import type { Task, UserRole, WorkflowSet, WorkflowStep } from '@/types';
import { SYSTEM_TRIGGER_EVENTS, type SystemTriggerEvent } from '@/types';
import { getTaskTriggerEvents, prepareTaskTriggerEventsForSave } from '@/lib/systemTriggerEvents';

export type TaskMasterSpreadsheetRow = {
  id: string;
  name: string;
  description: string;
  slaToComplete: number;
  isSystemTriggered: 'yes' | 'no';
  triggerEventsCsv: string;
  _markedDelete?: boolean;
  _isNew?: boolean;
};

export type WorkflowSetSpreadsheetRow = {
  id: string;
  /** Identitas unik per workflow di spreadsheet — tidak digabung berdasarkan nama. */
  workflowGroupId: string;
  workflowId: string;
  workflowName: string;
  stepOrder: number;
  taskName: string;
  roleIds: number[];
  roleNames: string;
  slaDays: number;
  taskScore: number;
  milestoneScore: number | '';
  triggeringTaskIds: string[];
  triggerTaskNames: string;
  _markedDelete?: boolean;
};

const TRIGGER_EVENT_CODES = new Set<SystemTriggerEvent>(
  SYSTEM_TRIGGER_EVENTS.map((e) => e.value),
);

export function createEmptyTaskRow(index = 0): TaskMasterSpreadsheetRow {
  return {
    id: `task-new-${Date.now()}-${index}`,
    name: '',
    description: '',
    slaToComplete: 0,
    isSystemTriggered: 'no',
    triggerEventsCsv: '',
    _isNew: true,
  };
}

export function createEmptyWorkflowStepRow(
  index = 0,
  workflowGroupId?: string,
): WorkflowSetSpreadsheetRow {
  const groupId = workflowGroupId ?? `wf-new-${Date.now()}-${index}`;
  return {
    id: `wf-row-${Date.now()}-${index}`,
    workflowGroupId: groupId,
    workflowId: '',
    workflowName: '',
    stepOrder: 1,
    taskName: '',
    roleIds: [],
    roleNames: '',
    slaDays: 0,
    taskScore: 0,
    milestoneScore: '',
    triggeringTaskIds: [],
    triggerTaskNames: '',
  };
}

