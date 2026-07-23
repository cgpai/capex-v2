import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProjectListQueryFilters } from './project-list.dto';
import { BUDGET_THRESHOLD } from './project-list.dto';
import {
  escapeIlikePattern,
  postgrestOrIlikeFilterValue,
  postgrestOrIlikePattern,
  sanitizePostgrestIdList,
  sanitizePostgrestSearchTerm,
  sanitizeSearchForOrFilter,
  sqlIlikePattern,
} from '../shared/postgrest-filter.util';

/** Bump when list read policy changes — invalidates Redis + FE disk caches. */
export const PROJECT_LIST_DATA_POLICY = 'v8-slim-wire-payload';

const SEARCH_PROJECT_ID_CAP = 3000;

export {
  escapeIlikePattern,
  postgrestOrIlikeFilterValue,
  postgrestOrIlikePattern,
  sanitizeSearchForOrFilter,
  sqlIlikePattern,
};

const MAX_SEARCH_PROJECT_IDS_IN_OR = 120;
const SEARCH_ASSET_ID_CAP = 3000;

type SearchableAssetColumn = 'asset_code' | 'asset_name' | 'description';

/**
 * Resolve project IDs matching search (project/HU/archetype names) for the period.
 * Avoids unreliable nested `projects.*.ilike` inside assets `.or()`.
 */
export async function resolveSearchProjectIdsForList(
  client: SupabaseClient,
  periodName: string,
  search: string,
  master: {
    archetypes: { id: string; name: string }[];
    hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
  },
  restrictHuIds: string[] | null,
): Promise<string[]> {
  const term = sanitizePostgrestSearchTerm(search);
  if (!term) return [];

  const sqlPat = sqlIlikePattern(term);
  const ids = new Set<string>();
  const pn = periodName.trim();

  const applyHuRestrict = <T extends { in: (col: string, vals: string[]) => T }>(q: T): T => {
    if (restrictHuIds?.length) return q.in('hospital_unit_id', restrictHuIds);
    return q;
  };

  for (const column of ['project_name', 'project_code'] as const) {
    let pq = client.from('projects').select('id').eq('period_name', pn).ilike(column, sqlPat);
    pq = applyHuRestrict(pq);
    const { data, error } = await pq.limit(1500);
    if (error) throw new Error(`search projects ${column}: ${error.message}`);
    for (const row of data || []) ids.add(String((row as { id: string }).id));
  }

  const { data: huHits, error: huErr } = await client
    .from('hospital_units_config')
    .select('id')
    .ilike('name', sqlPat)
    .limit(400);
  if (huErr) throw new Error(`search hospital_units: ${huErr.message}`);

  let huIds = (huHits || []).map((h: { id: string }) => String(h.id));
  if (restrictHuIds?.length) {
    const allow = new Set(restrictHuIds);
    huIds = huIds.filter((id) => allow.has(id));
  }
  for (let i = 0; i < huIds.length; i += 200) {
    const chunk = huIds.slice(i, i + 200);
    if (chunk.length === 0) continue;
    const { data: byHu, error: byHuErr } = await client
      .from('projects')
      .select('id')
      .eq('period_name', pn)
      .in('hospital_unit_id', chunk)
      .limit(1500);
    if (byHuErr) throw new Error(`search projects by hu: ${byHuErr.message}`);
    for (const row of byHu || []) ids.add(String((row as { id: string }).id));
  }

  const termLower = term.toLowerCase();
  const archIds = new Set<string>();
  for (const a of master.archetypes) {
    if (String(a.name).toLowerCase().includes(termLower)) archIds.add(String(a.id));
  }
  if (archIds.size === 0) {
    const { data: archHits, error: archErr } = await client
      .from('archetypes_config')
      .select('id')
      .ilike('name', sqlPat)
      .limit(50);
    if (archErr) throw new Error(`search archetypes: ${archErr.message}`);
    for (const row of archHits || []) archIds.add(String((row as { id: string }).id));
  }

  if (archIds.size > 0) {
    let huFromArch = master.hus
      .filter((h) => archIds.has(String(h.archetypeId ?? h.archetype_id)))
      .map((h) => String(h.id));
    if (restrictHuIds?.length) {
      const allow = new Set(restrictHuIds);
      huFromArch = huFromArch.filter((id) => allow.has(id));
    }
    for (let i = 0; i < huFromArch.length; i += 200) {
      const chunk = huFromArch.slice(i, i + 200);
      if (chunk.length === 0) continue;
      const { data: byArch, error: byArchErr } = await client
        .from('projects')
        .select('id')
        .eq('period_name', pn)
        .in('hospital_unit_id', chunk)
        .limit(1500);
      if (byArchErr) throw new Error(`search projects by archetype: ${byArchErr.message}`);
      for (const row of byArch || []) ids.add(String((row as { id: string }).id));
    }
  }

  return [...ids].slice(0, SEARCH_PROJECT_ID_CAP);
}

