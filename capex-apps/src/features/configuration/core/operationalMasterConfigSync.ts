import type { QueryClient } from '@tanstack/react-query';
import type { ConfigSliceKey, ConfigurationDataPack } from '@/services/configurationApi';
import { fetchFreshConfigurationSlices } from '@/services/configurationApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import { mergeConfigurationPack } from '@/features/configuration/core/configurationPageUtils';
import { writeConfigurationPackCache } from '@/lib/configurationDiskCache';
import {
  invalidateConfigurationMasterRequestCaches,
  subscribeConfigurationMasterChanged,
} from '@/lib/configurationCacheSync';

/** Master slices dipakai form operasional (Capex List, export, dll.). */
export const OPERATIONAL_MASTER_SLICES: ConfigSliceKey[] = [
  'budgetCategories',
  'assetTypeConfigs',
  'assetTypeGroups',
];

export function operationalSlicesTouched(slices: ConfigSliceKey[]): boolean {
  return slices.some((s) => OPERATIONAL_MASTER_SLICES.includes(s));
}

export function matchesConfigurationPackQueryKey(queryKey: unknown, userId: number): boolean {
  return (
    Array.isArray(queryKey) &&
    queryKey[0] === 'screen' &&
    queryKey[1] === 'configuration' &&
    queryKey[2] === userId
  );
}

function operationalSlicesComplete(pack: Partial<ConfigurationDataPack> | undefined): boolean {
  return OPERATIONAL_MASTER_SLICES.every((s) => Array.isArray(pack?.[s]));
}

/**
 * Muat / perbarui slice operasional ke configuration pack (satu cache dengan ConfigurationPage).
 * Data fresh from backend — not from a browser database client.
 */
export async function ensureOperationalMasterConfigPack(
  queryClient: QueryClient,
  userId: number,
  options?: { force?: boolean },
): Promise<Partial<ConfigurationDataPack>> {
  const packKey = queryKeys.configuration.page(userId);
  const existing = queryClient.getQueryData<Partial<ConfigurationDataPack>>(packKey);

  if (!options?.force && operationalSlicesComplete(existing)) {
    return existing ?? {};
  }

  invalidateConfigurationMasterRequestCaches();

  const fresh = await fetchFreshConfigurationSlices(
    (await getAccessTokenForBackend()) ?? null,
    userId,
    OPERATIONAL_MASTER_SLICES,
  );

  const merged = mergeConfigurationPack(existing, fresh);
  queryClient.setQueryData(packKey, merged);
  writeConfigurationPackCache(userId, merged, { replace: true });
  return merged;
}

export function readOperationalMasterFromPack(
  queryClient: QueryClient,
  userId: number,
): {
  categories: ConfigurationDataPack['budgetCategories'];
  assetTypes: ConfigurationDataPack['assetTypeConfigs'];
  assetTypeGroups: ConfigurationDataPack['assetTypeGroups'];
} {
  const pack = queryClient.getQueryData<Partial<ConfigurationDataPack>>(
    queryKeys.configuration.page(userId),
  );
  return {
    categories: pack?.budgetCategories ?? [],
    assetTypes: pack?.assetTypeConfigs ?? [],
    assetTypeGroups: pack?.assetTypeGroups ?? [],
  };
}

export function subscribeOperationalMasterConfig(
  queryClient: QueryClient,
  userId: number,
  onChange: () => void,
): () => void {
  const unsubEvent = subscribeConfigurationMasterChanged((slices) => {
    if (!operationalSlicesTouched(slices)) return;
    const pack = queryClient.getQueryData<Partial<ConfigurationDataPack>>(
      queryKeys.configuration.page(userId),
    );
    if (operationalSlicesComplete(pack)) {
      onChange();
      return;
    }
    void ensureOperationalMasterConfigPack(queryClient, userId, { force: true }).then(() => onChange());
  });

  const unsubCache = queryClient.getQueryCache().subscribe((event) => {
    if (event?.type !== 'updated') return;
    if (!matchesConfigurationPackQueryKey(event.query.queryKey, userId)) return;
    onChange();
  });

  return () => {
    unsubEvent();
    unsubCache();
  };
}
