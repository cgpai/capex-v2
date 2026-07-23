import { fetchRecordsInBatches, toCamelCase } from '../project-list/supabase-helpers';
import type { SupabaseClient } from '@supabase/supabase-js';

const EMPTY_BUDGET_METRICS = {
  budgetCarryForward: 0,
  budgetAllocated: 0,
  approvedBudget: 0,
  consumedBudget: 0,
  assetCount: 0,
  noBudgetAssetCount: 0,
};

/** Ringkasan multi-year tanpa agregat periode — agregat di-load saat baris di-expand. */
export function buildMultiYearsShellFromRows(multiYearRows: any[]): any[] {
  if (!multiYearRows?.length) return [];
  return multiYearRows.map((item) => {
    const camelItem = toCamelCase(item) as Record<string, unknown>;
    return {
      name: camelItem.name,
      startYear: camelItem.startYear,
      endYear: camelItem.endYear,
      budget: {
        budgetPlan: Number(camelItem.budgetPlan || 0),
        ...EMPTY_BUDGET_METRICS,
      },
    };
  });
}

export function buildPeriodSummariesFromRows(periodRows: any[]): any[] {
  if (!periodRows?.length) return [];
  return periodRows.map((period) => {
    const camel = toCamelCase(period) as Record<string, unknown>;
    return {
      periodName: String(camel.periodName ?? ''),
      multiYearName: String(camel.multiYearName ?? ''),
      startDate: String(camel.startDate ?? ''),
      endDate: String(camel.endDate ?? ''),
      budget: {},
      archetypes: [],
    };
  });
}

export function buildMultiYearsFromRows(
  multiYearRows: any[],
  allPeriods: any[],
  allCategoryBudgets: any[],
): any[] {
  if (!multiYearRows?.length) return [];
  return multiYearRows.map((item) => {
    const camelItem = toCamelCase(item) as Record<string, unknown>;
    const multiYearName = String(camelItem.name ?? '');
    const periodsForMultiYear = allPeriods?.filter((p) => p.multi_year_name === multiYearName) || [];
    let totalAllocated = 0;
    let totalApproved = 0;
    let totalConsumed = 0;
    let totalCarryForward = 0;
    periodsForMultiYear.forEach((period) => {
      const periodCategoryBudgets =
        allCategoryBudgets?.filter((cb) => cb.period_name === period.period_name) || [];
      periodCategoryBudgets.forEach((cb) => {
        totalAllocated += Number(cb.budget_allocated || 0);
        totalApproved += Number(cb.approved_budget || 0);
        totalConsumed += Number(cb.consumed_budget || 0);
        totalCarryForward += Number(cb.budget_carry_forward || 0);
      });
    });
    return {
      name: camelItem.name,
      startYear: camelItem.startYear,
      endYear: camelItem.endYear,
      budget: {
        budgetPlan: Number(camelItem.budgetPlan || 0),
        budgetCarryForward: totalCarryForward,
        budgetAllocated: totalAllocated,
        approvedBudget: totalApproved,
        consumedBudget: totalConsumed,
        assetCount: 0,
        noBudgetAssetCount: 0,
      },
    };
  });
}

export async function loadPeriodCategoryBudgetsForMultiYear(
  client: SupabaseClient,
  multiYearName: string,
): Promise<any[]> {
  const trimmed = multiYearName.trim();
  if (!trimmed) return [];

  const { data: periods, error: periodError } = await client
    .from('budget_periods')
    .select('period_name, multi_year_name, start_date, end_date')
    .eq('multi_year_name', trimmed);
  if (periodError) {
    throw new Error(`budget_periods: ${periodError.message}`);
  }
  if (!periods?.length) return [];

  const periodNames = periods.map((p) => String(p.period_name ?? '')).filter(Boolean);
  const categoryBudgets = await fetchRecordsInBatches(
    client,
    'budget_period_category_budgets',
    'period_name',
    periodNames,
    'period_name, budget_category_id, budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget, asset_count, no_budget_asset_count',
  );

  const budgetsByPeriod = new Map<string, Record<string, unknown>>();
  for (const cb of categoryBudgets) {
    const pn = String(cb.period_name ?? '');
    if (!pn) continue;
    if (!budgetsByPeriod.has(pn)) budgetsByPeriod.set(pn, {});
    const row = budgetsByPeriod.get(pn)!;
    row[String(cb.budget_category_id)] = {
      budgetPlan: Number(cb.budget_plan || 0),
      budgetCarryForward: Number(cb.budget_carry_forward || 0),
      budgetAllocated: Number(cb.budget_allocated || 0),
      approvedBudget: Number(cb.approved_budget || 0),
      consumedBudget: Number(cb.consumed_budget || 0),
      assetCount: Number(cb.asset_count || 0),
      noBudgetAssetCount: Number(cb.no_budget_asset_count || 0),
    };
  }

  return periods.map((period) => {
    const camel = toCamelCase(period) as Record<string, unknown>;
    const periodName = String(camel.periodName ?? '');
    return {
      periodName,
      multiYearName: String(camel.multiYearName ?? trimmed),
      startDate: String(camel.startDate ?? ''),
      endDate: String(camel.endDate ?? ''),
      budget: budgetsByPeriod.get(periodName) ?? {},
      archetypes: [],
    };
  });
}
