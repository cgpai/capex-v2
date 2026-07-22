import { TaskCurrentStatus } from '../types';
import type { AssetTaskStatus, User, UserRole, WorkflowSet, WorkflowStep } from '../types';

/** Roles that may force-complete workflow tasks regardless of trigger / Locked state. */
export const WORKFLOW_BYPASS_ROLE_NAMES = ['Super Admin', 'PMO'] as const;

const normRole = (name: string | undefined | null): string =>
  String(name ?? '').trim().toLowerCase();

export function isWorkflowBypassRole(user: User | null | undefined): boolean {
  if (!user?.assignments?.length) return false;
  return user.assignments.some((a) =>
    WORKFLOW_BYPASS_ROLE_NAMES.some((r) => normRole(a.roleName) === normRole(r)),
  );
}

/** Per-asset SLA override on status row; falls back to workflow step default. */
export function getEffectiveSlaDays(
  step: Pick<WorkflowStep, 'slaToComplete'>,
  status?: AssetTaskStatus | null,
): number {
  const override = status?.slaToCompleteOverride;
  if (override != null && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return step.slaToComplete ?? 0;
}

const normId = (value: string | number | undefined | null): string =>
  String(value ?? '').trim();

const normRoleId = (value: string | number | undefined | null): number | null => {
  if (value == null || value === '') return null;
  const n = typeof value === 'number' && Number.isFinite(value) ? value : parseInt(String(value), 10);
  return Number.isFinite(n) ? n : null;
};

/** Roles assigned to a workflow step (role_id match is tolerant of number/string). */
export function getStepAssignedRoles(
  step: Pick<WorkflowStep, 'roleIds'>,
  allRoles: UserRole[],
): UserRole[] {
  const roleIds = step.roleIds ?? [];
  if (!roleIds.length || !allRoles.length) return [];
  return allRoles.filter((r) =>
    roleIds.some((rid) => {
      const a = normRoleId(rid);
      const b = normRoleId(r.id);
      return a != null && b != null && a === b;
    }),
  );
}

/** Fallback when roles master is empty/unavailable — use the logged-in user's assignment. */
function roleFromUserAssignments(user: User, allRoles: UserRole[]): UserRole | undefined {
  const assignment =
    user.assignments.find((a) =>
      WORKFLOW_BYPASS_ROLE_NAMES.some((r) => normRole(a.roleName) === normRole(r)),
    ) ?? user.assignments.find((a) => String(a.roleName ?? '').trim());
  const roleName = String(assignment?.roleName ?? '').trim();
  if (!roleName) return undefined;
  const matched = allRoles.find((r) => normRole(r.roleName) === normRole(roleName));
  if (matched) return matched;
  return { id: 0, roleName, permissions: [] };
}

/**
 * Role used to complete a workflow task (Mark as Done). Bypass users (PMO / Super Admin)
 * always get a role even when master roles fail to load.
 */
export function resolveWorkflowActionableRole(
  user: User,
  step: Pick<WorkflowStep, 'roleIds'>,
  allRoles: UserRole[],
): UserRole | undefined {
  const userRoleNames = new Set(user.assignments.map((a) => String(a.roleName ?? '').trim()));
  const userRoleNamesLower = new Set([...userRoleNames].map((name) => name.toLowerCase()));
  const isBypass = isWorkflowBypassRole(user);
  const assignedRoles = getStepAssignedRoles(step, allRoles);

  const userHasAssignedRole = assignedRoles.find((r) => {
    const roleName = String(r.roleName ?? '').trim();
    return userRoleNames.has(roleName) || userRoleNamesLower.has(roleName.toLowerCase());
  });

  const anyUserRole = allRoles.find((r) => {
    const roleName = String(r.roleName ?? '').trim();
    return userRoleNames.has(roleName) || userRoleNamesLower.has(roleName.toLowerCase());
  });

  const baseActionableRole =
    userHasAssignedRole ?? (assignedRoles.length === 0 ? anyUserRole ?? undefined : undefined);

  if (isBypass) {
    return (
      assignedRoles[0] ??
      allRoles.find((r) => {
        const rn = normRole(r.roleName);
        return rn === 'super admin' || rn === 'pmo';
      }) ??
      anyUserRole ??
      allRoles[0] ??
      roleFromUserAssignments(user, allRoles)
    );
  }

  return baseActionableRole;
}

/**
 * Count workflow steps that are actionable for the current user.
 * Mirrors timeline behavior so badges stay consistent with detail panel.
 */
export function countActionableWorkflowTasks(
  user: User | null | undefined,
  workflow: WorkflowSet | null | undefined,
  statuses: AssetTaskStatus[] | null | undefined,
  allRoles: UserRole[] | null | undefined,
): number {
  if (!user || !workflow?.steps?.length) return 0;

  const roleList = allRoles ?? [];
  const statusRows = statuses ?? [];
  const statusesByTaskId = new Map(
    statusRows.map((row) => [normId(row.taskId), row] as const),
  );

  const isTaskDone = (taskId: string): boolean => {
    const row = statusesByTaskId.get(normId(taskId));
    const st = row?.status;
    return st === TaskCurrentStatus.Done || String(st ?? '').toLowerCase() === 'done';
  };

  const steps = [...workflow.steps].sort((a, b) => a.order - b.order);
  let actionableCount = 0;

  steps.forEach((step, index) => {
    const taskId = normId(step.taskId);
    if (isTaskDone(taskId)) return;

    const rawStatus = statusesByTaskId.get(taskId)?.status;
    let normalizedStatus: TaskCurrentStatus;
    if (rawStatus === TaskCurrentStatus.Open || String(rawStatus ?? '').toLowerCase() === 'open') {
      normalizedStatus = TaskCurrentStatus.Open;
    } else if (rawStatus === TaskCurrentStatus.Done || String(rawStatus ?? '').toLowerCase() === 'done') {
      normalizedStatus = TaskCurrentStatus.Done;
    } else {
      const triggerIds = (step.triggeringTaskIds?.length ?? 0) > 0
        ? step.triggeringTaskIds
        : (index > 0 ? [steps[index - 1].taskId] : []);
      const triggersMet = triggerIds.every((id) => isTaskDone(normId(id)));
      normalizedStatus = triggersMet ? TaskCurrentStatus.Open : TaskCurrentStatus.Locked;
    }

    const actionableRole = resolveWorkflowActionableRole(user, step, roleList);
    const canWorkOnStatus = normalizedStatus !== TaskCurrentStatus.Done;
    const isActionable = canWorkOnStatus && !!actionableRole;

    if (isActionable) actionableCount += 1;
  });

  return actionableCount;
}
