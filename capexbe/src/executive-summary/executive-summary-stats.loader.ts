import type { SupabaseClient } from '@supabase/supabase-js';
import { toCamelCase } from '../project-list/supabase-helpers';
import type { ExecutiveSummaryListFilters } from './executive-summary.dto';
import { applyExecutiveSummaryFilters } from './executive-summary-query.util';

export type ExecutiveSummaryPulse = {
  totalBudget: number;
  totalConsumed: number;
  remainingBudgetPlan: number;
  remainingBudgetPlanPct: number;
  approvedBudget: number;
  activeProjectCount: number;
  withProgressCount: number;
  withProgressPct: number;
  noEndDateCount: number;
  noEndDatePct: number;
  noBudgetPlanCount: number;
  noBudgetPlanPct: number;
};

export type LifecyclePreviewItem = {
  id: string;
  huCode: string;
  projectName: string;
  taskToDo: string | null;
  completionRate: number;
  status: number;
};

export type PlanningBudgetScoringAsset = {
  id: string;
  assetCode: string;
  assetName: string;
  budgetPlan: number;
};

export type PlanningBudgetScoringItem = {
  id: string;
  projectName: string;
  assetCode: string;
  budgetPlan: number;
  assets: PlanningBudgetScoringAsset[];
};

export type ExecutiveSummaryStatsResult = {
  totalProjectsInPeriod: number;
  filteredCount: number;
  activeHuCount: number;
  totalRevenue: number;
  totalAssetImpact: number;
  pulse: ExecutiveSummaryPulse;
  buckets: {
    preCon: { count: number; items: PlanningBudgetScoringItem[] };
    inCon: { count: number; items: LifecyclePreviewItem[] };
    postCon: { count: number; items: LifecyclePreviewItem[] };
    attention: { count: number; items: LifecyclePreviewItem[] };
  };
};

const PREVIEW_SELECT = `
  id,
  project_name,
  completion_rate,
  status,
  task_to_do,
  hospital_units_config!inner ( code, name )
`;

const PREVIEW_LIMIT = 40;
const PLANNING_SCORING_LIMIT = 15;

const PLANNING_SCORING_SELECT = `
  id,
  project_name,
  asset_code,
  budget_plan,
  budget_carry_forward
`;

type BucketKind = 'preCon' | 'inCon' | 'postCon' | 'attention' | null;

function applyBucketFilter<T extends { eq: (c: string, v: unknown) => T; neq: (c: string, v: unknown) => T; gt: (c: string, v: number) => T; lt: (c: string, v: number) => T; in: (c: string, v: number[]) => T }>(
  q: T,
  bucket: BucketKind,
): T {
  if (!bucket) return q;
  if (bucket === 'preCon') return q.eq('completion_rate', 0).neq('status', 2) as T;
  if (bucket === 'inCon') return q.gt('completion_rate', 0).lt('completion_rate', 100) as T;
  if (bucket === 'postCon') return q.eq('completion_rate', 100) as T;
  return q.in('status', [1, 2]) as T;
}

async function countFiltered(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
  bucket: BucketKind = null,
): Promise<number> {
  let q = client.from('projects').select('id', { count: 'exact', head: true }).eq('period_name', periodName.trim());
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  q = applyBucketFilter(q, bucket);
  const { count, error } = await q;
  if (error) throw new Error(`count: ${error.message}`);
  return count ?? 0;
}

async function fetchPreview(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
  bucket: BucketKind,
): Promise<LifecyclePreviewItem[]> {
  let q = client.from('projects').select(PREVIEW_SELECT).eq('period_name', periodName.trim());
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  q = applyBucketFilter(q, bucket);
  q = q.order('project_name', { ascending: true }).limit(PREVIEW_LIMIT) as typeof q;
  const { data, error } = await q;
  if (error) throw new Error(`preview: ${error.message}`);
  return (data || []).map((row: Record<string, unknown>) => {
    const camel = toCamelCase(row) as Record<string, unknown>;
    const hu = toCamelCase(row.hospital_units_config) as Record<string, unknown>;
    const huNested = Array.isArray(row.hospital_units_config)
      ? toCamelCase((row.hospital_units_config as Record<string, unknown>[])[0])
      : hu;
    return {
      id: String(camel.id ?? ''),
      huCode: String(huNested.code ?? ''),
      projectName: String(camel.projectName ?? ''),
      taskToDo: camel.taskToDo != null ? String(camel.taskToDo) : null,
      completionRate: Number(camel.completionRate ?? 0),
      status: Number(camel.status ?? 0),
    };
  });
}

