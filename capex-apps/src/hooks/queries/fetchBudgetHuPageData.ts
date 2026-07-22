import type { BudgetPeriod } from '@/types';
import type { BudgetHuPageBundle } from '@/services/budgetHuPageApi';
import { fetchBudgetHuPageBundle } from '@/services/budgetHuPageApi';
import { getBudgetByPeriodName } from '@/services/budgetService';
import * as configService from '@/services/configService';
import { writeBudgetHuPageCache, writeBudgetPeriodCache } from '@/lib/budgetHuDiskCache';

export function isAppBudgetPeriodStructureShell(period: BudgetPeriod, name: string): boolean {
  if (period.periodName !== name) return false;
  const hasProjects = period.archetypes?.some((a) => a.units?.some((u) => (u.projects?.length ?? 0) > 0));
  if (hasProjects) return false;
  const noCategoryBudget = Object.keys(period.budget || {}).length === 0;
  const noMeta =
    !period.multiYearName?.trim() && !period.startDate?.trim() && !period.endDate?.trim();
  return noMeta && noCategoryBudget;
}

export type BudgetHuRemoteBundle = BudgetHuPageBundle & {
  source: 'bundle' | 'fallback';
  /** Present when payload only hydrated this HU's projects/assets. */
  scopedHuId?: string;
};

export async function fetchBudgetHuPageRemote(
  periodName: string,
  userId: number,
  options?: { skipCache?: boolean; hospitalUnitId?: string; omitConfig?: boolean },
): Promise<BudgetHuRemoteBundle> {
  const bundle = await fetchBudgetHuPageBundle(periodName, userId, options);
  if (bundle?.budgetPeriod) {
    const budgetPeriod = bundle.budgetPeriod;
    const result: BudgetHuRemoteBundle = {
      ...bundle,
      source: 'bundle',
      scopedHuId: String(options?.hospitalUnitId ?? '').trim() || undefined,
    };
    const replace = options?.skipCache === true && !options?.hospitalUnitId;
    writeBudgetHuPageCache(periodName, userId, bundle, { replace });
    writeBudgetPeriodCache(periodName, userId, budgetPeriod, { replace });
    return result;
  }
  const data = await getBudgetByPeriodName(periodName);
  const [config, categories, priorities, workflows, assetTypes] = await Promise.all([
    configService.getAppConfig('routineAssetMaxBudget'),
    configService.getAllBudgetCategories(),
    configService.getActiveProjectPriorities(),
    configService.getAllWorkflowSets(),
    configService.getAllAssetTypeConfigs(),
  ]);
  const result: BudgetHuRemoteBundle = {
    budgetPeriod: data || null,
    routineAssetMaxBudget: config?.value || 0,
    categories,
    priorities,
    workflows,
    assetTypes,
    studies: [],
    source: 'fallback',
  };
  writeBudgetHuPageCache(periodName, userId, result);
  if (result.budgetPeriod) {
    writeBudgetPeriodCache(periodName, userId, result.budgetPeriod);
  }
  return result;
}
