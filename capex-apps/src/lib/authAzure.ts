/**
 * Azure SSO — browser only redirects to backend OAuth; no Supabase keys in bundle.
 */

export const OAUTH_ERROR_STORAGE_KEY = 'auth_oauth_error';

export const humanizeOAuthError = (raw: string): string => {
  const msg = decodeURIComponent(raw).toLowerCase();
  if (msg.includes('unable to exchange external code')) {
    return 'Konfigurasi Azure belum benar. Periksa Redirect URI di Azure dan provider Azure di Supabase Dashboard.';
  }
  if (msg.includes('error getting user email')) {
    return 'Microsoft tidak mengirim email. Pastikan scope email aktif di provider Azure.';
  }
  if (msg.includes('access_denied')) {
    return 'Login Microsoft dibatalkan atau akun tidak diizinkan mengakses aplikasi ini.';
  }
  return raw;
};

/** PKCE / query callback only — implicit hash tokens are rejected (security). */
export const isOAuthCallbackFromUrl = (): boolean => {
  if (typeof window === 'undefined') return false;
  const queryParams = new URLSearchParams(window.location.search);
  if (queryParams.get('oauth_error')) return true;
  if (queryParams.get('code')) return true;
  if (queryParams.get('error')) return true;
  return false;
};

export const getOAuthErrorFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const queryParams = new URLSearchParams(window.location.search);
  const fromQuery = queryParams.get('oauth_error');
  if (fromQuery?.trim()) return humanizeOAuthError(fromQuery.trim());

  const err = queryParams.get('error_description') || queryParams.get('error');
  return err?.trim() ? humanizeOAuthError(err.trim()) : null;
};

export const clearOAuthParamsFromUrl = (): void => {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.hash = '';
  url.searchParams.delete('oauth_error');
  url.searchParams.delete('code');
  url.searchParams.delete('error');
  url.searchParams.delete('error_description');
  url.searchParams.delete('state');
  const next = `${url.pathname}${url.search}`;
  window.history.replaceState({}, '', next || '/');
};

export const consumeOAuthError = (): string | null => {
  if (typeof window === 'undefined') return null;
  const fromUrl = getOAuthErrorFromUrl();
  if (fromUrl) {
    clearOAuthParamsFromUrl();
    return fromUrl;
  }
  const msg = sessionStorage.getItem(OAUTH_ERROR_STORAGE_KEY);
  if (msg) sessionStorage.removeItem(OAUTH_ERROR_STORAGE_KEY);
  return msg;
};

import { sanitizeOAuthReturnTo } from './auth/oauthReturnTo';

export const signInWithAzure = async (): Promise<{ error: Error | null }> => {
  if (typeof window === 'undefined') {
    return { error: new Error('Login Microsoft hanya tersedia di browser.') };
  }
  const returnTo = encodeURIComponent(sanitizeOAuthReturnTo(window.location.pathname || '/'));
  window.location.assign(`/api/auth/azure/start?returnTo=${returnTo}`);
  return { error: null };
};

/** PKCE callback sets httpOnly cookies server-side; client only surfaces OAuth errors. */
export const probeOAuthCallbackIfPresent = async (): Promise<null> => {
  if (!isOAuthCallbackFromUrl()) return null;
  const urlError = getOAuthErrorFromUrl();
  clearOAuthParamsFromUrl();
  if (urlError && typeof window !== 'undefined') {
    sessionStorage.setItem(OAUTH_ERROR_STORAGE_KEY, urlError);
  }
  return null;
};

export const signOutSupabaseAuth = async (): Promise<void> => {
  /* session cleared via logoutBackend */
};

export const hasSupabaseAuthSession = async (): Promise<boolean> => false;
