import type { SupabaseClient } from '@supabase/supabase-js';
import { normId, toCamelCase } from '../project-list/supabase-helpers';
import { getEffectiveSlaDays } from '../shared/workflow-role-policy';

const normTaskId = (id: string | number | undefined): string => (id == null ? '' : String(id));

const isDone = (s: { status?: unknown }): boolean => {
  const v = s.status;
  if (typeof v === 'string') return v.toLowerCase() === 'done';
  return v === 'Done';
};

/** Mirror capexapp taskService.recalculateAssetTaskStatuses (Supabase). */
export async function recalculateAssetTaskStatuses(
  client: SupabaseClient,
  assetId: string,
  workflows: any[],
): Promise<void> {
  const assetIdStr = normTaskId(assetId);
  const [{ data: assetRow, error: assetErr }, stRes] = await Promise.all([
    client.from('assets').select('*').eq('id', assetIdStr).maybeSingle(),
    client.from('asset_task_statuses').select('*').eq('asset_id', assetIdStr),
  ]);
  if (assetErr || !assetRow) return;

  const asset = toCamelCase(assetRow) as Record<string, unknown>;
  const workflowSetId = normTaskId(asset.workflowSetId as string);
  if (!workflowSetId.trim()) return;

  const workflow = workflows.find((w: any) => normTaskId(w.id) === workflowSetId);
  if (!workflow?.steps?.length) return;

  const stepsInOrder = [...workflow.steps].sort((a: any, b: any) => a.order - b.order);
  if (stepsInOrder.length === 0) return;

  const existingStatuses = (stRes.data || []).map(toCamelCase) as any[];
  // Source of truth is asset_task_statuses.status (not historical task_logs).

  const existingStatusesMap = new Map(existingStatuses.map((s) => [normTaskId(s.taskId), s]));

  const doneTaskIds = new Set<string>();
  existingStatuses.forEach((s) => {
    if (isDone(s)) doneTaskIds.add(normTaskId(s.taskId));
  });

  for (const step of stepsInOrder) {
    const stepTaskIdNorm = normTaskId(step.taskId);
    const currentStatus = existingStatusesMap.get(stepTaskIdNorm);

    if (doneTaskIds.has(stepTaskIdNorm)) {
      continue;
    }

    let effectiveTriggerIds: (string | number)[] = step.triggeringTaskIds ?? [];
    if (effectiveTriggerIds.length === 0 && step.order > 0) {
      const previousStep = stepsInOrder.find((s: any) => s.order === step.order - 1);
      if (previousStep) effectiveTriggerIds = [previousStep.taskId];
    }

    const areTriggersMet = effectiveTriggerIds.every((triggerId) => doneTaskIds.has(normTaskId(triggerId)));

    const newStatus = areTriggersMet ? 'Open' : 'Locked';

    const base = currentStatus ?? {
      id: `${assetIdStr}-${stepTaskIdNorm}`,
      assetId: assetIdStr,
      taskId: stepTaskIdNorm,
    };
    const effectiveSla = getEffectiveSlaDays(step, currentStatus);

    const updatedStatus: Record<string, unknown> = {
      ...base,
      assetId: assetIdStr,
      taskId: stepTaskIdNorm,
      status: newStatus,
      slaToCompleteOverride: currentStatus?.slaToCompleteOverride ?? null,
    };

    if (newStatus === 'Open') {
      const startDate = updatedStatus.startDate
        ? new Date(String(updatedStatus.startDate))
        : new Date();
      const targetEndDate = new Date(startDate);
      targetEndDate.setDate(startDate.getDate() + effectiveSla);
      const dateStr = startDate.toISOString().split('T')[0];
      const endStr = targetEndDate.toISOString().split('T')[0];
      if (!updatedStatus.startDate) updatedStatus.startDate = dateStr;
      const justOpened = !currentStatus || currentStatus.status !== 'Open';
      if (justOpened || !updatedStatus.targetEndDate) {
        updatedStatus.targetEndDate = endStr;
      }
    }

    if (!currentStatus || currentStatus.status !== newStatus) {
      const snake: Record<string, unknown> = {
        id: updatedStatus.id,
        asset_id: updatedStatus.assetId,
        task_id: updatedStatus.taskId,
        status: updatedStatus.status,
        completed_at: updatedStatus.completedAt ?? null,
        log_id: updatedStatus.logId ?? null,
        start_date: updatedStatus.startDate ?? null,
        target_end_date: updatedStatus.targetEndDate ?? null,
        sla_to_complete_override: updatedStatus.slaToCompleteOverride ?? null,
      };
      const { error } = await client.from('asset_task_statuses').upsert(snake, { onConflict: 'id' });
      if (error) throw new Error(`saveAssetTaskStatus: ${error.message}`);
      existingStatusesMap.set(stepTaskIdNorm, { ...updatedStatus, status: newStatus });
    }
  }
}
