import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

export const ACCESS_COOKIE = 'capex_access';
export const REFRESH_COOKIE = 'capex_refresh';

export type EdgeSessionState = 'valid' | 'refreshable' | 'none';

function decodeExpUnsafe(token: string): number | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as {
      exp?: number;
    };
    return typeof payload.exp === 'number' ? payload.exp : null;
  } catch {
    return null;
  }
}

async function verifyAccessToken(access: string): Promise<boolean> {
  const secret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';
  if (secret?.trim()) {
    try {
      const key = new TextEncoder().encode(secret.trim());
      await jwtVerify(access, key, { algorithms: ['HS256'] });
      return true;
    } catch {
      return false;
    }
  }
  if (isProd) return false;
  const exp = decodeExpUnsafe(access);
  if (exp == null) return false;
  return exp * 1000 > Date.now();
}

/** Edge session probe: verify access JWT when secret is set; allow refresh cookie as fallback. */
export async function resolveEdgeSession(req: NextRequest): Promise<EdgeSessionState> {
  const access = req.cookies.get(ACCESS_COOKIE)?.value?.trim();
  const refresh = req.cookies.get(REFRESH_COOKIE)?.value?.trim();

  if (access && (await verifyAccessToken(access))) {
    return 'valid';
  }
  if (refresh) {
    return 'refreshable';
  }
  return 'none';
}

export function edgeSessionPermits(state: EdgeSessionState): boolean {
  return state === 'valid' || state === 'refreshable';
}

/** Data proxy (/api/be) requires verified access JWT — refresh cookie alone is not enough. */
export function edgeSessionPermitsBeProxy(state: EdgeSessionState): boolean {
  return state === 'valid';
}

export function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
