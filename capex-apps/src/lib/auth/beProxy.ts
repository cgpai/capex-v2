import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { ACCESS_COOKIE, REFRESH_COOKIE } from './authBff';
import { CSRF_COOKIE, CSRF_HEADER } from './authConstants';
import { isAllowedBePath } from './bePathAllowlist';
import {
  applyBackendSetCookies,
  applySetCookiesToResponse,
  authCookieHeaderFromStore,
  collectSetCookies,
} from './authCookies.server';

function backendBase(): string {
  return (process.env.NEXT_PUBLIC_CAPEXBE_URL || process.env.CAPEXBE_URL || '')
    .replace(/\/$/, '')
    .trim();
}

function decodeAccessExp(access: string): number | null {
  try {
    const part = access.split('.')[1];
    if (!part) return null;
    const padded = part + '='.repeat((4 - (part.length % 4)) % 4);
    const payload = JSON.parse(
      Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'),
    ) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

/** When exp cannot be decoded, assume token is still valid — capexbe will reject if not. */
function isAccessExpired(access: string, skewSec = 30): boolean {
  const exp = decodeAccessExp(access);
  if (exp == null) return false;
  return exp * 1000 <= Date.now() + skewSec * 1000;
}

function clearAuthCookiesOnResponse(res: NextResponse): void {
  res.cookies.delete(ACCESS_COOKIE);
  res.cookies.delete(REFRESH_COOKIE);
  res.cookies.delete(CSRF_COOKIE);
}

function sessionExpiredResponse(message = 'Session expired'): NextResponse {
  const out = NextResponse.json({ message }, { status: 401 });
  clearAuthCookiesOnResponse(out);
  return out;
}

/** Only wipe session cookies when BE says the session itself is invalid — not app-level 401s. */
function shouldClearSessionOn401(bodyText: string): boolean {
  try {
    const msg = String((JSON.parse(bodyText) as { message?: unknown }).message ?? '').toLowerCase();
    if (!msg) return true;
    if (msg.includes('invalid userid')) return false;
    if (msg.includes('forbidden')) return false;
    return true;
  } catch {
    return true;
  }
}

function resolveCsrfToken(
  cookieStore: Awaited<ReturnType<typeof cookies>>,
  csrfHeader: string | null,
): string | null {
  const cookieToken = cookieStore.get(CSRF_COOKIE)?.value?.trim();
  if (!cookieToken) return null;
  const headerToken = csrfHeader?.trim();
  if (headerToken && headerToken !== cookieToken) return null;
  return headerToken || cookieToken;
}

async function forwardBePost(
  path: string,
  body: string | ArrayBuffer,
  csrfHeader: string | null,
  contentType?: string | null,
): Promise<Response> {
  const base = backendBase();
  const cookieStore = await cookies();
  const cookieHeader = authCookieHeaderFromStore(cookieStore);

  const headers: Record<string, string> = {};
  if (contentType) {
    headers['Content-Type'] = contentType;
  } else if (typeof body === 'string') {
    headers['Content-Type'] = 'application/json';
  }
  if (cookieHeader) headers.Cookie = cookieHeader;
  const access = cookieStore.get(ACCESS_COOKIE)?.value;
  if (access) {
    headers.Authorization = `Bearer ${access}`;
  }
  const csrf = csrfHeader ?? cookieStore.get(CSRF_COOKIE)?.value;
  if (csrf) headers[CSRF_HEADER] = csrf;

  try {
    return await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      method: 'POST',
      headers,
      body,
      cache: 'no-store',
    });
  } catch (err) {
    const code =
      err != null && typeof err === 'object' && 'cause' in err
        ? String((err as { cause?: { code?: string } }).cause?.code ?? '')
        : '';
    const unreachable =
      code === 'ECONNREFUSED' ||
      code === 'ECONNRESET' ||
      (err instanceof Error && err.message.includes('fetch failed'));
    const message = unreachable
      ? `Backend tidak berjalan di ${base}. Jalankan: cd capexbe && npm run start:dev`
      : 'Backend tidak dapat dihubungi';
    return new Response(JSON.stringify({ message, statusCode: 503 }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function refreshSessionOnServer(): Promise<string[] | null> {
  const base = backendBase();
  if (!base) return null;

  const cookieStore = await cookies();
  if (!cookieStore.get(REFRESH_COOKIE)?.value) return null;

  const cookieHeader = authCookieHeaderFromStore(cookieStore);
  const headers: Record<string, string> = { Cookie: cookieHeader };
  const csrf = cookieStore.get(CSRF_COOKIE)?.value;
  if (csrf) headers[CSRF_HEADER] = csrf;

  const res = await fetch(`${base}/auth/refresh`, {
    method: 'POST',
    headers,
    cache: 'no-store',
  });

  if (!res.ok) return null;

  const setCookies = collectSetCookies(res);
  applyBackendSetCookies(cookieStore, setCookies);
  return setCookies;
}

export async function proxyBePost(
  path: string,
  body: string | ArrayBuffer,
  csrfHeader: string | null,
  contentType?: string | null,
): Promise<NextResponse> {
  const base = backendBase();
  if (!base) {
    return NextResponse.json({ message: 'Backend not configured' }, { status: 503 });
  }

  if (!isAllowedBePath(path)) {
    return NextResponse.json({ message: 'Forbidden path' }, { status: 403 });
  }

  const cookieStore = await cookies();
  const hasSession = Boolean(
    cookieStore.get(ACCESS_COOKIE)?.value || cookieStore.get(REFRESH_COOKIE)?.value,
  );
  if (!hasSession) {
    return NextResponse.json({ message: 'Authentication required' }, { status: 401 });
  }

  if (!resolveCsrfToken(cookieStore, csrfHeader)) {
    return NextResponse.json({ message: 'Invalid CSRF token' }, { status: 403 });
  }

  const csrfToken = resolveCsrfToken(cookieStore, csrfHeader)!;

  let refreshSetCookies: string[] | null = null;
  const access = cookieStore.get(ACCESS_COOKIE)?.value;
  const hasRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value?.trim());
  if ((!access || isAccessExpired(access)) && hasRefresh) {
    refreshSetCookies = await refreshSessionOnServer();
    if (!refreshSetCookies) {
      return sessionExpiredResponse();
    }
  }

  let res = await forwardBePost(path, body, csrfToken, contentType);
  if (res.status === 503) {
    const text = await res.text();
    return new NextResponse(text, {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (res.status === 401 && refreshSetCookies === null && hasRefresh) {
    refreshSetCookies = await refreshSessionOnServer();
    if (refreshSetCookies) {
      res = await forwardBePost(path, body, csrfToken, contentType);
    } else {
      const out = sessionExpiredResponse();
      return out;
    }
  }

  const text = await res.text();
  const out = new NextResponse(text, {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });

  if (refreshSetCookies?.length) {
    applySetCookiesToResponse(out, refreshSetCookies);
  }

  if (res.status === 401 && refreshSetCookies === null && shouldClearSessionOn401(text)) {
    clearAuthCookiesOnResponse(out);
  }

  return out;
}