/**
 * Resolve asset IDs matching search on asset columns (two-arg ilike — safe for dots in codes).
 */
export async function resolveSearchAssetIdsForList(
  client: SupabaseClient,
  periodName: string,
  search: string,
  restrictHuIds: string[] | null,
): Promise<string[]> {
  const term = sanitizePostgrestSearchTerm(search);
  if (!term) return [];

  const sqlPat = sqlIlikePattern(term);
  const ids = new Set<string>();
  const pn = periodName.trim();

  for (const column of ['asset_code', 'asset_name', 'description'] as SearchableAssetColumn[]) {
    let q = client
      .from('assets')
      .select('id, projects!inner(period_name, hospital_unit_id)')
      .eq('projects.period_name', pn)
      .ilike(column, sqlPat);
    if (restrictHuIds?.length) {
      q = q.in('projects.hospital_unit_id', restrictHuIds);
    }
    const { data, error } = await q.limit(1500);
    if (error) throw new Error(`search assets ${column}: ${error.message}`);
    for (const row of data || []) ids.add(String((row as { id: string }).id));
    if (ids.size >= SEARCH_ASSET_ID_CAP) break;
  }

  return [...ids].slice(0, SEARCH_ASSET_ID_CAP);
}

/** Union asset-id hits (direct asset search + all assets under matched projects). */
export async function resolveFullSearchMatchingAssetIds(
  client: SupabaseClient,
  searchProjectIds: string[],
  searchAssetIds: string[],
): Promise<string[]> {
  const ids = new Set<string>(sanitizePostgrestIdList(searchAssetIds));
  const projectIds = sanitizePostgrestIdList(searchProjectIds);
  for (let i = 0; i < projectIds.length; i += 150) {
    const chunk = projectIds.slice(i, i + 150);
    if (chunk.length === 0) continue;
    const { data, error } = await client.from('assets').select('id').in('project_id', chunk);
    if (error) throw new Error(`search assets by project: ${error.message}`);
    for (const row of data || []) ids.add(String((row as { id: string }).id));
  }
  return [...ids];
}

const norm = (s: string) => s.trim().toLowerCase();

export function resolveArchetypeIdByName(archetypes: { id: string; name: string }[], name: string | null): string | null {
  if (!name?.trim()) return null;
  const key = norm(name);
  const hit = archetypes.find((a) => norm(String(a.name)) === key);
  return hit ? String(hit.id) : null;
}

export function resolveHuIdsByNames(
  hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[],
  names: string[],
): string[] {
  if (!names.length) return [];
  const wanted = new Set(names.map(norm));
  return hus
    .filter((h) => wanted.has(norm(String(h.name))))
    .map((h) => String(h.id));
}

export function huIdsForArchetype(
  hus: { id: string; archetypeId?: string; archetype_id?: string }[],
  archetypeId: string,
): string[] {
  return hus
    .filter((h) => String(h.archetypeId ?? h.archetype_id) === String(archetypeId))
    .map((h) => String(h.id));
}

const ASSET_LIST_SELECT = `
  id,
  asset_code,
  asset_name,
  description,
  project_id,
  workflow_set_id,
  budget_category_id,
  budget_plan,
  consumed_budget,
  budget_allocated,
  end_target_date,
  catalogue_id,
  po_number,
  is_goods_received,
  bdd_priority,
  asset_type_id,
  lifecycle_status,
  projects!inner (
    id,
    period_name,
    project_name,
    project_code,
    hospital_unit_id,
    priority_id,
    budget_category_id,
    approved_budget,
    budget_plan,
    hospital_units_config (
      id,
      name,
      archetype_id,
      archetypes_config ( id, name )
    )
  )
`;

