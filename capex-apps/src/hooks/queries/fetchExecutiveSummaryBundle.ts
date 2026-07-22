import type { BudgetPeriod } from '@/types';
import { ProjectStatus } from '@/types';
import * as budgetService from '@/services/budgetService';
import * as configService from '@/services/configService';
import { normalizeProjectStatus } from '@/lib/executiveSummary/utils';

export type ExecutiveSummaryLegacyMetrics = {
  projectCount: number;
  statusCounts: { OnTrack: number; AtRisk: number; OffTrack: number };
};

/** Client-side budget tree used when backend endpoints are unavailable. */
export type ExecutiveSummaryLegacyBundle = {
  budgetData: BudgetPeriod | null;
  categoryNames: Record<string, string>;
  metrics: ExecutiveSummaryLegacyMetrics;
};

const EMPTY_METRICS: ExecutiveSummaryLegacyMetrics = {
  projectCount: 0,
  statusCounts: { OnTrack: 0, AtRisk: 0, OffTrack: 0 },
};

function countStatusFromProjects(period: BudgetPeriod | null): ExecutiveSummaryLegacyMetrics {
  const projects = period?.archetypes.flatMap((a) => a.units.flatMap((u) => u.projects)) ?? [];
  const statusCounts = { OnTrack: 0, AtRisk: 0, OffTrack: 0 };
  for (const p of projects) {
    const s = normalizeProjectStatus(p.status);
    if (s === ProjectStatus.OnTrack) statusCounts.OnTrack += 1;
    else if (s === ProjectStatus.AtRisk) statusCounts.AtRisk += 1;
    else statusCounts.OffTrack += 1;
  }
  return { projectCount: projects.length, statusCounts };
}

/**
 * Loads the full budget period tree on the client for legacy fallback paths only.
 * Primary data flow uses paginated backend endpoints (`summary-stats`, `projects-page`).
 */
export async function fetchExecutiveSummaryBundle(
  periodName: string,
  _userId: number,
): Promise<ExecutiveSummaryLegacyBundle> {
  if (!periodName.trim()) {
    return { budgetData: null, categoryNames: {}, metrics: EMPTY_METRICS };
  }

  const [period, categories] = await Promise.all([
    budgetService.getBudgetByPeriodName(periodName),
    configService.getActiveBudgetCategories(),
  ]);

  return {
    budgetData: period ?? null,
    categoryNames: Object.fromEntries(categories.map((c) => [String(c.id), c.name])),
    metrics: countStatusFromProjects(period ?? null),
  };
}
