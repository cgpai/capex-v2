import { Injectable, BadRequestException } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { getAllTasks, getAllWorkflowSets } from '../project-list/master-data.loader';
import { fetchAllRecordsWhereEq, toCamelCase, normId } from '../project-list/supabase-helpers';
import { getEffectiveStatusForStep, mergeAfterLastDoneWorkflow, norm, TaskCurrentStatus } from './build-timeline';

const AUDIT_LOG_COLUMNS =
  'id,entity_id,entity_type,action,field_name,old_value,new_value,changed_by,timestamp';

@Injectable()
export class AssetTimelineService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  async getTimeline(
    accessToken: string,
    body: { assetId: string; workflowSetId: string; projectId?: string; userId?: number },
  ): Promise<{ items: any[] }> {
    const { assetId, workflowSetId, projectId } = body;
    if (!assetId?.trim() || !workflowSetId?.trim()) {
      throw new BadRequestException('assetId and workflowSetId are required');
    }

    const userId = Number(body.userId);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Capex Project List', 'view');

    const { client } = await this.authContext.getRlsClient(accessToken, userId);

    const auditPromise = projectId?.trim()
      ? client
          .from('audit_logs')
          .select(AUDIT_LOG_COLUMNS)
          .eq('entity_id', projectId.trim())
          .eq('entity_type', 'Project')
      : Promise.resolve({ data: [] as any[], error: null });

    const [statuses, logs, moms, adhocs, auditResult, allWorkflows, allTasks] = await Promise.all([
      fetchAllRecordsWhereEq(client, 'asset_task_statuses', 'asset_id', assetId),
      fetchAllRecordsWhereEq(client, 'task_logs', 'asset_id', assetId),
      fetchAllRecordsWhereEq(client, 'moms', 'asset_id', assetId),
      fetchAllRecordsWhereEq(client, 'adhoc_tasks', 'asset_id', assetId),
      auditPromise,
      getAllWorkflowSets(client),
      getAllTasks(client),
    ]);
    if (auditResult.error) {
      throw new BadRequestException(auditResult.error.message);
    }
    const auditRaw = auditResult.data ?? [];

    const statusesC = (statuses || []).map((r) => toCamelCase(r));
    const logsC = (logs || []).map((r) => toCamelCase(r));
    const workflow = allWorkflows.find((w) => norm(w.id) === norm(workflowSetId)) ?? null;
    const stepsInOrder = workflow ? [...(workflow as any).steps].sort((a: any, b: any) => a.order - b.order) : [];

    const statusesMap = new Map(statusesC.map((s: any) => [norm(s.taskId), s]));

    const getEff = (step: any) =>
      getEffectiveStatusForStep(
        step,
        stepsInOrder,
        statusesMap,
        logsC as { taskId: string }[],
        assetId,
      );

    const logsById = new Map((logsC as any[]).map((l) => [norm(l.id), l]));
    const logsMap = new Map((logsC as any[]).map((l) => [norm(l.taskId), l]));

    const workflowItems: any[] = stepsInOrder
      .map((step: any) => {
        const stepTid = norm(step.taskId);
        const task = (allTasks as any[]).find((t) => norm(t.id) === stepTid);
        if (!task) return null;
        const row = statusesC.find((s: any) => norm(s.taskId) === stepTid);
        const effectiveStatus = getEff(step);
        const statusInfo = row ? { ...row, status: effectiveStatus } : { id: `${assetId}-${stepTid}`, assetId, taskId: step.taskId, status: effectiveStatus };
        const date = statusInfo.completedAt || statusInfo.startDate || new Date(0).toISOString();
        // Only show completion log when the task is currently Done (not after Revert to Open).
        const activeLog =
          effectiveStatus === TaskCurrentStatus.Done
            ? (row?.logId ? logsById.get(norm(row.logId)) : null) || logsMap.get(stepTid) || null
            : null;
        return {
          type: 'workflow' as const,
          task,
          step,
          statusInfo,
          log: activeLog,
          date,
        };
      })
      .filter(Boolean);

    const sortedWorkflow = workflowItems.slice().sort((a, b) => a.step.order - b.step.order);

    const momItems = (moms || []).map((m: any) => {
      const mom = toCamelCase(m);
      return { type: 'mom', mom, date: mom.createdAt };
    });
    const adhocItems = (adhocs || []).map((t: any) => {
      const at = toCamelCase(t);
      return { type: 'adhoc', adhocTask: at, date: at.createdAt };
    });
    const auditItems = (auditRaw || []).map((a: any) => {
      const log = toCamelCase(a) as { timestamp: string };
      return { type: 'audit', log, date: log.timestamp };
    });

    const isRowDone = (w: any) => {
      const statusVal = String(w.statusInfo?.status ?? '').toLowerCase();
      if (statusVal === 'done') return true;
      return getEff(w.step) === TaskCurrentStatus.Done;
    };

    const items = mergeAfterLastDoneWorkflow(sortedWorkflow, isRowDone, momItems, adhocItems, auditItems);
    return { items };
  }
}
