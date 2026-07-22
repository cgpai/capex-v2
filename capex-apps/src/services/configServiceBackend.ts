import type { ConfigSliceKey } from './configurationApi';
import { fetchConfigurationSlicesFromBackend } from './configurationApi';
import type { AppConfig } from '../types';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { getAccessTokenForBackend } from '../lib/authSession';
import { getCurrentAppUserIdFromSession } from '../features/configuration/shared/configSession';
import { resolveMyTasksAccessToken } from './myTasksApi';

/** Load one configuration slice via BFF. */
export async function readConfigurationSlice<T>(
  slice: ConfigSliceKey,
  userId?: number | null,
): Promise<T[]> {
  const uid = userId ?? getCurrentAppUserIdFromSession();
  if (uid != null) {
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    const pack = await fetchConfigurationSlicesFromBackend(token, uid, [slice]);
    const rows = pack?.[slice];
    if (Array.isArray(rows)) return rows as T[];
  }
  return [];
}

export async function readAppConfigFromBackend(
  key: string,
  userId?: number | null,
): Promise<AppConfig | null | undefined> {
  const uid = userId ?? getCurrentAppUserIdFromSession();
  if (uid == null || !isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    const body = await postToCapexBe<{ config?: AppConfig | null }>(
      '/configuration/app-config-get',
      { userId: uid, key },
      token,
    );
    return body.config ?? null;
  } catch {
    return undefined;
  }
}

export async function readAppConfigFromDb(_key: string) {
  return undefined;
}