export function assetListSelect(): string {
  return ASSET_LIST_SELECT;
}

/** PO Update page — ASSET_LIST_SELECT + PO/GR columns. */
export function poUpdateAssetListSelect(): string {
  return `
  id,
  asset_code,
  asset_name,
  description,
  project_id,
  workflow_set_id,
  budget_category_id,
  budget_plan,
  consumed_budget,
  budget_allocated,
  end_target_date,
  catalogue_id,
  po_number,
  qty,
  received_qty,
  is_goods_received,
  bdd_priority,
  asset_type_id,
  lifecycle_status,
  projects!inner (
    id,
    period_name,
    project_name,
    project_code,
    hospital_unit_id,
    priority_id,
    budget_category_id,
    approved_budget,
    budget_plan,
    hospital_units_config (
      id,
      name,
      archetype_id,
      archetypes_config ( id, name )
    )
  )
`;
}

/** Minimal join for count-only queries (faster than full ASSET_LIST_SELECT). */
export function assetCountSelect(): string {
  return `id, projects!inner(period_name, hospital_unit_id)`;
}

/** Embed projects — wajib ada agar filter PostgREST (period/HU/priority/budget) valid pada id-scan. */
const ASSET_ID_SCAN_PROJECT_EMBED =
  'projects!inner(period_name, hospital_unit_id, priority_id, budget_category_id, approved_budget, budget_plan)';

/** Lightweight scan for progress-filter / BDD ID pass. */
export function assetIdScanSelect(extended = false): string {
  const base = `id, asset_code, workflow_set_id, project_id`;
  if (extended) {
    return `${base}, asset_name, asset_type_id, bdd_priority, ${ASSET_ID_SCAN_PROJECT_EMBED}`;
  }
  return `${base}, ${ASSET_ID_SCAN_PROJECT_EMBED}`;
}

/** No rows — valid PostgREST filter that matches nothing. */
export const EMPTY_RESULT_HU_ID = '00000000-0000-0000-0000-000000000000';

export type AssetTypeGroupFilterIds = {
  workflowSetIds: string[];
  assetTypeIds: string[];
};

export type ResolvedProjectListFilterOpts = {
  priorityIds: string[];
  /** null = no asset-type-group filter; empty ids = force empty result */
  assetTypeGroupFilter: AssetTypeGroupFilterIds | null;
  /** @deprecated Use assetTypeGroupFilter — kept for gradual migration */
  workflowSetIdsForGroup: string[] | null;
  scopeAll: boolean;
  scopeHuIds: string[];
  scopeArchetypeIds: string[];
  /** Final HU ids to filter (intersection of archetype + selected HUs). */
  filterHuIds: string[] | null;
  /** true = force empty result (invalid filter combo). */
  forceEmpty: boolean;
  /** Project ids from search pre-pass (project/HU/archetype name match). */
  searchProjectIds?: string[];
  /** Asset ids from search pre-pass (asset_code/name/description). */
  searchAssetIds?: string[];
};

