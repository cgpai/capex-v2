import { CSRF_COOKIE, CSRF_HEADER } from './authConstants';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Attach CSRF double-submit header for state-changing requests. */
export function withCsrfHeaders(init?: RequestInit): RequestInit {
  const token = readCookie(CSRF_COOKIE);
  if (!token) return init ?? {};
  const headers = new Headers(init?.headers);
  if (!headers.has(CSRF_HEADER)) {
    headers.set(CSRF_HEADER, token);
  }
  return { ...init, headers };
}

export function getCsrfToken(): string | null {
  return readCookie(CSRF_COOKIE);
}

/** Clear readable CSRF cookie when server session is gone (httpOnly cookies cleared via BFF). */
export function clearClientCsrfCookie(): void {
  if (typeof document === 'undefined') return;
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CSRF_COOKIE}=; Max-Age=0; path=/; SameSite=Strict${secure}`;
}
