import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { createHash, randomUUID } from 'crypto';
import {
  ACCESS_TOKEN_TTL_SEC,
  REFRESH_TOKEN_TTL_SEC,
} from './auth.constants';
import type { AuthSessionPayload } from './auth.types';

@Injectable()
export class JwtTokenService {
  private getSecret(): string {
    const secret =
      process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!secret?.trim()) {
      throw new UnauthorizedException('JWT secret not configured');
    }
    return secret.trim();
  }

  signAccess(payload: Omit<AuthSessionPayload, 'iat' | 'exp'>): string {
    return jwt.sign(payload, this.getSecret(), {
      expiresIn: ACCESS_TOKEN_TTL_SEC,
      algorithm: 'HS256',
    });
  }

  verifyAccess(token: string): AuthSessionPayload {
    try {
      const decoded = jwt.verify(token, this.getSecret(), {
        algorithms: ['HS256'],
      }) as unknown as AuthSessionPayload;
      if (!decoded?.sub || !decoded?.authId) {
        throw new UnauthorizedException('Invalid token payload');
      }
      return decoded;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  /** Opaque refresh token stored hashed in DB. */
  createRefreshToken(): { raw: string; hash: string; expiresAt: Date } {
    const raw = randomUUID() + randomUUID();
    const hash = JwtTokenService.hashToken(raw);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000);
    return { raw, hash, expiresAt };
  }

  static hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
