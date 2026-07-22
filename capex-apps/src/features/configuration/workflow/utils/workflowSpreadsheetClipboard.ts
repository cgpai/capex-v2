import {
  createEmptyTaskRow,
  createNewWorkflowGroup,
  roleNamesToIds,
  taskNamesToIds,
  type TaskMasterSpreadsheetRow,
  type WorkflowSetSpreadsheetRow,
} from './workflowSpreadsheetUtils';
import type { Task, UserRole } from '@/types';

type ColumnDef = { key: string; aliases: string[] };

const TASK_COLUMNS: ColumnDef[] = [
  { key: 'name', aliases: ['task name', 'name', 'nama', 'nama task'] },
  { key: 'description', aliases: ['description', 'deskripsi', 'desc'] },
  { key: 'slaToComplete', aliases: ['sla days', 'sla day', 'sla', 'sla (days)'] },
  { key: 'isSystemTriggered', aliases: ['system triggered', 'system trigger', 'triggered', 'is system triggered'] },
  { key: 'triggerEventsCsv', aliases: ['trigger events', 'trigger event', 'triggers', 'system triggers'] },
];

const WORKFLOW_COLUMNS: ColumnDef[] = [
  { key: 'workflowName', aliases: ['workflow name', 'workflow', 'nama workflow', 'nama wf'] },
  { key: 'stepOrder', aliases: ['step', 'step #', 'step no', 'order', 'no', 'urutan'] },
  { key: 'taskName', aliases: ['task', 'task name', 'nama task'] },
  { key: 'roleNames', aliases: ['roles', 'role', 'peran', 'assigned roles'] },
  { key: 'slaDays', aliases: ['sla', 'sla days'] },
  { key: 'taskScore', aliases: ['score', 'score %', 'task score', 'task score %'] },
  { key: 'milestoneScore', aliases: ['milestone', 'milestone %', 'milestone score'] },
  { key: 'triggerTaskNames', aliases: ['triggers', 'trigger tasks', 'triggering tasks'] },
];

export const TASK_PASTE_TEMPLATE_HEADER =
  'Task Name\tDescription\tSLA (days)\tSystem Triggered (yes/no)\tTrigger Events (|)';

export const WORKFLOW_PASTE_TEMPLATE_HEADER =
  'Workflow Name\tStep #\tTask\tRoles (comma)\tSLA\tScore %\tMilestone %\tTriggers (comma)';

export const TASK_PASTE_TEMPLATE_EXAMPLE = [
  TASK_PASTE_TEMPLATE_HEADER,
  'Budget Approval\tApprove project budget\t5\tno\t',
  'PO Created\tPurchase order issued\t3\tyes\tPO_CREATED',
  'FS Approval\tFeasibility study sign-off\t7\tyes\tFS_APPROVAL',
].join('\n');

export const WORKFLOW_PASTE_TEMPLATE_EXAMPLE = [
  WORKFLOW_PASTE_TEMPLATE_HEADER,
  'Standard Capex\t1\tBudget Approval\tPMO, Finance\t5\t40\t\t',
  'Standard Capex\t2\tPO Created\tProcurement\t3\t30\t50\tBudget Approval',
  'Standard Capex\t3\tFS Approval\tPMO\t7\t30\t100\tPO Created',
].join('\n');

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function mapHeaderToKey(header: string, defs: ColumnDef[]): string | null {
  const norm = normalizeHeader(header);
  if (!norm) return null;
  for (const def of defs) {
    for (const alias of def.aliases) {
      const aliasNorm = normalizeHeader(alias);
      if (norm === aliasNorm || norm.includes(aliasNorm) || aliasNorm.includes(norm)) {
        return def.key;
      }
    }
  }
  return null;
}

function parseTsvLines(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim())
    .map((line) => line.split('\t'));
}

function resolveColumnKeys(
  firstRow: string[],
  defs: ColumnDef[],
): { keys: (string | null)[]; isHeader: boolean } {
  const mapped = firstRow.map((cell) => mapHeaderToKey(cell, defs));
  const mappedCount = mapped.filter(Boolean).length;
  const requiredCount = Math.max(1, Math.min(2, defs.length));
  if (mappedCount >= requiredCount) {
    return { keys: mapped, isHeader: true };
  }
  return { keys: defs.map((def) => def.key), isHeader: false };
}

function parseYesNo(value: string): 'yes' | 'no' {
  const v = value.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'ya'].includes(v)) return 'yes';
  return 'no';
}

function parseNumber(value: string, fallback = 0): number {
  const cleaned = String(value ?? '').trim().replace(/[^0-9.-]/g, '');
  if (!cleaned) return fallback;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : fallback;
}

function parseOptionalNumber(value: string): number | '' {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return '';
  const n = parseNumber(trimmed, NaN);
  return Number.isFinite(n) ? n : '';
}

