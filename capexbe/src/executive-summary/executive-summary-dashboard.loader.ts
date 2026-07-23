import type { SupabaseClient } from '@supabase/supabase-js';
import {
  canonicalAssetKey,
  fetchAllRecordsWhereEq,
  fetchRecordsByAssetIds,
  fetchRecordsInBatches,
  normAssetTaskStatusRow,
  normTaskLogRow,
} from '../project-list/supabase-helpers';
import { getSlimTasksForPipeline, getWorkflowSetsByIds } from '../project-list/master-data.loader';
import { calculateRates, groupLogsByAsset, groupStatusesByAsset } from '../project-list/progress-aggregate';
import type { ExecutiveSummaryListFilters } from './executive-summary.dto';
import { applyExecutiveSummaryFilters } from './executive-summary-query.util';

export type ExecutiveDashboardUnitRow = {
  unitCode: string;
  unitName: string;
  budget: number;
  consumed: number;
  utilizationPct: number;
};

export type ExecutiveDashboardCancelledAsset = {
  id: string;
  assetCode: string;
  assetName: string;
  projectName: string;
  unitCode: string;
};

export type ExecutiveDashboardCapexDonutSlice = {
  id: string;
  name: string;
  value: number;
  color: string;
  pct: number;
};

export type ExecutiveDashboardCapexStatus = {
  projectCount: number;
  assetCount: number;
  fsApprovalCount: number;
  poSentCount: number;
  readyToUseCount: number;
  cancelledCount: number;
  cancelledAssets: ExecutiveDashboardCancelledAsset[];
  donutSlices: ExecutiveDashboardCapexDonutSlice[];
  avgApprovalDays: number | null;
  overdueSlaCount: number;
};

const CAPEX_DONUT_STAGES: Array<{ id: string; name: string; color: string }> = [
  { id: 'belumFs', name: 'Belum FS Approval', color: '#94A3B8' },
  { id: 'fsApproval', name: 'Sudah FS Approval', color: '#00A3E0' },
  { id: 'poSent', name: 'Sudah PO', color: '#F59E0B' },
  { id: 'readyToUse', name: 'Ready to Use', color: '#28A745' },
  { id: 'cancelled', name: 'Cancel', color: '#DC3545' },
];

export type ExecutiveDashboardCategorySlice = {
  id: string;
  name: string;
  value: number;
  pct: number;
};

export type ExecutiveDashboardMonthlyPoint = {
  month: string;
  label: string;
  realization: number;
  priorYear: number;
  budgetTarget: number;
};

export type ExecutiveDashboardTopInvestment = {
  id: string;
  projectName: string;
  unitCode: string;
  amount: number;
  statusLabel: string;
};

export type ExecutiveDashboardAlert = {
  severity: 'red' | 'yellow';
  title: string;
  detail: string;
};

export type ExecutiveDashboardMetrics = {
  summary: {
    totalBudget: number;
    budgetAllocationToProject: number;
    budgetApproval: number;
    budgetConsumed: number;
    budgetRevenuePerMonth: number;
    utilizationPct: number;
    totalCapexSubmission: number;
    pendingApprovalValue: number;
    approvedValue: number;
    rejectedCount: number;
    waitingApprovalCount: number;
  };
  budgetByUnit: ExecutiveDashboardUnitRow[];
  capexStatus: ExecutiveDashboardCapexStatus;
  categoryBreakdown: ExecutiveDashboardCategorySlice[];
  monthlyTrend: ExecutiveDashboardMonthlyPoint[];
  topInvestments: ExecutiveDashboardTopInvestment[];
  topUnits: ExecutiveDashboardUnitRow[];
  alerts: ExecutiveDashboardAlert[];
  updatedAt: string;
};

type ProjectRow = {
  id: string;
  project_name: string;
  completion_rate: number;
  status: number;
  hospital_unit_id?: string;
  budget_plan?: number;
  budget_carry_forward?: number;
  budget_allocated?: number;
  consumed_budget?: number;
  approved_budget?: number;
  budget_revenue_permonth?: number | null;
  budget_category_id?: string | null;
  target_start?: string | null;
  end_date?: string | null;
  hospital_units_config: { code?: string; name?: string; archetype_id?: string } | { code?: string; name?: string; archetype_id?: string }[];
};

type AssetRow = {
  id: string;
  project_id: string;
  asset_code?: string;
  asset_name?: string;
  consumed_budget?: number;
  is_goods_received?: boolean;
  lifecycle_status?: string | null;
  workflow_set_id?: string | null;
  po_number?: string | null;
};

type TaskMeta = {
  id: string;
  name?: string;
  isSystemTriggered?: boolean;
  triggerEvent?: string;
  triggerEvents?: string[];
};

type CategoryBudgetRow = {
  budget_category_id?: string;
  budget_plan?: number;
  budget_carry_forward?: number;
  budget_allocated?: number;
  approved_budget?: number;
  consumed_budget?: number;
};

