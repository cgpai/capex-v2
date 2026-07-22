/** Keep in sync with capexapp getTimelineForAsset merge + getEffectiveStatus rules. */

const norm = (id: string | number | undefined) => (id == null ? '' : String(id));

const TaskCurrentStatus = {
  Open: 'Open',
  Done: 'Done',
  Locked: 'Locked',
} as const;

type WorkflowStep = {
  order: number;
  taskId: string;
  roleIds: number[];
  slaToComplete: number;
  triggeringTaskIds: string[];
  taskScore: number;
  milestoneScore?: number;
};

type WorkflowItem = {
  type: 'workflow';
  task: any;
  step: WorkflowStep;
  statusInfo: any;
  log: any;
  date: string;
};

const rowIsDone = (row: any): boolean =>
  row?.status === TaskCurrentStatus.Done ||
  (typeof row?.status === 'string' && String(row.status).toLowerCase() === 'done');

/**
 * Effective Open/Done/Locked for a workflow step.
 * Source of truth is asset_task_statuses.status — orphan task_logs (e.g. after Revert to Open)
 * must NOT force Done.
 */
export function getEffectiveStatusForStep(
  step: WorkflowStep,
  stepsInOrder: WorkflowStep[],
  statusesMap: Map<string, any>,
  _logs: { taskId: string }[],
  _assetId: string,
): string {
  const stepTid = norm(step.taskId);
  const row = statusesMap.get(stepTid);
  if (rowIsDone(row)) return TaskCurrentStatus.Done;
  let triggerIds: (string | number)[] = step.triggeringTaskIds || [];
  if (triggerIds.length === 0 && step.order > 0) {
    const prev = stepsInOrder.find((s) => s.order === step.order - 1);
    if (prev) triggerIds = [prev.taskId];
  }
  const triggersMet = triggerIds.every((tid) => rowIsDone(statusesMap.get(norm(tid))));
  return triggersMet ? TaskCurrentStatus.Open : TaskCurrentStatus.Locked;
}

export function mergeAfterLastDoneWorkflow(
  sortedWorkflow: WorkflowItem[],
  isRowDone: (w: WorkflowItem) => boolean,
  momItems: { type: string; date: string }[],
  adhocItems: { type: string; date: string }[],
  auditItems: { type: string; date: string }[],
): any[] {
  const supplemental = [...momItems, ...adhocItems, ...auditItems].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );
  let lastDoneIdx = -1;
  for (let i = 0; i < sortedWorkflow.length; i++) {
    if (isRowDone(sortedWorkflow[i])) {
      lastDoneIdx = i;
    }
  }
  if (lastDoneIdx < 0) {
    return [...sortedWorkflow, ...supplemental];
  }
  return [...sortedWorkflow.slice(0, lastDoneIdx + 1), ...supplemental, ...sortedWorkflow.slice(lastDoneIdx + 1)];
}

export { norm, TaskCurrentStatus };
