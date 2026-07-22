export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';
export const CSRF_COOKIE = 'capex_csrf';
export const CSRF_HEADER = 'X-CSRF-Token';
export const OAUTH_PKCE_COOKIE = 'capex_oauth_pkce';
export const OAUTH_RETURN_COOKIE = 'capex_oauth_return';

/** Inactivity / tab-hidden logout (mirrors backend idle timeout). */
export const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;
export const TAB_HIDDEN_TIMEOUT_MS = IDLE_TIMEOUT_MS;
/** Refresh access token 15 min before 3h access JWT expires. */
export const SESSION_REFRESH_INTERVAL_MS = 3 * 60 * 60 * 1000 - 15 * 60 * 1000;

/** Use backend httpOnly session (recommended). */
export function useBackendSession(): boolean {
  const flag = process.env.NEXT_PUBLIC_USE_BACKEND_SESSION;
  if (flag === 'false') return false;
  if (flag === 'true') return true;
  return Boolean(process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim());
}

/** Azure Entra ID SSO via backend OAuth (enabled by default). */
export function isAzureSsoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENABLE_AZURE_SSO !== 'false';
}
