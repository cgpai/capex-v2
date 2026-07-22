const WORKFLOW_BYPASS_ROLE_NAMES = ['Super Admin', 'PMO'] as const;

const normRole = (name: string | undefined | null): string =>
  String(name ?? '').trim().toLowerCase();

export function isWorkflowBypassRole(user: { assignments?: { roleName?: string }[] } | null | undefined): boolean {
  if (!user?.assignments?.length) return false;
  return user.assignments.some((a) =>
    WORKFLOW_BYPASS_ROLE_NAMES.some((r) => normRole(a.roleName) === normRole(r)),
  );
}

export function getEffectiveSlaDays(
  step: { slaToComplete?: number },
  status?: { slaToCompleteOverride?: number | null } | null,
): number {
  const override = status?.slaToCompleteOverride;
  if (override != null && Number.isFinite(override) && override >= 0) {
    return override;
  }
  return step.slaToComplete ?? 0;
}
