import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { ACCESS_COOKIE } from './auth.constants';
import { parseCookies } from './cookie.util';

/** Read backend access JWT from Authorization header or httpOnly cookie. */
export function getAccessTokenFromRequest(req: Request): string | undefined {
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    const bearer = auth.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ACCESS_COOKIE]?.trim() || undefined;
}

export function requireAccessTokenFromRequest(req: Request): string {
  const token = getAccessTokenFromRequest(req);
  if (!token) {
    throw new UnauthorizedException('Authentication required');
  }
  return token;
}

export function parseBodyUserId(req: Request): number | undefined {
  const body = req.body as { userId?: number } | undefined;
  if (body?.userId != null && Number.isFinite(Number(body.userId))) {
    return Number(body.userId);
  }
  return undefined;
}