/** Satu workflow baru (grup unik) + satu baris step kosong. */
export function createNewWorkflowGroup(stepCount = 1): WorkflowSetSpreadsheetRow[] {
  const groupId = `wf-new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  return Array.from({ length: stepCount }, (_, i) => ({
    ...createEmptyWorkflowStepRow(i, groupId),
    stepOrder: i + 1,
  }));
}

export function isNewWorkflowGroupId(groupId: string): boolean {
  return groupId.startsWith('wf-new-');
}

export function tasksToSpreadsheetRows(tasks: Task[]): TaskMasterSpreadsheetRow[] {
  return tasks.map((task) => ({
    id: task.id,
    name: task.name,
    description: task.description ?? '',
    slaToComplete: task.slaToComplete ?? 0,
    isSystemTriggered: task.isSystemTriggered ? 'yes' : 'no',
    triggerEventsCsv: getTaskTriggerEvents(task).join('|'),
  }));
}

export function workflowsToSpreadsheetRows(
  workflows: WorkflowSet[],
  tasks: Task[],
  roles: UserRole[],
): WorkflowSetSpreadsheetRow[] {
  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));
  const roleNameById = new Map(roles.map((r) => [r.id, r.roleName]));

  const rows: WorkflowSetSpreadsheetRow[] = [];
  for (const wf of workflows) {
    const sorted = [...wf.steps].sort((a, b) => a.order - b.order);
    sorted.forEach((step, index) => {
      rows.push({
        id: `${wf.id}-step-${step.taskId}-${index}`,
        workflowGroupId: wf.id,
        workflowId: wf.id,
        workflowName: wf.name,
        stepOrder: step.order + 1,
        taskName: taskNameById.get(step.taskId) ?? step.taskId,
        roleIds: [...step.roleIds],
        roleNames: step.roleIds
          .map((id) => roleNameById.get(id) ?? String(id))
          .join(', '),
        slaDays: step.slaToComplete ?? 0,
        taskScore: step.taskScore ?? 0,
        milestoneScore:
          step.milestoneScore !== undefined && step.milestoneScore !== null
            ? step.milestoneScore
            : '',
        triggeringTaskIds: [...step.triggeringTaskIds],
        triggerTaskNames: step.triggeringTaskIds
          .map((id) => taskNameById.get(id) ?? id)
          .join(', '),
      });
    });
  }
  return rows;
}

function parseCsvList(value: string): string[] {
  return value
    .split(/[,;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTriggerEventsCsv(value: string): SystemTriggerEvent[] {
  const parts = value.split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
  return [...new Set(parts.filter((p): p is SystemTriggerEvent => TRIGGER_EVENT_CODES.has(p as SystemTriggerEvent)))];
}

export function getTaskRowTriggerEvents(row: TaskMasterSpreadsheetRow): SystemTriggerEvent[] {
  return parseTriggerEventsCsv(row.triggerEventsCsv);
}

export function taskRowTriggerEventsToCsv(events: SystemTriggerEvent[]): string {
  return events.join('|');
}

export function spreadsheetRowToTask(row: TaskMasterSpreadsheetRow): Partial<Task> {
  const isSystemTriggered = row.isSystemTriggered === 'yes';
  const triggerEvents = isSystemTriggered ? parseTriggerEventsCsv(row.triggerEventsCsv) : [];
  return prepareTaskTriggerEventsForSave({
    id: row._isNew ? '' : row.id,
    name: row.name.trim(),
    description: row.description.trim(),
    slaToComplete: row.slaToComplete ?? 0,
    isSystemTriggered,
    triggerEvents,
  });
}

export type TaskSpreadsheetValidation = { rowId: string; message: string };

export function validateTaskSpreadsheetRows(rows: TaskMasterSpreadsheetRow[]): TaskSpreadsheetValidation[] {
  const errors: TaskSpreadsheetValidation[] = [];
  const active = rows.filter((r) => !r._markedDelete && r.name.trim());
  const names = new Map<string, string>();

  for (const row of active) {
    if (!row.name.trim()) {
      errors.push({ rowId: row.id, message: 'Nama task wajib diisi.' });
      continue;
    }
    const key = row.name.trim().toLowerCase();
    const prev = names.get(key);
    if (prev) {
      errors.push({ rowId: row.id, message: `Nama task duplikat: "${row.name.trim()}".` });
    } else {
      names.set(key, row.id);
    }
    if (row.isSystemTriggered === 'yes') {
      const events = parseTriggerEventsCsv(row.triggerEventsCsv);
      if (events.length === 0) {
        errors.push({ rowId: row.id, message: 'Task system-triggered membutuhkan trigger event (pisahkan dengan |).' });
      }
    }
  }
  return errors;
}

export type WorkflowSpreadsheetValidation = { rowId: string; message: string };

function resolveRoleIds(roleNamesCsv: string, roles: UserRole[]): number[] {
  const names = parseCsvList(roleNamesCsv);
  const byName = new Map(roles.map((r) => [r.roleName.toLowerCase(), r.id]));
  return names
    .map((n) => byName.get(n.toLowerCase()))
    .filter((id): id is number => id != null);
}

export function roleNamesToIds(roleNamesCsv: string, roles: UserRole[]): number[] {
  return resolveRoleIds(roleNamesCsv, roles);
}

export function taskNamesToIds(namesCsv: string, tasks: Task[]): string[] {
  return resolveTaskIdsFromNames(namesCsv, tasks);
}

export function resolveRoleIdsForRow(row: WorkflowSetSpreadsheetRow, roles: UserRole[]): number[] {
  if (row.roleIds.length > 0) return row.roleIds;
  return resolveRoleIds(row.roleNames, roles);
}

export function resolveTriggeringTaskIdsForRow(row: WorkflowSetSpreadsheetRow, tasks: Task[]): string[] {
  if (row.triggeringTaskIds.length > 0) return row.triggeringTaskIds;
  return resolveTaskIdsFromNames(row.triggerTaskNames, tasks);
}

export function syncWorkflowRowDerivedFields(
  row: WorkflowSetSpreadsheetRow,
  roles: UserRole[],
  tasks: Task[],
): WorkflowSetSpreadsheetRow {
  const roleIds = row.roleIds;
  const triggeringTaskIds = row.triggeringTaskIds;
  const roleNameById = new Map(roles.map((r) => [r.id, r.roleName]));
  const taskNameById = new Map(tasks.map((t) => [t.id, t.name]));
  return {
    ...row,
    roleNames: roleIds.map((id) => roleNameById.get(id) ?? String(id)).join(', '),
    triggerTaskNames: triggeringTaskIds.map((id) => taskNameById.get(id) ?? id).join(', '),
  };
}

export function getTriggerTaskOptionsForRow(
  row: WorkflowSetSpreadsheetRow,
  allRows: WorkflowSetSpreadsheetRow[],
  tasks: Task[],
): Task[] {
  const currentTaskId = resolveTaskId(row.taskName, tasks);
  const groupTaskNames = new Set(
    allRows
      .filter((r) => r.workflowGroupId === row.workflowGroupId && r.taskName.trim())
      .map((r) => r.taskName.trim().toLowerCase()),
  );
  return tasks.filter((t) => {
    if (currentTaskId && t.id === currentTaskId) return false;
    return groupTaskNames.has(t.name.toLowerCase());
  });
}

function resolveTaskId(taskName: string, tasks: Task[]): string | null {
  const trimmed = taskName.trim();
  if (!trimmed) return null;
  const byName = tasks.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
  if (byName) return byName.id;
  const byId = tasks.find((t) => t.id === trimmed);
  return byId?.id ?? null;
}

function resolveTaskIdsFromNames(namesCsv: string, tasks: Task[]): string[] {
  return parseCsvList(namesCsv)
    .map((name) => resolveTaskId(name, tasks))
    .filter((id): id is string => !!id);
}

export function buildWorkflowSetsFromSpreadsheetRows(
  rows: WorkflowSetSpreadsheetRow[],
  tasks: Task[],
  roles: UserRole[],
  existingWorkflows: WorkflowSet[],
): { workflows: WorkflowSet[]; errors: WorkflowSpreadsheetValidation[] } {
  const errors: WorkflowSpreadsheetValidation[] = [];
  const active = rows.filter((r) => !r._markedDelete && (r.workflowName.trim() || r.taskName.trim()));

  const groups = new Map<string, WorkflowSetSpreadsheetRow[]>();
  for (const row of active) {
    if (!row.workflowGroupId.trim()) {
      errors.push({ rowId: row.id, message: 'Grup workflow tidak valid.' });
      continue;
    }
    if (!row.workflowName.trim()) {
      errors.push({ rowId: row.id, message: 'Nama workflow wajib diisi.' });
      continue;
    }
    const key = row.workflowGroupId.trim();
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  const workflows: WorkflowSet[] = [];
  const usedNames = new Map<string, string>();

  for (const [groupId, groupRows] of groups) {
    const first = groupRows[0];
    const isNewGroup = isNewWorkflowGroupId(groupId);
    const workflowId =
      !isNewGroup && existingWorkflows.some((w) => w.id === groupId)
        ? groupId
        : first.workflowId.trim() ||
          (existingWorkflows.some((w) => w.id === groupId) ? groupId : '') ||
          `wf-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const nameKey = first.workflowName.trim().toLowerCase();
    const prevGroup = usedNames.get(nameKey);
    if (prevGroup && prevGroup !== groupId) {
      errors.push({
        rowId: first.id,
        message: `Nama workflow "${first.workflowName.trim()}" duplikat di spreadsheet (grup terpisah). Gunakan nama unik per workflow.`,
      });
    } else {
      usedNames.set(nameKey, groupId);
    }

    const sorted = [...groupRows].sort((a, b) => (a.stepOrder || 0) - (b.stepOrder || 0));
    const steps: WorkflowStep[] = [];
    const usedTaskIds = new Set<string>();

    sorted.forEach((row, index) => {
      const taskId = resolveTaskId(row.taskName, tasks);
      if (!taskId) {
        errors.push({ rowId: row.id, message: `Task "${row.taskName}" tidak ditemukan.` });
        return;
      }
      if (usedTaskIds.has(taskId)) {
        errors.push({ rowId: row.id, message: `Task "${row.taskName}" duplikat dalam workflow "${first.workflowName}".` });
        return;
      }
      usedTaskIds.add(taskId);

      const task = tasks.find((t) => t.id === taskId);
      steps.push({
        order: index,
        taskId,
        roleIds: resolveRoleIdsForRow(row, roles),
        slaToComplete: row.slaDays > 0 ? row.slaDays : (task?.slaToComplete ?? 0),
        triggeringTaskIds: resolveTriggeringTaskIdsForRow(row, tasks),
        taskScore: row.taskScore ?? 0,
        milestoneScore:
          row.milestoneScore === '' || row.milestoneScore == null
            ? undefined
            : Number(row.milestoneScore),
      });
    });

    if (steps.length === 0) continue;

    const totalScore = steps.reduce((sum, s) => sum + (s.taskScore || 0), 0);
    if (totalScore !== 100) {
      errors.push({
        rowId: first.id,
        message: `Workflow "${first.workflowName}": total task score harus 100% (sekarang ${totalScore}%).`,
      });
    }

    const nameConflicts = existingWorkflows.filter(
      (w) => w.name.toLowerCase() === first.workflowName.trim().toLowerCase() && w.id !== workflowId,
    );
    if (nameConflicts.length > 0 && isNewGroup) {
      errors.push({ rowId: first.id, message: `Nama workflow "${first.workflowName}" sudah ada di sistem.` });
    }

    workflows.push({
      id: workflowId,
      name: first.workflowName.trim(),
      steps,
    });
  }

  return { workflows, errors };
}

