import { getAccessTokenForBackend } from '@/lib/authSession';
import { withRequestCache } from '@/lib/requestCache';
import {
  fetchConfigurationSlicesFromBackend,
  fetchFreshConfigurationSlices,
  type ConfigSliceKey,
  type ConfigurationDataPack,
} from '@/services/configurationApi';
import { isUserManagedConfigurationSlice } from '@/features/configuration/core/configurationPageUtils';
import { isCapexBeConfigured } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';

async function fetchSlicesFromBackendWhenAvailable(
  userId: number,
  slices: ConfigSliceKey[],
): Promise<Partial<ConfigurationDataPack> | null> {
  if (!isCapexBeConfigured()) return null;
  const token = useBackendSession() ? null : await getAccessTokenForBackend();
  if (!useBackendSession() && !token) return null;
  return fetchConfigurationSlicesFromBackend(token, userId, slices);
}

/** Ambil slice tertentu saja (paralel di backend). */
export async function fetchConfigurationSlicesForUser(
  userId: number,
  slices: ConfigSliceKey[],
): Promise<Partial<ConfigurationDataPack>> {
  const unique = [...new Set(slices)].sort();
  if (!unique.length) return {};

  if (unique.some(isUserManagedConfigurationSlice)) {
    const fromBe = await fetchSlicesFromBackendWhenAvailable(userId, unique);
    if (fromBe && unique.every((k) => Array.isArray(fromBe[k]))) {
      return fromBe;
    }
    const token = useBackendSession() ? null : (await getAccessTokenForBackend()) ?? null;
    return fetchFreshConfigurationSlices(token, userId, unique);
  }

  const cacheKey = `configuration:slices:${userId}:${unique.join(',')}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const fromBe = await fetchSlicesFromBackendWhenAvailable(userId, unique);
      if (fromBe && Object.keys(fromBe).length) {
        return fromBe;
      }
      return {};
    },
    30_000,
  );
}
