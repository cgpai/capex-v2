import { canonicalAssetKey } from './supabase-helpers';
import { getEffectiveSlaDays } from '../shared/workflow-role-policy';

export const TaskCurrentStatus = {
  Open: 'Open',
  Done: 'Done',
  Locked: 'Locked',
} as const;

export function calculateRates(
  assetsToCalc: any[],
  workflows: any[],
  statusesByAsset: Map<string, any[]>,
  logsByAsset: Map<string, any[]>,
): Map<string, number> {
  const newRates = new Map<string, number>();
  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const isDone = (s: any) =>
    typeof s.status === 'string' ? s.status.toLowerCase() === 'done' : s.status === TaskCurrentStatus.Done;

  for (const asset of assetsToCalc) {
    const assetKey = canonicalAssetKey(asset.id);
    const workflow = workflows.find((w) => str(w.id) === str(asset.workflowSetId));
    if (!workflow || workflow.steps.length === 0) {
      newRates.set(assetKey, 0);
      continue;
    }
    const stepTaskIds = new Set(workflow.steps.map((s: any) => str(s.taskId)));
    const stepWeightByTaskId = new Map<string, number>(
      workflow.steps.map((s: any) => {
        const weightRaw = s?.taskScore ?? 0;
        const weight = Number.isFinite(Number(weightRaw)) ? Number(weightRaw) : 0;
        return [str(s.taskId), weight] as [string, number];
      }),
    );
    const milestoneByTaskId = new Map<string, number>(
      workflow.steps
        .filter((s: any) => s?.milestoneScore != null)
        .map((s: any) => {
          const v = Number(s?.milestoneScore ?? 0);
          return [str(s.taskId), Number.isFinite(v) ? v : 0] as [string, number];
        }),
    );
    const statuses = statusesByAsset.get(assetKey) || [];
    const logs = logsByAsset.get(assetKey) || [];

    const doneFromStatuses = new Set(
      statuses.filter(isDone).map((s: any) => str(s.taskId)).filter((tid: string) => stepTaskIds.has(tid)),
    );
    const doneFromLogs = new Set(logs.map((l: any) => str(l.taskId)).filter((tid: string) => stepTaskIds.has(tid)));
    const doneTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);
    const totalWeight = Array.from(stepWeightByTaskId.values()).reduce((sum, w) => sum + Math.max(0, w), 0);
    const milestoneRate = Array.from(doneTaskIds).reduce(
      (max, tid) => Math.max(max, Math.max(0, milestoneByTaskId.get(tid) ?? 0)),
      0,
    );
    let rate = 0;
    if (totalWeight > 0) {
      const doneWeight = Array.from(doneTaskIds).reduce(
        (sum, tid) => sum + Math.max(0, stepWeightByTaskId.get(tid) ?? 0),
        0,
      );
      const weightedRate = Math.min(100, Math.round((doneWeight / totalWeight) * 100));
      rate = Math.min(100, Math.max(weightedRate, milestoneRate));
    } else {
      const totalSteps = workflow.steps.length;
      const countRate = totalSteps === 0 ? 0 : Math.min(100, Math.round((doneTaskIds.size / totalSteps) * 100));
      rate = Math.min(100, Math.max(countRate, milestoneRate));
    }
    newRates.set(assetKey, rate);
  }
  return newRates;
}

export function calculateProjectionDates(workflow: any, statuses: any[]): Map<string, string> {
  const projectionDates = new Map<string, string>();
  if (!workflow) return projectionDates;

  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const isDone = (s: any) =>
    typeof s?.status === 'string' ? s.status.toLowerCase() === 'done' : s?.status === TaskCurrentStatus.Done;
  const isOpen = (s: any) =>
    typeof s?.status === 'string' ? s.status.toLowerCase() === 'open' : s?.status === TaskCurrentStatus.Open;

  const statusMap = new Map(statuses.map((s) => [str(s.taskId), s]));
  const sortedSteps = [...workflow.steps].sort((a: any, b: any) => a.order - b.order);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const [index, step] of sortedSteps.entries()) {
    const stepTaskId = str(step.taskId);
    const status = statusMap.get(stepTaskId);

    if (status && isDone(status) && status.completedAt) {
      projectionDates.set(stepTaskId, new Date(status.completedAt).toISOString().split('T')[0]);
      continue;
    }

    if (status?.rescheduledEndDate) {
      projectionDates.set(stepTaskId, status.rescheduledEndDate);
      continue;
    }

    let latestTriggerCompletionDate = new Date(0);
    const triggerIds =
      step.triggeringTaskIds?.length > 0 ? step.triggeringTaskIds : index > 0 ? [sortedSteps[index - 1].taskId] : [];

    triggerIds.forEach((triggerId: string) => {
      const triggerDateStr = projectionDates.get(str(triggerId));
      if (triggerDateStr) {
        const triggerDate = new Date(triggerDateStr);
        if (triggerDate > latestTriggerCompletionDate) {
          latestTriggerCompletionDate = triggerDate;
        }
      }
    });

    let calculationStartDate: Date;

    if (isOpen(status)) {
      calculationStartDate = new Date(Math.max(latestTriggerCompletionDate.getTime(), today.getTime()));
    } else {
      calculationStartDate =
        latestTriggerCompletionDate.getTime() > 0 ? latestTriggerCompletionDate : today;
    }

    const projectedEndDate = new Date(calculationStartDate);
    projectedEndDate.setDate(projectedEndDate.getDate() + getEffectiveSlaDays(step, status));
    projectionDates.set(stepTaskId, projectedEndDate.toISOString().split('T')[0]);
  }

  return projectionDates;
}

