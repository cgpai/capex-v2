import {
  ProjectStatus,
  ProjectType,
  type AssetTypeConfig,
  type AssetTypeGroupConfig,
  type BudgetPeriod,
  type EnrichedAsset,
  type Project,
  type ProjectPriorityConfig,
  type User,
  type WorkflowSet,
  type AssetTaskStatus,
  type TaskLog,
  TaskCurrentStatus,
} from '../../types';
import {
  projectListBundleToListSource,
  scopeListSourceToUser,
  type UserScopesForCapex,
} from '../../lib/capexProjectListScope';
import type { ProjectListSortOption } from '../../services/projectListQueryTypes';
import { DEFAULT_PROJECT_LIST_SORT } from '../../services/projectListQueryTypes';
import type { ProjectListFilterSelection } from '../../lib/capexProjectListDiskCache';
import type { ProjectListBundle } from '../../services/capexProjectListApi';
import { normAssetKey } from '../../lib/assetKeys';
import { isAssetCancelledForProjectList } from '../../lib/assetLifecycle';

export type { ProjectListSortOption };
export { DEFAULT_PROJECT_LIST_SORT, PROJECT_LIST_SORT_OPTIONS } from '../../services/projectListQueryTypes';

/** Mirror server `norm()` — trim + lowercase for filter comparisons. */
export function normFilterName(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function filterNamesEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  return normFilterName(a) === normFilterName(b);
}

export function compareAssetCodes(a: string | undefined | null, b: string | undefined | null): number {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  if (!left && !right) return 0;
  if (!left) return 1;
  if (!right) return -1;
  return left.localeCompare(right, 'id', { numeric: true, sensitivity: 'base' });
}

/** Normalize asset code for lookup (trim, strip spaces, lowercase). */
export function normalizeAssetCodeForLookup(code: string | null | undefined): string {
  return String(code ?? '').trim().replace(/\s+/g, '').toLowerCase();
}

export function readAssetCodeForLookup(asset: EnrichedAsset): string {
  const raw =
    asset.assetCode ??
    (asset as { asset_code?: string }).asset_code ??
    '';
  return normalizeAssetCodeForLookup(raw);
}

export function findEnrichedAssetByCode(
  assets: EnrichedAsset[],
  code: string,
): EnrichedAsset | null {
  const norm = normalizeAssetCodeForLookup(code);
  if (!norm) return null;
  return assets.find((a) => readAssetCodeForLookup(a) === norm) ?? null;
}