type FsRow = {
  project_id: string;
  conclusion?: string;
  created_at?: string;
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const SLA_DAYS = 14;
const LARGE_INVESTMENT_THRESHOLD = 500_000_000;
const APPROVED_CONCLUSIONS = new Set(['Approved', 'Approved with Notes']);
const CATEGORY_BUDGET_SELECT =
  'budget_category_id, budget_plan, budget_carry_forward, budget_allocated, approved_budget, consumed_budget';
const ARCHETYPE_BUDGET_SELECT = 'archetype_id, budget_category_id, budget_plan';
const HU_BUDGET_SELECT = 'hospital_unit_id, budget_category_id, budget_plan';
const ASSET_STATUS_SELECT = 'asset_id, task_id, status';
const ASSET_LOG_SELECT = 'asset_id, task_id, completed_at';

function rowNum(row: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const raw = row[key];
    if (raw == null || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function projectPlanBudget(row: ProjectRow): number {
  const r = row as Record<string, unknown>;
  return rowNum(r, 'budget_plan', 'budgetPlan') + rowNum(r, 'budget_carry_forward', 'budgetCarryForward');
}

function huFromRow(row: ProjectRow): { code: string; name: string; id: string; archetypeId: string } {
  const hu = row.hospital_units_config;
  const nested = Array.isArray(hu) ? hu[0] : hu;
  return {
    code: String(nested?.code ?? '—'),
    name: String(nested?.name ?? '—'),
    id: String(row.hospital_unit_id ?? ''),
    archetypeId: String(nested?.archetype_id ?? ''),
  };
}

async function fetchFilteredProjects(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  let from = 0;
  const batch = 500;
  while (true) {
    let q = client
      .from('projects')
      .select(
        `id, project_name, completion_rate, status, hospital_unit_id,
         budget_plan, budget_carry_forward, budget_allocated,
         consumed_budget, approved_budget, budget_revenue_permonth, budget_category_id,
         target_start, end_date,
         hospital_units_config!inner ( code, name, archetype_id )`,
      )
      .eq('period_name', periodName.trim());
    q = applyExecutiveSummaryFilters(q, periodName, filters, '') as typeof q;
    const { data, error } = await q.range(from, from + batch - 1);
    if (error) throw new Error(`dashboard projects: ${error.message}`);
    if (!data?.length) break;
    rows.push(...(data as ProjectRow[]));
    if (data.length < batch) break;
    from += batch;
  }
  return rows;
}

function hasScopeFilter(filters: ExecutiveSummaryListFilters): boolean {
  return Boolean(
    filters.archetypeId ||
      filters.huCodes.length > 0 ||
      filters.capexType !== 'all' ||
      filters.status !== 'all',
  );
}

async function fetchCategoryNames(client: SupabaseClient): Promise<Map<string, string>> {
  const { data, error } = await client.from('budget_category_configs').select('id, name');
  if (error) throw new Error(`categories: ${error.message}`);
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const r = row as { id: string; name: string };
    map.set(String(r.id), String(r.name ?? 'Unknown'));
  }
  return map;
}

async function fetchPeriodCategoryBudgets(
  client: SupabaseClient,
  periodName: string,
): Promise<CategoryBudgetRow[]> {
  return fetchAllRecordsWhereEq(
    client,
    'budget_period_category_budgets',
    'period_name',
    periodName.trim(),
    CATEGORY_BUDGET_SELECT,
  );
}

async function fetchArchetypeBudgetRows(client: SupabaseClient, periodName: string) {
  return fetchAllRecordsWhereEq(
    client,
    'budget_period_archetype_budgets',
    'period_name',
    periodName.trim(),
    ARCHETYPE_BUDGET_SELECT,
  ).catch(() => [] as unknown[]);
}

async function fetchHuBudgetRows(client: SupabaseClient, periodName: string) {
  return fetchAllRecordsWhereEq(
    client,
    'budget_period_hospital_unit_budgets',
    'period_name',
    periodName.trim(),
    HU_BUDGET_SELECT,
  ).catch(() => [] as unknown[]);
}

function sumCategoryFields(rows: CategoryBudgetRow[]) {
  let totalBudget = 0;
  let budgetAllocated = 0;
  let budgetApproved = 0;
  let budgetConsumed = 0;
  const consumedByCategory = new Map<string, number>();

  for (const cb of rows) {
    const catId = String(cb.budget_category_id ?? 'unknown');
    const plan = Number(cb.budget_plan ?? 0) + Number(cb.budget_carry_forward ?? 0);
    totalBudget += plan;
    budgetAllocated += Number(cb.budget_allocated ?? 0);
    budgetApproved += Number(cb.approved_budget ?? 0);
    const consumed = Number(cb.consumed_budget ?? 0);
    budgetConsumed += consumed;
    consumedByCategory.set(catId, (consumedByCategory.get(catId) ?? 0) + consumed);
  }

  return { totalBudget, budgetAllocated, budgetApproved, budgetConsumed, consumedByCategory };
}

function buildCategoryBreakdownFromConsumed(
  consumedByCategory: Map<string, number>,
  categoryNames: Map<string, string>,
): ExecutiveDashboardCategorySlice[] {
  const entries = [...consumedByCategory.entries()].filter(([, v]) => v > 0);
  const totalSum = entries.reduce((s, [, v]) => s + v, 0);
  return entries
    .map(([id, value]) => ({
      id,
      name: categoryNames.get(id) ?? (id === 'unknown' ? 'Lainnya' : 'Unknown'),
      value,
      pct: totalSum > 0 ? Math.round((value / totalSum) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function normText(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isAssetCancelled(asset: AssetRow): boolean {
  const lifecycle = normText(asset.lifecycle_status);
  return lifecycle === 'cancel' || lifecycle === 'cancelled' || lifecycle === 'canceled';
}

function getTaskTriggerEvents(task: TaskMeta): string[] {
  const fromArray = (task.triggerEvents ?? []).filter(Boolean);
  if (fromArray.length > 0) return [...new Set(fromArray.map(String))];
  if (task.triggerEvent) return [String(task.triggerEvent)];
  return [];
}

function taskHasTriggerEvent(task: TaskMeta, event: string): boolean {
  return Boolean(task.isSystemTriggered) && getTaskTriggerEvents(task).includes(event);
}

function matchesFsApprovalTask(task: TaskMeta): boolean {
  if (taskHasTriggerEvent(task, 'FS_APPROVAL')) return true;
  const name = normText(task.name);
  return name.includes('fs approval') || name.includes('feasibility study approval');
}

function matchesPoSentTask(task: TaskMeta): boolean {
  if (taskHasTriggerEvent(task, 'PO_CREATED')) return true;
  const name = normText(task.name);
  return name.includes('po sent') || name.includes('sent to vendor');
}

function matchesGrnTask(task: TaskMeta): boolean {
  if (taskHasTriggerEvent(task, 'PO_GOODS_RECEIVED')) return true;
  const name = normText(task.name);
  return name.includes('grn') || name.includes('goods received') || name.includes('good received');
}

function matchesBastTask(task: TaskMeta): boolean {
  return normText(task.name).includes('bast');
}

function buildTaskIdSets(allTasks: TaskMeta[]) {
  const fsApprovalTaskIds = new Set<string>();
  const poSentTaskIds = new Set<string>();
  const grnTaskIds = new Set<string>();
  const bastTaskIds = new Set<string>();

  for (const task of allTasks) {
    const id = String(task.id);
    if (matchesFsApprovalTask(task)) fsApprovalTaskIds.add(id);
    if (matchesPoSentTask(task)) poSentTaskIds.add(id);
    if (matchesGrnTask(task)) grnTaskIds.add(id);
    if (matchesBastTask(task)) bastTaskIds.add(id);
  }

  return { fsApprovalTaskIds, poSentTaskIds, grnTaskIds, bastTaskIds };
}

function collectDoneTaskIds(
  statuses: { taskId?: string; status?: string }[],
  logs: { taskId?: string }[],
): Set<string> {
  const done = new Set<string>();
  for (const status of statuses) {
    const statusValue = normText(status.status);
    if (statusValue === 'done') done.add(String(status.taskId ?? ''));
  }
  for (const log of logs) {
    const taskId = String(log.taskId ?? '');
    if (taskId) done.add(taskId);
  }
  done.delete('');
  return done;
}

function hasDoneTaskInSet(doneTaskIds: Set<string>, taskIds: Set<string>): boolean {
  for (const taskId of doneTaskIds) {
    if (taskIds.has(taskId)) return true;
  }
  return false;
}

type AssetPipelineStage = 'cancelled' | 'readyToUse' | 'poSent' | 'fsApproval' | 'belumFs';

function classifyAssetPipelineStage(
  asset: AssetRow,
  doneTaskIds: Set<string>,
  completionRate: number,
  taskIdSets: ReturnType<typeof buildTaskIdSets>,
): AssetPipelineStage {
  if (isAssetCancelled(asset)) return 'cancelled';

  const grnDone =
    hasDoneTaskInSet(doneTaskIds, taskIdSets.grnTaskIds) || Boolean(asset.is_goods_received);
  const bastDone = hasDoneTaskInSet(doneTaskIds, taskIdSets.bastTaskIds);
  if (completionRate >= 100 || (grnDone && bastDone)) return 'readyToUse';
  if (hasDoneTaskInSet(doneTaskIds, taskIdSets.poSentTaskIds)) return 'poSent';
  if (hasDoneTaskInSet(doneTaskIds, taskIdSets.fsApprovalTaskIds)) return 'fsApproval';
  return 'belumFs';
}

function buildCapexDonutSlices(stageCounts: Record<AssetPipelineStage, number>): ExecutiveDashboardCapexDonutSlice[] {
  const total = CAPEX_DONUT_STAGES.reduce((sum, stage) => sum + (stageCounts[stage.id as AssetPipelineStage] ?? 0), 0);
  return CAPEX_DONUT_STAGES.map((stage) => {
    const value = stageCounts[stage.id as AssetPipelineStage] ?? 0;
    return {
      id: stage.id,
      name: stage.name,
      value,
      color: stage.color,
      pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    };
  }).filter((slice) => slice.value > 0);
}

async function fetchAssetsByProject(
  client: SupabaseClient,
  _periodName: string,
  _filters: ExecutiveSummaryListFilters,
  projectIdSet: Set<string>,
): Promise<Map<string, AssetRow[]>> {
  const byProject = new Map<string, AssetRow[]>();
  if (projectIdSet.size === 0) return byProject;

  const select =
    'id, project_id, asset_code, asset_name, consumed_budget, is_goods_received, lifecycle_status, workflow_set_id, po_number';
  const rows = await fetchRecordsInBatches(client, 'assets', 'project_id', [...projectIdSet], select);

  for (const row of rows) {
    const r = row as AssetRow;
    const pid = String(r.project_id ?? '');
    if (!projectIdSet.has(pid)) continue;
    const asset: AssetRow = {
      id: String(r.id),
      project_id: pid,
      asset_code: r.asset_code,
      asset_name: r.asset_name,
      consumed_budget: r.consumed_budget,
      is_goods_received: r.is_goods_received,
      lifecycle_status: r.lifecycle_status,
      workflow_set_id: r.workflow_set_id,
      po_number: r.po_number,
    };
    const list = byProject.get(pid) ?? [];
    list.push(asset);
    byProject.set(pid, list);
  }

  return byProject;
}

type ProjectCapexStatusKey = 'draft' | 'menungguApproval' | 'disetujui' | 'ditolak' | 'selesaiDibeli';

const PROJECT_DONUT_STAGES: Array<{ id: ProjectCapexStatusKey; name: string; color: string }> = [
  { id: 'draft', name: 'Draft', color: '#94A3B8' },
  { id: 'menungguApproval', name: 'Menunggu Approval', color: '#F59E0B' },
  { id: 'disetujui', name: 'Disetujui', color: '#00529B' },
  { id: 'ditolak', name: 'Ditolak', color: '#DC3545' },
  { id: 'selesaiDibeli', name: 'Selesai Dibeli', color: '#28A745' },
];

function buildProjectLevelDonutFallback(
  projects: ProjectRow[],
  fsByProject: Map<string, FsRow>,
  assetsByProject: Map<string, AssetRow[]>,
): Pick<
  ExecutiveDashboardCapexStatus,
  'donutSlices' | 'fsApprovalCount' | 'poSentCount' | 'readyToUseCount' | 'cancelledCount' | 'cancelledAssets'
> {
  const counts: Record<ProjectCapexStatusKey, number> = {
    draft: 0,
    menungguApproval: 0,
    disetujui: 0,
    ditolak: 0,
    selesaiDibeli: 0,
  };
  let fsApprovalCount = 0;
  let poSentCount = 0;
  let readyToUseCount = 0;

  for (const project of projects) {
    const pid = String(project.id);
    const assets = assetsByProject.get(pid) ?? [];
    const key = classifyCapexStatus(project, fsByProject.get(pid), assets);
    counts[key] += 1;

    const approved = rowNum(project as Record<string, unknown>, 'approved_budget', 'approvedBudget');
    const consumed = rowNum(project as Record<string, unknown>, 'consumed_budget', 'consumedBudget');
    const completion = rowNum(project as Record<string, unknown>, 'completion_rate', 'completionRate');
    if (approved > 0 || key === 'disetujui' || key === 'selesaiDibeli') fsApprovalCount += 1;
    if (consumed > 0) poSentCount += 1;
    if (key === 'selesaiDibeli' || completion >= 100) readyToUseCount += 1;
  }

  const total = projects.length;
  const donutSlices = PROJECT_DONUT_STAGES.map((stage) => {
    const value = counts[stage.id] ?? 0;
    return {
      id: stage.id,
      name: stage.name,
      value,
      color: stage.color,
      pct: total > 0 ? Math.round((value / total) * 1000) / 10 : 0,
    };
  }).filter((slice) => slice.value > 0);

  return {
    donutSlices,
    fsApprovalCount,
    poSentCount,
    readyToUseCount,
    cancelledCount: 0,
    cancelledAssets: [],
  };
}

type FlatAssetRow = AssetRow & { projectName: string; unitCode: string };

function flattenAssetsForProjects(
  projects: ProjectRow[],
  assetsByProject: Map<string, AssetRow[]>,
): FlatAssetRow[] {
  const flatAssets: FlatAssetRow[] = [];
  for (const project of projects) {
    const pid = String(project.id);
    const hu = huFromRow(project);
    for (const asset of assetsByProject.get(pid) ?? []) {
      flatAssets.push({
        ...asset,
        projectName: String(project.project_name ?? ''),
        unitCode: hu.code,
      });
    }
  }
  return flatAssets;
}

function buildCapexPipelineStatus(
  projects: ProjectRow[],
  assetsByProject: Map<string, AssetRow[]>,
  fsByProject: Map<string, FsRow>,
  allTasks: TaskMeta[],
  workflows: unknown[],
  statusesRaw: unknown[],
  logsRaw: unknown[],
): ExecutiveDashboardCapexStatus {
  const taskIdSets = buildTaskIdSets(allTasks);
  const flatAssets = flattenAssetsForProjects(projects, assetsByProject);

  if (flatAssets.length === 0 && projects.length > 0) {
    const fallback = buildProjectLevelDonutFallback(projects, fsByProject, assetsByProject);
    return {
      projectCount: projects.length,
      assetCount: 0,
      ...fallback,
      avgApprovalDays: null,
      overdueSlaCount: 0,
    };
  }

  const statuses = (statusesRaw ?? []).map(normAssetTaskStatusRow);
  const logs = (logsRaw ?? []).map(normTaskLogRow);
  const statusesByAsset = groupStatusesByAsset(statuses);
  const logsByAsset = groupLogsByAsset(logs);

  const assetsForRates = flatAssets
    .filter((a) => !isAssetCancelled(a))
    .map((a) => ({
      id: a.id,
      workflowSetId: a.workflow_set_id,
    }));
  const completionRates = calculateRates(assetsForRates, workflows, statusesByAsset, logsByAsset);

  let assetCount = 0;
  let fsApprovalCount = 0;
  let poSentCount = 0;
  let readyToUseCount = 0;
  let cancelledCount = 0;
  const cancelledAssets: ExecutiveDashboardCancelledAsset[] = [];
  const stageCounts: Record<AssetPipelineStage, number> = {
    belumFs: 0,
    fsApproval: 0,
    poSent: 0,
    readyToUse: 0,
    cancelled: 0,
  };

  for (const asset of flatAssets) {
    const assetKey = canonicalAssetKey(asset.id);
    const doneTaskIds = collectDoneTaskIds(statusesByAsset.get(assetKey) ?? [], logsByAsset.get(assetKey) ?? []);
    const completionRate = isAssetCancelled(asset) ? 0 : (completionRates.get(assetKey) ?? 0);
    const stage = classifyAssetPipelineStage(asset, doneTaskIds, completionRate, taskIdSets);
    stageCounts[stage] += 1;

    if (stage === 'cancelled') {
      cancelledCount += 1;
      cancelledAssets.push({
        id: String(asset.id),
        assetCode: String(asset.asset_code ?? '—'),
        assetName: String(asset.asset_name ?? '—'),
        projectName: asset.projectName,
        unitCode: asset.unitCode,
      });
      continue;
    }

    assetCount += 1;
    if (hasDoneTaskInSet(doneTaskIds, taskIdSets.fsApprovalTaskIds)) fsApprovalCount += 1;
    if (hasDoneTaskInSet(doneTaskIds, taskIdSets.poSentTaskIds)) poSentCount += 1;
    if (stage === 'readyToUse') readyToUseCount += 1;
  }

  cancelledAssets.sort((a, b) => a.assetCode.localeCompare(b.assetCode));

  return {
    projectCount: projects.length,
    assetCount,
    fsApprovalCount,
    poSentCount,
    readyToUseCount,
    cancelledCount,
    cancelledAssets: cancelledAssets.slice(0, 50),
    donutSlices: buildCapexDonutSlices(stageCounts),
    avgApprovalDays: null,
    overdueSlaCount: 0,
  };
}

async function fetchLatestFsByProject(
  client: SupabaseClient,
  projectIds: string[],
): Promise<Map<string, FsRow>> {
  const latest = new Map<string, FsRow>();
  if (projectIds.length === 0) return latest;

  const unique = [...new Set(projectIds.map(String))];
  const chunkSize = 100;
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += chunkSize) {
    chunks.push(unique.slice(i, i + chunkSize));
  }

  const chunkResults = await Promise.all(
    chunks.map(async (chunk) => {
      const { data, error } = await client
        .from('feasibility_studies')
        .select('project_id, conclusion, created_at')
        .in('project_id', chunk);
      if (error) throw new Error(`fs map: ${error.message}`);
      return data ?? [];
    }),
  );

  for (const rows of chunkResults) {
    for (const row of rows) {
      const r = row as FsRow;
      const pid = String(r.project_id);
      const existing = latest.get(pid);
      if (!existing || String(r.created_at ?? '') > String(existing.created_at ?? '')) {
        latest.set(pid, r);
      }
    }
  }
  return latest;
}

function classifyCapexStatus(
  row: ProjectRow,
  latestFs: FsRow | undefined,
  assets: AssetRow[],
): ProjectCapexStatusKey {
  const completion = rowNum(row as Record<string, unknown>, 'completion_rate', 'completionRate');
  const approved = rowNum(row as Record<string, unknown>, 'approved_budget', 'approvedBudget');
  const budget = projectPlanBudget(row);
  const conclusion = String(latestFs?.conclusion ?? '');

  const allGoodsReceived =
    assets.length > 0 && assets.every((a) => Boolean(a.is_goods_received));
  if (completion >= 100 || allGoodsReceived) return 'selesaiDibeli';
  if (conclusion === 'Rejected') return 'ditolak';
  if (APPROVED_CONCLUSIONS.has(conclusion) || approved > 0) return 'disetujui';
  if (conclusion === 'Pending' || (budget > 0 && approved === 0)) return 'menungguApproval';
  return 'draft';
}

function statusLabelFromKey(key: string): string {
  const map: Record<string, string> = {
    draft: 'Draft',
    menungguApproval: 'Menunggu Approval',
    disetujui: 'Disetujui',
    ditolak: 'Ditolak',
    selesaiDibeli: 'Selesai Dibeli',
  };
  return map[key] ?? 'Draft';
}

function rollupScopedBudget(
  projects: ProjectRow[],
  assetsByProject: Map<string, AssetRow[]>,
  archetypeBudgetRows: unknown[],
  huBudgetRows: unknown[],
  filters: ExecutiveSummaryListFilters,
): {
  totalBudget: number;
  budgetAllocated: number;
  budgetApproved: number;
  budgetConsumed: number;
  consumedByCategory: Map<string, number>;
} {
  const archetypeId = filters.archetypeId ? String(filters.archetypeId) : null;
  const huCodeSet = new Set(filters.huCodes.map(String));

  const manualHuBudget = new Map<string, number>();
  for (const row of huBudgetRows) {
    const r = row as { hospital_unit_id?: string; budget_plan?: number };
    const huId = String(r.hospital_unit_id ?? '');
    manualHuBudget.set(huId, (manualHuBudget.get(huId) ?? 0) + Number(r.budget_plan ?? 0));
  }

  const manualArchBudget = new Map<string, number>();
  for (const row of archetypeBudgetRows) {
    const r = row as { archetype_id?: string; budget_plan?: number };
    if (archetypeId && String(r.archetype_id ?? '') !== archetypeId) continue;
    const aid = String(r.archetype_id ?? '');
    manualArchBudget.set(aid, (manualArchBudget.get(aid) ?? 0) + Number(r.budget_plan ?? 0));
  }

  const huProjectPlan = new Map<string, number>();
  const huCarryForward = new Map<string, number>();
  let budgetAllocated = 0;
  let budgetApproved = 0;
  let budgetConsumed = 0;
  const consumedByCategory = new Map<string, number>();

  for (const row of projects) {
    const hu = huFromRow(row);
    if (archetypeId && hu.archetypeId !== archetypeId) continue;
    if (huCodeSet.size > 0 && !huCodeSet.has(hu.code)) continue;

    const pid = String(row.id);
    const plan = projectPlanBudget(row);
    const huId = hu.id;

    if (!manualHuBudget.has(huId) || manualHuBudget.get(huId) === 0) {
      huProjectPlan.set(huId, (huProjectPlan.get(huId) ?? 0) + rowNum(row as Record<string, unknown>, 'budget_plan', 'budgetPlan'));
    }
    huCarryForward.set(huId, (huCarryForward.get(huId) ?? 0) + rowNum(row as Record<string, unknown>, 'budget_carry_forward', 'budgetCarryForward'));

    budgetAllocated += rowNum(row as Record<string, unknown>, 'budget_allocated', 'budgetAllocated') || plan;
    budgetApproved += rowNum(row as Record<string, unknown>, 'approved_budget', 'approvedBudget');

    const assets = assetsByProject.get(pid) ?? [];
    let projectAssetConsumed = 0;
    for (const asset of assets) {
      const c = Number(asset.consumed_budget ?? 0);
      projectAssetConsumed += c;
    }
    const projectConsumed =
      projectAssetConsumed > 0
        ? projectAssetConsumed
        : rowNum(row as Record<string, unknown>, 'consumed_budget', 'consumedBudget');
    budgetConsumed += projectConsumed;

    const catId = String(row.budget_category_id ?? 'unknown');
    consumedByCategory.set(catId, (consumedByCategory.get(catId) ?? 0) + projectConsumed);
  }

  let totalBudget = 0;
  if (archetypeId && manualArchBudget.has(archetypeId)) {
    totalBudget = manualArchBudget.get(archetypeId) ?? 0;
    for (const row of projects) {
      const hu = huFromRow(row);
      if (hu.archetypeId !== archetypeId) continue;
      if (huCodeSet.size > 0 && !huCodeSet.has(hu.code)) continue;
      totalBudget += rowNum(row as Record<string, unknown>, 'budget_carry_forward', 'budgetCarryForward');
    }
  } else if (huCodeSet.size > 0) {
    const seenHu = new Set<string>();
    for (const row of projects) {
      const hu = huFromRow(row);
      if (!huCodeSet.has(hu.code)) continue;
      if (seenHu.has(hu.id)) continue;
      seenHu.add(hu.id);
      const manual = manualHuBudget.get(hu.id) ?? 0;
      totalBudget += manual > 0 ? manual : (huProjectPlan.get(hu.id) ?? 0);
      totalBudget += huCarryForward.get(hu.id) ?? 0;
    }
  } else {
    for (const [huId, plan] of huProjectPlan.entries()) {
      const manual = manualHuBudget.get(huId) ?? 0;
      totalBudget += manual > 0 ? manual : plan;
      totalBudget += huCarryForward.get(huId) ?? 0;
    }
    if (archetypeId) {
      totalBudget = manualArchBudget.get(archetypeId) ?? totalBudget;
    }
  }

  if (totalBudget === 0) {
    totalBudget = projects.reduce((s, p) => s + projectPlanBudget(p), 0);
  }

  return { totalBudget, budgetAllocated, budgetApproved, budgetConsumed, consumedByCategory };
}

function buildHuUnitRows(
  projects: ProjectRow[],
  assetsByProject: Map<string, AssetRow[]>,
  huBudgetRows: unknown[],
): ExecutiveDashboardUnitRow[] {
  const manualHuBudget = new Map<string, number>();
  for (const row of huBudgetRows) {
    const r = row as { hospital_unit_id?: string; budget_plan?: number };
    const huId = String(r.hospital_unit_id ?? '');
    manualHuBudget.set(huId, (manualHuBudget.get(huId) ?? 0) + Number(r.budget_plan ?? 0));
  }

  const unitMap = new Map<string, ExecutiveDashboardUnitRow & { huId: string; projectPlan: number; carryForward: number }>();

  for (const row of projects) {
    const hu = huFromRow(row);
    const pid = String(row.id);
    const unitKey = hu.code;
    const existing = unitMap.get(unitKey) ?? {
      unitCode: hu.code,
      unitName: hu.name,
      budget: 0,
      consumed: 0,
      utilizationPct: 0,
      huId: hu.id,
      projectPlan: 0,
      carryForward: 0,
    };

    existing.projectPlan += rowNum(row as Record<string, unknown>, 'budget_plan', 'budgetPlan');
    existing.carryForward += rowNum(row as Record<string, unknown>, 'budget_carry_forward', 'budgetCarryForward');

    const assets = assetsByProject.get(pid) ?? [];
    let assetConsumed = 0;
    for (const asset of assets) {
      assetConsumed += Number(asset.consumed_budget ?? 0);
    }
    existing.consumed +=
      assetConsumed > 0
        ? assetConsumed
        : rowNum(row as Record<string, unknown>, 'consumed_budget', 'consumedBudget');

    unitMap.set(unitKey, existing);
  }

  return [...unitMap.values()]
    .map((u) => {
      const manual = manualHuBudget.get(u.huId) ?? 0;
      const budget = (manual > 0 ? manual : u.projectPlan) + u.carryForward;
      return {
        unitCode: u.unitCode,
        unitName: u.unitName,
        budget,
        consumed: u.consumed,
        utilizationPct: budget > 0 ? Math.round((u.consumed / budget) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.utilizationPct - a.utilizationPct);
}

function computePendingFsStats(fsByProject: Map<string, FsRow>): {
  pendingCount: number;
  avgDays: number | null;
  overdueCount: number;
} {
  const now = Date.now();
  let totalDays = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const fs of fsByProject.values()) {
    if (String(fs.conclusion ?? '') !== 'Pending') continue;
    pendingCount += 1;
    const created = fs.created_at ? new Date(fs.created_at).getTime() : now;
    const days = Math.max(0, Math.floor((now - created) / 86_400_000));
    totalDays += days;
    if (days > SLA_DAYS) overdueCount += 1;
  }

  return {
    pendingCount,
    avgDays: pendingCount > 0 ? Math.round((totalDays / pendingCount) * 10) / 10 : null,
    overdueCount,
  };
}

function buildConsumptionByMonthFromLogs(
  logsRaw: unknown[],
  assetsByProject: Map<string, AssetRow[]>,
  projectIds: string[],
): number[] {
  const monthly = new Array(12).fill(0) as number[];
  if (projectIds.length === 0) return monthly;

  const assetConsumed = new Map<string, number>();
  for (const pid of projectIds) {
    for (const asset of assetsByProject.get(String(pid)) ?? []) {
      const consumed = Number(asset.consumed_budget ?? 0);
      if (consumed <= 0) continue;
      assetConsumed.set(String(asset.id), consumed);
    }
  }
  if (assetConsumed.size === 0) return monthly;

  const assetMonth = new Map<string, number>();
  for (const row of logsRaw ?? []) {
    const r = row as { asset_id?: string; completed_at?: string };
    const aid = String(r.asset_id ?? '');
    const completedAt = r.completed_at;
    if (!aid || !completedAt || !assetConsumed.has(aid)) continue;
    const monthIdx = Math.max(0, Math.min(11, new Date(completedAt).getMonth()));
    if (!assetMonth.has(aid)) assetMonth.set(aid, monthIdx);
  }

  for (const [aid, consumed] of assetConsumed.entries()) {
    const monthIdx = assetMonth.get(aid) ?? 0;
    monthly[monthIdx] += consumed;
  }

  return monthly;
}

function buildMonthlyTrend(
  monthlyRealization: number[],
  totalBudget: number,
  priorYearMonthly: number[],
): ExecutiveDashboardMonthlyPoint[] {
  const monthlyBudgetTarget = totalBudget > 0 ? totalBudget / 12 : 0;
  return MONTH_LABELS.map((label, idx) => ({
    month: String(idx + 1).padStart(2, '0'),
    label,
    realization: monthlyRealization[idx] ?? 0,
    priorYear: priorYearMonthly[idx] ?? 0,
    budgetTarget: monthlyBudgetTarget,
  }));
}

function buildAlerts(
  units: ExecutiveDashboardUnitRow[],
  projects: ProjectRow[],
  fsByProject: Map<string, FsRow>,
  assetsByProject: Map<string, AssetRow[]>,
  overdueSlaCount: number,
): ExecutiveDashboardAlert[] {
  const alerts: ExecutiveDashboardAlert[] = [];

  const overspending = units.filter((u) => u.utilizationPct > 100);
  if (overspending.length > 0) {
    alerts.push({
      severity: 'red',
      title: `${overspending.length} Unit melebihi budget`,
      detail: overspending.slice(0, 5).map((u) => u.unitCode).join(', '),
    });
  }

  const lowRemaining = units.filter((u) => u.budget > 0 && (u.budget - u.consumed) / u.budget < 0.1);
  if (lowRemaining.length > 0) {
    alerts.push({
      severity: 'yellow',
      title: `${lowRemaining.length} Unit budget tersisa < 10%`,
      detail: lowRemaining.slice(0, 5).map((u) => u.unitCode).join(', '),
    });
  }

  if (overdueSlaCount > 0) {
    alerts.push({
      severity: 'red',
      title: `${overdueSlaCount} Pengajuan FS tertunda`,
      detail: `Lebih dari ${SLA_DAYS} hari dari SLA approval`,
    });
  }

  const largePending = projects.filter((p) => {
    const key = classifyCapexStatus(p, fsByProject.get(String(p.id)), assetsByProject.get(String(p.id)) ?? []);
    return key === 'menungguApproval' && projectPlanBudget(p) >= LARGE_INVESTMENT_THRESHOLD;
  });
  if (largePending.length > 0) {
    alerts.push({
      severity: 'red',
      title: `${largePending.length} Investasi bernilai besar belum diproses`,
      detail: largePending.slice(0, 3).map((p) => p.project_name).join(', '),
    });
  }

  const rejectedFs = projects.filter((p) => classifyCapexStatus(p, fsByProject.get(String(p.id)), assetsByProject.get(String(p.id)) ?? []) === 'ditolak');
  if (rejectedFs.length > 0) {
    alerts.push({
      severity: 'red',
      title: `${rejectedFs.length} Pengajuan CAPEX ditolak (FS)`,
      detail: rejectedFs.slice(0, 3).map((p) => p.project_name).join(', '),
    });
  }

  const notStartedApproved = projects.filter((p) => {
    const key = classifyCapexStatus(p, fsByProject.get(String(p.id)), assetsByProject.get(String(p.id)) ?? []);
    return key === 'disetujui' && rowNum(p as Record<string, unknown>, 'completion_rate', 'completionRate') === 0;
  });
  if (notStartedApproved.length > 0) {
    alerts.push({
      severity: 'yellow',
      title: `${notStartedApproved.length} Pengadaan disetujui belum terealisasi`,
      detail: 'Alat/konstruksi belum mulai implementasi',
    });
  }

  return alerts.slice(0, 6);
}

export async function loadExecutiveDashboardMetrics(
  client: SupabaseClient,
  periodName: string,
  filters: ExecutiveSummaryListFilters,
): Promise<ExecutiveDashboardMetrics> {
  const pn = periodName.trim();
  const scoped = hasScopeFilter(filters);

  const [projects, categoryNames, categoryBudgetRows, archetypeBudgetRows, huBudgetRows, slimTasks] =
    await Promise.all([
      fetchFilteredProjects(client, pn, filters),
      fetchCategoryNames(client),
      fetchPeriodCategoryBudgets(client, pn),
      fetchArchetypeBudgetRows(client, pn),
      fetchHuBudgetRows(client, pn),
      getSlimTasksForPipeline(client),
    ]);

  const projectIds = projects.map((p) => String(p.id));
  const projectIdSet = new Set(projectIds);
  const [assetsByProject, fsByProject] = await Promise.all([
    fetchAssetsByProject(client, pn, filters, projectIdSet),
    fetchLatestFsByProject(client, projectIds),
  ]);

  const flatAssets = flattenAssetsForProjects(projects, assetsByProject);
  let statusesRaw: unknown[] = [];
  let logsRaw: unknown[] = [];
  let workflows: unknown[] = [];

  if (flatAssets.length > 0) {
    const assetIds = flatAssets.map((a) => String(a.id));
    const workflowSetIds = [
      ...new Set(flatAssets.map((a) => String(a.workflow_set_id ?? '')).filter(Boolean)),
    ];
    [statusesRaw, logsRaw, workflows] = await Promise.all([
      fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds, ASSET_STATUS_SELECT),
      fetchRecordsByAssetIds(client, 'task_logs', assetIds, ASSET_LOG_SELECT),
      getWorkflowSetsByIds(client, workflowSetIds),
    ]);
  }

  const periodTotals = sumCategoryFields(categoryBudgetRows);
  const scopedTotals = scoped
    ? rollupScopedBudget(projects, assetsByProject, archetypeBudgetRows, huBudgetRows, filters)
    : null;

  const totalBudget = scoped ? (scopedTotals?.totalBudget ?? 0) : periodTotals.totalBudget;
  const budgetAllocationToProject = scoped
    ? (scopedTotals?.budgetAllocated ?? 0)
    : periodTotals.budgetAllocated;
  const budgetApproval = scoped ? (scopedTotals?.budgetApproved ?? 0) : periodTotals.budgetApproved;
  const budgetConsumed = scoped ? (scopedTotals?.budgetConsumed ?? 0) : periodTotals.budgetConsumed;

  let budgetRevenuePerMonth = 0;
  let approvedValue = 0;
  let pendingApprovalValue = 0;
  let rejectedCount = 0;
  let waitingApprovalCount = 0;

  for (const row of projects) {
    const pid = String(row.id);
    const assets = assetsByProject.get(pid) ?? [];
    const fs = fsByProject.get(pid);
    const statusKey = classifyCapexStatus(row, fs, assets);

    const approved = rowNum(row as Record<string, unknown>, 'approved_budget', 'approvedBudget');
    const plan = projectPlanBudget(row);
    approvedValue += approved;
    budgetRevenuePerMonth += rowNum(row as Record<string, unknown>, 'budget_revenue_permonth', 'budgetRevenuePermonth');

    if (statusKey === 'menungguApproval') {
      waitingApprovalCount += 1;
      pendingApprovalValue += plan;
    }
    if (statusKey === 'ditolak') rejectedCount += 1;
  }

  const fsStats = computePendingFsStats(fsByProject);
  const monthlyRealization = buildConsumptionByMonthFromLogs(logsRaw, assetsByProject, projectIds);
  const capexPipeline = buildCapexPipelineStatus(
    projects,
    assetsByProject,
    fsByProject,
    slimTasks as TaskMeta[],
    workflows,
    statusesRaw,
    logsRaw,
  );

  const capexStatus: ExecutiveDashboardCapexStatus = {
    ...capexPipeline,
    avgApprovalDays: fsStats.avgDays,
    overdueSlaCount: fsStats.overdueCount,
  };

  const consumedByCategory = scoped
    ? (scopedTotals?.consumedByCategory ?? new Map<string, number>())
    : periodTotals.consumedByCategory;

  const categoryBreakdown = buildCategoryBreakdownFromConsumed(consumedByCategory, categoryNames);
  const allUnitRows = buildHuUnitRows(projects, assetsByProject, huBudgetRows);
  const budgetByUnit = allUnitRows.slice(0, 10);
  const priorYearMonthly = new Array(12).fill(0) as number[];

  const capexTotal = capexStatus.projectCount;

  const topInvestments: ExecutiveDashboardTopInvestment[] = [...projects]
    .sort((a, b) => {
      const av = Math.max(
        rowNum(a as Record<string, unknown>, 'approved_budget', 'approvedBudget'),
        projectPlanBudget(a),
      );
      const bv = Math.max(
        rowNum(b as Record<string, unknown>, 'approved_budget', 'approvedBudget'),
        projectPlanBudget(b),
      );
      return bv - av;
    })
    .slice(0, 5)
    .map((row) => {
      const pid = String(row.id);
      const key = classifyCapexStatus(row, fsByProject.get(pid), assetsByProject.get(pid) ?? []);
      return {
        id: pid,
        projectName: String(row.project_name ?? ''),
        unitCode: huFromRow(row).code,
        amount: Math.max(
          rowNum(row as Record<string, unknown>, 'approved_budget', 'approvedBudget'),
          projectPlanBudget(row),
        ),
        statusLabel: statusLabelFromKey(key),
      };
    });

  const utilizationPct = totalBudget > 0 ? Math.round((budgetConsumed / totalBudget) * 1000) / 10 : 0;

  return {
    summary: {
      totalBudget,
      budgetAllocationToProject,
      budgetApproval,
      budgetConsumed,
      budgetRevenuePerMonth,
      utilizationPct,
      totalCapexSubmission: capexTotal,
      pendingApprovalValue,
      approvedValue,
      rejectedCount,
      waitingApprovalCount,
    },
    budgetByUnit,
    capexStatus,
    categoryBreakdown,
    monthlyTrend: buildMonthlyTrend(monthlyRealization, totalBudget, priorYearMonthly),
    topInvestments,
    topUnits: allUnitRows.slice(0, 5),
    alerts: buildAlerts(allUnitRows, projects, fsByProject, assetsByProject, fsStats.overdueCount),
    updatedAt: new Date().toISOString(),
  };
}
