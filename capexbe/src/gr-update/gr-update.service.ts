import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { persistAssetRow } from '../budget-hu/budget-hu-persist.util';
import { getAllEnrichedAssetsForPeriod } from '../project-list/enriched-assets.loader';
import {
  fetchProjectsByIds,
  getAllArchetypesConfig,
  getAllHospitalUnitsConfig,
  getAllProjectPriorities,
  getAllTasks,
} from '../project-list/master-data.loader';
import { fetchRecordsByAssetIds, toCamelCase } from '../project-list/supabase-helpers';

type GrAssetPatch = {
  id: string;
  projectId: string;
  poNumber?: string | null;
  consumedBudget?: number;
  isGoodsReceived?: boolean;
  receivedQty?: number;
  qty?: number;
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
  lifecycleStatus?: string | null;
};

@Injectable()
export class GrUpdateService {
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

  async loadPageBundle(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; periodName?: string };
    const userId = this.parseUserId(b);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'GR Update', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const periodName = typeof b.periodName === 'string' ? b.periodName.trim() : '';

    const [assets, archetypes, hus, priorities, allTasks] = await Promise.all([
      getAllEnrichedAssetsForPeriod(client, periodName || undefined),
      getAllArchetypesConfig(client),
      getAllHospitalUnitsConfig(client),
      getAllProjectPriorities(client),
      getAllTasks(client),
    ]);

    const projectIds = [...new Set(assets.map((a: { projectId: string }) => String(a.projectId)))];
    const projects = projectIds.length ? await fetchProjectsByIds(client, projectIds) : [];
    const assetIds = assets.map((a: { id: string }) => String(a.id));
    const [statusesRaw, taskLogsRaw] = await Promise.all([
      assetIds.length
        ? fetchRecordsByAssetIds(client, 'asset_task_statuses', assetIds)
        : Promise.resolve([]),
      assetIds.length ? fetchRecordsByAssetIds(client, 'task_logs', assetIds) : Promise.resolve([]),
    ]);

    return {
      assets,
      archetypes,
      hus,
      projects: projects.map(toCamelCase),
      priorities,
      statuses: (statusesRaw || []).map(toCamelCase),
      tasks: allTasks,
      taskLogs: (taskLogsRaw || []).map(toCamelCase),
      totalAssetCount: assets.length,
    };
  }

  async saveAssets(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; assets?: GrAssetPatch[] };
    const userId = this.parseUserId(b);
    const patches = Array.isArray(b.assets) ? b.assets : [];
    if (patches.length === 0) {
      return { ok: true, updated: 0 };
    }

    await this.authZ.assertHierarchyPermission(accessToken, userId, 'GR Update', 'update');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    await this.patchAssets(client, patches);
    return { ok: true, updated: patches.length };
  }

  private async patchAssets(client: SupabaseClient, patches: GrAssetPatch[]): Promise<void> {
    for (const patch of patches) {
      const projectId = String(patch.projectId ?? '').trim();
      const assetId = String(patch.id ?? '').trim();
      if (!assetId || !projectId) {
        throw new BadRequestException('Each asset patch requires id and projectId');
      }
      const qty = Number(patch.qty ?? 1);
      const receivedQty =
        patch.receivedQty ??
        (patch.isGoodsReceived ? qty : 0);
      await persistAssetRow(
        client,
        {
          id: assetId,
          projectId,
          poNumber: patch.poNumber ?? null,
          consumedBudget: patch.consumedBudget ?? 0,
          isGoodsReceived: patch.isGoodsReceived ?? false,
          receivedQty,
          qty,
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
