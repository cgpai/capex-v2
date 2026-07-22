import type { AuditLog } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';

async function resolveToken(): Promise<string | null> {
  return resolveMyTasksAccessToken(getAccessTokenForBackend);
}

export async function fetchAuditLogsForEntityFromBackend(
  userId: number,
  entityId: string,
  accessToken?: string | null,
): Promise<AuditLog[] | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('audit.listForEntity', 'fallback', { reason: 'missing_base_url' });
    return null;
  }
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    const data = await postToCapexBe<{ logs?: AuditLog[] }>(
      '/audit/list-for-entity',
      { userId, entityId },
      token,
    );
    trackBackendFetch('audit.listForEntity', 'success');
    return Array.isArray(data?.logs) ? data.logs : [];
  } catch {
    trackBackendFetch('audit.listForEntity', 'fallback', { reason: 'http_error' });
    return null;
  }
}

export async function saveAuditLogsBatchViaBackend(
  userId: number,
  logs: AuditLog[],
  accessToken?: string | null,
): Promise<boolean> {
  if (!isCapexBeConfigured() || !logs.length) return false;
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    await postToCapexBe('/audit/save-batch', { userId, logs }, token);
    trackBackendFetch('audit.saveBatch', 'success');
    return true;
  } catch {
    trackBackendFetch('audit.saveBatch', 'fallback', { reason: 'http_error' });
    return false;
  }
}
