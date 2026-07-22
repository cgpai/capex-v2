import type { QueryClient } from '@tanstack/react-query';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  CONFIGURATION_SLICE_KEYS,
  fetchFreshConfigurationSlices,
  type ConfigSliceKey,
  type ConfigurationDataPack,
} from '@/services/configurationApi';
import type { ConfigurationCrudEntity } from '@/services/configurationCrudApi';
import {
  readConfigurationPackCacheAnyAge,
  writeConfigurationPackCache,
} from '@/lib/configurationDiskCache';
import { invalidateRequestCache } from '@/lib/requestCache';
import {
  excludeUserManagedConfigurationSlices,
  mergeConfigurationPack,
} from '@/features/configuration/core/configurationPageUtils';
import { isShellCachePatchGuarded } from '@/lib/syncAppShellCaches';
import { fetchBudgetHuConfigBundle } from '@/screens/BudgetHU/fetchBudgetHuConfig';
import { invalidateBudgetHuConfigDiskCache } from '@/lib/budgetHuDiskCache';
import type { BudgetHuPageBundle } from '@/services/budgetHuPageApi';

export const CRUD_ENTITY_TO_SLICES: Record<ConfigurationCrudEntity, ConfigSliceKey[]> = {
  user: ['users', 'roles'],
  role: ['roles', 'users'],
  budgetCategory: ['budgetCategories'],
  projectPriority: ['projectPriorities'],
  assetTag: ['assetTags'],
  regional: ['regionals'],
  archetype: ['archetypes'],
  hospitalUnit: ['hospitalUnits'],
  task: ['tasks'],
  masterCatalogue: ['masterCatalogue'],
  room: ['rooms'],
  vendor: ['vendors'],
  appConfig: [],
  assetTypeConfig: ['assetTypeConfigs'],
  assetTypeGroup: ['assetTypeGroups', 'assetTypeConfigs'],
  workflowSet: ['workflows'],
};

export function slicesForCrudEntity(entity: ConfigurationCrudEntity): ConfigSliceKey[] {
  return [...new Set(CRUD_ENTITY_TO_SLICES[entity] ?? [])];
}

export function invalidateConfigurationMasterRequestCaches(): void {
  invalidateRequestCache('cfg:');
  invalidateRequestCache('configuration:slices:');
}

function resolveConfigurationUserIds(queryClient: QueryClient, explicitUserId?: number): number[] {
  const fromQueries = queryClient
    .getQueryCache()
    .findAll({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        q.queryKey[0] === 'screen' &&
        q.queryKey[1] === 'configuration' &&
        typeof q.queryKey[2] === 'number',
    })
    .map((q) => Number(q.queryKey[2]))
    .filter((id) => Number.isFinite(id));

  if (fromQueries.length) return [...new Set(fromQueries)];

  if (explicitUserId != null && Number.isFinite(explicitUserId)) return [explicitUserId];

  if (typeof window !== 'undefined') {
    const raw = sessionStorage.getItem('currentUserId');
    const uid = Number(raw);
    if (Number.isFinite(uid)) return [uid];
  }

  return [];
}

async function patchConfigurationPackForUser(
  queryClient: QueryClient,
  userId: number,
  slices: ConfigSliceKey[],
  token: string | null,
): Promise<void> {
  const partial = await fetchFreshConfigurationSlices(token, userId, slices);
  const qk = queryKeys.configuration.page(userId);
  const existing =
    queryClient.getQueryData<Partial<ConfigurationDataPack>>(qk) ??
    readConfigurationPackCacheAnyAge(userId) ??
    undefined;
  const merged = mergeConfigurationPack(existing, partial);
  writeConfigurationPackCache(userId, merged, { replace: true });
  queryClient.setQueryData(qk, merged);
}

export type RefreshConfigurationQueriesOptions = {
  includeUserManaged?: boolean;
};

export async function refreshActiveConfigurationQueries(
  queryClient: QueryClient,
  slices: ConfigSliceKey[],
  explicitUserId?: number,
  options?: RefreshConfigurationQueriesOptions,
): Promise<void> {
  let keys = [...new Set(slices)];
  if (!options?.includeUserManaged) {
    keys = excludeUserManagedConfigurationSlices(keys);
  }
  if (!keys.length) return;

  invalidateConfigurationMasterRequestCaches();

  const userIds = resolveConfigurationUserIds(queryClient, explicitUserId);
  if (!userIds.length) return;

  const token = (await getAccessTokenForBackend()) ?? null;

  await Promise.all(userIds.map((userId) => patchConfigurationPackForUser(queryClient, userId, keys, token)));
}

export async function refreshBudgetHuMasterConfigQueries(
  queryClient: QueryClient,
  userId: number,
): Promise<void> {
  if (!Number.isFinite(userId)) return;
  invalidateRequestCache('app:master:budget-hu:');
  invalidateRequestCache('app:table:budget-hu:');
  invalidateBudgetHuConfigDiskCache(userId);

  const fresh = await fetchBudgetHuConfigBundle(userId);
  queryClient.setQueryData(queryKeys.budgetHu.config(), fresh);

  const pageQueries = queryClient.getQueryCache().findAll({
    predicate: (q) =>
      Array.isArray(q.queryKey) &&
      q.queryKey[0] === 'screen' &&
      q.queryKey[1] === 'budget-hu' &&
      q.queryKey[3] === userId,
  });

  for (const query of pageQueries) {
    queryClient.setQueryData(query.queryKey, (old: BudgetHuPageBundle | undefined) => {
      if (!old) return old;
      return {
        ...old,
        assetTypes: fresh.assetTypes,
        workflows: fresh.workflows,
        categories: fresh.categories,
        priorities: fresh.priorities,
        routineAssetMaxBudget: fresh.routineAssetMaxBudget,
      };
    });
  }
}

export async function refreshFullConfigurationPack(
  queryClient: QueryClient,
  explicitUserId?: number,
): Promise<void> {
  await refreshActiveConfigurationQueries(queryClient, [...CONFIGURATION_SLICE_KEYS], explicitUserId, {
    includeUserManaged: true,
  });
}

const CONFIG_MASTER_CHANGED_EVENT = 'capex:configuration-master-changed';

/** CRUD admin on the same device — refresh other tabs/components without polling. */
export function dispatchConfigurationMasterChanged(slices: ConfigSliceKey[]): void {
  if (typeof window === 'undefined' || !slices.length) return;
  invalidateConfigurationMasterRequestCaches();
  window.dispatchEvent(new CustomEvent(CONFIG_MASTER_CHANGED_EVENT, { detail: { slices } }));
}

export function subscribeConfigurationMasterChanged(
  handler: (slices: ConfigSliceKey[]) => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (event: Event) => {
    const slices = (event as CustomEvent<{ slices: ConfigSliceKey[] }>).detail?.slices;
    if (slices?.length) handler(slices);
  };
  window.addEventListener(CONFIG_MASTER_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CONFIG_MASTER_CHANGED_EVENT, listener);
}
