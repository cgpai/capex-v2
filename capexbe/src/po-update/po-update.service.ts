import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { persistAssetRow } from '../budget-hu/budget-hu-persist.util';
import { CACHE_TTL_MS, cacheKeys } from '../shared/cache-keys';
import { perfCacheDeleteByPrefix, perfCacheGet, perfCacheSet } from '../shared/perf-cache';
import { loadPoUpdatePageBundle } from './po-update-page.loader';

type PoAssetPatch = {
  id: string;
  projectId: string;
  poNumber?: string | null;
  cprId?: string | null;
  poDate?: string | null;
  consumedBudget?: number;
  isGoodsReceived?: boolean;
  assetCode?: string;
  assetName?: string;
  description?: string;
  budgetPlan?: number;
  budgetAllocated?: number;
  workflowSetId?: string;
  budgetCategoryId?: string;
  endTargetDate?: string | null;
  catalogueId?: string | null;
  bddPriority?: string | null;
  assetTypeId?: string | null;
  qty?: number;
  receivedQty?: number;
  lifecycleStatus?: string | null;
};

const PO_PAGE_CACHE_TTL_MS = CACHE_TTL_MS.TABLE;
const PO_FIELDS_UPDATE_CONCURRENCY = 30;
const inflightLoads = new Map<string, Promise<unknown>>();

@Injectable()
export class PoUpdateService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private parseUserId(body: { userId?: number }): number {
    const userId = Number(body?.userId);
    if (!Number.isFinite(userId)) {
      throw new BadRequestException('Invalid userId');
    }
    return userId;
  }

  private async loadPageBundleCached(
    client: SupabaseClient,
    userId: number,
    periodName: string,
  ) {
    const cacheKey = cacheKeys.poUpdatePage(userId, periodName || 'all');
    const cached = await perfCacheGet<ReturnType<typeof loadPoUpdatePageBundle>>(cacheKey);
    if (cached) return cached;

    const inflightKey = cacheKey;
    const existing = inflightLoads.get(inflightKey) as
      | ReturnType<typeof loadPoUpdatePageBundle>
      | undefined;
    if (existing) return existing;

    const promise = loadPoUpdatePageBundle(client, periodName || undefined).then(async (bundle) => {
      await perfCacheSet(cacheKey, bundle, PO_PAGE_CACHE_TTL_MS);
      return bundle;
    });
    inflightLoads.set(inflightKey, promise);
    try {
      return await promise;
    } finally {
      inflightLoads.delete(inflightKey);
    }
  }

  async loadPageBundle(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; periodName?: string };
    const userId = this.parseUserId(b);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'PO Update', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';

    const bundle = await this.loadPageBundleCached(client, userId, periodName);
    return {
      assets: bundle.assets,
      archetypes: bundle.archetypes,
      hus: bundle.hus,
      projects: bundle.projects,
      priorities: bundle.priorities,
      assetHasPOMap: bundle.assetHasPOMap,
      assetLastTaskMap: bundle.assetLastTaskMap,
      totalAssetCount: bundle.totalAssetCount,
    };
  }

  async saveAssets(accessToken: string, body: unknown) {
    const b = (body ?? {}) as {
      userId?: number;
      assets?: PoAssetPatch[];
      poFieldsOnly?: boolean;
    };
    const userId = this.parseUserId(b);
    const patches = Array.isArray(b.assets) ? b.assets : [];
    if (patches.length === 0) {
      return { ok: true, updated: 0 };
    }

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'PO Update', 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    if (b.poFieldsOnly === true) {
      await this.patchPoFieldsOnly(client, patches);
      await perfCacheDeleteByPrefix(`app:table:po-update:page:${userId}:`);
    } else {
      await this.patchAssetsFull(client, patches);
    }
    return { ok: true, updated: patches.length };
  }

  /** Migrasi Excel: update kolom PO saja — paralel, tanpa alokasi asset code / workflow. */
  private async patchPoFieldsOnly(
    client: SupabaseClient,
    patches: PoAssetPatch[],
  ): Promise<void> {
    for (let i = 0; i < patches.length; i += PO_FIELDS_UPDATE_CONCURRENCY) {
      const chunk = patches.slice(i, i + PO_FIELDS_UPDATE_CONCURRENCY);
      await Promise.all(
        chunk.map(async (patch) => {
          const assetId = String(patch.id ?? '').trim();
          if (!assetId) {
            throw new BadRequestException('Each asset patch requires id');
          }
          const update: Record<string, unknown> = {};
          if (patch.poNumber !== undefined) update.po_number = patch.poNumber ?? null;
          if (patch.cprId !== undefined) update.cpr_id = patch.cprId ?? null;
          if (patch.poDate !== undefined) {
            update.po_date =
              patch.poDate == null || String(patch.poDate).trim() === ''
                ? null
                : String(patch.poDate).slice(0, 10);
          }
          if (patch.consumedBudget !== undefined) {
            update.consumed_budget = Number(patch.consumedBudget) || 0;
          }
          if (Object.keys(update).length === 0) return;

          const { error } = await client.from('assets').update(update).eq('id', assetId);
          if (error) {
            throw new BadRequestException(`PO migration update ${assetId}: ${error.message}`);
          }
        }),
      );
    }
  }

  private async patchAssetsFull(client: SupabaseClient, patches: PoAssetPatch[]): Promise<void> {
    for (const patch of patches) {
      const projectId = String(patch.projectId ?? '').trim();
      const assetId = String(patch.id ?? '').trim();
      if (!assetId || !projectId) {
        throw new BadRequestException('Each asset patch requires id and projectId');
      }
      const receivedQty =
        patch.receivedQty ??
        (patch.isGoodsReceived ? Number(patch.qty ?? 1) : 0);
      await persistAssetRow(
        client,
        {
          id: assetId,
          projectId,
          poNumber: patch.poNumber ?? null,
          cprId: patch.cprId ?? null,
          poDate: patch.poDate ?? null,
          consumedBudget: patch.consumedBudget ?? 0,
          isGoodsReceived: patch.isGoodsReceived ?? false,
          receivedQty,
          qty: patch.qty ?? 1,
          assetCode: patch.assetCode,
          assetName: patch.assetName,
          description: patch.description,
          budgetPlan: patch.budgetPlan,
          budgetAllocated: patch.budgetAllocated,
          workflowSetId: patch.workflowSetId,
          budgetCategoryId: patch.budgetCategoryId,
          endTargetDate: patch.endTargetDate,
          catalogueId: patch.catalogueId,
          bddPriority: patch.bddPriority,
          assetTypeId: patch.assetTypeId,
          lifecycleStatus: patch.lifecycleStatus,
        },
        projectId,
      );
    }
  }
}
