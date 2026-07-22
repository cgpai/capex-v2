import { Injectable, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Response } from 'express';
import { CSRF_COOKIE, CSRF_HEADER } from './auth.constants';

function cookieOptions(maxAgeSec: number) {
  const secure = process.env.NODE_ENV === 'production';
  return {
    httpOnly: false,
    secure,
    sameSite: 'strict' as const,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
}

@Injectable()
export class CsrfService {
  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  setCsrfCookie(res: Response, token: string, maxAgeSec: number): void {
    res.cookie(CSRF_COOKIE, token, cookieOptions(maxAgeSec));
  }

  clearCsrfCookie(res: Response): void {
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  /**
   * Double-submit cookie validation for state-changing auth requests.
   * Safe methods (GET) skip validation.
   */
  assertValid(
    method: string,
    cookies: Record<string, string>,
    headers: Record<string, string | string[] | undefined>,
  ): void {
    const upper = method.toUpperCase();
    if (upper === 'GET' || upper === 'HEAD' || upper === 'OPTIONS') return;

    const cookieToken = cookies[CSRF_COOKIE]?.trim();
    const headerRaw = headers[CSRF_HEADER.toLowerCase()] ?? headers[CSRF_HEADER];
    const headerToken = (Array.isArray(headerRaw) ? headerRaw[0] : headerRaw)?.trim();

    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('Invalid CSRF token');
    }
  }
}