/** First occurrence wins — prevents duplicate React keys when streams overlap. */
export function dedupeEnrichedAssetsById(assets: EnrichedAsset[]): EnrichedAsset[] {
  const seen = new Set<string>();
  const out: EnrichedAsset[] = [];
  for (const asset of assets) {
    const key = normAssetKey(asset.id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(asset);
  }
  return out;
}

export function sortEnrichedAssetsByOption(
  assets: EnrichedAsset[],
  sortBy: ProjectListSortOption = DEFAULT_PROJECT_LIST_SORT,
): EnrichedAsset[] {
  const ascending = sortBy !== 'assetCode_desc';
  return [...assets].sort((a, b) => {
    const cmp = compareAssetCodes(a.assetCode, b.assetCode);
    return ascending ? cmp : -cmp;
  });
}

/** `selectedPeriods.length === 0` means "Semua budget period" in the UI. */
export function isAllBudgetPeriodsSelected(
  selectedPeriods: string[],
  availableOptions: string[],
): boolean {
  return selectedPeriods.length === 0 && availableOptions.length > 0;
}

/** True when period selection differs from the current running budget period only. */
export function isProjectListPeriodFilterActive(
  selectedPeriods: string[],
  currentRunningPeriod: string,
  availableOptions: string[],
): boolean {
  if (availableOptions.length === 0) return false;
  if (selectedPeriods.length === 0) return true;
  if (selectedPeriods.length > 1) return true;
  const only = selectedPeriods[0]?.trim();
  const current = currentRunningPeriod.trim();
  return !!only && only !== current;
}

/** Sort budget periods newest-first (by startDate, then periodName). */
export function sortBudgetPeriodsNewestFirst(periods: BudgetPeriod[]): BudgetPeriod[] {
  return [...periods]
    .filter((p) => p.periodName?.trim())
    .sort((a, b) => {
      const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
      const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
      if (Number.isFinite(tb) && Number.isFinite(ta) && tb !== ta) return tb - ta;
      return a.periodName.localeCompare(b.periodName, 'id');
    });
}

export function pickLatestBudgetPeriodName(periods: BudgetPeriod[]): string {
  return sortBudgetPeriodsNewestFirst(periods)[0]?.periodName.trim() ?? '';
}

/** @deprecated Prefer sortBudgetPeriodsNewestFirst — sorts by year in label only. */
export function sortPeriodNamesNewestFirst(periods: string[]): string[] {
  const key = (name: string) => {
    const years = name.match(/\d{4}/g);
    return years?.length ? Math.max(...years.map(Number)) : 0;
  };
  return [...periods].sort((a, b) => key(b) - key(a) || a.localeCompare(b, 'id'));
}

/** Default = latest budget period; empty array = user chose "Semua budget period". */
export function resolveInitialProjectListSelectedPeriods(
  saved: ProjectListFilterSelection | null | undefined,
  budgetPeriods: BudgetPeriod[],
): string[] {
  if (saved != null && Array.isArray(saved.selectedPeriods)) {
    return saved.selectedPeriods;
  }
  const latest = pickLatestBudgetPeriodName(budgetPeriods);
  return latest ? [latest] : [];
}

export function budgetPeriodFilterOptions(periods: BudgetPeriod[]): string[] {
  return sortBudgetPeriodsNewestFirst(periods).map((p) => p.periodName.trim());
}

/** Preload bundle is single-period — only use when filter matches that budget period. */
export function shouldUsePreloadedProjectListForPeriods(
  initialSelectedPeriods: string[],
  preloadBudgetPeriodName: string,
): boolean {
  const preload = preloadBudgetPeriodName.trim();
  if (!preload) return false;
  if (initialSelectedPeriods.length === 0) return false;
  if (initialSelectedPeriods.length === 1) return initialSelectedPeriods[0]?.trim() === preload;
  return false;
}

export function selectedPeriodsCacheKey(periods: string[]): string {
  if (periods.length === 0) return '__all__';
  return periods
    .map((p) => p.trim())
    .filter(Boolean)
    .sort()
    .join('\u0001');
}

/** Same key as CapexProjectListPage `queryPeriodKey` — for session pool restore on mount. */
export function resolveQueryPeriodKey(
  selectedPeriods: string[],
  availablePeriodOptions: string[],
  fallbackPeriodName: string,
  latestPeriodName: string | null,
): string {
  let effective: string[] = [];
  if (selectedPeriods.length > 0) {
    const picked = selectedPeriods.filter((p) => availablePeriodOptions.includes(p));
    if (picked.length > 0) effective = picked;
  }
  if (effective.length === 0 && availablePeriodOptions.length > 0) {
    effective = [...availablePeriodOptions];
  }
  if (effective.length === 0 && latestPeriodName) {
    effective = [latestPeriodName];
  }
  if (effective.length === 0 && fallbackPeriodName.trim()) {
    effective = [fallbackPeriodName.trim()];
  }
  return effective.slice().sort().join('\u0001') || fallbackPeriodName || 'all';
}

/** Tag projects missing `periodName` when bundle came from a single-period query. */
export function tagProjectListBundlePeriodNames(
  bundle: ProjectListBundle,
  periodNames: string[],
): ProjectListBundle {
  const unique = [...new Set(periodNames.map((p) => p.trim()).filter(Boolean))];
  if (unique.length !== 1) return bundle;
  const inferred = unique[0];
  const needsTag = bundle.projects.some((p) => !(p.periodName ?? '').trim());
  if (!needsTag) return bundle;
  return {
    ...bundle,
    projects: bundle.projects.map((p) =>
      (p.periodName ?? '').trim() ? p : { ...p, periodName: inferred },
    ),
  };
}

/** Keep only rows whose project belongs to one of the allowed budget periods. */
export function filterProjectListBundleByPeriods(
  bundle: ProjectListBundle,
  allowedPeriods: string[],
  opts?: { strictMissingProject?: boolean },
): ProjectListBundle {
  const allowed = new Set(allowedPeriods.map((p) => p.trim()).filter(Boolean));
  if (allowed.size === 0) return bundle;

  const tagged = tagProjectListBundlePeriodNames(bundle, allowedPeriods);
  const projectsWithPeriod = tagged.projects.filter((p) => (p.periodName ?? '').trim());
  if (projectsWithPeriod.length === 0 && !opts?.strictMissingProject) return tagged;

  const projectById = new Map(tagged.projects.map((p) => [String(p.id), p] as const));
  const projects = tagged.projects.filter((p) => allowed.has((p.periodName ?? '').trim()));
  const enrichedAssets = tagged.enrichedAssets.filter((a) => {
    const project = projectById.get(String(a.projectId));
    if (!project) return !opts?.strictMissingProject;
    const rowPeriod = (project.periodName ?? '').trim();
    if (!rowPeriod) return !opts?.strictMissingProject;
    return allowed.has(rowPeriod);
  });
  const assetKeys = new Set(enrichedAssets.map((a) => normAssetKey(a.id)));
  const assetLastTaskMap = Object.fromEntries(
    Object.entries(tagged.assetLastTaskMap).filter(([k]) => assetKeys.has(normAssetKey(k))),
  );

  const unchangedRows = enrichedAssets.length === tagged.enrichedAssets.length;
  const totalAssetCount =
    unchangedRows && typeof tagged.totalAssetCount === 'number'
      ? tagged.totalAssetCount
      : enrichedAssets.length;

  return {
    ...tagged,
    projects,
    enrichedAssets,
    assetLastTaskMap,
    totalAssetCount,
  };
}

export const formatListDate = (dateString?: string) => {
  if (!dateString) return '–';
  return new Date(dateString).toLocaleDateString('en-CA');
};

export function abbrevBudgetCategoryName(fullName: string): string {
  const trimmed = fullName.trim();
  if (!trimmed) return '–';
  const known: Record<string, string> = {
    'revenue maintenance': 'RM',
    'new revenue generating': 'NRG',
    strategic: 'S',
    'general & routine assets': 'GR',
    'general and routine assets': 'GR',
    'project pipeline': 'PP',
  };
  const key = trimmed.toLowerCase();
  if (known[key]) return known[key];
  const words = trimmed.split(/[\s&/_-]+/).filter((w) => /[a-zA-Z0-9]/.test(w));
  if (words.length === 0) return trimmed.slice(0, 4).toUpperCase();
  const initials = words
    .map((w) => {
      const m = w.match(/[a-zA-Z]/);
      return m ? m[0].toUpperCase() : '';
    })
    .join('');
  return initials || trimmed.slice(0, 3).toUpperCase();
}

export type ProjectTimingTone = 'ahead' | 'behind' | 'neutral' | 'missing';

export function getProjectTimingInfo(asset: EnrichedAsset): {
  label: string;
  tone: ProjectTimingTone;
  title: string;
} {
  const targetRaw = asset.endTargetDate;
  const projectionRaw = asset.projectionEndDate;
  if (!targetRaw || !projectionRaw) {
    return { label: '–', tone: 'missing', title: 'Perlu End Date dan Projection Date' };
  }
  const target = new Date(targetRaw);
  const projection = new Date(projectionRaw);
  if (Number.isNaN(target.getTime()) || Number.isNaN(projection.getTime())) {
    return { label: '–', tone: 'missing', title: 'Tanggal tidak valid' };
  }
  target.setHours(0, 0, 0, 0);
  projection.setHours(0, 0, 0, 0);
  const diffDays = Math.round((projection.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return { label: '0d', tone: 'neutral', title: 'Proyeksi sama dengan target' };
  }
  if (diffDays < 0) {
    const n = Math.abs(diffDays);
    return {
      label: `-${n}d`,
      tone: 'ahead',
      title: `${n} hari lebih cepat dari target (proyeksi vs end date)`,
    };
  }
  return {
    label: `+${diffDays}d`,
    tone: 'behind',
    title: `${diffDays} hari terlambat vs target (proyeksi vs end date)`,
  };
}

const BUDGET_THRESHOLD = 300_000_000;

export type AssetFilterMaps = {
  projectPriorityMap: Map<string, string>;
  projectBudgetMap: Map<string, number>;
  projectById: Map<string, Project>;
};

function pickProjectField(project: Project | undefined, camel: keyof Project, snake: string): string {
  if (!project) return '';
  const direct = project[camel];
  if (direct != null && String(direct).trim() !== '') return String(direct).trim();
  const raw = (project as unknown as Record<string, unknown>)[snake];
  return raw != null && String(raw).trim() !== '' ? String(raw).trim() : '';
}

export type PreloadedTableScope = {
  assets: EnrichedAsset[];
  projects: Project[];
  lastMap: Map<string, string>;
};

/** Scope preloaded bundle once at mount — no render-path side effects. */
export function resolvePreloadedTableScope(
  usePreloaded: boolean,
  bundle: ProjectListBundle | null | undefined,
  user: User | null | undefined,
  scopes: UserScopesForCapex,
  scopesReady: boolean,
): PreloadedTableScope | null {
  if (!usePreloaded || !bundle || !user) return null;
  const ls = projectListBundleToListSource(bundle);
  const scopedLs = scopeListSourceToUser(ls, scopes, { ready: scopesReady });
  const lastMap = new Map<string, string>();
  for (const [k, v] of Object.entries(scopedLs.assetLastTaskMap)) {
    lastMap.set(normAssetKey(k), v);
  }
  return {
    assets: scopedLs.assets,
    projects: scopedLs.projects,
    lastMap,
  };
}

/** O(assets) completion rates with O(1) workflow lookup per asset. */
export function calculateAssetCompletionRates(
  assetsToCalc: EnrichedAsset[],
  workflows: WorkflowSet[],
  statusesByAsset: Map<string, AssetTaskStatus[]>,
  logsByAsset: Map<string, TaskLog[]>,
): Map<string, number> {
  const newRates = new Map<string, number>();
  const str = (id: string | number | undefined) => (id == null ? '' : String(id));
  const isDone = (s: AssetTaskStatus) =>
    typeof s.status === 'string'
      ? s.status.toLowerCase() === 'done'
      : s.status === TaskCurrentStatus.Done;
  const workflowById = new Map(workflows.map((w) => [str(w.id), w] as const));

  for (const asset of assetsToCalc) {
    const assetKey = normAssetKey(asset.id);
    const workflow = workflowById.get(str(asset.workflowSetId));
    if (!workflow || workflow.steps.length === 0) {
      newRates.set(assetKey, 0);
      continue;
    }
    const stepTaskIds = new Set(workflow.steps.map((s) => str(s.taskId)));
    const stepWeightByTaskId = new Map<string, number>(
      workflow.steps.map((s) => [str(s.taskId), Number(s.taskScore ?? 0)] as [string, number]),
    );
    const milestoneByTaskId = new Map<string, number>(
      workflow.steps
        .filter((s) => s.milestoneScore != null)
        .map((s) => [str(s.taskId), Number(s.milestoneScore ?? 0)] as [string, number]),
    );
    const statuses = statusesByAsset.get(assetKey) || [];
    const logs = logsByAsset.get(assetKey) || [];

    const doneFromStatuses = new Set(
      statuses.filter(isDone).map((s) => str(s.taskId)).filter((tid) => stepTaskIds.has(tid)),
    );
    const doneFromLogs = new Set(logs.map((l) => str(l.taskId)).filter((tid) => stepTaskIds.has(tid)));
    const doneTaskIds = new Set<string>([...doneFromStatuses, ...doneFromLogs]);
    const totalWeight = Array.from(stepWeightByTaskId.values()).reduce(
      (sum, w) => sum + Math.max(0, w),
      0,
    );
    const weightedRate =
      totalWeight > 0
        ? Math.min(
            100,
            Math.round(
              (Array.from(doneTaskIds).reduce(
                (sum, tid) => sum + Math.max(0, stepWeightByTaskId.get(tid) ?? 0),
                0,
              ) /
                totalWeight) *
                100,
            ),
          )
        : Math.min(100, Math.round((doneTaskIds.size / workflow.steps.length) * 100));
    const milestoneRate = Array.from(doneTaskIds).reduce(
      (max, tid) => Math.max(max, Math.max(0, milestoneByTaskId.get(tid) ?? 0)),
      0,
    );
    const rate = Math.min(100, Math.max(weightedRate, milestoneRate));
    newRates.set(assetKey, rate);
  }
  return newRates;
}

/** Merge / synthesize project rows for visible assets when API bundles omit full `projects[]`. */
export function enrichProjectsForAssets(assets: EnrichedAsset[], projects: Project[]): Project[] {
  const byId = new Map(projects.map((p) => [String(p.id), { ...p }] as const));
  const orderedIds: string[] = [];
  const seen = new Set<string>();

  for (const asset of assets) {
    const pid = String(asset.projectId ?? '').trim();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    orderedIds.push(pid);

    const existing = byId.get(pid);
    const assetCat = String(asset.budgetCategoryId ?? '').trim();
    const assetPri = String(asset.projectPriorityId ?? '').trim();
    const mergedCat =
      pickProjectField(existing, 'budgetCategoryId', 'budget_category_id') || assetCat;
    const mergedPri = pickProjectField(existing, 'priorityId', 'priority_id') || assetPri;

    if (existing) {
      byId.set(pid, {
        ...existing,
        budgetCategoryId: mergedCat || existing.budgetCategoryId,
        priorityId: mergedPri || existing.priorityId,
        projectName: existing.projectName || asset.projectName,
      });
      continue;
    }

    byId.set(pid, {
      id: pid,
      assetCode: asset.assetCode,
      projectName: asset.projectName,
      assetName: asset.assetName,
      projectCode: asset.projectCode ?? '',
      completionRate: asset.completionRate ?? 0,
      taskToDo: '',
      owner: '',
      targetStart: '',
      endDate: '',
      status: ProjectStatus.OnTrack,
      plan: '',
      budgetPlan: asset.budgetPlan ?? 0,
      budgetCarryForward: 0,
      budgetAllocated: asset.budgetAllocated ?? 0,
      approvedBudget: 0,
      consumedBudget: asset.consumedBudget ?? 0,
      revenueProjection: 0,
      priorityId: mergedPri,
      type: ProjectType.GeneralAndRoutine,
      budgetCategoryId: mergedCat,
      assets: [],
    });
  }

  return orderedIds.map((id) => byId.get(id)!);
}

export function buildAssetFilterMaps(
  allProjects: Project[],
  priorities: ProjectPriorityConfig[],
  assets?: EnrichedAsset[],
): AssetFilterMaps {
  const priorityIdToNameMap = new Map(
    priorities.map((p) => [String(p.id), p.name] as [string, string]),
  );
  const projectPriorityMap = new Map<string, string>();
  const projectBudgetMap = new Map<string, number>();
  const projectById = new Map<string, Project>();
  for (const p of allProjects) {
    const id = String(p.id);
    projectById.set(id, p);
    const priorityName = priorityIdToNameMap.get(String(p.priorityId));
    if (priorityName) projectPriorityMap.set(id, priorityName);
    projectBudgetMap.set(id, p.approvedBudget > 0 ? p.approvedBudget : p.budgetPlan);
  }
  if (assets) {
    for (const asset of assets) {
      const pid = String(asset.projectId);
      if (projectPriorityMap.has(pid)) continue;
      const priId = String(asset.projectPriorityId ?? '').trim();
      const priorityName = priId ? priorityIdToNameMap.get(priId) : undefined;
      if (priorityName) projectPriorityMap.set(pid, priorityName);
    }
  }
  return { projectPriorityMap, projectBudgetMap, projectById };
}

export type AssetListFilters = {
  searchLower: string;
  selectedHUs: string[];
  selectedPriorities: string[];
  selectedFinishedTasks: string[];
  selectedBudgetFilter: string | null;
  selectedBudgetCategoryIds: string[];
  completionRange: { min: number; max: number };
  meetingFilters: { archetype: string | null; assetTypeGroup: string | null };
  /** Budget periods currently selected in UI — rows outside these are excluded when set. */
  allowedPeriods?: string[];
  /** When true, drop rows whose project period is unknown (client pool path). */
  strictPeriodFilter?: boolean;
  /** Master maps for asset type group — preferred over legacy lookup. */
  assetTypeGroupMaps?: AssetTypeGroupMasterMaps;
  /** workflowSetId / `type:${assetTypeId}` → group name — legacy fallback */
  assetTypeGroupLookup?: Map<string, string>;
  /** huName → archetype name — aligns client filter with server HU-based archetype filter. */
  archetypeByHuName?: Map<string, string>;
};

export type AssetTypeGroupMasterMaps = {
  /** asset_type_configs.id → group name */
  groupNameByTypeId: Map<string, string>;
  /** workflow_set_id → group name */
  groupNameByWorkflowSetId: Map<string, string>;
  /** Combined lookup (`type:{id}` + workflow_set_id) — backward compat */
  lookup: Map<string, string>;
  /** Group names that have at least one active asset type — for slicer UI */
  groupNames: string[];
};

function readTypeGroupId(type: AssetTypeConfig): string {
  return String(
    (type as { groupId?: string; group_id?: string }).groupId ??
      (type as { group_id?: string }).group_id ??
      '',
  ).trim();
}

function readTypeWorkflowSetId(type: AssetTypeConfig): string {
  return String(
    (type as { workflowSetId?: string; workflow_set_id?: string }).workflowSetId ??
      (type as { workflow_set_id?: string }).workflow_set_id ??
      '',
  ).trim();
}

/** Master-aligned maps — only active asset types; type id is canonical over workflow_set_id. */
export function buildAssetTypeGroupMasterMaps(
  groups: AssetTypeGroupConfig[],
  types: AssetTypeConfig[],
): AssetTypeGroupMasterMaps {
  const groupNameById = new Map(
    groups.map((g) => [String(g.id), g.name] as [string, string]),
  );
  const groupNameByTypeId = new Map<string, string>();
  const groupNameByWorkflowSetId = new Map<string, string>();
  const lookup = new Map<string, string>();
  const groupIdsWithActiveTypes = new Set<string>();

  for (const type of types) {
    if (type.isActive === false) continue;
    const groupId = readTypeGroupId(type);
    const groupName = groupNameById.get(groupId);
    if (!groupName) continue;
    groupIdsWithActiveTypes.add(groupId);

    const typeId = String(type.id).trim();
    if (typeId) {
      groupNameByTypeId.set(typeId, groupName);
      lookup.set(`type:${typeId}`, groupName);
    }
    const wsId = readTypeWorkflowSetId(type);
    if (wsId) {
      groupNameByWorkflowSetId.set(wsId, groupName);
      lookup.set(wsId, groupName);
    }
  }

  const groupNames = groups
    .filter((g) => groupIdsWithActiveTypes.has(String(g.id)))
    .map((g) => g.name)
    .sort((a, b) => a.localeCompare(b, 'id', { sensitivity: 'base' }));

  return { groupNameByTypeId, groupNameByWorkflowSetId, lookup, groupNames };
}

/** @deprecated Prefer `buildAssetTypeGroupMasterMaps().lookup` */
export function buildAssetTypeGroupLookup(
  groups: AssetTypeGroupConfig[],
  types: AssetTypeConfig[],
): Map<string, string> {
  return buildAssetTypeGroupMasterMaps(groups, types).lookup;
}

export function resolveAssetTypeGroupName(
  asset: EnrichedAsset,
  lookupOrMaps?: Map<string, string> | AssetTypeGroupMasterMaps,
): string | undefined {
  const maps: AssetTypeGroupMasterMaps | null =
    lookupOrMaps instanceof Map
      ? {
          groupNameByTypeId: new Map(),
          groupNameByWorkflowSetId: new Map(),
          lookup: lookupOrMaps,
          groupNames: [],
        }
      : lookupOrMaps ?? null;

  const typeId = asset.assetTypeId != null ? String(asset.assetTypeId).trim() : '';
  if (typeId) {
    const fromType = maps?.groupNameByTypeId.get(typeId) ?? maps?.lookup.get(`type:${typeId}`);
    if (fromType) return fromType;
  }

  const wsId = asset.workflowSetId != null ? String(asset.workflowSetId).trim() : '';
  if (wsId) {
    const fromWs = maps?.groupNameByWorkflowSetId.get(wsId) ?? maps?.lookup.get(wsId);
    if (fromWs) return fromWs;
  }

  const enriched = asset.assetTypeGroupName?.trim();
  if (enriched && maps?.groupNames.length) {
    const key = normFilterName(enriched);
    const hit = maps.groupNames.find((name) => normFilterName(name) === key);
    if (hit) return hit;
  }

  return undefined;
}

/** Build huName → archetype from bundle or page master (for meeting-slicer validation). */
export function buildArchetypeByHuNameFromBundle(
  archetypes: { id: string | number; name: string }[],
  hus: { id: string | number; name: string; archetypeId?: string | number; archetype_id?: string | number }[],
): Map<string, string> {
  const archById = new Map(archetypes.map((a) => [String(a.id), a.name] as const));
  const m = new Map<string, string>();
  for (const hu of hus) {
    const archId = String(hu.archetypeId ?? hu.archetype_id ?? '');
    const archName = archById.get(archId);
    if (archName) m.set(hu.name, archName);
  }
  return m;
}

/** Archetype name on asset, or derived from HU (same rule as server HU-based archetype filter). */
export function resolveAssetArchetypeName(
  asset: EnrichedAsset,
  archetypeByHuName?: Map<string, string>,
): string | undefined {
  const direct = asset.archetypeName?.trim();
  if (direct) return direct;
  const hu = asset.huName?.trim();
  if (!hu || !archetypeByHuName?.size) return undefined;
  if (archetypeByHuName.has(hu)) return archetypeByHuName.get(hu);
  const huKey = normFilterName(hu);
  for (const [name, arch] of archetypeByHuName) {
    if (normFilterName(name) === huKey) return arch;
  }
  return undefined;
}

/** True when visible rows already match archetype / asset-type-group slicers. */
function assetTypeGroupResolver(
  maps?: AssetTypeGroupMasterMaps,
  legacyLookup?: Map<string, string>,
): Map<string, string> | AssetTypeGroupMasterMaps | undefined {
  return maps ?? legacyLookup;
}

export function enrichedAssetsMatchMeetingFilters(
  assets: EnrichedAsset[],
  meetingFilters: { archetype: string | null; assetTypeGroup: string | null },
  assetTypeGroupLookup?: Map<string, string> | AssetTypeGroupMasterMaps,
  archetypeByHuName?: Map<string, string>,
  opts?: { allowEmpty?: boolean },
): boolean {
  if (assets.length === 0) return opts?.allowEmpty ?? false;
  if (meetingFilters.archetype) {
    if (
      assets.some(
        (a) =>
          !filterNamesEqual(
            resolveAssetArchetypeName(a, archetypeByHuName),
            meetingFilters.archetype,
          ),
      )
    ) {
      return false;
    }
  }
  if (meetingFilters.assetTypeGroup) {
    if (
      assets.some((a) => {
        if (filterNamesEqual(a.assetTypeGroupName, meetingFilters.assetTypeGroup)) {
          return false;
        }
        const group =
          resolveAssetTypeGroupName(a, assetTypeGroupLookup) ?? a.assetTypeGroupName?.trim();
        return !filterNamesEqual(group, meetingFilters.assetTypeGroup);
      })
    ) {
      return false;
    }
  }
  return true;
}

export type PanelTableFilterSlice = {
  selectedHUs: string[];
  selectedPriorities: string[];
  selectedFinishedTasks: string[];
  selectedBudgetFilter: string | null;
  selectedBudgetCategoryIds: string[];
  completionRange: { min: number; max: number };
  searchLower?: string;
};

export type ProjectListSearchFieldTexts = {
  assetCode: string;
  assetName: string;
  projectName: string;
  projectCode: string;
};

/** Resolve the four core search columns from asset row + optional linked project. */
export function resolveProjectListSearchFieldTexts(
  asset: EnrichedAsset,
  project?: Project | null,
): ProjectListSearchFieldTexts {
  const linked = project ?? null;
  return {
    assetCode: String(
      asset.assetCode ?? (asset as { asset_code?: string }).asset_code ?? linked?.assetCode ?? '',
    ).trim(),
    assetName: String(
      asset.assetName ?? (asset as { asset_name?: string }).asset_name ?? linked?.assetName ?? '',
    ).trim(),
    projectName: String(
      asset.projectName ??
        (asset as { project_name?: string }).project_name ??
        linked?.projectName ??
        '',
    ).trim(),
    projectCode: String(
      asset.projectCode ??
        (asset as { project_code?: string }).project_code ??
        linked?.projectCode ??
        '',
    ).trim(),
  };
}

function normalizeProjectListSearchTerm(term: string): string {
  return term.trim().toLowerCase();
}

function normalizeProjectListCodeSearchTerm(term: string): string {
  return normalizeProjectListSearchTerm(term).replace(/\s+/g, '');
}

function textIncludesProjectListSearchTerm(
  haystack: string,
  term: string,
  termCode: string,
): boolean {
  const normalized = haystack.toLowerCase();
  const normalizedCode = normalized.replace(/\s+/g, '');
  return normalized.includes(term) || (termCode.length > 0 && normalizedCode.includes(termCode));
}

/** Match code asset, nama asset, nama project, code project (+ optional HU/archetype/description/last task). */
export function enrichedAssetMatchesProjectListSearch(
  asset: EnrichedAsset,
  searchLower: string,
  opts?: {
    project?: Project | null;
    assetLastTaskMap?: Map<string, string>;
    archetypeByHuName?: Map<string, string>;
    includeExtendedFields?: boolean;
  },
): boolean {
  const term = normalizeProjectListSearchTerm(searchLower);
  if (!term) return true;

  const termCode = normalizeProjectListCodeSearchTerm(searchLower);
  const fields = resolveProjectListSearchFieldTexts(asset, opts?.project);
  const coreMatch =
    textIncludesProjectListSearchTerm(fields.assetCode, term, termCode) ||
    textIncludesProjectListSearchTerm(fields.assetName, term, termCode) ||
    textIncludesProjectListSearchTerm(fields.projectName, term, termCode) ||
    textIncludesProjectListSearchTerm(fields.projectCode, term, termCode);

  if (coreMatch) return true;
  if (opts?.includeExtendedFields === false) return false;

  const lastTask =
    opts?.assetLastTaskMap?.get(normAssetKey(asset.id))?.toLowerCase() ?? '';
  const archetypeSearch =
    resolveAssetArchetypeName(asset, opts?.archetypeByHuName)?.toLowerCase() ??
    asset.archetypeName?.toLowerCase() ??
    '';
  return (
    Boolean(asset.huName?.toLowerCase().includes(term)) ||
    archetypeSearch.includes(term) ||
    Boolean((asset as { description?: string }).description?.toLowerCase().includes(term)) ||
    lastTask.includes(term)
  );
}

/** Validate visible rows against panel filters (HU, priority, etc.) — mirrors client filter rules. */
export function enrichedAssetsMatchPanelFilters(
  assets: EnrichedAsset[],
  filters: PanelTableFilterSlice,
  maps?: AssetFilterMaps,
  assetLastTaskMap?: Map<string, string>,
  opts?: { allowEmpty?: boolean; archetypeByHuName?: Map<string, string> },
): boolean {
  if (assets.length === 0) return opts?.allowEmpty ?? false;

  if (filters.selectedHUs.length > 0) {
    const huSet = new Set(filters.selectedHUs.map((hu) => normFilterName(hu)));
    if (assets.some((a) => !huSet.has(normFilterName(a.huName)))) return false;
  }

  if (filters.selectedPriorities.length > 0) {
    if (!maps) return false;
    const prioritySet = new Set(filters.selectedPriorities.map((p) => normFilterName(p)));
    if (
      assets.some((a) => {
        const priorityName = maps.projectPriorityMap.get(String(a.projectId));
        return !priorityName || !prioritySet.has(normFilterName(priorityName));
      })
    ) {
      return false;
    }
  }

  if (filters.selectedBudgetCategoryIds.length > 0) {
    if (!maps) return false;
    const categorySet = new Set(filters.selectedBudgetCategoryIds.map(String));
    if (
      assets.some((a) => {
        const catId =
          maps.projectById.get(String(a.projectId))?.budgetCategoryId || a.budgetCategoryId;
        return !catId || !categorySet.has(String(catId));
      })
    ) {
      return false;
    }
  }

  if (filters.selectedBudgetFilter) {
    if (!maps) return false;
    if (
      assets.some((a) => {
        const projectBudget = maps.projectBudgetMap.get(String(a.projectId)) || 0;
        if (filters.selectedBudgetFilter === 'low' && projectBudget > BUDGET_THRESHOLD) return true;
        if (filters.selectedBudgetFilter === 'high' && projectBudget <= BUDGET_THRESHOLD) return true;
        return false;
      })
    ) {
      return false;
    }
  }

  if (filters.selectedFinishedTasks.length > 0) {
    if (!assetLastTaskMap) return false;
    const finishedSet = new Set(filters.selectedFinishedTasks);
    if (
      assets.some((a) => {
        const lastTask = assetLastTaskMap.get(normAssetKey(a.id));
        return !lastTask || !finishedSet.has(lastTask);
      })
    ) {
      return false;
    }
  }

  const { min, max } = filters.completionRange;
  if (min > 0 || max < 100) {
    if (assets.some((a) => {
      const rate = a.completionRate || 0;
      return rate < min || rate > max;
    })) {
      return false;
    }
  }

  const searchLower = filters.searchLower?.trim().toLowerCase();
  if (searchLower) {
    if (
      assets.some((a) => {
        const project = maps?.projectById.get(String(a.projectId));
        return !enrichedAssetMatchesProjectListSearch(a, searchLower, {
          project,
          assetLastTaskMap,
          archetypeByHuName: opts?.archetypeByHuName,
        });
      })
    ) {
      return false;
    }
  }

  return true;
}

export function filterEnrichedAssets(
  allAssets: EnrichedAsset[],
  maps: AssetFilterMaps,
  assetLastTaskMap: Map<string, string>,
  filters: AssetListFilters,
): EnrichedAsset[] {
  const {
    searchLower,
    selectedHUs,
    selectedPriorities,
    selectedFinishedTasks,
    selectedBudgetFilter,
    selectedBudgetCategoryIds,
    completionRange,
    meetingFilters,
  } = filters;

  const huSet =
    selectedHUs.length > 0 ? new Set(selectedHUs.map((hu) => normFilterName(hu))) : null;
  const prioritySet =
    selectedPriorities.length > 0
      ? new Set(selectedPriorities.map((p) => normFilterName(p)))
      : null;
  const finishedSet = selectedFinishedTasks.length > 0 ? new Set(selectedFinishedTasks) : null;
  const categorySet =
    selectedBudgetCategoryIds.length > 0 ? new Set(selectedBudgetCategoryIds) : null;
  const periodSet =
    filters.allowedPeriods && filters.allowedPeriods.length > 0
      ? new Set(filters.allowedPeriods.map((p) => p.trim()).filter(Boolean))
      : null;
  const strictPeriod = Boolean(filters.strictPeriodFilter);

  const out: EnrichedAsset[] = [];
  for (const asset of allAssets) {
    if (isAssetCancelledForProjectList(asset)) continue;
    if (periodSet && periodSet.size > 0) {
      const project = maps.projectById.get(String(asset.projectId));
      const rowPeriod = (project?.periodName ?? '').trim();
      if (rowPeriod) {
        if (!periodSet.has(rowPeriod)) continue;
      } else if (strictPeriod) {
        continue;
      }
    }
    if (
      meetingFilters.archetype &&
      !filterNamesEqual(
        resolveAssetArchetypeName(asset, filters.archetypeByHuName),
        meetingFilters.archetype,
      )
    ) {
      continue;
    }
    if (meetingFilters.assetTypeGroup) {
      const groupName =
        resolveAssetTypeGroupName(
          asset,
          assetTypeGroupResolver(filters.assetTypeGroupMaps, filters.assetTypeGroupLookup),
        ) ?? asset.assetTypeGroupName?.trim();
      if (!filterNamesEqual(groupName, meetingFilters.assetTypeGroup)) continue;
    }
    if (huSet && !huSet.has(normFilterName(asset.huName))) continue;

    if (selectedBudgetFilter) {
      const projectBudget = maps.projectBudgetMap.get(String(asset.projectId)) || 0;
      if (selectedBudgetFilter === 'low' && projectBudget > BUDGET_THRESHOLD) continue;
      if (selectedBudgetFilter === 'high' && projectBudget <= BUDGET_THRESHOLD) continue;
    }

    if (prioritySet) {
      const priorityName = maps.projectPriorityMap.get(String(asset.projectId));
      if (!priorityName || !prioritySet.has(normFilterName(priorityName))) continue;
    }

    if (categorySet) {
      const catId =
        maps.projectById.get(String(asset.projectId))?.budgetCategoryId || asset.budgetCategoryId;
      if (!catId || !categorySet.has(String(catId))) continue;
    }

    if (finishedSet) {
      const lastTask = assetLastTaskMap.get(normAssetKey(asset.id));
      if (!lastTask || !finishedSet.has(lastTask)) continue;
    }

    const rate = asset.completionRate || 0;
    if (rate < completionRange.min || rate > completionRange.max) continue;

    if (searchLower) {
      const project = maps.projectById.get(String(asset.projectId));
      if (
        !enrichedAssetMatchesProjectListSearch(asset, searchLower, {
          project,
          assetLastTaskMap,
          archetypeByHuName: filters.archetypeByHuName,
        })
      ) {
        continue;
      }
    }
    out.push(asset);
  }
  return out;
}

export type ClientFilteredProjectListPage = {
  assets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Map<string, string>;
  totalAssetCount: number;
};

/** Gabungkan halaman server ke pool client-filter tanpa menunggu full warm. */
export function mergeListSourceIntoPool(
  existing: {
    assets: EnrichedAsset[];
    projects: Project[];
    assetLastTaskMap: Record<string, string>;
    priorities: ProjectPriorityConfig[];
  },
  incoming: {
    assets: EnrichedAsset[];
    projects: Project[];
    assetLastTaskMap: Record<string, string>;
    priorities?: ProjectPriorityConfig[];
  },
): typeof existing {
  const assetSeen = new Set(existing.assets.map((a) => normAssetKey(a.id)));
  const mergedAssets = [...existing.assets];
  for (const a of incoming.assets) {
    const k = normAssetKey(a.id);
    if (!assetSeen.has(k)) {
      assetSeen.add(k);
      mergedAssets.push(a);
    }
  }
  const projectById = new Map(existing.projects.map((p) => [String(p.id), p]));
  for (const p of incoming.projects) {
    projectById.set(String(p.id), p);
  }
  const mergedProjects = enrichProjectsForAssets(mergedAssets, Array.from(projectById.values()));
  return {
    ...existing,
    assets: mergedAssets,
    projects: mergedProjects,
    assetLastTaskMap: { ...existing.assetLastTaskMap, ...incoming.assetLastTaskMap },
    priorities: incoming.priorities?.length ? incoming.priorities : existing.priorities,
  };
}

/** Instant table page from an in-memory pool (no server round-trip). */
export function buildClientFilteredProjectListPage(
  pool: {
    assets: EnrichedAsset[];
    projects: Project[];
    priorities: ProjectPriorityConfig[];
    assetLastTaskMap: Record<string, string>;
  },
  filters: AssetListFilters & { sortBy?: ProjectListSortOption },
  page: number,
  pageSize: number,
): ClientFilteredProjectListPage {
  let poolAssets = pool.assets;
  let poolProjects = pool.projects;
  let poolLastRecord = pool.assetLastTaskMap;

  if (filters.allowedPeriods?.length) {
    const scoped = filterProjectListBundleByPeriods(
      {
        enrichedAssets: pool.assets,
        projects: pool.projects,
        assetLastTaskMap: pool.assetLastTaskMap,
        workflows: [],
        archetypes: [],
        hus: [],
        users: [],
        priorities: pool.priorities,
        allRoles: [],
        allTasks: [],
      },
      filters.allowedPeriods,
      { strictMissingProject: filters.strictPeriodFilter },
    );
    poolAssets = scoped.enrichedAssets;
    poolProjects = scoped.projects;
    poolLastRecord = scoped.assetLastTaskMap;
  }

  const maps = buildAssetFilterMaps(poolProjects, pool.priorities, poolAssets);
  const lastMap = new Map(
    Object.entries(poolLastRecord).map(([k, v]) => [normAssetKey(k), v] as [string, string]),
  );
  const filtered = filterEnrichedAssets(poolAssets, maps, lastMap, filters);
  const sorted = sortEnrichedAssetsByOption(filtered, filters.sortBy ?? DEFAULT_PROJECT_LIST_SORT);
  const from = Math.max(0, (page - 1) * pageSize);
  const pageSlice = sorted.slice(from, from + pageSize);
  const projects = enrichProjectsForAssets(pageSlice, poolProjects);
  const pageKeys = new Set(pageSlice.map((a) => normAssetKey(a.id)));
  const pageLastMap = new Map<string, string>();
  for (const [k, v] of lastMap) {
    if (pageKeys.has(k)) pageLastMap.set(k, v);
  }
  return {
    assets: pageSlice,
    projects,
    assetLastTaskMap: pageLastMap,
    totalAssetCount: sorted.length,
  };
}

/** All filtered rows from in-memory pool (Excel export — no pagination). */
export function buildClientFilteredProjectListExport(
  pool: {
    assets: EnrichedAsset[];
    projects: Project[];
    priorities: ProjectPriorityConfig[];
    assetLastTaskMap: Record<string, string>;
  },
  filters: AssetListFilters & { sortBy?: ProjectListSortOption },
): {
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  assetLastTaskMap: Map<string, string>;
} {
  let poolAssets = pool.assets;
  let poolProjects = pool.projects;
  let poolLastRecord = pool.assetLastTaskMap;

  if (filters.allowedPeriods?.length) {
    const scoped = filterProjectListBundleByPeriods(
      {
        enrichedAssets: pool.assets,
        projects: pool.projects,
        assetLastTaskMap: pool.assetLastTaskMap,
        workflows: [],
        archetypes: [],
        hus: [],
        users: [],
        priorities: pool.priorities,
        allRoles: [],
        allTasks: [],
      },
      filters.allowedPeriods,
      { strictMissingProject: filters.strictPeriodFilter },
    );
    poolAssets = scoped.enrichedAssets;
    poolProjects = scoped.projects;
    poolLastRecord = scoped.assetLastTaskMap;
  }

  const maps = buildAssetFilterMaps(poolProjects, pool.priorities, poolAssets);
  const lastMap = new Map(
    Object.entries(poolLastRecord).map(([k, v]) => [normAssetKey(k), v] as [string, string]),
  );
  const filtered = filterEnrichedAssets(poolAssets, maps, lastMap, filters);
  const sorted = sortEnrichedAssetsByOption(filtered, filters.sortBy ?? DEFAULT_PROJECT_LIST_SORT);
  const filteredKeys = new Set(sorted.map((a) => normAssetKey(a.id)));
  const exportLastMap = new Map<string, string>();
  for (const [k, v] of lastMap) {
    if (filteredKeys.has(k)) exportLastMap.set(k, v);
  }

  return {
    enrichedAssets: sorted,
    projects: enrichProjectsForAssets(sorted, poolProjects),
    assetLastTaskMap: exportLastMap,
  };
}
