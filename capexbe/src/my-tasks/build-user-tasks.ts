import { TaskCurrentStatus } from '../project-list/progress-aggregate';
import {
  isAssetInUserUnionScope,
  isWorkflowStepAssignedToUser,
  type ScopeResolutionMaps,
  type UserAssignmentLike,
} from './task-assignment-scope';

const norm = (id: string | number | undefined) => (id == null ? '' : String(id));

function isStatusDone(s: { status?: unknown }): boolean {
  const v = s.status;
  if (typeof v === 'string') return v.toLowerCase() === 'done';
  return v === 'Done';
}

/**
 * Mirrors capexapp taskService.getTasksForUser — same business rules, runs server-side on scoped data.
 */
export function buildUserTasksSnapshot(params: {
  userId: number;
  userAssignments: UserAssignmentLike[];
  scopeMaps: ScopeResolutionMaps;
  allAssets: any[];
  allRoles: any[];
  allWorkflows: any[];
  allTasks: any[];
  allAssetStatuses: any[];
  allTaskLogs: any[];
  adhocForUser: any[];
}): any[] {
  const {
    userId,
    userAssignments,
    scopeMaps,
    allAssets,
    allRoles,
    allWorkflows,
    allTasks,
    allAssetStatuses,
    allTaskLogs,
    adhocForUser,
  } = params;

  const assetMap = new Map(allAssets.map((a) => [norm(a.id), a]));
  const workflowMap = new Map(allWorkflows.map((w) => [norm(w.id), w]));
  const taskMap = new Map(allTasks.map((t) => [norm(t.id), t]));

  const userTasks: any[] = [];

  for (const adhoc of adhocForUser) {
    const asset = assetMap.get(norm(adhoc.assetId));
    if (asset && isAssetInUserUnionScope(asset, userAssignments, scopeMaps)) {
      userTasks.push({
        type: 'adhoc',
        id: adhoc.id,
        taskName: 'Ad-hoc Task',
        description: adhoc.description,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.assetName,
        projectCode: asset.projectCode,
        projectName: asset.projectName,
        huName: asset.huName,
        archetypeName: asset.archetypeName,
        startDate: adhoc.createdAt,
        targetEndDate: adhoc.dueDate,
        status: adhoc.status,
        adhocTask: adhoc,
      });
    }
  }

  const openWorkflowStatuses = allAssetStatuses.filter((s) => s.status === TaskCurrentStatus.Open);
  for (const status of openWorkflowStatuses) {
    const asset = assetMap.get(norm(status.assetId));
    if (!asset || !asset.workflowSetId) continue;

    const workflow = workflowMap.get(norm(asset.workflowSetId));
    if (!workflow) continue;

    const step = workflow.steps.find((s: any) => norm(s.taskId) === norm(status.taskId));
    if (!step) continue;

    const task = taskMap.get(norm(step.taskId));
    if (!task) continue;

    const isAssigned = isWorkflowStepAssignedToUser(
      step.roleIds ?? [],
      userAssignments,
      allRoles,
      asset,
      scopeMaps,
    );
    if (isAssigned) {
      const assignedRoles = allRoles.filter((r) => step.roleIds.some((rid: any) => norm(rid) === norm(r.id)));
      const startDate = status.startDate || new Date().toISOString();
      const targetEndDate = status.targetEndDate || status.startDate || new Date().toISOString();
      userTasks.push({
        type: 'workflow',
        id: status.id,
        taskName: task.name,
        description: task.description,
        assetId: asset.id,
        assetCode: asset.assetCode,
        assetName: asset.assetName,
        projectCode: asset.projectCode,
        projectName: asset.projectName,
        huName: asset.huName,
        archetypeName: asset.archetypeName,
        startDate,
        targetEndDate,
        status: status.status,
        workflowStep: step,
        assignedRoles: assignedRoles,
      });
    }
  }

  const userCompletedTaskKeys = new Set(
    allTaskLogs
      .filter((log) => Number(log.completedByUserId) === Number(userId))
      .map((log) => `${norm(log.assetId)}-${norm(log.taskId)}`),
  );
  const doneWorkflowStatuses = allAssetStatuses.filter((s) => isStatusDone(s));

  for (const status of doneWorkflowStatuses) {
    const taskKey = `${norm(status.assetId)}-${norm(status.taskId)}`;
    const asset = assetMap.get(norm(status.assetId));
    if (!asset || !asset.workflowSetId) continue;
    const workflow = workflowMap.get(norm(asset.workflowSetId));
    if (!workflow) continue;
    const step = workflow.steps.find((s: any) => norm(s.taskId) === norm(status.taskId));
    if (!step) continue;
    const task = taskMap.get(norm(step.taskId));
    if (!task) continue;

    const isAssignedToUser = isWorkflowStepAssignedToUser(
      step.roleIds ?? [],
      userAssignments,
      allRoles,
      asset,
      scopeMaps,
    );
    const completedByUser = userCompletedTaskKeys.has(taskKey);
    if (!isAssignedToUser && !completedByUser) continue;

    const assignedRoles = allRoles.filter((r) => step.roleIds.some((rid: any) => norm(rid) === norm(r.id)));
    const startDate = status.startDate || status.completedAt || '';
    const targetEndDate = status.targetEndDate || status.completedAt || '';
    userTasks.push({
      type: 'workflow',
      id: status.id,
      taskName: task.name,
      description: task.description,
      assetId: asset.id,
      assetCode: asset.assetCode,
      assetName: asset.assetName,
      projectCode: asset.projectCode,
      projectName: asset.projectName,
      huName: asset.huName,
      archetypeName: asset.archetypeName,
      startDate,
      targetEndDate,
      status: status.status,
      workflowStep: step,
      assignedRoles: assignedRoles,
    });
  }

  return userTasks.sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
}
