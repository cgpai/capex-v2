import { Injectable, BadRequestException } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords, fetchAllRecordsWhereEq, toCamelCase } from '../project-list/supabase-helpers';
import { countAssetsByProjectIds } from '../executive-summary/executive-summary-query.util';
import { getAllWorkflowSets } from '../project-list/master-data.loader';
import { loadBudgetByPeriodName, loadBudgetPeriodStructureOnly } from './budget-period.loader';
import {
  assertHuInUserScope,
  allocateNextAssetCode,
  allocateNextProjectCode,
  deleteProjectCascade,
  deleteAssetCascade,
  persistAssetRow,
  persistProjectRow,
  persistPipelineItems,
  persistPurchaseOrderRow,
  remapAssetCodePrefix,
} from './budget-hu-persist.util';
import {
  fetchPurchaseOrderById,
  fetchPurchaseOrdersByProjectId,
} from './purchase-order.loader';
import { yyFromPeriodName } from './budget-hu-code-year.util';
import {
  perfCacheDelete,
  perfCacheDeleteByPrefix,
  perfCacheGet,
  perfCacheSet,
} from '../shared/perf-cache';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';

export type BudgetHuConfigBundleDto = {
  routineAssetMaxBudget: number;
  categories: any[];
  priorities: any[];
  workflows: any[];
  assetTypes: any[];
};

export type BudgetHuPageBundleDto = BudgetHuConfigBundleDto & {
  budgetPeriod: any | null;
  studies: Array<{ id: string; projectId: string; conclusion: string }>;
};

const BUDGET_CATEGORY_SELECT = 'id,name,is_active';
const PRIORITY_SELECT = 'id,name,is_active';
const ASSET_TYPE_SELECT = 'id,name,group_id,is_active';
const PROJECT_LIST_SELECT =
  'id,hospital_unit_id,period_name,project_code,project_name,ax_code,budget_category_id,priority_id,budget_plan,budget_carry_forward,budget_allocated,approved_budget,consumed_budget,is_routine_asset_aggregator,is_pipeline_project';

export type BudgetHuSavePayload = {
  periodName: string;
  budgetPeriod: Record<string, unknown>;
  partial?: boolean;
  huId?: string;
  changedProjectIds?: string[];
  deletedProjectIds?: string[];
  touchedAssetIds?: string[];
  projectsOnly?: boolean;
};

@Injectable()
export class BudgetHuService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private readonly responseCache = new Map<string, { expiresAt: number; data: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  private pruneCache(): void {
    const now = Date.now();
    for (const [k, v] of this.responseCache.entries()) {
      if (v.expiresAt <= now) this.responseCache.delete(k);
    }
  }

  private getFromProcessCache<T>(key: string): T | null {
    this.pruneCache();
    const hit = this.responseCache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.data as T;
    return null;
  }

  private setProcessCache(key: string, data: unknown, ttlMs: number): void {
    this.responseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
  }

  private async dedupe<T>(key: string, run: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = run();
    this.inflight.set(key, promise);
    try {
      return await promise;
    } finally {
      this.inflight.delete(key);
    }
  }

