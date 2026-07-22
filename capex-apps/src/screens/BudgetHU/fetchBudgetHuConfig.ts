import type { AssetTypeConfig, BudgetCategoryConfig, ProjectPriorityConfig, WorkflowSet } from '@/types';
import * as configService from '@/services/configService';
import { fetchBudgetHuConfigFromBackend, type BudgetHuConfigBundle } from '@/services/budgetHuPageApi';
import { writeBudgetHuConfigCache } from '@/lib/budgetHuDiskCache';
import { invalidateRequestCache } from '@/lib/requestCache';

export type { BudgetHuConfigBundle };

/** Asset types & workflows selalu dari Supabase — backend cache bisa tertinggal 30 menit. */
async function overlayFreshHuMasterSlices(bundle: BudgetHuConfigBundle): Promise<BudgetHuConfigBundle> {
  invalidateRequestCache('cfg:asset_type');
  invalidateRequestCache('cfg:workflow');
  const [assetTypes, workflows] = await Promise.all([
    configService.getAllAssetTypeConfigs(),
    configService.getAllWorkflowSets(),
  ]);
  return { ...bundle, assetTypes, workflows };
}

/** Master data for HU forms — backend untuk slice berat; master form overlay dari Supabase. */
export async function fetchBudgetHuConfigBundle(userId: number): Promise<BudgetHuConfigBundle> {
  const cached = await fetchBudgetHuConfigFromBackend(userId);
  if (cached) {
    const result = await overlayFreshHuMasterSlices(cached);
    writeBudgetHuConfigCache(userId, result);
    return result;
  }

  const [config, categories, priorities, workflows, assetTypes] = await Promise.all([
    configService.getAppConfig('routineAssetMaxBudget'),
    configService.getAllBudgetCategories(),
    configService.getActiveProjectPriorities(),
    configService.getAllWorkflowSets(),
    configService.getAllAssetTypeConfigs(),
  ]);
  const result = {
    routineAssetMaxBudget: config?.value || 0,
    categories,
    priorities,
    workflows,
    assetTypes,
  };
  writeBudgetHuConfigCache(userId, result);
  return result;
}

export async function overlayFreshHuMasterOnPageBundle<
  T extends {
    assetTypes: AssetTypeConfig[];
    workflows: WorkflowSet[];
    categories?: BudgetCategoryConfig[];
    priorities?: ProjectPriorityConfig[];
  },
>(bundle: T): Promise<T> {
  const fresh = await overlayFreshHuMasterSlices({
    routineAssetMaxBudget: 0,
    categories: bundle.categories ?? [],
    priorities: bundle.priorities ?? [],
    workflows: bundle.workflows,
    assetTypes: bundle.assetTypes,
  });
  return {
    ...bundle,
    assetTypes: fresh.assetTypes,
    workflows: fresh.workflows,
  };
}
