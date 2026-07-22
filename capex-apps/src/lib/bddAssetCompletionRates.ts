import type { AssetTaskStatus, EnrichedAsset, TaskLog, WorkflowSet } from '@/types';
import { TaskCurrentStatus } from '@/types';

/** Hitung completion rate per asset (sama logika dengan BDD / Capex list). */
export function computeBddAssetCompletionRates(
  assetsToCalc: EnrichedAsset[],
  workflows: WorkflowSet[],
  allTaskLogs: TaskLog[],
  allStatuses: AssetTaskStatus[],
): Map<string, number> {
  const newRates = new Map<string, number>();
  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const isDone = (s: AssetTaskStatus) =>
    typeof s.status === 'string' ? s.status.toLowerCase() === 'done' : s.status === TaskCurrentStatus.Done;

  const logsByAsset = allTaskLogs.reduce((acc, log) => {
    const k = str(log.assetId);
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k)!.push(log);
    return acc;
  }, new Map<string, TaskLog[]>());

  const statusesByAsset = allStatuses.reduce((acc, s) => {
    const k = str(s.assetId);
    if (!acc.has(k)) acc.set(k, []);
    acc.get(k)!.push(s);
    return acc;
  }, new Map<string, AssetTaskStatus[]>());

  for (const asset of assetsToCalc) {
    const workflow = workflows.find((w) => w.id === asset.workflowSetId);
    if (workflow && workflow.steps.length > 0) {
      const assetKey = str(asset.id);
      const stepTaskIds = new Set(workflow.steps.map((s) => str(s.taskId)));
      const stepWeightByTaskId = new Map<string, number>(
        workflow.steps.map((s) => [str(s.taskId), Number(s.taskScore ?? 0)] as [string, number]),
      );
      const milestoneByTaskId = new Map<string, number>(
        workflow.steps
          .filter((s) => s.milestoneScore != null)
          .map((s) => [str(s.taskId), Number(s.milestoneScore ?? 0)] as [string, number]),
      );
      const assetLogs = logsByAsset.get(assetKey) || [];
      const assetStatuses = statusesByAsset.get(assetKey) || [];

      const doneFromStatuses = new Set(
        assetStatuses.filter(isDone).map((s) => str(s.taskId)).filter((tid) => stepTaskIds.has(tid)),
      );
      const doneFromLogs = new Set(assetLogs.map((l) => str(l.taskId)).filter((tid) => stepTaskIds.has(tid)));
      const doneTaskIds = new Set([...doneFromStatuses, ...doneFromLogs]);
      const totalWeight = Array.from(stepWeightByTaskId.values()).reduce((sum, w) => sum + Math.max(0, w), 0);
      const weightedRate =
        totalWeight > 0
          ? Math.min(
              100,
              Math.round(
                (Array.from(doneTaskIds).reduce(
                  (sum, tid) => sum + Math.max(0, stepWeightByTaskId.get(tid) ?? 0),
                  0,
                ) /
                  totalWeight) *
                  100,
              ),
            )
          : Math.min(100, Math.round((doneTaskIds.size / workflow.steps.length) * 100));
      const milestoneRate = Array.from(doneTaskIds).reduce(
        (max, tid) => Math.max(max, Math.max(0, milestoneByTaskId.get(tid) ?? 0)),
        0,
      );
      const rate = Math.min(100, Math.max(weightedRate, milestoneRate));
      newRates.set(asset.id, rate);
    } else {
      newRates.set(asset.id, 0);
    }
  }
  return newRates;
}
