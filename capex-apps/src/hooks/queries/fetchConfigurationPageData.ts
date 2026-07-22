import { getAccessTokenForBackend } from '@/lib/authSession';
import { fetchConfigurationSlicesForUser } from '@/hooks/queries/fetchConfigurationSlices';
import {
  CONFIGURATION_SLICE_KEYS,
  fetchConfigurationPackFromBackend,
  isCompleteConfigurationPack,
  type ConfigurationDataPack,
} from '@/services/configurationApi';
import {
  buildSeedFromBootstrap,
  mergeConfigurationPack,
  toRenderableConfigurationPack,
} from '@/features/configuration/core/configurationPageUtils';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';

export type { ConfigurationDataPack };

/** Muat seluruh paket (prefetch / invalidasi penuh). */
export async function fetchConfigurationPageData(
  userId: number,
  bootstrapSeed?: Partial<ConfigurationDataPack>,
): Promise<ConfigurationDataPack> {
  const seed = bootstrapSeed ?? {};
  if (isCapexBeConfigured()) {
    const token = useBackendSession()
      ? null
      : await getAccessTokenForBackend();
    if (useBackendSession() || token) {
      const pack = await fetchConfigurationPackFromBackend(token, userId);
      if (pack && isCompleteConfigurationPack(pack)) {
        return toRenderableConfigurationPack(mergeConfigurationPack(seed, pack));
      }
    }
  }

  const partial = await fetchConfigurationSlicesForUser(userId, [...CONFIGURATION_SLICE_KEYS]);
  const merged = mergeConfigurationPack(seed, partial);
  if (isCompleteConfigurationPack(merged)) {
    return toRenderableConfigurationPack(merged);
  }

  throw new Error('Gagal memuat paket konfigurasi dari backend.');
}

export function buildConfigurationPageSeedFromBootstrap(
  bootstrap: AppBootstrapPayload | undefined,
): Partial<ConfigurationDataPack> {
  return buildSeedFromBootstrap(bootstrap);
}