function expandScopeHuIds(
  hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[],
  scopeHuNames: string[],
  scopeArchetypeNames: string[],
  archetypes: { id: string; name: string }[],
): string[] {
  const ids = new Set(resolveHuIdsByNames(hus, scopeHuNames));
  for (const archName of scopeArchetypeNames) {
    const archId = resolveArchetypeIdByName(archetypes, archName);
    if (archId) {
      huIdsForArchetype(hus, archId).forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}


export function resolveProjectListFilterOpts(
  filters: ProjectListQueryFilters,
  master: {
    archetypes: { id: string; name: string }[];
    hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
  },
  serverScope: { scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] },
): ResolvedProjectListFilterOpts {
  const archetypeId = resolveArchetypeIdByName(master.archetypes, filters.archetypeName);

  if (filters.archetypeName && !archetypeId) {
    return {
      priorityIds: [],
      assetTypeGroupFilter: null,
      workflowSetIdsForGroup: null,
      scopeAll: serverScope.scopeAll,
      scopeHuIds: [],
      scopeArchetypeIds: [],
      filterHuIds: [],
      forceEmpty: true,
    };
  }

  let filterHuIds: string[] | null = null;

  if (filters.huNames.length > 0) {
    const selected = resolveHuIdsByNames(master.hus, filters.huNames);
    if (selected.length === 0) {
      return {
        priorityIds: [],
        assetTypeGroupFilter: null,
        workflowSetIdsForGroup: null,
        scopeAll: serverScope.scopeAll,
        scopeHuIds: [],
        scopeArchetypeIds: [],
        filterHuIds: [],
        forceEmpty: true,
      };
    }
    if (archetypeId) {
      const archSet = new Set(huIdsForArchetype(master.hus, archetypeId));
      filterHuIds = selected.filter((id) => archSet.has(id));
      if (filterHuIds.length === 0) {
        return {
          priorityIds: [],
          assetTypeGroupFilter: null,
          workflowSetIdsForGroup: null,
          scopeAll: serverScope.scopeAll,
          scopeHuIds: [],
          scopeArchetypeIds: [],
          filterHuIds: [],
          forceEmpty: true,
        };
      }
    } else {
      filterHuIds = selected;
    }
  } else if (archetypeId) {
    filterHuIds = huIdsForArchetype(master.hus, archetypeId);
    if (filterHuIds.length === 0) {
      return {
        priorityIds: [],
        assetTypeGroupFilter: null,
        workflowSetIdsForGroup: null,
        scopeAll: serverScope.scopeAll,
        scopeHuIds: [],
        scopeArchetypeIds: [],
        filterHuIds: [],
        forceEmpty: true,
      };
    }
  }

  const scopeHuIds = expandScopeHuIds(
    master.hus,
    serverScope.scopeHuNames,
    serverScope.scopeArchetypeNames,
    master.archetypes,
  );
  const scopeArchetypeIds = serverScope.scopeArchetypeNames
    .map((n) => resolveArchetypeIdByName(master.archetypes, n))
    .filter((id): id is string => !!id);

  const { filterHuIds: effectiveHuIds, forceEmpty: scopeForceEmpty } = intersectHuIdsWithAssignmentScope(
    filterHuIds,
    serverScope.scopeAll,
    scopeHuIds,
  );

  return {
    priorityIds: [],
    assetTypeGroupFilter: null,
    workflowSetIdsForGroup: null,
    scopeAll: serverScope.scopeAll,
    scopeHuIds,
    scopeArchetypeIds,
    filterHuIds: effectiveHuIds,
    forceEmpty: scopeForceEmpty,
  };
}

/** Narrow HU filter to assignment scope; scoped users with no HUs see nothing. */
function intersectHuIdsWithAssignmentScope(
  filterHuIds: string[] | null,
  scopeAll: boolean,
  scopeHuIds: string[],
): { filterHuIds: string[] | null; forceEmpty: boolean } {
  if (scopeAll) {
    return { filterHuIds, forceEmpty: false };
  }
  if (scopeHuIds.length === 0) {
    return { filterHuIds: [], forceEmpty: true };
  }
  const scopeSet = new Set(scopeHuIds);
  if (filterHuIds === null) {
    return { filterHuIds: scopeHuIds, forceEmpty: false };
  }
  const intersected = filterHuIds.filter((id) => scopeSet.has(id));
  return {
    filterHuIds: intersected,
    forceEmpty: intersected.length === 0,
  };
}

type FilterableQuery = {
  eq: (col: string, val: unknown) => FilterableQuery;
  in: (col: string, vals: string[]) => FilterableQuery;
  or: (expr: string) => FilterableQuery;
};

/** Hide cancelled assets from Capex project list (matches enrichAssetRowsFromJoinedSelect). */
export function applyProjectListLifecycleFilter<T extends FilterableQuery>(query: T): T {
  return query.or(
    'lifecycle_status.is.null,and(lifecycle_status.neq.cancel,and(lifecycle_status.neq.cancelled,lifecycle_status.neq.canceled))',
  ) as T;
}

/** Authoritative DB count: all non-cancelled assets in period (no RBAC / UI slicers). */
export async function countDbTruthAssetsForPeriod(
  client: SupabaseClient,
  periodName: string,
): Promise<number> {
  let q = client.from('assets').select(assetCountSelect(), { count: 'exact', head: true });
  q = applyProjectListLifecycleFilter(q.eq('projects.period_name', periodName.trim()) as typeof q) as typeof q;
  const { count, error } = await q;
  if (error) throw new Error(`db truth count: ${error.message}`);
  return count ?? 0;
}

export function isDefaultProjectListQueryFilters(filters: ProjectListQueryFilters): boolean {
  return (
    !filters.search.trim() &&
    !filters.archetypeName &&
    !filters.assetTypeGroupName &&
    filters.huNames.length === 0 &&
    filters.priorityNames.length === 0 &&
    filters.budgetCategoryIds.length === 0 &&
    !filters.budgetFilter &&
    filters.finishedTasks.length === 0 &&
    filters.completionMin === 0 &&
    filters.completionMax === 100 &&
    !filters.bddConstructionOnly &&
    !filters.hideUnassignedBdd
  );
}

export function applyProjectListAssetFilters<T extends FilterableQuery>(
  query: T,
  periodName: string,
  opts: ResolvedProjectListFilterOpts & {
    priorityIds: string[];
    workflowSetIdsForGroup?: string[] | null;
  },
): T {
  if (opts.forceEmpty) {
    return query.in('projects.hospital_unit_id', [EMPTY_RESULT_HU_ID]) as T;
  }

  let q = applyProjectListLifecycleFilter(query.eq('projects.period_name', periodName.trim()) as T);

  if (opts.filterHuIds && opts.filterHuIds.length > 0) {
    q = q.in('projects.hospital_unit_id', opts.filterHuIds) as T;
  }

  if (opts.priorityIds.length > 0) {
    q = q.in('projects.priority_id', opts.priorityIds) as T;
  }

  const groupFilter = opts.assetTypeGroupFilter;
  if (groupFilter) {
    const wsIds = groupFilter.workflowSetIds.filter(Boolean);
    const typeIds = groupFilter.assetTypeIds.filter(Boolean);
    if (wsIds.length === 0 && typeIds.length === 0) {
      q = q.eq('id', EMPTY_RESULT_HU_ID) as T;
    } else if (wsIds.length > 0 && typeIds.length > 0) {
      q = q.or(`workflow_set_id.in.(${wsIds.join(',')}),asset_type_id.in.(${typeIds.join(',')})`) as T;
    } else if (wsIds.length > 0) {
      q = q.in('workflow_set_id', wsIds) as T;
    } else {
      q = q.in('asset_type_id', typeIds) as T;
    }
  } else if (opts.workflowSetIdsForGroup && opts.workflowSetIdsForGroup.length > 0) {
    q = q.in('workflow_set_id', opts.workflowSetIdsForGroup) as T;
  } else if (opts.workflowSetIdsForGroup && opts.workflowSetIdsForGroup.length === 0) {
    q = q.eq('id', EMPTY_RESULT_HU_ID) as T;
  }

  return q;
}

/**
 * Restrict to pre-resolved search hits (asset id + project id unions).
 * Avoids PostgREST `.or(col.ilike.…)` — dots in asset codes break that grammar.
 */
export function applyProjectListSearchFilter<T extends FilterableQuery>(
  query: T,
  search: string,
  searchProjectIds: string[] = [],
  searchAssetIds: string[] = [],
): T {
  if (!search.trim()) return query;

  const assetIds = sanitizePostgrestIdList(searchAssetIds).slice(0, MAX_SEARCH_PROJECT_IDS_IN_OR);
  const projectIds = sanitizePostgrestIdList(searchProjectIds).slice(0, MAX_SEARCH_PROJECT_IDS_IN_OR);
  const parts: string[] = [];

  if (assetIds.length > 0) parts.push(`id.in.(${assetIds.join(',')})`);
  if (projectIds.length > 0) parts.push(`project_id.in.(${projectIds.join(',')})`);

  if (parts.length === 0) {
    return query.eq('id', EMPTY_RESULT_HU_ID) as T;
  }
  if (parts.length === 1) {
    if (assetIds.length > 0) return query.in('id', assetIds) as T;
    return query.in('project_id', projectIds) as T;
  }
  return query.or(parts.join(',')) as T;
}

export function applyProjectListBudgetFilters<T extends FilterableQuery>(
  query: T,
  budgetCategoryIds: string[],
  budgetFilter: 'low' | 'high' | null,
): T {
  let q = query;
  if (budgetCategoryIds.length > 0) {
    q = q.in('projects.budget_category_id', budgetCategoryIds) as T;
  }
  if (budgetFilter === 'low') {
    q = q.or(
      `projects.approved_budget.lte.${BUDGET_THRESHOLD},and(projects.approved_budget.eq.0,projects.budget_plan.lte.${BUDGET_THRESHOLD})`,
    ) as T;
  } else if (budgetFilter === 'high') {
    q = q.or(
      `projects.approved_budget.gt.${BUDGET_THRESHOLD},and(projects.approved_budget.eq.0,projects.budget_plan.gt.${BUDGET_THRESHOLD})`,
    ) as T;
  }
  return q as T;
}

export type AssetTypeGroupMasterMaps = {
  groupNameByTypeId: Map<string, string>;
  groupNameByWorkflowSetId: Map<string, string>;
};

/** Master maps for enrich + client validation — active types only; type id is canonical. */
export async function loadAssetTypeGroupMasterMaps(
  client: SupabaseClient,
): Promise<AssetTypeGroupMasterMaps> {
  const { data: groups, error: gErr } = await client.from('asset_type_groups').select('id, name');
  if (gErr) throw new Error(`asset_type_groups: ${gErr.message}`);
  const groupNameById = new Map(
    (groups || []).map((g: { id: string; name: string }) => [String(g.id), String(g.name)] as [string, string]),
  );

  const { data: types, error: tErr } = await client
    .from('asset_type_configs')
    .select('id, workflow_set_id, group_id, is_active');
  if (tErr) throw new Error(`asset_type_configs: ${tErr.message}`);

  const groupNameByTypeId = new Map<string, string>();
  const groupNameByWorkflowSetId = new Map<string, string>();
  for (const row of types || []) {
    const isActive = (row as { is_active?: boolean }).is_active;
    if (isActive === false) continue;
    const groupName = groupNameById.get(String((row as { group_id: string }).group_id || ''));
    if (!groupName) continue;
    const typeId = String((row as { id: string }).id || '').trim();
    if (typeId) groupNameByTypeId.set(typeId, groupName);
    const wsId = String((row as { workflow_set_id: string }).workflow_set_id || '').trim();
    if (wsId) groupNameByWorkflowSetId.set(wsId, groupName);
  }
  return { groupNameByTypeId, groupNameByWorkflowSetId };
}

/** workflow_set_id → asset type group name (cached per query page in loader). */
export async function loadGroupNameByWorkflowSetId(
  client: SupabaseClient,
): Promise<Map<string, string>> {
  const maps = await loadAssetTypeGroupMasterMaps(client);
  return maps.groupNameByWorkflowSetId;
}

export async function resolveAssetTypeGroupFilterIds(
  client: SupabaseClient,
  groupName: string | null,
): Promise<AssetTypeGroupFilterIds | null> {
  if (!groupName) return null;
  const key = norm(groupName);
  const { data: groups, error: gErr } = await client.from('asset_type_groups').select('id, name');
  if (gErr) throw new Error(`asset_type_groups: ${gErr.message}`);
  const groupIds = (groups || [])
    .filter((g: { id: string; name: string }) => norm(String(g.name)) === key)
    .map((g: { id: string }) => String(g.id));
  if (groupIds.length === 0) return { workflowSetIds: [], assetTypeIds: [] };

  const { data: types, error: tErr } = await client
    .from('asset_type_configs')
    .select('id, workflow_set_id, is_active')
    .in('group_id', groupIds);
  if (tErr) throw new Error(`asset_type_configs: ${tErr.message}`);

  const workflowSetIds = new Set<string>();
  const assetTypeIds = new Set<string>();
  for (const row of types || []) {
    if ((row as { is_active?: boolean }).is_active === false) continue;
    const typeId = String((row as { id: string }).id || '').trim();
    if (typeId) assetTypeIds.add(typeId);
    const wsId = String((row as { workflow_set_id: string }).workflow_set_id || '').trim();
    if (wsId) workflowSetIds.add(wsId);
  }
  return {
    workflowSetIds: [...workflowSetIds],
    assetTypeIds: [...assetTypeIds],
  };
}

/** @deprecated Use resolveAssetTypeGroupFilterIds */
export async function resolveWorkflowSetIdsForAssetGroup(
  client: SupabaseClient,
  groupName: string | null,
): Promise<string[] | null> {
  const resolved = await resolveAssetTypeGroupFilterIds(client, groupName);
  if (!resolved) return null;
  return resolved.workflowSetIds;
}

/**
 * FE may only widen scope (`scopeAll: true`). RBAC narrowing is server-only — never trust
 * `scopeHuNames` / `scopeArchetypeNames` from the client (stale assignments caused ~1264 vs ~3123 rows).
 */
export function mergeServerScopeFromQuery(
  serverScope: { scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] },
  query: Pick<ProjectListQueryFilters, 'scopeAll' | 'scopeHuNames' | 'scopeArchetypeNames'>,
): void {
  if (query.scopeAll === true) {
    serverScope.scopeAll = true;
    serverScope.scopeHuNames = [];
    serverScope.scopeArchetypeNames = [];
  }
}

