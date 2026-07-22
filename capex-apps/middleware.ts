import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  AUTH_PUBLIC_PREFIXES,
  classifyApiRoute,
  PUBLIC_PAGE_EXACT,
  validateBeProxyRequest,
} from '@/lib/auth/edgeApiPolicy';
import { checkEdgeRateLimit } from '@/lib/auth/edgeRateLimit';
import {
  clientIp,
  edgeSessionPermits,
  edgeSessionPermitsBeProxy,
  resolveEdgeSession,
} from '@/lib/auth/edgeSession';
import { isDemoMode } from '@/lib/auth/demoMode';
import { requestIpAllowed } from '@/lib/auth/ipAllowlist';

const AUTH_RATE_LIMITS: Record<string, { max: number; windowMs: number }> = {
  '/api/auth/login': { max: 8, windowMs: 15 * 60 * 1000 },
  '/api/auth/forgot-password': { max: 2, windowMs: 60 * 60 * 1000 },
  '/api/auth/refresh': { max: 60, windowMs: 15 * 60 * 1000 },
  '/api/auth/exchange': { max: 20, windowMs: 15 * 60 * 1000 },
};

const AUTH_RATE_LIMITS_DEMO: Record<string, { max: number; windowMs: number }> = {
  '/api/auth/login': { max: 40, windowMs: 15 * 60 * 1000 },
  '/api/auth/forgot-password': { max: 10, windowMs: 60 * 60 * 1000 },
  '/api/auth/refresh': { max: 120, windowMs: 15 * 60 * 1000 },
  '/api/auth/exchange': { max: 40, windowMs: 15 * 60 * 1000 },
};

const BE_PROXY_LIMIT = { max: 180, windowMs: 60 * 1000 };

function isPublicPage(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PAGE_EXACT.has(pathname);
}

function isBackendSessionEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_USE_BACKEND_SESSION !== 'false' &&
    Boolean(process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim())
  );
}

function attachRequestId(res: NextResponse, req: NextRequest): NextResponse {
  const existing = req.headers.get('x-request-id');
  const id = existing?.trim() || crypto.randomUUID();
  res.headers.set('x-request-id', id);
  return res;
}

function jsonError(status: number, message: string): NextResponse {
  return NextResponse.json({ message }, { status });
}

function rateLimitAuthRoute(req: NextRequest): NextResponse | null {
  if (req.method !== 'POST') return null;
  const { pathname } = req.nextUrl;
  const limits = isDemoMode() ? AUTH_RATE_LIMITS_DEMO : AUTH_RATE_LIMITS;
  const rule = limits[pathname];
  if (!rule) return null;

  const ip = clientIp(req);
  const ok = checkEdgeRateLimit(`auth:${pathname}:${ip}`, rule.max, rule.windowMs);
  if (ok) return null;
  return jsonError(429, 'Too many requests. Try again later.');
}

function rateLimitBeProxy(req: NextRequest): NextResponse | null {
  if (req.method !== 'POST') return null;
  const ip = clientIp(req);
  const ok = checkEdgeRateLimit(`be:${ip}`, BE_PROXY_LIMIT.max, BE_PROXY_LIMIT.windowMs);
  if (ok) return null;
  return jsonError(429, 'Too many requests. Try again later.');
}

/**
 * Edge middleware — Layer 1 only. AuthZ stays in capexbe Guards.
 */
export async function middleware(req: NextRequest) {
  const isProd = process.env.NODE_ENV === 'production';
  const { pathname } = req.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon')) {
    return NextResponse.next();
  }

  if (!requestIpAllowed(req)) {
    return attachRequestId(jsonError(403, 'Forbidden'), req);
  }

  if (!isBackendSessionEnabled()) {
    if (isProd) {
      return attachRequestId(jsonError(503, 'Backend session is required in production'), req);
    }
    return attachRequestId(NextResponse.next(), req);
  }

  const authLimited = rateLimitAuthRoute(req);
  if (authLimited) return attachRequestId(authLimited, req);

  const routeClass = classifyApiRoute(pathname);

  if (routeClass === 'public') {
    return attachRequestId(NextResponse.next(), req);
  }

  if (routeClass === 'deny') {
    return attachRequestId(jsonError(404, 'Not found'), req);
  }

  const session = await resolveEdgeSession(req);

  if (routeClass === 'session') {
    const beProxy = pathname.startsWith('/api/be');
    const permitted = beProxy
      ? edgeSessionPermitsBeProxy(session)
      : edgeSessionPermits(session);

    if (!permitted) {
      return attachRequestId(jsonError(401, 'Authentication required'), req);
    }

    if (beProxy) {
      const beLimited = rateLimitBeProxy(req);
      if (beLimited) return attachRequestId(beLimited, req);

      const beCheck = validateBeProxyRequest(req);
      if (!beCheck.ok) {
        return attachRequestId(jsonError(beCheck.status, beCheck.message), req);
      }
    }

    return attachRequestId(NextResponse.next(), req);
  }

  const pagePermitted = edgeSessionPermits(session);
  if (!pagePermitted && !isPublicPage(pathname)) {
    const url = req.nextUrl.clone();
    url.pathname = '/';
    return attachRequestId(NextResponse.redirect(url), req);
  }

  return attachRequestId(NextResponse.next(), req);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};

/** @deprecated use AUTH_PUBLIC_PREFIXES — kept for tests/docs */
export const PUBLIC_PREFIXES = AUTH_PUBLIC_PREFIXES;
