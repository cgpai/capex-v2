/** Fields required for Capex Project List table rows (not detail/editor). */
const SLIM_TABLE_ROW_KEYS = [
  'id',
  'assetCode',
  'assetName',
  'projectId',
  'projectName',
  'projectCode',
  'huName',
  'archetypeName',
  'workflowSetId',
  'budgetCategoryId',
  'endTargetDate',
  'projectionEndDate',
  'completionRate',
  'actionableTaskCount',
  'bddPriority',
  'projectPriorityId',
  'assetTypeGroupName',
] as const;

/** Fields required for inline table edits / column lookups. */
const SLIM_TABLE_PROJECT_KEYS = [
  'id',
  'periodName',
  'budgetCategoryId',
  'priorityId',
  'hospitalUnitId',
  'projectName',
  'projectCode',
  'assetName',
] as const;

function pickKeys(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (row[key] !== undefined) out[key] = row[key];
  }
  return out;
}

export function toSlimTableRow(asset: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(asset, SLIM_TABLE_ROW_KEYS);
}

export function toSlimTableProject(project: Record<string, unknown>): Record<string, unknown> {
  return pickKeys(project, SLIM_TABLE_PROJECT_KEYS);
}

export function slimProjectListWirePayload<T extends Record<string, unknown>>(
  payload: T,
  opts?: { keepMaster?: boolean; keepFullRows?: boolean },
): T {
  if (opts?.keepMaster && opts?.keepFullRows) return payload;

  const out: Record<string, unknown> = { ...payload };

  if (!opts?.keepMaster) {
    out.workflows = [];
    out.archetypes = [];
    out.hus = [];
    out.users = [];
    out.allRoles = [];
    out.allTasks = [];
    out.priorities = [];
  }

  if (!opts?.keepFullRows) {
    if (Array.isArray(out.enrichedAssets)) {
      out.enrichedAssets = out.enrichedAssets.map((row) =>
        toSlimTableRow(row as Record<string, unknown>),
      );
    }
    if (Array.isArray(out.projects)) {
      out.projects = out.projects.map((row) =>
        toSlimTableProject(row as Record<string, unknown>),
      );
    }
  }

  return out as T;
}
