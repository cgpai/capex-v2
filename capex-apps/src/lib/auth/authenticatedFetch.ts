import { useBackendSession } from './authConstants';
import { coordinatedRefreshSession } from './authRefreshCoordinator';
import { authDebug } from './authDebug';
import { isBackendSessionValid } from './sessionValidity';
import { withCsrfHeaders } from './csrfToken';

export type AuthenticatedFetchOptions = RequestInit & {
  /** Retry once after refresh on 401. Default true when backend session is enabled. */
  retryOn401?: boolean;
};

const MAX_401_RETRIES = 1;

/**
 * fetch wrapper: on 401 (backend session mode), runs coordinated refresh then retries once.
 * Prevents infinite loops via MAX_401_RETRIES.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: AuthenticatedFetchOptions,
): Promise<Response> {
  const { retryOn401 = useBackendSession(), ...fetchInit } = init ?? {};

  let attempt = 0;
  let lastRes: Response | null = null;

  while (attempt <= MAX_401_RETRIES) {
    const mergedInit = withCsrfHeaders(fetchInit);
    const res = await fetch(input, {
      ...mergedInit,
      credentials: mergedInit.credentials ?? fetchInit.credentials ?? 'include',
    });
    lastRes = res;

    if (res.status !== 401 || !retryOn401 || attempt >= MAX_401_RETRIES) {
      return res;
    }

    authDebug('fetch 401: attempting refresh', {
      url: typeof input === 'string' ? input : input.toString(),
      attempt,
    });

    const refreshed = await coordinatedRefreshSession();
    if (!refreshed) {
      const stillValid = await isBackendSessionValid();
      if (!stillValid) {
        authDebug('fetch 401: session invalid — cleanup');
        const { invalidateStaleAuthCookies, invalidateAuthProbeCache, clearServerAuthCookies } =
          await import('./authApi');
        invalidateStaleAuthCookies();
        invalidateAuthProbeCache();
        void clearServerAuthCookies();
        const { useAuthStore } = await import('../../stores/authStore');
        if (useAuthStore.getState().status === 'authenticated') {
          const { notifyAuthFailure } = await import('./authFailureHandler');
          notifyAuthFailure();
        }
      } else {
        authDebug('fetch 401: refresh failed but /me still valid — keep session');
      }
      return res;
    }

    attempt += 1;
  }

  return lastRes!;
}
