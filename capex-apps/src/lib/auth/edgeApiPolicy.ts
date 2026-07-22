import type { NextRequest } from 'next/server';
import { CSRF_COOKIE, CSRF_HEADER } from './authConstants';
import { isAllowedBePath } from './bePathAllowlist';

/** Unauthenticated auth endpoints (rate-limited separately). */
export const AUTH_PUBLIC_PREFIXES = [
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/clear-cookies',
  '/api/auth/exchange',
  '/api/auth/forgot-password',
  '/api/auth/azure',
  '/api/auth/me',
] as const;

/** Auth endpoints that require a session cookie / valid edge JWT. */
export const AUTH_SESSION_PREFIXES = [
  '/api/auth/logout',
  '/api/auth/heartbeat',
  '/api/auth/change-password',
] as const;

export const PROTECTED_API_PREFIXES = ['/api/be'] as const;

export const PUBLIC_PAGE_EXACT = new Set(['/sabet']);

export type ApiRouteClass = 'public' | 'session' | 'deny' | 'page';

export function classifyApiRoute(pathname: string): ApiRouteClass {
  if (AUTH_PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return 'public';
  if (AUTH_SESSION_PREFIXES.some((p) => pathname.startsWith(p))) return 'session';
  if (PROTECTED_API_PREFIXES.some((p) => pathname.startsWith(p))) return 'session';
  if (pathname.startsWith('/api/')) return 'deny';
  return 'page';
}

export function extractBeProxyPath(pathname: string): string | null {
  if (!pathname.startsWith('/api/be/')) return null;
  const segment = pathname.slice('/api/be/'.length);
  if (!segment) return null;
  return `/${segment}`;
}

export function hasCsrfCookie(req: NextRequest): boolean {
  return Boolean(req.cookies.get(CSRF_COOKIE)?.value?.trim());
}

export function csrfHeaderMatchesCookie(req: NextRequest): boolean {
  const cookie = req.cookies.get(CSRF_COOKIE)?.value?.trim();
  if (!cookie) return false;
  const header = req.headers.get(CSRF_HEADER)?.trim();
  if (!header) return false;
  return header === cookie;
}

export function validateBeProxyRequest(req: NextRequest): { ok: true } | { ok: false; status: number; message: string } {
  if (req.method !== 'POST') {
    return { ok: false, status: 405, message: 'Method not allowed' };
  }

  const bePath = extractBeProxyPath(req.nextUrl.pathname);
  if (!bePath) {
    return { ok: false, status: 404, message: 'Not found' };
  }

  if (!isAllowedBePath(bePath)) {
    return { ok: false, status: 403, message: 'Forbidden path' };
  }

  if (!hasCsrfCookie(req)) {
    return { ok: false, status: 403, message: 'Invalid CSRF token' };
  }

  if (!csrfHeaderMatchesCookie(req)) {
    return { ok: false, status: 403, message: 'Invalid CSRF token' };
  }

  return { ok: true };
}