export function getDeletedWorkflowIds(
  rows: WorkflowSetSpreadsheetRow[],
  existingWorkflows: WorkflowSet[],
): string[] {
  const existingIdsInSheet = new Set(
    existingWorkflows
      .filter((w) => rows.some((r) => r.workflowGroupId === w.id || r.workflowId === w.id))
      .map((w) => w.id),
  );

  const activeGroupIds = new Set(
    rows
      .filter((r) => !r._markedDelete && (r.workflowName.trim() || r.taskName.trim()))
      .map((r) => r.workflowGroupId.trim())
      .filter(Boolean),
  );

  return [...existingIdsInSheet].filter((id) => !activeGroupIds.has(id));
}

export function getWorkflowGroupLabels(rows: WorkflowSetSpreadsheetRow[]): Map<string, string> {
  const labels = new Map<string, string>();
  let counter = 0;
  for (const row of rows) {
    const gid = row.workflowGroupId;
    if (!gid || labels.has(gid)) continue;
    counter += 1;
    labels.set(gid, `Workflow ${counter}`);
  }
  return labels;
}

export function syncWorkflowNameInGroup(
  rows: WorkflowSetSpreadsheetRow[],
  rowId: string,
  workflowName: string,
): WorkflowSetSpreadsheetRow[] {
  const target = rows.find((r) => r.id === rowId);
  if (!target) return rows;
  const groupId = target.workflowGroupId;
  return rows.map((r) => (r.workflowGroupId === groupId ? { ...r, workflowName } : r));
}