/** Authoritative scope — DB RPC + assignments (never FE scope arrays). */
export async function resolveAuthoritativeProjectListScope(
  client: SupabaseClient,
  userId: number,
  master: {
    users: { id: number | string; assignments?: Array<{ assignedScopes?: string[]; roleName?: string }> }[];
    archetypes: { id: string; name: string }[];
    hus: { id: string; name: string; archetypeId?: string; archetype_id?: string }[];
  },
): Promise<{ scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] }> {
  try {
    const { data: hasAll, error } = await client.rpc('user_has_all_scope', {
      user_id_param: userId,
    });
    if (!error && hasAll === true) {
      return { scopeAll: true, scopeHuNames: [], scopeArchetypeNames: [] };
    }
  } catch {
    /* fall through to assignment-based resolution */
  }

  const archetypeIdToName = new Map(master.archetypes.map((a) => [String(a.id), String(a.name)] as [string, string]));
  const huIdToName = new Map(master.hus.map((h) => [String(h.id), String(h.name)] as [string, string]));
  const archetypeNames = new Set(master.archetypes.map((a) => String(a.name)));
  const huNames = new Set(master.hus.map((h) => String(h.name)));
  const currentUser = master.users.find((u) => Number(u.id) === Number(userId));
  return resolveUserScopesFromAssignments(
    currentUser,
    archetypeIdToName,
    huIdToName,
    archetypeNames,
    huNames,
  );
}

