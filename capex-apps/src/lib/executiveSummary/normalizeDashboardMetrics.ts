import type { ExecutiveDashboardMetrics } from './dashboardTypes';
import { EMPTY_EXECUTIVE_DASHBOARD } from './dashboardTypes';

function num(value: unknown, fallback = 0): number {
  if (value == null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Coerce API payload (incl. legacy summary keys) into a complete dashboard view-model. */
export function normalizeExecutiveDashboardMetrics(
  raw: Partial<ExecutiveDashboardMetrics> | null | undefined,
): ExecutiveDashboardMetrics {
  if (!raw) return EMPTY_EXECUTIVE_DASHBOARD;

  const s = (raw.summary ?? {}) as Record<string, unknown>;
  const units = raw.budgetByUnit ?? [];

  const unitBudgetSum = units.reduce((acc, u) => acc + num(u.budget), 0);
  const unitConsumedSum = units.reduce((acc, u) => acc + num(u.consumed), 0);

  const totalBudget = num(s.totalBudget);
  const budgetAllocationToProject = num(s.budgetAllocationToProject, unitBudgetSum);
  const budgetApproval = num(s.budgetApproval, num(s.approvedValue));
  const budgetConsumed = num(s.budgetConsumed, num(s.budgetUsed, unitConsumedSum));
  const budgetRevenuePerMonth = num(s.budgetRevenuePerMonth);
  const utilizationPct =
    totalBudget > 0
      ? num(s.utilizationPct, Math.round((budgetConsumed / totalBudget) * 1000) / 10)
      : 0;

  const rawStatus = (raw.capexStatus ?? {}) as Record<string, unknown>;
  const capexStatus = {
    projectCount: num(rawStatus.projectCount, num(s.totalCapexSubmission)),
    assetCount: num(rawStatus.assetCount),
    fsApprovalCount: num(rawStatus.fsApprovalCount),
    poSentCount: num(rawStatus.poSentCount),
    readyToUseCount: num(rawStatus.readyToUseCount),
    cancelledCount: num(rawStatus.cancelledCount),
    cancelledAssets: Array.isArray(rawStatus.cancelledAssets) ? rawStatus.cancelledAssets : [],
    donutSlices: Array.isArray(rawStatus.donutSlices) ? rawStatus.donutSlices : [],
    avgApprovalDays:
      rawStatus.avgApprovalDays == null || rawStatus.avgApprovalDays === ''
        ? null
        : num(rawStatus.avgApprovalDays),
    overdueSlaCount: num(rawStatus.overdueSlaCount),
  };

  return {
    budgetByUnit: units,
    capexStatus,
    categoryBreakdown: raw.categoryBreakdown ?? [],
    monthlyTrend: raw.monthlyTrend ?? [],
    topInvestments: raw.topInvestments ?? [],
    topUnits: raw.topUnits ?? units.slice(0, 5),
    alerts: raw.alerts ?? [],
    updatedAt: raw.updatedAt ?? '',
    periodMeta: raw.periodMeta ?? null,
    summary: {
      totalBudget,
      budgetAllocationToProject,
      budgetApproval,
      budgetConsumed,
      budgetRevenuePerMonth,
      utilizationPct,
      totalCapexSubmission: num(s.totalCapexSubmission),
      pendingApprovalValue: num(s.pendingApprovalValue),
      approvedValue: num(s.approvedValue, budgetApproval),
      rejectedCount: num(s.rejectedCount),
      waitingApprovalCount: num(s.waitingApprovalCount),
    },
  };
}
