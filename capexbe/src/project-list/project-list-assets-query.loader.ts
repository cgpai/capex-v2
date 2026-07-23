import type { SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'crypto';
import type { ProjectListQueryBody } from './project-list.dto';
import {
  applyAllProjectListFilters,
  applyProjectListAssetFilters,
  applyProjectListBudgetFilters,
  assetCountSelect,
  assetIdScanSelect,
  assetListSelect,
  buildResolvedFilterOpts,
  countDbTruthAssetsForPeriod,
  isDefaultProjectListQueryFilters,
  PROJECT_LIST_DATA_POLICY,
  resolveAuthoritativeProjectListScope,
  resolveSearchAssetIdsForList,
  resolveSearchProjectIdsForList,
  resolveFullSearchMatchingAssetIds,
  loadAssetTypeGroupMasterMaps,
  resolveAssetTypeGroupFilterIds,
} from './project-list-query.util';
import { sanitizePostgrestIdList } from '../shared/postgrest-filter.util';
import {
  enrichAssetRowsFromJoinedSelect,
  enrichRawAssetRowsWithMaster,
  extractProjectsFromJoinedRows,
  type MasterEnrichContext,
} from './enriched-assets.loader';
import { fetchProjectsByIds } from './master-data.loader';
import { canonicalAssetKey, fetchRecordsByAssetIds, normAssetTaskStatusRow, normTaskLogRow } from './supabase-helpers';
import {
  buildAssetLastTaskMap,
  calculateRates,
  groupLogsByAsset,
  groupStatusesByAsset,
} from './progress-aggregate';
import {
  buildBddAssetSqlOrFilter,
  isBddConstructionAsset,
  isUnassignedBddPriority,
  resolveBddConstructionAssetTypeIds,
} from './bdd-construction.util';
import { isAssetCodeSortAscending, sortRowsByAssetCode } from './project-list-sort.util';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { perfCacheGet, perfCacheSet } from '../shared/perf-cache';

export type ProjectListQueryDebugCounts = {
  dataPolicy: string;
  dbTruthCount: number;
  dbMatchedCount: number;
  afterProgressFilterCount: number;
  returnedRowCount: number;
  enrichDroppedCount: number;
  cacheLayer: 'none' | 'memory' | 'redis';
  usedProgressFilter: boolean;
  defaultQuery: boolean;
};

const ID_BATCH = 400;
const ID_SCAN_BATCH = 2000;

function needsBddFilter(query: ProjectListQueryBody): boolean {
  return Boolean(query.bddConstructionOnly || query.hideUnassignedBdd);
}

function needsSearchPaginationPath(query: ProjectListQueryBody): boolean {
  return query.search.trim().length > 0;
}

function needsProgressFilter(query: ProjectListQueryBody): boolean {
  const { completionMin, completionMax, finishedTasks } = query;
  return completionMin > 0 || completionMax < 100 || finishedTasks.length > 0;
}

async function countMatchingAssets(
  client: SupabaseClient,
  periodName: string,
  query: ProjectListQueryBody,
  resolved: ReturnType<typeof buildResolvedFilterOpts>,
): Promise<number> {
  let q = client.from('assets').select(assetCountSelect(), { count: 'exact', head: true });
  q = applyAllProjectListFilters(q as any, periodName, query, resolved) as any;
  const { count, error } = await q;
  if (error) throw new Error(`assets count: ${error.message}`);
  return count ?? 0;
}

type AssetIdScanRow = {
  id: string;
  asset_code?: string | null;
  assetCode?: string | null;
  workflow_set_id?: string;
  workflowSetId?: string;
  project_id?: string;
  projectId?: string;
  asset_name?: string;
  assetName?: string;
  asset_type_id?: string;
  assetTypeId?: string;
  bdd_priority?: string | null;
  bddPriority?: string | null;
};

function bddScanCacheHash(query: ProjectListQueryBody): string {
  const { page: _p, pageSize: _s, skipCache: _c, exportAll: _e, ...rest } = query;
  return createHash('sha256').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

async function filterScanRowsForBdd(
  client: SupabaseClient,
  scanRows: AssetIdScanRow[],
  query: ProjectListQueryBody,
  groupNameByTypeId: Map<string, string>,
): Promise<AssetIdScanRow[]> {
  if (scanRows.length === 0) return scanRows;

  const needsProjectNames = query.bddConstructionOnly;
  const projectNameById = new Map<string, string>();
  if (needsProjectNames) {
    const projectIds = [
      ...new Set(
        scanRows
          .map((r) => String(r.project_id || r.projectId || ''))
          .filter(Boolean),
      ),
    ];
    for (let i = 0; i < projectIds.length; i += 150) {
      const chunk = projectIds.slice(i, i + 150);
      const { data, error } = await client.from('projects').select('id, project_name').in('id', chunk);
      if (error) throw new Error(`bdd projects: ${error.message}`);
      for (const row of data || []) {
        projectNameById.set(String((row as { id: string }).id), String((row as { project_name: string }).project_name || ''));
      }
    }
  }

  return scanRows.filter((row) => {
    const bddPriority = row.bdd_priority ?? row.bddPriority;
    if (query.hideUnassignedBdd && isUnassignedBddPriority(bddPriority)) return false;
    if (!query.bddConstructionOnly) return true;

    const typeId = String(row.asset_type_id || row.assetTypeId || '');
    const assetTypeGroupName = typeId ? groupNameByTypeId.get(typeId) : undefined;
    const projectId = String(row.project_id || row.projectId || '');
    return isBddConstructionAsset({
      assetTypeGroupName,
      assetName: row.asset_name || row.assetName,
      projectName: projectNameById.get(projectId),
    });
  });
}

async function getBddFilteredSortedRows(
  client: SupabaseClient,
  query: ProjectListQueryBody,
  resolved: ReturnType<typeof buildResolvedFilterOpts>,
  groupNameByTypeId: Map<string, string>,
  searchMatchingAssetIds: string[] = [],
): Promise<AssetIdScanRow[]> {
  const useScanCache = !query.exportAll;
  const scanHash = bddScanCacheHash(query);
  const scanCacheKey = cacheKeys.bddConstructionScan(query.userId, query.periodName, scanHash);

  if (useScanCache) {
    const cached = await perfCacheGet<AssetIdScanRow[]>(scanCacheKey);
    if (cached) return cached;
  }

  const bddTypeIds = query.bddConstructionOnly
    ? resolveBddConstructionAssetTypeIds(groupNameByTypeId)
    : [];
  const bddSqlOr = query.bddConstructionOnly ? buildBddAssetSqlOrFilter(bddTypeIds) : null;

  let scanRows =
    searchMatchingAssetIds.length > 0
      ? await fetchMatchingAssetRowsForSearchIds(
          client,
          query,
          resolved,
          searchMatchingAssetIds,
          true,
          bddSqlOr,
        )
      : await fetchMatchingAssetIdRows(client, query, resolved, true, bddSqlOr);
  scanRows = await filterScanRowsForBdd(client, scanRows, query, groupNameByTypeId);
  const sortedRows = sortRowsByAssetCode(scanRows, isAssetCodeSortAscending(query.sortBy));

  if (useScanCache && sortedRows.length >= 0) {
    await perfCacheSet(scanCacheKey, sortedRows, CACHE_TTL_MS.TABLE);
  }
  return sortedRows;
}

async function fetchMatchingAssetIdRows(
  client: SupabaseClient,
  query: ProjectListQueryBody,
  resolved: ReturnType<typeof buildResolvedFilterOpts>,
  extendedScan = false,
  bddSqlOr: string | null = null,
): Promise<AssetIdScanRow[]> {
  const rows: AssetIdScanRow[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let q = client
      .from('assets')
      .select(assetIdScanSelect(extendedScan))
      .order('id', { ascending: true });
    q = applyAllProjectListFilters(q as any, query.periodName, query, resolved) as any;
    if (bddSqlOr) {
      q = q.or(bddSqlOr) as typeof q;
    }
    const { data, error } = await q.range(from, from + ID_SCAN_BATCH - 1);
    if (error) throw new Error(`assets id scan: ${error.message}`);
    const batch = (data || []) as unknown as AssetIdScanRow[];
    rows.push(...batch);
    hasMore = batch.length === ID_SCAN_BATCH;
    from += ID_SCAN_BATCH;
    if (rows.length > 250_000) {
      console.warn('[project-list-query] id scan capped at 250000');
      break;
    }
  }
  return rows;
}

/** Search path — load all pre-resolved asset ids with panel filters (no 120-id OR cap). */
async function fetchMatchingAssetRowsForSearchIds(
  client: SupabaseClient,
  query: ProjectListQueryBody,
  resolved: ReturnType<typeof buildResolvedFilterOpts>,
  searchMatchingAssetIds: string[],
  extendedScan = false,
  bddSqlOr: string | null = null,
): Promise<AssetIdScanRow[]> {
  const ids = [...new Set(sanitizePostgrestIdList(searchMatchingAssetIds))];
  if (ids.length === 0) return [];

  const rows: AssetIdScanRow[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    let q = client
      .from('assets')
      .select(assetIdScanSelect(extendedScan))
      .in('id', chunk);
    q = applyProjectListAssetFilters(q as any, query.periodName, resolved) as any;
    q = applyProjectListBudgetFilters(q as any, query.budgetCategoryIds, query.budgetFilter) as any;
    if (bddSqlOr) {
      q = q.or(bddSqlOr) as typeof q;
    }
    const { data, error } = await q;
    if (error) throw new Error(`assets search id chunk: ${error.message}`);
    rows.push(...((data || []) as unknown as AssetIdScanRow[]));
  }
  return rows;
}

async function filterRowsByProgress(
  client: SupabaseClient,
  scanRows: AssetIdScanRow[],
  query: ProjectListQueryBody,
  workflows: any[],
  allTasks: any[],
): Promise<string[]> {
  const finishedSet = query.finishedTasks.length > 0 ? new Set(query.finishedTasks) : null;
  const out: string[] = [];
  const ids = scanRows.map((r) => String(r.id));

  for (let i = 0; i < ids.length; i += ID_BATCH) {
    const chunkIds = ids.slice(i, i + ID_BATCH);
    const chunkRows = scanRows.slice(i, i + ID_BATCH);
    const [statusesRaw, logsRaw] = await Promise.all([
      fetchRecordsByAssetIds(client, 'asset_task_statuses', chunkIds),
      fetchRecordsByAssetIds(client, 'task_logs', chunkIds),
    ]);
    const statuses = (statusesRaw || []).map(normAssetTaskStatusRow);
    const logs = (logsRaw || []).map(normTaskLogRow);
    const statusesByAsset = groupStatusesByAsset(statuses);
    const logsByAsset = groupLogsByAsset(logs);

    const assetsForChunk = chunkRows.map((row) => ({
      id: row.id,
      workflowSetId: row.workflow_set_id || row.workflowSetId,
    }));

    const rates = calculateRates(assetsForChunk, workflows, statusesByAsset, logsByAsset);
    const lastMap = buildAssetLastTaskMap(assetsForChunk, workflows, allTasks, logsByAsset, statusesByAsset);

    for (const row of chunkRows) {
      const id = String(row.id);
      const key = canonicalAssetKey(id);
      const rate = rates.get(key) ?? 0;
      if (rate < query.completionMin || rate > query.completionMax) continue;
      if (finishedSet) {
        const last = lastMap.get(key);
        if (!last || !finishedSet.has(last)) continue;
      }
      out.push(id);
    }
  }
  return out;
}

async function fetchAssetRowsByIds(client: SupabaseClient, ids: string[]): Promise<any[]> {
  if (ids.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data, error } = await client.from('assets').select('*').in('id', chunk);
    if (error) throw new Error(`assets by id: ${error.message}`);
    if (data?.length) out.push(...data);
  }
  const byId = new Map(out.map((row) => [String(row.id), row] as const));
  return ids.map((id) => byId.get(String(id))).filter((row): row is any => row != null);
}

/** Joined select — one round-trip per chunk (BDD page path). */
async function fetchJoinedAssetRowsByIds(
  client: SupabaseClient,
  ids: string[],
  select: string,
): Promise<any[]> {
  if (ids.length === 0) return [];
  const out: any[] = [];
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150);
    const { data, error } = await client.from('assets').select(select).in('id', chunk);
    if (error) throw new Error(`assets joined page: ${error.message}`);
    if (data?.length) out.push(...data);
  }
  const byId = new Map(out.map((row) => [String((row as { id: string }).id), row] as const));
  return ids.map((id) => byId.get(String(id))).filter((row): row is any => row != null);
}