export function resolveUserScopesFromAssignments(
  user: { assignments?: Array<{ assignedScopes?: string[]; roleName?: string }> } | undefined,
  archetypeIdToName: Map<string, string>,
  huIdToName: Map<string, string>,
  archetypeNames: Set<string>,
  huNames: Set<string>,
): { scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] } {
  if (!user?.assignments?.length) {
    return { scopeAll: false, scopeHuNames: [], scopeArchetypeNames: [] };
  }
  for (const a of user.assignments) {
    const roleKey = String(a.roleName ?? '').trim().toLowerCase();
    if (roleKey === 'super admin') {
      return { scopeAll: true, scopeHuNames: [], scopeArchetypeNames: [] };
    }
    if (a.assignedScopes?.includes('All')) {
      return { scopeAll: true, scopeHuNames: [], scopeArchetypeNames: [] };
    }
  }
  const scopeHuNames = new Set<string>();
  const scopeArchetypeNames = new Set<string>();
  for (const a of user.assignments) {
    for (const scope of a.assignedScopes || []) {
      if (!scope || scope === 'All') continue;
      const key = String(scope);
      if (key.startsWith('ARCH-')) {
        const name = archetypeIdToName.get(key);
        if (name) scopeArchetypeNames.add(name);
        else scopeArchetypeNames.add(key);
        continue;
      }
      if (key.startsWith('HU-')) {
        const name = huIdToName.get(key);
        if (name) scopeHuNames.add(name);
        else scopeHuNames.add(key);
        continue;
      }
      if (archetypeIdToName.has(key)) {
        const name = archetypeIdToName.get(key);
        if (name) scopeArchetypeNames.add(name);
        continue;
      }
      if (huIdToName.has(key)) {
        const name = huIdToName.get(key);
        if (name) scopeHuNames.add(name);
        continue;
      }
      if (archetypeNames.has(scope)) scopeArchetypeNames.add(scope);
      else if (huNames.has(scope)) scopeHuNames.add(scope);
      else if (scope.toLowerCase().includes('siloam') || scope.toLowerCase().includes('unit')) {
        scopeHuNames.add(scope);
      } else {
        scopeArchetypeNames.add(scope);
      }
    }
  }
  return {
    scopeAll: false,
    scopeHuNames: [...scopeHuNames],
    scopeArchetypeNames: [...scopeArchetypeNames],
  };
}

