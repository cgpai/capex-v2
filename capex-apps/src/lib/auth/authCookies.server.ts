import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  CSRF_COOKIE,
  OAUTH_PKCE_COOKIE,
  OAUTH_RETURN_COOKIE,
  REFRESH_COOKIE,
} from './authConstants';

/** Cookies forwarded to capexbe auth routes (session + short-lived OAuth PKCE). */
const PROXY_COOKIE_NAMES = new Set([
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  OAUTH_PKCE_COOKIE,
  OAUTH_RETURN_COOKIE,
]);

export function authCookieHeaderFromStore(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
): string {
  return cookieStore
    .getAll()
    .filter((c) => PROXY_COOKIE_NAMES.has(c.name))
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');
}

export function applyBackendSetCookies(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  setCookies: string[],
): void {
  const secure = process.env.NODE_ENV === 'production';
  for (const raw of setCookies) {
    const parts = raw.split(';').map((p) => p.trim());
    const [nameValue, ...attrs] = parts;
    const eq = nameValue.indexOf('=');
    if (eq < 0) continue;
    const name = nameValue.slice(0, eq).trim();
    const value = nameValue.slice(eq + 1).trim();
    if (!PROXY_COOKIE_NAMES.has(name)) continue;

    let maxAge: number | undefined;
    let httpOnly = name !== CSRF_COOKIE;
    for (const a of attrs) {
      const lower = a.toLowerCase();
      if (lower.startsWith('max-age=')) {
        maxAge = Number(lower.slice(8));
      }
      if (lower === 'httponly') {
        httpOnly = true;
      }
    }

    cookieStore.set(name, value, {
      httpOnly,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: Number.isFinite(maxAge) ? maxAge : undefined,
    });
  }
}

export function collectSetCookies(res: Response): string[] {
  return typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : res.headers.get('set-cookie')
      ? [res.headers.get('set-cookie') as string]
      : [];
}

/** Mirror backend Set-Cookie onto a BFF NextResponse for the browser. */
export function applySetCookiesToResponse(res: NextResponse, rawCookies: string[]): void {
  const secure = process.env.NODE_ENV === 'production';
  for (const raw of rawCookies) {
    const parts = raw.split(';').map((p) => p.trim());
    const [nameValue, ...attrs] = parts;
    const eq = nameValue.indexOf('=');
    if (eq < 0) continue;
    const name = nameValue.slice(0, eq).trim();
    const value = nameValue.slice(eq + 1).trim();
    if (!PROXY_COOKIE_NAMES.has(name)) continue;

    let maxAge: number | undefined;
    let httpOnly = name !== CSRF_COOKIE;
    for (const a of attrs) {
      const lower = a.toLowerCase();
      if (lower.startsWith('max-age=')) {
        maxAge = Number(lower.slice(8));
      }
      if (lower === 'httponly') {
        httpOnly = true;
      }
    }

    res.cookies.set(name, value, {
      httpOnly,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: Number.isFinite(maxAge) ? maxAge : undefined,
    });
  }
}
