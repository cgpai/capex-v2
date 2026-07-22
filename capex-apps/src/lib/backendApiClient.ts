import { getAccessTokenForBackend } from './authSession';
import { trackBackendFetch } from './backendFetchTelemetry';
import { useBackendSession } from './auth/authConstants';
import { authenticatedFetch } from './auth/authenticatedFetch';

export type PostBackendOptions = {
  /** Telemetry source key, e.g. `fsApproval.bundle` */
  source: string;
  timeoutMs?: number;
  /** When true, missing base URL or token returns null without fetch */
  requireAuth?: boolean;
};

function getBackendBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
}

/**
 * Shared POST helper for NestJS BFF endpoints.
 * Matches existing *Api.ts pattern: Bearer token, JSON body, telemetry, null on failure.
 */
export async function postBackend<T>(
  path: string,
  body: Record<string, unknown>,
  options: PostBackendOptions,
): Promise<T | null> {
  const { source, timeoutMs = 12_000, requireAuth = true } = options;
  const base = getBackendBaseUrl();
  if (!base) {
    trackBackendFetch(source, 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const cookieMode = useBackendSession();
  let accessToken: string | undefined;
  if (requireAuth && !cookieMode) {
    const token = await getAccessTokenForBackend();
    accessToken = token ?? undefined;
    if (!accessToken) {
      trackBackendFetch(source, 'fallback', { reason: 'missing_access_token' });
      return null;
    }
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const url = cookieMode ? `/api/be${path.startsWith('/') ? path : `/${path}`}` : `${base}${path}`;
    const res = await (cookieMode ? authenticatedFetch : fetch)(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      credentials: cookieMode ? 'include' : 'same-origin',
      body: JSON.stringify(body),
      ...(cookieMode ? { retryOn401: true } : {}),
    });

    if (!res.ok) {
      trackBackendFetch(source, 'fallback', { reason: 'http_error', httpStatus: res.status });
      return null;
    }

    trackBackendFetch(source, 'success');
    return (await res.json()) as T;
  } catch {
    trackBackendFetch(source, 'fallback', { reason: 'network_error' });
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function isBackendConfigured(): boolean {
  return Boolean(getBackendBaseUrl());
}
