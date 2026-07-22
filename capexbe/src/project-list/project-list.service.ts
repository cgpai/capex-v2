import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { getAllEnrichedAssetsForPeriod, getEnrichedAssetsPageForPeriod } from './enriched-assets.loader';
import {
  fetchProjectsByIds,
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllProjectPriorities,
  getAllRoles,
  getAllTasks,
  getAllUsers,
  getAllWorkflowSets,
} from './master-data.loader';
import {
  canonicalAssetKey,
  normAssetTaskStatusRow,
  normTaskLogRow,
  fetchRecordsByAssetIds,
} from './supabase-helpers';
import {
  buildActionableTaskCounts,
  buildAssetLastTaskMap,
  calculateProjectionDates,
  calculateRates,
  groupLogsByAsset,
  groupStatusesByAsset,
} from './progress-aggregate';
import { perfCacheDelete, perfCacheGet, perfCacheSet } from '../shared/perf-cache';
import { viewerCanSeeUserPii } from '../shared/pii-access.util';
import { sanitizeUsersForDirectory } from '../shared/response-sanitize.util';
import { parseProjectListQueryBody, projectListQueryCacheKey } from './project-list.dto';
import {
  filterRowsByAssignmentScope,
  PROJECT_LIST_DATA_POLICY,
  resolveAuthoritativeProjectListScope,
} from './project-list-query.util';
import { loadProjectListQueryPage } from './project-list-assets-query.loader';
import { ProjectListCacheService } from './project-list-cache.service';

type MasterListPayload = {
  expiresAt: number;
  workflows: any[];
  archetypes: any[];
  hus: any[];
  allRoles: any[];
  users: any[];
  prioritiesConfig: any[];
  allTasks: any[];
};