export function buildResolvedFilterOpts(
  query: ProjectListQueryFilters,
  master: {
    archetypes: any[];
    hus: any[];
    prioritiesConfig: any[];
  },
  serverScope: { scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] },
  assetTypeGroupFilter: AssetTypeGroupFilterIds | null,
): ResolvedProjectListFilterOpts & { priorityIds: string[]; assetTypeGroupFilter: AssetTypeGroupFilterIds | null } {
  const priorityIdToName = new Map(
    master.prioritiesConfig.map((p: any) => [String(p.id), String(p.name)] as [string, string]),
  );
  const priorityIds =
    query.priorityNames.length > 0
      ? [...priorityIdToName.entries()]
          .filter(([, name]) =>
            query.priorityNames.some((picked) => norm(String(picked)) === norm(String(name))),
          )
          .map(([id]) => id)
      : [];

  if (query.priorityNames.length > 0 && priorityIds.length === 0) {
    return {
      ...resolveProjectListFilterOpts(query, master, serverScope),
      priorityIds: [],
      assetTypeGroupFilter,
      workflowSetIdsForGroup: assetTypeGroupFilter?.workflowSetIds ?? null,
      forceEmpty: true,
      filterHuIds: [],
    };
  }

  const base = resolveProjectListFilterOpts(query, master, serverScope);
  return {
    ...base,
    priorityIds,
    assetTypeGroupFilter,
    workflowSetIdsForGroup: assetTypeGroupFilter?.workflowSetIds ?? null,
  };
}