async function loadBddPageAssets(
  client: SupabaseClient,
  pageIds: string[],
  assetTypeGroupMaps: MasterEnrichContext['assetTypeGroupMaps'],
): Promise<{ rawEnrichedAssets: any[]; pageProjects: any[] }> {
  const pageJoined = await fetchJoinedAssetRowsByIds(client, pageIds, assetListSelect());
  return {
    rawEnrichedAssets: enrichAssetRowsFromJoinedSelect(pageJoined, assetTypeGroupMaps),
    pageProjects: extractProjectsFromJoinedRows(pageJoined),
  };
}

export async function loadProjectListQueryPage(
  client: SupabaseClient,
  query: ProjectListQueryBody,
  master: {
    workflows: any[];
    archetypes: any[];
    hus: any[];
    prioritiesConfig: any[];
    allTasks: any[];
    users: any[];
  },
): Promise<{
  rawEnrichedAssets: any[];
  pageProjects?: any[];
  totalCount: number;
  debug: ProjectListQueryDebugCounts;
}> {
  const assetTypeGroupMaps = await loadAssetTypeGroupMasterMaps(client);
  const enrichMaster: MasterEnrichContext = {
    archetypes: master.archetypes,
    hus: master.hus,
    assetTypeGroupMaps,
  };

  const defaultQuery = isDefaultProjectListQueryFilters(query);
  const useBdd = needsBddFilter(query);
  const dbTruthCount = useBdd
    ? 0
    : await countDbTruthAssetsForPeriod(client, query.periodName);

  const serverScope = await resolveAuthoritativeProjectListScope(client, query.userId, {
    users: master.users,
    archetypes: master.archetypes,
    hus: master.hus,
  });

  const assetTypeGroupFilter = await resolveAssetTypeGroupFilterIds(
    client,
    query.assetTypeGroupName,
  );

  const resolvedBase = buildResolvedFilterOpts(
    query,
    { archetypes: master.archetypes, hus: master.hus, prioritiesConfig: master.prioritiesConfig },
    serverScope,
    assetTypeGroupFilter,
  );

  let searchProjectIds: string[] = [];
  let searchAssetIds: string[] = [];
  if (query.search.trim() && !resolvedBase.forceEmpty) {
    [searchProjectIds, searchAssetIds] = await Promise.all([
      resolveSearchProjectIdsForList(
        client,
        query.periodName,
        query.search,
        { archetypes: master.archetypes, hus: master.hus },
        resolvedBase.filterHuIds,
      ),
      resolveSearchAssetIdsForList(
        client,
        query.periodName,
        query.search,
        resolvedBase.filterHuIds,
      ),
    ]);
  }

  const resolved = { ...resolvedBase, searchProjectIds, searchAssetIds };

  if (resolved.forceEmpty) {
    return {
      rawEnrichedAssets: [],
      totalCount: 0,
      debug: {
        dataPolicy: PROJECT_LIST_DATA_POLICY,
        dbTruthCount,
        dbMatchedCount: 0,
        afterProgressFilterCount: 0,
        returnedRowCount: 0,
        enrichDroppedCount: 0,
        cacheLayer: 'none',
        usedProgressFilter: false,
        defaultQuery,
      },
    };
  }

  const useProgress = needsProgressFilter(query);
  const useSearchScan = needsSearchPaginationPath(query);

  let searchMatchingAssetIds: string[] = [];
  if (useSearchScan) {
    searchMatchingAssetIds = await resolveFullSearchMatchingAssetIds(
      client,
      searchProjectIds,
      searchAssetIds,
    );
    if (searchMatchingAssetIds.length === 0) {
      return {
        rawEnrichedAssets: [],
        totalCount: 0,
        debug: {
          dataPolicy: PROJECT_LIST_DATA_POLICY,
          dbTruthCount,
          dbMatchedCount: 0,
          afterProgressFilterCount: 0,
          returnedRowCount: 0,
          enrichDroppedCount: 0,
          cacheLayer: 'none',
          usedProgressFilter: useProgress,
          defaultQuery,
        },
      };
    }
  }

  if (useProgress || useBdd || useSearchScan) {
    const sortedRows = useBdd
      ? await getBddFilteredSortedRows(
          client,
          query,
          resolved,
          assetTypeGroupMaps.groupNameByTypeId,
          searchMatchingAssetIds,
        )
      : sortRowsByAssetCode(
          useSearchScan
            ? await fetchMatchingAssetRowsForSearchIds(
                client,
                query,
                resolved,
                searchMatchingAssetIds,
                false,
              )
            : await fetchMatchingAssetIdRows(client, query, resolved, false),
          isAssetCodeSortAscending(query.sortBy),
        );
    const dbMatchedCount = sortedRows.length;

    if (useProgress) {
      const filteredIds = await filterRowsByProgress(
        client,
        sortedRows,
        query,
        master.workflows,
        master.allTasks,
      );
      const filteredIdSet = new Set(filteredIds);
      const orderedFilteredRows = sortedRows.filter((row) => filteredIdSet.has(String(row.id)));
      const afterProgressFilterCount = orderedFilteredRows.length;
      const from = (query.page - 1) * query.pageSize;
      const pageIds = orderedFilteredRows.slice(from, from + query.pageSize).map((row) => String(row.id));

      const { rawEnrichedAssets, pageProjects } = query.bddConstructionOnly
        ? await loadBddPageAssets(client, pageIds, assetTypeGroupMaps)
        : await (async () => {
            const pageRaw = await fetchAssetRowsByIds(client, pageIds);
            const projectIds = [
              ...new Set(pageRaw.map((r: any) => String(r.project_id || r.projectId)).filter(Boolean)),
            ];
            const projects = projectIds.length ? await fetchProjectsByIds(client, projectIds) : [];
            return {
              rawEnrichedAssets: enrichRawAssetRowsWithMaster(projects, pageRaw, enrichMaster),
              pageProjects: projects,
            };
          })();

      return {
        rawEnrichedAssets,
        pageProjects,
        totalCount: afterProgressFilterCount,
        debug: {
          dataPolicy: PROJECT_LIST_DATA_POLICY,
          dbTruthCount,
          dbMatchedCount,
          afterProgressFilterCount,
          returnedRowCount: rawEnrichedAssets.length,
          enrichDroppedCount: 0,
          cacheLayer: 'none',
          usedProgressFilter: true,
          defaultQuery,
        },
      };
    }

    const from = (query.page - 1) * query.pageSize;
    const pageIds = sortedRows.slice(from, from + query.pageSize).map((r) => String(r.id));

    const { rawEnrichedAssets, pageProjects } = query.bddConstructionOnly
      ? await loadBddPageAssets(client, pageIds, assetTypeGroupMaps)
      : await (async () => {
          const pageRaw = await fetchAssetRowsByIds(client, pageIds);
          const projectIds = [
            ...new Set(pageRaw.map((r: any) => String(r.project_id || r.projectId)).filter(Boolean)),
          ];
          const projects = projectIds.length ? await fetchProjectsByIds(client, projectIds) : [];
          return {
            rawEnrichedAssets: enrichRawAssetRowsWithMaster(projects, pageRaw, enrichMaster),
            pageProjects: projects,
          };
        })();

    return {
      rawEnrichedAssets,
      pageProjects,
      totalCount: dbMatchedCount,
      debug: {
        dataPolicy: PROJECT_LIST_DATA_POLICY,
        dbTruthCount,
        dbMatchedCount,
        afterProgressFilterCount: dbMatchedCount,
        returnedRowCount: rawEnrichedAssets.length,
        enrichDroppedCount: 0,
        cacheLayer: 'none',
        usedProgressFilter: false,
        defaultQuery,
      },
    };
  }

  const from = (query.page - 1) * query.pageSize;
  const to = from + query.pageSize - 1;
  const ascending = isAssetCodeSortAscending(query.sortBy);

  let pageQuery = client
    .from('assets')
    .select(assetListSelect())
    .order('asset_code', { ascending, nullsFirst: false });
  pageQuery = applyAllProjectListFilters(pageQuery as any, query.periodName, query, resolved) as any;

  const [dbMatchedCount, pageResult] = await Promise.all([
    countMatchingAssets(client, query.periodName, query, resolved),
    pageQuery.range(from, to),
  ]);

  const { data, error } = pageResult;
  if (error) throw new Error(`assets query page: ${error.message}`);

  const joinedRows = data || [];
  const rawEnrichedAssets = enrichAssetRowsFromJoinedSelect(joinedRows, assetTypeGroupMaps);
  const pageProjects = extractProjectsFromJoinedRows(joinedRows);
  const enrichDroppedCount = Math.max(0, joinedRows.length - rawEnrichedAssets.length);

  if (defaultQuery && dbMatchedCount !== dbTruthCount) {
    console.error(
      `[project-list-query] COUNT MISMATCH period=${query.periodName} dbTruth=${dbTruthCount} dbMatched=${dbMatchedCount} policy=${PROJECT_LIST_DATA_POLICY}`,
    );
  }
  if (enrichDroppedCount > 0) {
    console.warn(
      `[project-list-query] enrich dropped ${enrichDroppedCount} rows on page ${query.page} period=${query.periodName}`,
    );
  }
  if (process.env.PROJECT_LIST_PIPELINE_LOG !== '0') {
    console.info(
      `[project-list-query] pipeline period=${query.periodName} page=${query.page}/${query.pageSize} dbTruth=${dbTruthCount} dbMatched=${dbMatchedCount} returned=${rawEnrichedAssets.length} enrichDropped=${enrichDroppedCount} default=${defaultQuery}`,
    );
  }

  const totalCount =
    defaultQuery && dbMatchedCount !== dbTruthCount ? dbTruthCount : dbMatchedCount;

  return {
    rawEnrichedAssets,
    pageProjects,
    totalCount,
    debug: {
      dataPolicy: PROJECT_LIST_DATA_POLICY,
      dbTruthCount,
      dbMatchedCount,
      afterProgressFilterCount: dbMatchedCount,
      returnedRowCount: rawEnrichedAssets.length,
      enrichDroppedCount,
      cacheLayer: 'none',
      usedProgressFilter: false,
      defaultQuery,
    },
  };
}
