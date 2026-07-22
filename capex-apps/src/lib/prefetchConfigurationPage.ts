import type { QueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { fetchConfigurationSlicesForUser } from '@/hooks/queries/fetchConfigurationSlices';
import { queryKeys } from '@/lib/query-keys';
import type { ConfigurationDataPack } from '@/services/configurationApi';
import {
  readConfigurationPackCacheAnyAge,
  writeConfigurationPackCache,
} from '@/lib/configurationDiskCache';
import {
  buildSeedFromBootstrap,
  getMissingSlices,
  INITIAL_CRITICAL_SLICES,
  mergeConfigurationPack,
} from '@/features/configuration/core/configurationPageUtils';

const CONFIG_STALE_MS = 5 * 60 * 1000;

/** Hydrate TanStack Query dari disk — paint instan setelah F5. */
export function hydrateConfigurationFromDisk(queryClient: QueryClient, userId: number): boolean {
  if (!Number.isFinite(userId)) return false;
  const disk = readConfigurationPackCacheAnyAge(userId);
  if (!disk) return false;
  const boot = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap);
  const merged = mergeConfigurationPack(buildSeedFromBootstrap(boot), disk);
  queryClient.setQueryData(queryKeys.configuration.page(userId), merged);
  return true;
}

/** Warm cache konfigurasi (slice kritis) — dipanggil saat hover/nav ke halaman Configuration. */
export function prefetchConfigurationPageCritical(
  queryClient: QueryClient,
  userId: number,
): void {
  const qk = queryKeys.configuration.page(userId);
  hydrateConfigurationFromDisk(queryClient, userId);

  const existingState = queryClient.getQueryState(qk);
  if (
    existingState?.dataUpdatedAt &&
    Date.now() - existingState.dataUpdatedAt < CONFIG_STALE_MS &&
    queryClient.getQueryData(qk)
  ) {
    return;
  }

  const boot = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap);
  const seed = mergeConfigurationPack(
    buildSeedFromBootstrap(boot),
    readConfigurationPackCacheAnyAge(userId) ?? undefined,
  );

  void queryClient.prefetchQuery({
    queryKey: qk,
    staleTime: CONFIG_STALE_MS,
    queryFn: async (): Promise<Partial<ConfigurationDataPack>> => {
      const missing = getMissingSlices(seed, INITIAL_CRITICAL_SLICES);
      const partial = missing.length
        ? await fetchConfigurationSlicesForUser(userId, missing)
        : {};
      const merged = mergeConfigurationPack(seed, partial);
      writeConfigurationPackCache(userId, merged);
      return merged;
    },
  });
}