export function applyAllProjectListFilters<T extends FilterableQuery>(
  query: T,
  periodName: string,
  filters: ProjectListQueryFilters,
  resolved: ResolvedProjectListFilterOpts & {
    priorityIds: string[];
    assetTypeGroupFilter?: AssetTypeGroupFilterIds | null;
    workflowSetIdsForGroup?: string[] | null;
  },
): T {
  let q = applyProjectListAssetFilters(query, periodName, resolved);
  q = applyProjectListBudgetFilters(q, filters.budgetCategoryIds, filters.budgetFilter);
  if (filters.search) {
    q = applyProjectListSearchFilter(
      q,
      filters.search,
      resolved.searchProjectIds ?? [],
      resolved.searchAssetIds ?? [],
    );
  }
  return q;
}

/** Filter in-memory rows using authoritative assignment scope (never trust client scope arrays). */
export function filterRowsByAssignmentScope<T extends { huName?: string; archetypeName?: string }>(
  rows: T[],
  scope: { scopeAll: boolean; scopeHuNames: string[]; scopeArchetypeNames: string[] },
): T[] {
  if (scope.scopeAll) return rows;
  const scopeHus = new Set(scope.scopeHuNames.map((n) => n.trim().toLowerCase()).filter(Boolean));
  const scopeArchetypes = new Set(
    scope.scopeArchetypeNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  if (scopeHus.size === 0 && scopeArchetypes.size === 0) return [];
  return rows.filter((row) => {
    const inHu = scopeHus.has(String(row.huName ?? '').trim().toLowerCase());
    const inArch = scopeArchetypes.has(String(row.archetypeName ?? '').trim().toLowerCase());
    return inHu || inArch;
  });
}