  /** Invalidate list/detail/summary caches after HU budget mutations (all users on this period). */
  async invalidateForPeriod(
    accessToken: string,
    userId: number,
    periodName: string,
  ): Promise<void> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'update');
    await this.invalidateCachesForPeriod(periodName);
  }

  private async invalidateCachesForPeriod(periodName: string): Promise<void> {
    const pn = periodName.trim().toLowerCase();
    // Clear in-process entries for every user on this period so peer browsers don't read stale Redis/memory.
    for (const key of [...this.responseCache.keys()]) {
      if (key.includes('budget-hu') && key.includes(`:${pn}`)) {
        this.responseCache.delete(key);
        this.inflight.delete(key);
      }
    }
    // Keys: app:table:budget-hu:{page|period|asset-counts}:{userId}:{period}
    await perfCacheDeleteByPrefix('app:table:budget-hu:page:');
    await perfCacheDeleteByPrefix('app:table:budget-hu:period:');
    await perfCacheDeleteByPrefix('app:table:budget-hu:period-network:');
    await perfCacheDeleteByPrefix('app:table:budget-hu:period-structure:');
    await perfCacheDeleteByPrefix('app:table:budget-hu:asset-counts:');
    await perfCacheDeleteByPrefix('app:dashboard:');
  }

  private async fetchStudiesByProjectIds(
    client: any,
    projectIds: string[],
  ): Promise<Array<{ id: string; projectId: string; conclusion: string }>> {
    if (projectIds.length === 0) return [];
    const rows: Array<{ id: string; projectId: string; conclusion: string }> = [];
    const chunkSize = 150;
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      const chunk = projectIds.slice(i, i + chunkSize);
      const { data, error } = await client
        .from('feasibility_studies')
        .select('id,project_id,conclusion')
        .in('project_id', chunk);
      if (error) throw new Error(`feasibility_studies(project_id in): ${error.message}`);
      for (const r of data || []) {
        rows.push({
          id: String((r as any).id),
          projectId: String((r as any).project_id),
          conclusion: String((r as any).conclusion || 'Pending'),
        });
      }
    }
    return rows;
  }

  private async loadConfigFromDb(client: any): Promise<BudgetHuConfigBundleDto> {
    const [routineRow, categoriesRaw, prioritiesRaw, workflows, assetTypesRaw] = await Promise.all([
      client.from('app_config').select('value').eq('key', 'routineAssetMaxBudget').maybeSingle(),
      fetchAllRecords(client, 'budget_category_configs', BUDGET_CATEGORY_SELECT),
      fetchAllRecords(client, 'project_priority_configs', PRIORITY_SELECT),
      getAllWorkflowSets(client),
      fetchAllRecords(client, 'asset_type_configs', ASSET_TYPE_SELECT),
    ]);

    const rawVal = (routineRow.data as any)?.value;
    const routineAssetMaxBudget =
      typeof rawVal === 'number' ? rawVal : Number.parseFloat(String(rawVal ?? '0')) || 0;

    return {
      routineAssetMaxBudget,
      categories: (categoriesRaw || []).map((r) => toCamelCase(r)),
      priorities: (prioritiesRaw || [])
        .map((r) => toCamelCase(r))
        .filter((p: any) => p.isActive !== false),
      workflows,
      assetTypes: (assetTypesRaw || []).map((r) => toCamelCase(r)),
    };
  }

  async loadConfigBundle(accessToken: string, userId: number, skipCache = false): Promise<BudgetHuConfigBundleDto> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const key = cacheKeys.budgetHuConfig();
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }

    const processHit = this.getFromProcessCache<BudgetHuConfigBundleDto>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<BudgetHuConfigBundleDto>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.MASTER);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const payload = await this.loadConfigFromDb(client);
      this.setProcessCache(key, payload, CACHE_TTL_MS.MASTER);
      await perfCacheSet(key, payload, CACHE_TTL_MS.MASTER);
      return payload;
    });
  }

  async loadBudgetPeriodOnly(
    accessToken: string,
    userId: number,
    periodName: string,
    skipCache = false,
    options?: { networkView?: boolean; networkShell?: boolean; categoryId?: string },
  ): Promise<{ budgetPeriod: any | null }> {
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const networkView = options?.networkView === true;
    const networkShell = options?.networkShell === true;
    const categoryId = String(options?.categoryId ?? '').trim();
    const key = networkShell
      ? cacheKeys.budgetHuPeriodNetworkShell(userId, periodName)
      : networkView && categoryId
        ? cacheKeys.budgetHuPeriodNetworkCategory(userId, periodName, categoryId)
        : networkView
          ? cacheKeys.budgetHuPeriodNetwork(userId, periodName)
          : cacheKeys.budgetHuPeriod(userId, periodName);
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }

    const processHit = this.getFromProcessCache<{ budgetPeriod: any | null }>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<{ budgetPeriod: any | null }>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const budgetPeriod = await loadBudgetByPeriodName(client, periodName.trim(), {
        networkView: networkView || networkShell || !!categoryId,
        networkShell,
        categoryId: categoryId || undefined,
      });
      const payload = { budgetPeriod };
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  async loadBudgetPeriodStructure(
    accessToken: string,
    userId: number,
    periodName: string,
    skipCache = false,
  ): Promise<{ archetypes: any[] } | null> {
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const key = cacheKeys.budgetHuPeriodStructure(userId, periodName);
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }

    const processHit = this.getFromProcessCache<{ archetypes: any[] } | null>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<{ archetypes: any[] } | null>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const payload = await loadBudgetPeriodStructureOnly(client, periodName.trim());
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  async loadPageBundle(
    accessToken: string,
    userId: number,
    periodName: string,
    skipCache = false,
    options?: { hospitalUnitId?: string; omitConfig?: boolean },
  ): Promise<BudgetHuPageBundleDto> {
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const scopedHuId = String(options?.hospitalUnitId ?? '').trim();
    if (scopedHuId) {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      await assertHuInUserScope(client, userId, scopedHuId);
    }

    const key = cacheKeys.budgetHuPage(userId, periodName, scopedHuId || undefined);
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }

    const processHit = this.getFromProcessCache<BudgetHuPageBundleDto>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<BudgetHuPageBundleDto>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const pn = periodName.trim();
      const omitConfig = options?.omitConfig === true;

      const [budgetPeriod, config] = await Promise.all([
        loadBudgetByPeriodName(client, pn, {
          hospitalUnitId: scopedHuId || undefined,
        }),
        omitConfig
          ? Promise.resolve({
              routineAssetMaxBudget: 0,
              categories: [],
              priorities: [],
              workflows: [],
              assetTypes: [],
            } as BudgetHuConfigBundleDto)
          : this.loadConfigFromDb(client),
      ]);

      const projectIds: string[] = [];
      for (const archetype of budgetPeriod?.archetypes || []) {
        for (const hu of archetype.units || []) {
          if (scopedHuId && String(hu.id) !== scopedHuId) continue;
          for (const project of hu.projects || []) {
            projectIds.push(String(project.id));
          }
        }
      }
      const studies = await this.fetchStudiesByProjectIds(client, projectIds);

      const payload: BudgetHuPageBundleDto = {
        budgetPeriod,
        ...config,
        studies,
      };
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  /** Lightweight asset counts per project — for instant table badges without full asset hydration. */
  async loadProjectAssetCounts(
    accessToken: string,
    userId: number,
    periodName: string,
    skipCache = false,
  ): Promise<Record<string, number>> {
    if (!periodName?.trim()) {
      throw new BadRequestException('periodName is required');
    }
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const key = cacheKeys.budgetHuAssetCounts(userId, periodName);
    if (skipCache) {
      this.responseCache.delete(key);
      this.inflight.delete(key);
      await perfCacheDelete(key);
    }

    const processHit = this.getFromProcessCache<Record<string, number>>(key);
    if (processHit) return processHit;

    const sharedHit = await perfCacheGet<Record<string, number>>(key);
    if (sharedHit) {
      this.setProcessCache(key, sharedHit, CACHE_TTL_MS.TABLE);
      return sharedHit;
    }

    return this.dedupe(key, async () => {
      const { client } = await this.authContext.getRlsClient(accessToken, userId);
      const pn = periodName.trim();
      const projects = await fetchAllRecordsWhereEq(client, 'projects', 'period_name', pn, 'id');
      const projectIds = (projects || []).map((p: { id: string }) => String(p.id));
      const countsMap = await countAssetsByProjectIds(client, projectIds);
      const payload = Object.fromEntries(countsMap.entries());
      this.setProcessCache(key, payload, CACHE_TTL_MS.TABLE);
      await perfCacheSet(key, payload, CACHE_TTL_MS.TABLE);
      return payload;
    });
  }

  private getPersistClient(fallbackClient: import('@supabase/supabase-js').SupabaseClient) {
    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) return fallbackClient;
    return createSupabaseClient(serviceKey);
  }

  async savePeriod(
    accessToken: string,
    userId: number,
    payload: BudgetHuSavePayload,
  ): Promise<{ budgetPeriod: Record<string, unknown> }> {
    const periodName = String(payload.periodName ?? '').trim();
    if (!periodName) {
      throw new BadRequestException('periodName is required');
    }

    const ctx = await this.authZ.assertHierarchyPermission(
      accessToken,
      userId,
      'Budget HU',
      'update',
    );
    const persistClient = this.getPersistClient(ctx.client);

    const huId = String(payload.huId ?? '').trim();
    if (huId) {
      await assertHuInUserScope(persistClient, userId, huId);
    }

    const changedProjectIds = new Set(
      (payload.changedProjectIds ?? []).map((id) => String(id)).filter(Boolean),
    );
    const deletedProjectIds = new Set(
      (payload.deletedProjectIds ?? []).map((id) => String(id)).filter(Boolean),
    );
    const touchedAssetIds = new Set(
      (payload.touchedAssetIds ?? []).map((id) => String(id)).filter(Boolean),
    );
    const projectsOnly = payload.projectsOnly === true;

    const budgetPeriod = payload.budgetPeriod;
    if (!budgetPeriod || typeof budgetPeriod !== 'object') {
      throw new BadRequestException('budgetPeriod is required');
    }

    const presentAssetIds = new Set<string>();
    for (const archetype of (budgetPeriod.archetypes as any[]) || []) {
      for (const unit of archetype.units || []) {
        if (huId && String(unit.id) !== huId) continue;
        for (const project of unit.projects || []) {
          if (!changedProjectIds.has(String(project.id))) continue;
          if (deletedProjectIds.has(String(project.id))) continue;
          for (const asset of project.assets || []) {
            const assetId = String(asset.id ?? '');
            if (assetId) presentAssetIds.add(assetId);
          }
        }
      }
    }

    for (const archetype of (budgetPeriod.archetypes as any[]) || []) {
      for (const unit of archetype.units || []) {
        if (huId && String(unit.id) !== huId) continue;
        for (const project of unit.projects || []) {
          if (!changedProjectIds.has(String(project.id))) continue;
          if (deletedProjectIds.has(String(project.id))) continue;

          const requestedProjectCode = String(project.projectCode ?? '');
          const saved = await persistProjectRow(
            persistClient,
            project as Record<string, unknown>,
            String(unit.id),
            periodName,
          );

          project.id = saved.id;
          project.projectCode = saved.projectCode;

          if (Boolean(project.isPipelineProject)) {
            await persistPipelineItems(
              persistClient,
              saved.id,
              project.pipelineData as Array<{ roomId?: string; catalogueId?: string; qty?: number }> | undefined,
              String(unit.id),
              String(archetype.id ?? ''),
            );
          }

          if (!projectsOnly && Array.isArray(project.assets)) {
            for (const asset of project.assets) {
              const assetId = String(asset.id ?? '');
              if (touchedAssetIds.size > 0 && !touchedAssetIds.has(assetId)) continue;

              if (saved.codeRemapped && asset.assetCode) {
                asset.assetCode = remapAssetCodePrefix(
                  String(asset.assetCode),
                  requestedProjectCode,
                  saved.projectCode,
                );
              }

              const assetSaved = await persistAssetRow(
                persistClient,
                asset as Record<string, unknown>,
                saved.id,
                saved.projectCode,
              );
              asset.id = assetSaved.id;
              if (assetSaved.assetCode != null) {
                asset.assetCode = assetSaved.assetCode;
              }
            }
          }
        }
      }
    }

    if (!projectsOnly && touchedAssetIds.size > 0) {
      for (const assetId of touchedAssetIds) {
        if (!presentAssetIds.has(assetId)) {
          await deleteAssetCascade(persistClient, assetId);
        }
      }
    }

    for (const projectId of deletedProjectIds) {
      if (!changedProjectIds.has(projectId)) continue;
      await deleteProjectCascade(persistClient, projectId);
    }

    await this.invalidateCachesForPeriod(periodName);
    return { budgetPeriod };
  }

  /**
   * Atomically reserve next free project code for HU+YY (server is source of truth).
   * Concurrent browsers each receive a different nn via DB sequence RPC.
   */
  async allocateProjectCode(
    accessToken: string,
    userId: number,
    payload: {
      periodName: string;
      huCode: string;
      preferredCode?: string;
      excludeProjectId?: string;
    },
  ): Promise<{ projectCode: string }> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const persistClient = this.getPersistClient(
      (await this.authContext.getRlsClient(accessToken, userId)).client,
    );
    const yy = yyFromPeriodName(String(payload.periodName ?? ''));
    const huCode = String(payload.huCode ?? '').trim();
    if (!huCode) throw new BadRequestException('huCode is required');
    const excludeId = payload.excludeProjectId ? String(payload.excludeProjectId) : null;
    const projectCode = await allocateNextProjectCode(
      persistClient,
      huCode,
      yy,
      // Only honor preferred when updating an existing project id.
      excludeId ? payload.preferredCode ?? null : null,
      excludeId,
      { forceReserve: !excludeId },
    );
    return { projectCode };
  }

  async allocateAssetCode(
    accessToken: string,
    userId: number,
    payload: {
      projectCode: string;
      preferredCode?: string;
      excludeAssetId?: string;
    },
  ): Promise<{ assetCode: string }> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const persistClient = this.getPersistClient(
      (await this.authContext.getRlsClient(accessToken, userId)).client,
    );
    const projectCode = String(payload.projectCode ?? '').trim();
    if (!projectCode) throw new BadRequestException('projectCode is required');
    const excludeId = payload.excludeAssetId ? String(payload.excludeAssetId) : null;
    const assetCode = await allocateNextAssetCode(
      persistClient,
      projectCode,
      excludeId ? payload.preferredCode ?? null : null,
      excludeId,
      { forceReserve: !excludeId },
    );
    return { assetCode };
  }

  /**
   * Lightweight change detector for one HU. Peers poll this when Supabase Realtime
   * is unavailable under backend-session (persistSession: false).
   * Projects-only fingerprint (no chunked asset scans) — keep stamp <100ms.
   */
  async getHuSyncStamp(
    accessToken: string,
    userId: number,
    periodName: string,
    hospitalUnitId: string,
  ): Promise<{
    fingerprint: string;
    projectSignature: string;
    projectCount: number;
    assetCount: number;
  }> {
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const pn = String(periodName ?? '').trim();
    const huId = String(hospitalUnitId ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');
    if (!huId) throw new BadRequestException('hospitalUnitId is required');

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    await assertHuInUserScope(client, userId, huId);
    const persistClient = this.getPersistClient(client);

    const { data: projects, error: projErr } = await persistClient
      .from('projects')
      .select('id, project_code, updated_at')
      .eq('period_name', pn)
      .eq('hospital_unit_id', huId)
      .order('id', { ascending: true });
    if (projErr) throw new BadRequestException(projErr.message);

    const rows = (projects || []) as Array<{
      id: string;
      project_code?: string | null;
      updated_at?: string | null;
    }>;

    const projectSignature = rows
      .map((p) => `${p.id}:${String(p.project_code ?? '').trim()}`)
      .sort()
      .join(',');
    let maxUpdated = '';
    for (const p of rows) {
      const u = String(p.updated_at ?? '');
      if (u > maxUpdated) maxUpdated = u;
    }
    const fingerprint = `p${rows.length}|${maxUpdated}|${projectSignature}`;

    return {
      fingerprint,
      projectSignature,
      projectCount: rows.length,
      assetCount: 0,
    };
  }

  /**
   * Lightweight single-project persist for Capex Project List / trigger-task flows.
   * Resolves hospital_unit_id from the payload or existing DB row.
   */
  async saveSingleProject(
    accessToken: string,
    userId: number,
    periodName: string,
    project: Record<string, unknown>,
  ): Promise<{ project: Record<string, unknown> }> {
    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');
    if (!project || typeof project !== 'object') {
      throw new BadRequestException('project is required');
    }
    const projectId = String(project.id ?? '').trim();
    if (!projectId) throw new BadRequestException('project.id is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Capex Project List', 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const persistClient = this.getPersistClient(client);

    let hospitalUnitId = String(
      project.hospitalUnitId ?? project.hospital_unit_id ?? '',
    ).trim();
    if (!hospitalUnitId) {
      const { data: existing, error } = await persistClient
        .from('projects')
        .select('hospital_unit_id, period_name')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw new BadRequestException(error.message);
      hospitalUnitId = String(existing?.hospital_unit_id ?? '').trim();
      if (!hospitalUnitId) {
        throw new BadRequestException('hospitalUnitId is required to save project');
      }
    }

    await assertHuInUserScope(persistClient, userId, hospitalUnitId);

    const saved = await persistProjectRow(
      persistClient,
      project,
      hospitalUnitId,
      pn,
    );

    if (Boolean(project.isPipelineProject)) {
      const { data: huRow } = await persistClient
        .from('hospital_units_config')
        .select('archetype_id')
        .eq('id', hospitalUnitId)
        .maybeSingle();
      await persistPipelineItems(
        persistClient,
        saved.id,
        project.pipelineData as Array<{ roomId?: string; catalogueId?: string; qty?: number }> | undefined,
        hospitalUnitId,
        huRow?.archetype_id ? String(huRow.archetype_id) : null,
      );
    }

    const { data: row, error: reloadErr } = await persistClient
      .from('projects')
      .select('*')
      .eq('id', saved.id)
      .maybeSingle();
    if (reloadErr) throw new BadRequestException(reloadErr.message);

    await this.invalidateCachesForPeriod(pn);
    return {
      project: row
        ? (toCamelCase(row) as Record<string, unknown>)
        : {
            ...project,
            id: saved.id,
            projectCode: saved.projectCode,
            hospitalUnitId,
            periodName: pn,
          },
    };
  }

  async saveSingleAsset(
    accessToken: string,
    userId: number,
    periodName: string,
    asset: Record<string, unknown>,
  ): Promise<{ asset: Record<string, unknown> }> {
    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');
    if (!asset || typeof asset !== 'object') {
      throw new BadRequestException('asset is required');
    }
    const assetId = String(asset.id ?? '').trim();
    const projectId = String(asset.projectId ?? asset.project_id ?? '').trim();
    if (!assetId) throw new BadRequestException('asset.id is required');
    if (!projectId) throw new BadRequestException('asset.projectId is required');

    try {
      await this.authZ.assertHierarchyPermission(accessToken, userId, 'Capex Project List', 'update');
    } catch {
      await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'update');
    }
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const persistClient = this.getPersistClient(client);

    const { data: projectRow, error: projErr } = await persistClient
      .from('projects')
      .select('id, project_code, hospital_unit_id')
      .eq('id', projectId)
      .maybeSingle();
    if (projErr) throw new BadRequestException(projErr.message);
    if (!projectRow) throw new BadRequestException('Project not found for asset');

    const huId = String(projectRow.hospital_unit_id ?? '').trim();
    if (huId) await assertHuInUserScope(persistClient, userId, huId);

    const projectCode = String(projectRow.project_code ?? asset.projectCode ?? '').trim();
    const saved = await persistAssetRow(
      persistClient,
      asset,
      projectId,
      projectCode,
    );

    const { data: row, error: reloadErr } = await persistClient
      .from('assets')
      .select('*')
      .eq('id', saved.id)
      .maybeSingle();
    if (reloadErr) throw new BadRequestException(reloadErr.message);

    await this.invalidateCachesForPeriod(pn);
    return {
      asset: row
        ? (toCamelCase(row) as Record<string, unknown>)
        : {
            ...asset,
            id: saved.id,
            assetCode: saved.assetCode ?? asset.assetCode,
            projectId,
          },
    };
  }

  async savePurchaseOrder(
    accessToken: string,
    userId: number,
    periodName: string,
    purchaseOrder: Record<string, unknown>,
    action: 'create' | 'update' = 'create',
  ): Promise<{ purchaseOrder: Record<string, unknown> }> {
    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');
    if (!purchaseOrder || typeof purchaseOrder !== 'object') {
      throw new BadRequestException('purchaseOrder is required');
    }

    const projectId = String(purchaseOrder.projectId ?? purchaseOrder.project_id ?? '').trim();
    if (!projectId) throw new BadRequestException('purchaseOrder.projectId is required');

    await this.authZ.assertHierarchyPermission(
      accessToken,
      userId,
      'Purchase Order',
      action,
    );

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const persistClient = this.getPersistClient(client);

    const { data: projectRow, error: projErr } = await persistClient
      .from('projects')
      .select('hospital_unit_id, period_name')
      .eq('id', projectId)
      .maybeSingle();
    if (projErr) throw new BadRequestException(projErr.message);
    if (!projectRow) throw new BadRequestException('Project not found for purchase order');

    const huId = String(projectRow.hospital_unit_id ?? '').trim();
    if (huId) await assertHuInUserScope(persistClient, userId, huId);

    await persistPurchaseOrderRow(persistClient, purchaseOrder);
    await this.invalidateCachesForPeriod(pn);

    return { purchaseOrder };
  }

  async getPurchaseOrder(
    accessToken: string,
    userId: number,
    poId: string,
  ): Promise<{ purchaseOrder: Record<string, unknown> | null }> {
    const id = String(poId ?? '').trim();
    if (!id) throw new BadRequestException('poId is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const purchaseOrder = await fetchPurchaseOrderById(client, id);
    return { purchaseOrder };
  }

  async getPurchaseOrdersForProject(
    accessToken: string,
    userId: number,
    projectId: string,
  ): Promise<{ purchaseOrders: Record<string, unknown>[] }> {
    const pid = String(projectId ?? '').trim();
    if (!pid) throw new BadRequestException('projectId is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const rows = await fetchPurchaseOrdersByProjectId(client, pid);
    const sorted = rows.sort((a, b) => {
      const aTime = new Date(String(a.createdAt ?? 0)).getTime();
      const bTime = new Date(String(b.createdAt ?? 0)).getTime();
      return bTime - aTime;
    });
    return { purchaseOrders: sorted };
  }

  /** Project metadata for one period — no asset hydration (export / list helpers). */
  async loadProjectsForPeriod(
    accessToken: string,
    userId: number,
    periodName: string,
  ): Promise<{ projects: Record<string, unknown>[] }> {
    const pn = String(periodName ?? '').trim();
    if (!pn) throw new BadRequestException('periodName is required');

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'Budget HU', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const rows = await fetchAllRecordsWhereEq(client, 'projects', 'period_name', pn, PROJECT_LIST_SELECT);
    const projects = (rows ?? []).map((row) => ({ ...toCamelCase(row), assets: [] }));
    return { projects };
  }
}
