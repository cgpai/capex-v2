import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords, toCamelCase } from '../project-list/supabase-helpers';
import { fetchRecordsByAssetIds } from '../project-list/supabase-helpers';
import {
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllTasks,
} from '../project-list/master-data.loader';
import { loadBudgetByPeriodName } from '../budget-hu/budget-period.loader';
import { FsAuthService } from '../fs/fs-auth.service';
import { parsePeriodUserBody } from '../fs/fs.dto';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { perfCacheDeleteByPrefix, perfCacheGet, perfCacheSet } from '../shared/perf-cache';

type FsProjectPatch = {
  id: string;
  axCode?: string | null;
  approvedBudget?: number;
  targetBudgetStart?: string | null;
  budgetRevenuePermonth?: number;
};

type FsPageBundle = Awaited<ReturnType<FsUpdateService['loadPageBundleUncached']>>;

const FS_PAGE_CACHE_TTL_MS = CACHE_TTL_MS.TABLE;
const FS_FIELDS_UPDATE_CONCURRENCY = 30;
const inflightLoads = new Map<string, Promise<FsPageBundle>>();

const FS_STUDY_COLUMNS =
  'id,project_id,fs_type,amount,conclusion,follow_up_action,updated_at';

@Injectable()
export class FsUpdateService {
  constructor(
    private readonly fsAuth: FsAuthService,
    private readonly authZ: AuthZService,
  ) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    return userId;
  }

  private extractPeriodIds(period: any | null): { projectIds: string[]; assetIds: string[] } {
    if (!period?.archetypes) return { projectIds: [], assetIds: [] };
    const projectIds: string[] = [];
    const assetIds: string[] = [];
    for (const archetype of period.archetypes) {
      for (const hu of archetype.units || []) {
        for (const project of hu.projects || []) {
          projectIds.push(String(project.id));
          for (const asset of project.assets || []) {
            assetIds.push(String(asset.id));
          }
        }
      }
    }
    return { projectIds, assetIds };
  }

  private async fetchStudiesByProjectIds(client: SupabaseClient, projectIds: string[]): Promise<any[]> {
    if (projectIds.length === 0) return [];
    const out: any[] = [];
    const chunkSize = 150;
    for (let i = 0; i < projectIds.length; i += chunkSize) {
      const chunk = projectIds.slice(i, i + chunkSize);
      const { data, error } = await client
        .from('feasibility_studies')
        .select(FS_STUDY_COLUMNS)
        .in('project_id', chunk);
      if (error) throw new Error(`feasibility_studies(project_id in): ${error.message}`);
      if (data?.length) out.push(...data);
    }
    return out;
  }

  private async loadPageBundleUncached(client: SupabaseClient, periodName: string) {
    const pn = periodName.trim();
    const [period, archetypes, hus, assetTypesRaw, assetTypeGroupsRaw, tasks] = await Promise.all([
      loadBudgetByPeriodName(client, pn),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      fetchAllRecords(client, 'asset_type_configs', 'id,name,group_id,is_active'),
      fetchAllRecords(client, 'asset_type_groups', 'id,name'),
      getAllTasks(client),
    ]);
    const { projectIds, assetIds } = this.extractPeriodIds(period);
    const [assetTaskStatusesRaw, studiesRaw] = await Promise.all([
      assetIds.length
        ? fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds)
        : Promise.resolve([]),
      this.fetchStudiesByProjectIds(client, projectIds),
    ]);

    return {
      period,
      archetypes,
      hus,
      assetTypes: assetTypesRaw ? assetTypesRaw.map(toCamelCase) : [],
      assetTypeGroups: assetTypeGroupsRaw ? assetTypeGroupsRaw.map(toCamelCase) : [],
      assetTaskStatuses: assetTaskStatusesRaw ? assetTaskStatusesRaw.map(toCamelCase) : [],
      tasks,
      studies: studiesRaw ? studiesRaw.map(toCamelCase) : [],
      summary: {
        totalProjects: projectIds.length,
        totalAssets: assetIds.length,
        totalStudies: studiesRaw?.length ?? 0,
      },
    };
  }

  private async loadPageBundleCached(client: SupabaseClient, userId: number, periodName: string) {
    const cacheKey = cacheKeys.fsUpdatePage(userId, periodName);
    const cached = await perfCacheGet<FsPageBundle>(cacheKey);
    if (cached) return cached;

    const existing = inflightLoads.get(cacheKey);
    if (existing) return existing;

    const promise = this.loadPageBundleUncached(client, periodName).then(async (bundle) => {
      await perfCacheSet(cacheKey, bundle, FS_PAGE_CACHE_TTL_MS);
      return bundle;
    });
    inflightLoads.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      inflightLoads.delete(cacheKey);
    }
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const { userId, periodName } = parsePeriodUserBody(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'view');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    return this.loadPageBundleCached(client, userId, periodName.trim());
  }

  async saveProjects(accessToken: string, body: unknown) {
    const b = (body ?? {}) as {
      userId?: number;
      periodName?: string;
      projects?: FsProjectPatch[];
    };
    const userId = this.parseUserId(b);
    const patches = Array.isArray(b.projects) ? b.projects : [];
    if (patches.length === 0) {
      return { ok: true, updated: 0 };
    }

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'FS Update', 'update');
    const { client } = await this.fsAuth.getAuthenticatedRlsClient(accessToken, userId);
    await this.patchFsFieldsOnly(client, patches);

    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';
    if (periodName) {
      await perfCacheDeleteByPrefix(`app:table:fs-update:page:${userId}:`);
    }

    return { ok: true, updated: patches.length };
  }

  private async patchFsFieldsOnly(client: SupabaseClient, patches: FsProjectPatch[]): Promise<void> {
    for (let i = 0; i < patches.length; i += FS_FIELDS_UPDATE_CONCURRENCY) {
      const chunk = patches.slice(i, i + FS_FIELDS_UPDATE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (patch) => {
          const projectId = String(patch.id ?? '').trim();
          if (!projectId) {
            throw new BadRequestException('Each project patch requires id');
          }

          const update: Record<string, unknown> = {};
          if (patch.axCode !== undefined) {
            const ax = patch.axCode == null ? '' : String(patch.axCode).trim();
            update.ax_code = ax || null;
          }
          if (patch.approvedBudget !== undefined) {
            update.approved_budget = Number(patch.approvedBudget) || 0;
          }
          if (patch.targetBudgetStart !== undefined) {
            update.target_budget_start =
              patch.targetBudgetStart == null || String(patch.targetBudgetStart).trim() === ''
                ? null
                : String(patch.targetBudgetStart).slice(0, 10);
          }
          if (patch.budgetRevenuePermonth !== undefined) {
            update.budget_revenue_permonth = Number(patch.budgetRevenuePermonth) || 0;
          }
          if (Object.keys(update).length === 0) return;

          const { error } = await client.from('projects').update(update).eq('id', projectId);
          if (error) {
            throw new BadRequestException(`FS update ${projectId}: ${error.message}`);
          }
        }),
      );
    }
  }
}