export function addStepToWorkflowGroup(
  rows: WorkflowSetSpreadsheetRow[],
  workflowGroupId: string,
): WorkflowSetSpreadsheetRow[] {
  const groupRows = rows.filter((r) => r.workflowGroupId === workflowGroupId);
  const last = groupRows[groupRows.length - 1];
  const nextOrder = groupRows.length > 0 ? Math.max(...groupRows.map((r) => r.stepOrder || 0)) + 1 : 1;
  const newRow = createEmptyWorkflowStepRow(rows.length, workflowGroupId);
  return [
    ...rows,
    {
      ...newRow,
      workflowId: last?.workflowId ?? '',
      workflowName: last?.workflowName ?? '',
      stepOrder: nextOrder,
    },
  ];
}

export function removeWorkflowGroup(
  rows: WorkflowSetSpreadsheetRow[],
  workflowGroupId: string,
): WorkflowSetSpreadsheetRow[] {
  return rows.filter((r) => r.workflowGroupId !== workflowGroupId);
}

export function getDeletedTaskIds(
  rows: TaskMasterSpreadsheetRow[],
  existingTasks: Task[],
): string[] {
  const activeIds = new Set(rows.filter((r) => !r._markedDelete && !r._isNew).map((r) => r.id));
  return existingTasks.filter((t) => !activeIds.has(t.id)).map((t) => t.id);
}

export const TASK_TRIGGER_EVENT_HINT = SYSTEM_TRIGGER_EVENTS.map((e) => e.value).join(' | ');
