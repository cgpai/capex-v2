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
const MAX_503_RETRIES = 2;
const RETRY_503_DELAY_MS = 700;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * fetch wrapper: on 401 (backend session mode), runs coordinated refresh then retries once.
 * On 503 (BE restarting / unreachable), retries briefly so dev HMR does not flash errors.
 */
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: AuthenticatedFetchOptions,
): Promise<Response> {
  const { retryOn401 = useBackendSession(), ...fetchInit } = init ?? {};

  let attempt401 = 0;
  let attempt503 = 0;
  let lastRes: Response | null = null;

  while (true) {
    const mergedInit = withCsrfHeaders(fetchInit);
    const res = await fetch(input, {
      ...mergedInit,
      credentials: mergedInit.credentials ?? fetchInit.credentials ?? 'include',
    });
    lastRes = res;

    if (res.status === 503 && attempt503 < MAX_503_RETRIES) {
      attempt503 += 1;
      authDebug('fetch 503: retrying', {
        url: typeof input === 'string' ? input : input.toString(),
        attempt: attempt503,
      });
      await delay(RETRY_503_DELAY_MS * attempt503);
      continue;
    }

    if (res.status !== 401 || !retryOn401 || attempt401 >= MAX_401_RETRIES) {
      return res;
    }

    authDebug('fetch 401: attempting refresh', {
      url: typeof input === 'string' ? input : input.toString(),
      attempt: attempt401,
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

    attempt401 += 1;
  }

  return lastRes!;
}