@Injectable()
export class ProjectListService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
    private readonly projectListCache: ProjectListCacheService,
  ) {}

  private async egressBundle<T extends Record<string, unknown>>(
    accessToken: string,
    viewerUserId: number,
    bundle: T,
  ): Promise<T> {
    if (!Array.isArray(bundle.users)) return bundle;
    const includePii = await viewerCanSeeUserPii(this.authZ, accessToken, viewerUserId);
    return {
      ...bundle,
      users: sanitizeUsersForDirectory(
        bundle.users as Record<string, unknown>[],
        viewerUserId,
        includePii,
      ),
    };
  }

  /** Repeat period switches hit memory cache more often (still short enough for near-real-time). */
  private static readonly CACHE_TTL_MS = 3 * 60 * 1000;
  /** Master config (workflows, users, …) sama untuk semua halaman lazy-load — hindari query ulang tiap chunk. */
  private static readonly MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
  private readonly responseCache = new Map<string, { expiresAt: number; data: any }>();
  private readonly inflight = new Map<string, Promise<any>>();
  private readonly masterPayloadByUserId = new Map<number, MasterListPayload>();
  private readonly queryInflight = new Map<string, Promise<any>>();

  private getCacheKey(userId: number, periodName: string): string {
    return `project-list:${userId}::${periodName}`;
  }

  private async assembleBundlePayload(
    client: SupabaseClient,
    userId: number,
    rawEnrichedAssets: any[],
    workflows: any[],
    archetypes: any[],
    hus: any[],
    allRoles: any[],
    users: any[],
    prioritiesConfig: any[],
    allTasks: any[],
  ) {
    const periodAssetIds = rawEnrichedAssets.map((a: any) => String(a.id));
    const [allStatusesRaw, allTaskLogsRaw] = await Promise.all([
      periodAssetIds.length
        ? fetchRecordsByAssetIds(client, 'asset_task_statuses', periodAssetIds)
        : Promise.resolve([]),
      periodAssetIds.length ? fetchRecordsByAssetIds(client, 'task_logs', periodAssetIds) : Promise.resolve([]),
    ]);

    const allStatuses = (allStatusesRaw || []).map(normAssetTaskStatusRow);
    const allTaskLogs = (allTaskLogsRaw || []).map(normTaskLogRow);

    const projectIds = [...new Set(rawEnrichedAssets.map((a: any) => String(a.projectId)))];
    const projects = projectIds.length ? await fetchProjectsByIds(client, projectIds) : [];

    const statusesByAsset = groupStatusesByAsset(allStatuses);
    const logsByAsset = groupLogsByAsset(allTaskLogs);

    const rates = calculateRates(rawEnrichedAssets, workflows, statusesByAsset, logsByAsset);
    const assetLastTaskMap = buildAssetLastTaskMap(
      rawEnrichedAssets,
      workflows,
      allTasks,
      logsByAsset,
      statusesByAsset,
    );

    const currentUser = users.find((u: any) => Number(u.id) === Number(userId));
    if (!currentUser) {
      throw new BadRequestException('User not found');
    }

    const actionableTaskCounts = buildActionableTaskCounts(
      rawEnrichedAssets,
      workflows,
      allStatuses,
      allRoles,
      currentUser,
    );

    const str = (id: string | number | undefined) => (id == null ? '' : String(id));
    const enrichedAssets = rawEnrichedAssets.map((asset: any) => {
      const assetKey = canonicalAssetKey(asset.id);
      const workflow = workflows.find((w: any) => str(w.id) === str(asset.workflowSetId));
      let projectionEndDate: string | undefined;
      if (workflow) {
        const assetStatuses = statusesByAsset.get(assetKey) || [];
        const projectionDates = calculateProjectionDates(workflow, assetStatuses);
        const lastStep = [...workflow.steps].sort((a: any, b: any) => b.order - a.order)[0];
        projectionEndDate = lastStep ? projectionDates.get(String(lastStep.taskId)) : undefined;
      }

      return {
        ...asset,
        completionRate: rates.get(assetKey) || 0,
        actionableTaskCount: actionableTaskCounts.get(assetKey) || 0,
        projectionEndDate,
      };
    });

    const assetLastTaskRecord: Record<string, string> = {};
    assetLastTaskMap.forEach((v, k) => {
      assetLastTaskRecord[k] = v;
    });

    return {
      enrichedAssets,
      projects,
      workflows,
      archetypes,
      hus,
      users,
      priorities: prioritiesConfig,
      allRoles,
      allTasks,
      assetLastTaskMap: assetLastTaskRecord,
    };
  }

  private pruneCache() {
    const now = Date.now();
    for (const [k, v] of this.responseCache.entries()) {
      if (v.expiresAt <= now) this.responseCache.delete(k);
    }
    for (const [k, v] of this.masterPayloadByUserId.entries()) {
      if (v.expiresAt <= now) this.masterPayloadByUserId.delete(k);
    }
  }

  async loadBundle(
    accessToken: string,
    userId: number,
    periodName: string,
    skipCache = false,
    opts?: { page?: number; pageSize?: number },
  ) {
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Capex Project List', 'view');

    const page = opts?.page;
    const pageSize = opts?.pageSize;
    const paged = page != null && Number.isFinite(page) && page >= 1 && pageSize != null && pageSize >= 1;

    const cacheKey = this.getCacheKey(userId, periodName);
    this.pruneCache();
    if (skipCache) {
      this.responseCache.delete(cacheKey);
      this.inflight.delete(cacheKey);
      this.masterPayloadByUserId.delete(userId);
      await this.projectListCache.invalidateForPeriod(userId, periodName);
    }

    if (!paged) {
      const cached = this.responseCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return this.egressBundle(accessToken, userId, cached.data);
      }
      const sharedCached = await perfCacheGet<any>(cacheKey);
      if (sharedCached) {
        this.responseCache.set(cacheKey, {
          expiresAt: Date.now() + ProjectListService.CACHE_TTL_MS,
          data: sharedCached,
        });
        return this.egressBundle(accessToken, userId, sharedCached);
      }
      const inflight = this.inflight.get(cacheKey);
      if (inflight) {
        return inflight;
      }
    }

    const run = (async () => {
      try {
      await this.authContext.getRlsClient(accessToken, userId);
      const client = this.authContext.createServiceClient();

      let workflows: any[];
      let archetypes: any[];
      let hus: any[];
      let allRoles: any[];
      let users: any[];
      let prioritiesConfig: any[];
      let allTasks: any[];

      const cachedMaster = this.masterPayloadByUserId.get(userId);
      if (cachedMaster && cachedMaster.expiresAt > Date.now()) {
        ({ workflows, archetypes, hus, allRoles, users, prioritiesConfig, allTasks } = cachedMaster);
      } else {
        [workflows, archetypes, hus, allRoles, users, prioritiesConfig, allTasks] = await Promise.all([
          getAllWorkflowSets(client),
          getAllArchetypesConfig(client),
          getAllHospitalUnitsConfig(client),
          getAllRoles(client),
          getAllUsers(client),
          getAllProjectPriorities(client),
          getAllTasks(client),
        ]);
        this.masterPayloadByUserId.set(userId, {
          expiresAt: Date.now() + ProjectListService.MASTER_CACHE_TTL_MS,
          workflows,
          archetypes,
          hus,
          allRoles,
          users,
          prioritiesConfig,
          allTasks,
        });
      }

      let rawEnrichedAssets: any[];
      let totalAssetCount: number | undefined;
      let pageOut: number | undefined;
      let pageSizeOut: number | undefined;

      if (paged) {
        const safeSize = Math.min(500, Math.max(1, Math.floor(pageSize as number)));
        const safePage = Math.max(1, Math.floor(page as number));
        const pageResult = await getEnrichedAssetsPageForPeriod(client, periodName, safePage, safeSize);
        rawEnrichedAssets = pageResult.enrichedAssets;
        totalAssetCount = pageResult.totalCount;
        pageOut = safePage;
        pageSizeOut = safeSize;
      } else {
        rawEnrichedAssets = await getAllEnrichedAssetsForPeriod(client, periodName);
      }

      const serverScope = await resolveAuthoritativeProjectListScope(client, userId, {
        users,
        archetypes,
        hus,
      });
      rawEnrichedAssets = filterRowsByAssignmentScope(rawEnrichedAssets, serverScope);
      if (paged) {
        totalAssetCount = rawEnrichedAssets.length;
      }

      const response = await this.assembleBundlePayload(
        client,
        userId,
        rawEnrichedAssets,
        workflows,
        archetypes,
        hus,
        allRoles,
        users,
        prioritiesConfig,
        allTasks,
      );

      if (paged) {
        return this.egressBundle(accessToken, userId, {
          ...response,
          totalAssetCount,
          page: pageOut,
          pageSize: pageSizeOut,
        });
      }

      this.responseCache.set(cacheKey, {
        expiresAt: Date.now() + ProjectListService.CACHE_TTL_MS,
        data: response,
      });
      await perfCacheSet(cacheKey, response, ProjectListService.CACHE_TTL_MS);
      return this.egressBundle(accessToken, userId, response);
      } catch (err: unknown) {
        if (err instanceof UnauthorizedException || err instanceof BadRequestException) {
          throw err;
        }
        const msg = err instanceof Error ? err.message : String(err);
        throw new InternalServerErrorException(
          msg || 'Project list gagal memuat data dari database. Periksa log server dan query Supabase.',
        );
      }
    })();

    if (!paged) {
      this.inflight.set(cacheKey, run);
    }
    try {
      return await run;
    } finally {
      if (!paged) {
        this.inflight.delete(cacheKey);
      }
    }
  }

  /**
   * Server-side search/filter + pagination — always reads DB; optional short-lived cache (cache-aside).
   */
  async loadQueryPage(accessToken: string, body: unknown) {
    const query = parseProjectListQueryBody(body);
    await this.authZ.assertHierarchyPermission(
      accessToken,
      query.userId,
      'Capex Project List',
      'view',
    );
    const cacheKey = projectListQueryCacheKey(query.userId, query.periodName, query);

    const bypassCache = query.skipCache || query.exportAll;
    if (bypassCache) {
      if (query.skipCache) {
        await this.projectListCache.invalidateForPeriod(query.userId, query.periodName);
      }
      this.queryInflight.delete(cacheKey);
    } else {
      const cached = await perfCacheGet<any>(cacheKey);
      if (cached) {
        const stalePolicy =
          cached._debug?.dataPolicy && cached._debug.dataPolicy !== PROJECT_LIST_DATA_POLICY;
        const stalePartial =
          cached._debug?.defaultQuery === true &&
          typeof cached._debug?.dbTruthCount === 'number' &&
          typeof cached.totalAssetCount === 'number' &&
          cached.totalAssetCount < cached._debug.dbTruthCount;
        if (stalePolicy || stalePartial) {
          if (process.env.PERF_CACHE_LOG !== '0') {
            console.warn(
              `[project-list-query] cache=reject user=${query.userId} period=${query.periodName} reason=${stalePolicy ? 'policy' : 'partial-total'} cachedTotal=${cached.totalAssetCount} dbTruth=${cached._debug?.dbTruthCount}`,
            );
          }
          await perfCacheDelete(cacheKey);
        } else {
          if (process.env.PERF_CACHE_LOG !== '0') {
            console.info(
              `[project-list-query] cache=redis|memory user=${query.userId} period=${query.periodName} total=${cached.totalAssetCount} returned=${cached.enrichedAssets?.length ?? 0} dbTruth=${cached._debug?.dbTruthCount ?? '?'}`,
            );
          }
          return this.egressBundle(accessToken, query.userId, {
            ...cached,
            _debug: { ...cached._debug, cacheLayer: 'redis' },
          });
        }
      }
      const inflight = this.queryInflight.get(cacheKey);
      if (inflight) {
        return inflight.then((payload) => this.egressBundle(accessToken, query.userId, payload));
      }
    }

    const run = async () => {
      const { userId } = await this.authContext.getRlsClient(accessToken, query.userId);
      const client = this.authContext.createServiceClient();
      const master = await this.loadMasterPayload(client, userId);
      const { rawEnrichedAssets, totalCount, debug } = await loadProjectListQueryPage(client, query, {
        workflows: master.workflows,
        archetypes: master.archetypes,
        hus: master.hus,
        prioritiesConfig: master.prioritiesConfig,
        allTasks: master.allTasks,
        users: master.users,
      });

      const response = await this.assembleBundlePayload(
        client,
        userId,
        rawEnrichedAssets,
        master.workflows,
        master.archetypes,
        master.hus,
        master.allRoles,
        master.users,
        master.prioritiesConfig,
        master.allTasks,
      );

      const payload = {
        ...response,
        totalAssetCount: totalCount,
        page: query.page,
        pageSize: query.pageSize,
        _debug: debug,
      };

      if (process.env.PERF_CACHE_LOG !== '0') {
        console.info(
          `[project-list-query] cache=none user=${userId} period=${query.periodName} dbTruth=${debug.dbTruthCount} dbMatched=${debug.dbMatchedCount} progress=${debug.afterProgressFilterCount} returned=${debug.returnedRowCount} enrichDropped=${debug.enrichDroppedCount} total=${totalCount} policy=${debug.dataPolicy}`,
        );
      }

      if (!query.skipCache && !query.exportAll) {
        await perfCacheSet(cacheKey, payload, this.projectListCache.getQueryTtlMs());
      }
      return payload;
    };

    const promise = run();
    if (!query.skipCache && !query.exportAll) {
      this.queryInflight.set(cacheKey, promise);
    }
    try {
      const result = await promise;
      return this.egressBundle(accessToken, query.userId, result);
    } catch (err: unknown) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(
        msg || 'Project list query gagal memuat data dari database.',
      );
    } finally {
      this.queryInflight.delete(cacheKey);
    }
  }

  /** Single-request export — uses exportAll with max page size (no client chunk loop). */
  async loadExport(accessToken: string, body: unknown) {
    const b = (body ?? {}) as Record<string, unknown>;
    return this.loadQueryPage(accessToken, {
      ...b,
      page: 1,
      pageSize: 50_000,
      exportAll: true,
      skipCache: b.skipCache !== false,
    });
  }

  private async loadMasterPayload(client: SupabaseClient, userId: number): Promise<MasterListPayload & { allRoles: any[] }> {
    const cachedMaster = this.masterPayloadByUserId.get(userId);
    if (cachedMaster && cachedMaster.expiresAt > Date.now()) {
      return cachedMaster;
    }
    const [workflows, archetypes, hus, allRoles, users, prioritiesConfig, allTasks] = await Promise.all([
      getAllWorkflowSets(client),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllRoles(client),
      getAllUsers(client),
      getAllProjectPriorities(client),
      getAllTasks(client),
    ]);
    const payload: MasterListPayload = {
      expiresAt: Date.now() + ProjectListService.MASTER_CACHE_TTL_MS,
      workflows,
      archetypes,
      hus,
      allRoles,
      users,
      prioritiesConfig,
      allTasks,
    };
    this.masterPayloadByUserId.set(userId, payload);
    return payload;
  }

  async invalidateCachesForPeriod(userId: number, periodName: string): Promise<void> {
    const cacheKey = this.getCacheKey(userId, periodName);
    this.responseCache.delete(cacheKey);
    this.inflight.delete(cacheKey);
    this.masterPayloadByUserId.delete(userId);
    await this.projectListCache.invalidateForPeriod(userId, periodName);
  }

  async invalidateCachesForAssetMutation(
    accessToken: string,
    userId: number,
    assetId: string,
  ): Promise<void> {
    try {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const { data: assetRow } = await client.from('assets').select('project_id').eq('id', assetId).maybeSingle();
      if (!assetRow?.project_id) {
        await this.projectListCache.invalidateForUser(userId);
        return;
      }
      const { data: projectRow } = await client
        .from('projects')
        .select('period_name')
        .eq('id', assetRow.project_id)
        .maybeSingle();
      const periodName = projectRow?.period_name ? String(projectRow.period_name) : '';
      if (periodName) {
        await this.invalidateCachesForPeriod(userId, periodName);
      } else {
        await this.projectListCache.invalidateForUser(userId);
      }
    } catch {
      await this.projectListCache.invalidateForUser(userId);
    }
  }
}