async function fetchAssetsByProjectIds(
  client: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, PlanningBudgetScoringAsset[]>> {
  const byProject = new Map<string, PlanningBudgetScoringAsset[]>();
  if (projectIds.length === 0) return byProject;

  const unique = [...new Set(projectIds.map(String))];
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data, error } = await client
      .from('assets')
      .select('id, project_id, asset_code, asset_name, budget_plan')
      .in('project_id', chunk)
      .order('asset_code', { ascending: true });
    if (error) throw new Error(`planning assets: ${error.message}`);
    for (const row of data || []) {
      const r = row as {
        id: string;
        project_id: string;
        asset_code?: string;
        asset_name?: string;
        budget_plan?: number;
      };
      const pid = String(r.project_id);
      const list = byProject.get(pid) ?? [];
      list.push({
        id: String(r.id),
        assetCode: String(r.asset_code ?? ''),
        assetName: String(r.asset_name ?? ''),
        budgetPlan: Number(r.budget_plan ?? 0),
      });
      byProject.set(pid, list);
    }
  }
  return byProject;
}

async function fetchPlanningBudgetScoring(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<PlanningBudgetScoringItem[]> {
  let q = client.from('projects').select(PLANNING_SCORING_SELECT).eq('period_name', periodName.trim());
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  q = applyBucketFilter(q, 'preCon');
  q = q.order('budget_plan', { ascending: false }).limit(PLANNING_SCORING_LIMIT) as typeof q;
  const { data, error } = await q;
  if (error) throw new Error(`planning scoring: ${error.message}`);

  const rows = (data || []) as Array<{
    id: string;
    project_name?: string;
    asset_code?: string;
    budget_plan?: number;
    budget_carry_forward?: number;
  }>;

  const sorted = [...rows].sort((a, b) => {
    const av = Number(a.budget_plan ?? 0) + Number(a.budget_carry_forward ?? 0);
    const bv = Number(b.budget_plan ?? 0) + Number(b.budget_carry_forward ?? 0);
    return bv - av;
  });

  const projectIds = sorted.map((r) => String(r.id));
  const assetsByProject = await fetchAssetsByProjectIds(client, projectIds);

  return sorted.map((row) => {
    const id = String(row.id);
    const assets = assetsByProject.get(id) ?? [];
    const projectAssetCode = String(row.asset_code ?? '').trim();
    const primaryAssetCode = projectAssetCode || assets[0]?.assetCode || '—';
    const budgetPlan = Number(row.budget_plan ?? 0) + Number(row.budget_carry_forward ?? 0);
    return {
      id,
      projectName: String(row.project_name ?? ''),
      assetCode: primaryAssetCode,
      budgetPlan,
      assets,
    };
  });
}

async function sumRevenueFiltered(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  let total = 0;
  let from = 0;
  const batch = 500;
  while (true) {
    let q = client.from('projects').select('revenue_projection').eq('period_name', periodName.trim());
    q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`revenue sum: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      total += Number((row as { revenue_projection: number }).revenue_projection ?? 0);
    }
    if (data.length < batch) break;
    from += batch;
  }
  return total;
}

async function countDistinctHu(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  const codes = new Set<string>();
  let from = 0;
  const batch = 500;
  while (true) {
    let q = client
      .from('projects')
      .select('hospital_units_config!inner(code)')
      .eq('period_name', periodName.trim());
    q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`hu distinct: ${error.message}`);
    if (!data?.length) break;
    for (const row of data as { hospital_units_config: { code?: string } | { code?: string }[] }[]) {
      const hu = row.hospital_units_config;
      const code = Array.isArray(hu) ? hu[0]?.code : hu?.code;
      if (code) codes.add(String(code));
    }
    if (data.length < batch) break;
    from += batch;
  }
  return codes.size;
}

async function countAssetImpact(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  let total = 0;
  let from = 0;
  const batch = 200;
  while (true) {
    let q = client.from('projects').select('id').eq('period_name', periodName.trim());
    q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`project ids: ${error.message}`);
    if (!data?.length) break;
    const ids = data.map((r: { id: string }) => String(r.id));
    const { count, error: cErr } = await client
      .from('assets')
      .select('id', { count: 'exact', head: true })
      .in('project_id', ids);
    if (cErr) throw new Error(`assets: ${cErr.message}`);
    total += count ?? 0;
    if (data.length < batch) break;
    from += batch;
  }
  return total;
}

async function countProjectsWithProgress(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  let q = client
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('period_name', periodName.trim())
    .gt('completion_rate', 0);
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  const { count, error } = await q;
  if (error) throw new Error(`with progress count: ${error.message}`);
  return count ?? 0;
}

async function countProjectsWithoutEndDate(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  let q = client
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('period_name', periodName.trim())
    .or('end_date.is.null,end_date.eq.');
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  const { count, error } = await q;
  if (error) throw new Error(`no end date count: ${error.message}`);
  return count ?? 0;
}

async function countProjectsWithoutBudgetPlan(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<number> {
  let q = client
    .from('projects')
    .select('id', { count: 'exact', head: true })
    .eq('period_name', periodName.trim())
    .or('budget_plan.is.null,budget_plan.eq.0');
  q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
  const { count, error } = await q;
  if (error) throw new Error(`no budget plan count: ${error.message}`);
  return count ?? 0;
}

async function sumProjectBudgetPulse(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<{ totalBudget: number; totalConsumed: number; approvedBudget: number }> {
  let totalBudget = 0;
  let totalConsumed = 0;
  let approvedBudget = 0;
  let from = 0;
  const batch = 500;
  while (true) {
    let q = client
      .from('projects')
      .select('budget_plan, budget_carry_forward, consumed_budget, approved_budget')
      .eq('period_name', periodName.trim());
    q = applyExecutiveSummaryFilters(q, periodName, filters, search) as typeof q;
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`project budget sum: ${error.message}`);
    if (!data?.length) break;
    for (const row of data) {
      const r = row as {
        budget_plan?: number;
        budget_carry_forward?: number;
        consumed_budget?: number;
        approved_budget?: number;
      };
      totalBudget += Number(r.budget_plan ?? 0) + Number(r.budget_carry_forward ?? 0);
      totalConsumed += Number(r.consumed_budget ?? 0);
      approvedBudget += Number(r.approved_budget ?? 0);
    }
    if (data.length < batch) break;
    from += batch;
  }
  return { totalBudget, totalConsumed, approvedBudget };
}

export async function loadExecutiveSummaryStats(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
  search: string,
): Promise<ExecutiveSummaryStatsResult> {
  const pn = periodName.trim();
  const emptyFilters: ExecutiveSummaryListFilters = {
    archetypeId: undefined,
    capexType: 'all',
    status: 'all',
    huCodes: [],
  };

  const [
    totalProjectsInPeriod,
    filteredCount,
    preConCount,
    inConCount,
    postConCount,
    attentionCount,
    preConItems,
    inConItems,
    postConItems,
    attentionItems,
    totalRevenue,
    activeHuCount,
    totalAssetImpact,
    withProgressCount,
    noEndDateCount,
    noBudgetPlanCount,
    pulseBudget,
  ] = await Promise.all([
    countFiltered(client, pn, emptyFilters, ''),
    countFiltered(client, pn, filters, search),
    countFiltered(client, pn, filters, search, 'preCon'),
    countFiltered(client, pn, filters, search, 'inCon'),
    countFiltered(client, pn, filters, search, 'postCon'),
    countFiltered(client, pn, filters, search, 'attention'),
    fetchPlanningBudgetScoring(client, pn, filters, search),
    fetchPreview(client, pn, filters, search, 'inCon'),
    fetchPreview(client, pn, filters, search, 'postCon'),
    fetchPreview(client, pn, filters, search, 'attention'),
    sumRevenueFiltered(client, pn, filters, search),
    countDistinctHu(client, pn, filters, search),
    countAssetImpact(client, pn, filters, search),
    countProjectsWithProgress(client, pn, filters, search),
    countProjectsWithoutEndDate(client, pn, filters, search),
    countProjectsWithoutBudgetPlan(client, pn, filters, search),
    sumProjectBudgetPulse(client, pn, filters, search),
  ]);

  const remainingBudgetPlan = Math.max(0, pulseBudget.totalBudget - pulseBudget.totalConsumed);
  const remainingBudgetPlanPct =
    pulseBudget.totalBudget > 0
      ? Math.round((remainingBudgetPlan / pulseBudget.totalBudget) * 1000) / 10
      : 0;
  const withProgressPct =
    filteredCount > 0 ? Math.round((withProgressCount / filteredCount) * 1000) / 10 : 0;
  const noEndDatePct =
    filteredCount > 0 ? Math.round((noEndDateCount / filteredCount) * 1000) / 10 : 0;
  const noBudgetPlanPct =
    filteredCount > 0 ? Math.round((noBudgetPlanCount / filteredCount) * 1000) / 10 : 0;

  return {
    totalProjectsInPeriod,
    filteredCount,
    activeHuCount,
    totalRevenue,
    totalAssetImpact,
    pulse: {
      totalBudget: pulseBudget.totalBudget,
      totalConsumed: pulseBudget.totalConsumed,
      remainingBudgetPlan,
      remainingBudgetPlanPct,
      approvedBudget: pulseBudget.approvedBudget,
      activeProjectCount: filteredCount,
      withProgressCount,
      withProgressPct,
      noEndDateCount,
      noEndDatePct,
      noBudgetPlanCount,
      noBudgetPlanPct,
    },
    buckets: {
      preCon: { count: preConCount, items: preConItems },
      inCon: { count: inConCount, items: inConItems },
      postCon: { count: postConCount, items: postConItems },
      attention: { count: attentionCount, items: attentionItems },
    },
  };
}