export function buildAssetLastTaskMap(
  scopedAssets: any[],
  workflows: any[],
  allTasks: any[],
  logsByAsset: Map<string, any[]>,
  statusesByAsset: Map<string, any[]>,
): Map<string, string> {
  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const newAssetLastTaskMap = new Map<string, string>();

  for (const asset of scopedAssets) {
    const assetKey = canonicalAssetKey(asset.id);
    const workflow = workflows.find((w) => str(w.id) === str(asset.workflowSetId));
    if (!workflow) {
      newAssetLastTaskMap.set(assetKey, 'No Workflow');
      continue;
    }
    const stepTaskIds = new Set(workflow.steps.map((s: any) => str(s.taskId)));
    const assetLogs = logsByAsset.get(assetKey) || [];
    const assetStatuses = statusesByAsset.get(assetKey) || [];

    const doneFromStatuses = new Set(
      assetStatuses
        .filter(isDone)
        .map((s: any) => str(s.taskId))
        .filter((tid: string) => stepTaskIds.has(tid)),
    );
    const doneFromLogs = new Set(
      assetLogs.map((log: any) => str(log.taskId)).filter((tid: string) => stepTaskIds.has(tid)),
    );
    const completedTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);

    if (completedTaskIds.size === 0) {
      newAssetLastTaskMap.set(assetKey, 'Not Started');
    } else {
      let lastStep: any = null;
      let maxOrder = -1;
      for (const taskIdStr of completedTaskIds) {
        const step = workflow.steps.find((s: any) => str(s.taskId) === taskIdStr);
        if (step && step.order > maxOrder) {
          maxOrder = step.order;
          lastStep = step;
        }
      }
      if (lastStep) {
        const task = allTasks.find((t: any) => str(t.id) === str(lastStep?.taskId));
        newAssetLastTaskMap.set(assetKey, task ? task.name : 'In Progress (Unknown)');
      } else {
        newAssetLastTaskMap.set(assetKey, 'In Progress (Unknown)');
      }
    }
  }
  return newAssetLastTaskMap;
}

function isDone(s: any): boolean {
  const v = s?.status;
  if (typeof v === 'string') return v.toLowerCase() === 'done';
  return v === 'Done';
}

export function buildActionableTaskCounts(
  scopedAssets: any[],
  workflows: any[],
  allStatuses: any[],
  allRoles: any[],
  currentUser: any,
): Map<string, number> {
  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const assignments = Array.isArray(currentUser?.assignments) ? currentUser.assignments : [];
  const userRoleNames = new Set(assignments.map((a: any) => a.roleName));
  const userRoleIds = new Set(allRoles.filter((r: any) => userRoleNames.has(r.roleName)).map((r: any) => r.id));
  const actionableTaskCounts = new Map<string, number>();

  for (const asset of scopedAssets) {
    const assetKey = canonicalAssetKey(asset.id);
    const workflow = workflows.find((w) => str(w.id) === str(asset.workflowSetId));
    if (!workflow) {
      actionableTaskCounts.set(assetKey, 0);
      continue;
    }
    const assetOpenStatuses = allStatuses.filter(
      (s: any) => canonicalAssetKey(s.assetId) === assetKey && s.status === TaskCurrentStatus.Open,
    );
    let count = 0;
    for (const status of assetOpenStatuses) {
      const step = workflow.steps.find((s: any) => str(s.taskId) === str(status.taskId));
      if (step && step.roleIds.some((roleId: number) => userRoleIds.has(roleId))) count++;
    }
    actionableTaskCounts.set(assetKey, count);
  }
  return actionableTaskCounts;
}

export function groupStatusesByAsset(allStatuses: any[]): Map<string, any[]> {
  const statusesByAsset = new Map<string, any[]>();
  for (const status of allStatuses) {
    const key = canonicalAssetKey(status.assetId);
    if (!statusesByAsset.has(key)) statusesByAsset.set(key, []);
    statusesByAsset.get(key)!.push(status);
  }
  return statusesByAsset;
}

export function groupLogsByAsset(allLogs: any[]): Map<string, any[]> {
  const logsByAsset = new Map<string, any[]>();
  for (const log of allLogs) {
    const key = canonicalAssetKey(log.assetId);
    if (!logsByAsset.has(key)) logsByAsset.set(key, []);
    logsByAsset.get(key)!.push(log);
  }
  return logsByAsset;
}
