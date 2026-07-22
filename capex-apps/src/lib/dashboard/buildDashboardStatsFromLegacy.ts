import type { BudgetItem, BudgetPeriod } from '@/types';
import { ProjectStatus } from '@/types';
import type { DashboardSnapshot } from '@/services/dashboardSnapshotApi';
import { EMPTY_DASHBOARD_STATS } from './constants';
import type { DashboardStats } from './types';

function categoryDisplayName(
  names: Record<string, string> | undefined,
  catId: string,
): string {
  if (!names) return 'Unknown';
  return names[catId] ?? 'Unknown';
}

/** Map BE snapshot DTO to view-model stats (no client aggregation). */
export function dashboardStatsFromSnapshot(snapshot: DashboardSnapshot): DashboardStats {
  return {
    totalBudget: snapshot.totalBudget,
    totalConsumed: snapshot.totalConsumed,
    projectCount: snapshot.projectCount,
    projectStatusData: snapshot.projectStatusData,
    budgetByCategory: snapshot.budgetByCategory,
    sankeyData: snapshot.sankeyData,
  };
}

/**
 * Legacy fallback only: aggregate from full budget tree when BFF is unavailable.
 * Prefer `dashboardStatsFromSnapshot` in production.
 */
export function buildDashboardStatsFromLegacy(
  budgetPeriod: BudgetPeriod | null,
  categoryNames: Record<string, string>,
): DashboardStats {
  if (!budgetPeriod) return EMPTY_DASHBOARD_STATS;

  const allProjects = budgetPeriod.archetypes.flatMap((a) => a.units.flatMap((u) => u.projects));
  const totalBudget = (Object.values(budgetPeriod.budget) as BudgetItem[]).reduce(
    (sum, cat) => sum + cat.budgetPlan + cat.budgetCarryForward,
    0,
  );
  const totalConsumed = (Object.values(budgetPeriod.budget) as BudgetItem[]).reduce(
    (sum, cat) => sum + cat.consumedBudget,
    0,
  );

  const projectStatusCounts = allProjects.reduce(
    (acc, proj) => {
      const statusName = ProjectStatus[proj.status] as keyof typeof acc;
      acc[statusName] = (acc[statusName] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  const projectStatusData = [
    { name: 'On Track', value: projectStatusCounts.OnTrack || 0, color: '#28A745' },
    { name: 'At Risk', value: projectStatusCounts.AtRisk || 0, color: '#FFC107' },
    { name: 'Off Track', value: projectStatusCounts.OffTrack || 0, color: '#DC3545' },
  ];

  const budgetByCategory = (Object.entries(budgetPeriod.budget) as [string, BudgetItem][])
    .map(([catId, budget]) => ({
      id: catId,
      name: categoryDisplayName(categoryNames, catId),
      approved: budget.approvedBudget,
      consumed: budget.consumedBudget,
    }))
    .filter((item) => item.approved > 0 || item.consumed > 0);

  const sankeyData: { source: string; target: string; value: number }[] = [];
  const totalBudgetValue = (Object.values(budgetPeriod.budget) as BudgetItem[]).reduce(
    (sum, cat) => sum + cat.budgetPlan,
    0,
  );
  if (totalBudgetValue > 0) {
    sankeyData.push({ source: 'Siloam Overall', target: 'Total Budget', value: totalBudgetValue });
  }

  budgetPeriod.archetypes.forEach((arch) => {
    const archTotal = (Object.values(arch.budget) as BudgetItem[]).reduce(
      (sum, cat) => sum + cat.budgetPlan,
      0,
    );
    if (archTotal > 0) {
      sankeyData.push({ source: 'Total Budget', target: arch.name, value: archTotal });
    }
    arch.units.forEach((unit) => {
      const unitTotal = (Object.values(unit.budget) as BudgetItem[]).reduce(
        (sum, cat) => sum + cat.budgetPlan,
        0,
      );
      if (unitTotal > 0) {
        sankeyData.push({ source: arch.name, target: unit.name, value: unitTotal });
      }
    });
  });

  return {
    totalBudget,
    totalConsumed,
    projectCount: allProjects.length,
    projectStatusData,
    budgetByCategory,
    sankeyData,
  };
}