function rowHasContent(values: Record<string, string>, keys: string[]): boolean {
  return keys.some((key) => (values[key] ?? '').trim() !== '');
}

export function parseClipboardToTaskRows(text: string): TaskMasterSpreadsheetRow[] {
  const matrix = parseTsvLines(text);
  if (matrix.length === 0) return [];

  const { keys: columnKeys, isHeader } = resolveColumnKeys(matrix[0], TASK_COLUMNS);
  const dataRows = isHeader ? matrix.slice(1) : matrix;

  const result: TaskMasterSpreadsheetRow[] = [];
  dataRows.forEach((cells, index) => {
    const values: Record<string, string> = {};
    columnKeys.forEach((key, colIndex) => {
      if (key) values[key] = (cells[colIndex] ?? '').trim();
    });
    if (!rowHasContent(values, ['name', 'description', 'triggerEventsCsv'])) return;

    result.push({
      ...createEmptyTaskRow(index),
      name: values.name ?? '',
      description: values.description ?? '',
      slaToComplete: parseNumber(values.slaToComplete ?? '', 0),
      isSystemTriggered: parseYesNo(values.isSystemTriggered ?? 'no'),
      triggerEventsCsv: values.triggerEventsCsv ?? '',
    });
  });

  return result;
}

/**
 * Parse TSV workflow steps. Baris berurutan dengan nama workflow sama = satu grup.
 * Perubahan nama workflow memulai grup baru (nama sama tidak digabung lintas blok).
 */
export function parseClipboardToWorkflowRows(
  text: string,
  roles: UserRole[],
  tasks: Task[],
): WorkflowSetSpreadsheetRow[] {
  const matrix = parseTsvLines(text);
  if (matrix.length === 0) return [];

  const { keys: columnKeys, isHeader } = resolveColumnKeys(matrix[0], WORKFLOW_COLUMNS);
  const dataRows = isHeader ? matrix.slice(1) : matrix;

  const parsed: Array<Record<string, string>> = [];
  dataRows.forEach((cells) => {
    const values: Record<string, string> = {};
    columnKeys.forEach((key, colIndex) => {
      if (key) values[key] = (cells[colIndex] ?? '').trim();
    });
    if (!rowHasContent(values, ['workflowName', 'taskName', 'roleNames', 'taskScore'])) return;
    parsed.push(values);
  });

  if (parsed.length === 0) return [];

  const result: WorkflowSetSpreadsheetRow[] = [];
  let currentGroupId = `wf-new-paste-${Date.now()}-0`;
  let lastWorkflowName = '';
  let groupCounter = 0;
  let stepCounterInGroup = 0;

  parsed.forEach((values, index) => {
    let workflowName = values.workflowName ?? '';
    if (!workflowName && lastWorkflowName) {
      workflowName = lastWorkflowName;
    }

    if (workflowName && workflowName !== lastWorkflowName) {
      groupCounter += 1;
      currentGroupId = `wf-new-paste-${Date.now()}-${groupCounter}`;
      lastWorkflowName = workflowName;
      stepCounterInGroup = 0;
    }

    stepCounterInGroup += 1;
    const stepOrder = values.stepOrder
      ? parseNumber(values.stepOrder, stepCounterInGroup)
      : stepCounterInGroup;

    const roleNames = values.roleNames ?? '';
    const triggerTaskNames = values.triggerTaskNames ?? '';
    const roleIds = roleNamesToIds(roleNames, roles);
    const triggeringTaskIds = taskNamesToIds(triggerTaskNames, tasks);

    const groupSeed = createNewWorkflowGroup(1)[0];
    result.push({
      ...groupSeed,
      id: `wf-paste-${Date.now()}-${index}`,
      workflowGroupId: currentGroupId,
      workflowName,
      stepOrder,
      taskName: values.taskName ?? '',
      roleIds,
      roleNames,
      slaDays: parseNumber(values.slaDays ?? '', 0),
      taskScore: parseNumber(values.taskScore ?? '', 0),
      milestoneScore: parseOptionalNumber(values.milestoneScore ?? ''),
      triggeringTaskIds,
      triggerTaskNames,
    });
  });

  return result;
}

export async function readClipboardText(): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return null;
  try {
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

export function mergePastedTaskRows(
  existing: TaskMasterSpreadsheetRow[],
  pasted: TaskMasterSpreadsheetRow[],
): TaskMasterSpreadsheetRow[] {
  const hasContent = existing.some((r) => r.name.trim() && !r._markedDelete);
  return hasContent ? [...existing, ...pasted] : pasted;
}

export function mergePastedWorkflowRows(
  existing: WorkflowSetSpreadsheetRow[],
  pasted: WorkflowSetSpreadsheetRow[],
): WorkflowSetSpreadsheetRow[] {
  const hasContent = existing.some((r) => (r.workflowName.trim() || r.taskName.trim()) && !r._markedDelete);
  return hasContent ? [...existing, ...pasted] : pasted;
}
