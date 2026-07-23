import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { isDemoMode } from '../shared/demo-mode.util';

type Bucket = { count: number; resetAt: number };

export type AuthRateLimitAction =
  | 'login'
  | 'exchange'
  | 'refresh'
  | 'heartbeat'
  | 'forgot_password';

const DEMO_LIMITS: Record<AuthRateLimitAction, { max: number; windowMs: number }> = {
  login: { max: 40, windowMs: 15 * 60 * 1000 },
  exchange: { max: 40, windowMs: 15 * 60 * 1000 },
  refresh: { max: 120, windowMs: 15 * 60 * 1000 },
  heartbeat: { max: 240, windowMs: 15 * 60 * 1000 },
  forgot_password: { max: 10, windowMs: 60 * 60 * 1000 },
};

const LIMITS: Record<AuthRateLimitAction, { max: number; windowMs: number }> = {
  login: { max: 8, windowMs: 15 * 60 * 1000 },
  exchange: { max: 20, windowMs: 15 * 60 * 1000 },
  refresh: { max: 60, windowMs: 15 * 60 * 1000 },
  heartbeat: { max: 120, windowMs: 15 * 60 * 1000 },
  forgot_password: { max: 2, windowMs: 60 * 60 * 1000 },
};

function limitsFor(action: AuthRateLimitAction): { max: number; windowMs: number } {
  return isDemoMode() ? DEMO_LIMITS[action] : LIMITS[action];
}

/**
 * In-memory sliding-window rate limiter for auth endpoints.
 * Key format: `${action}:${ip}:${identifier?}`.
 */
@Injectable()
export class AuthRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();

  assertAllowed(action: AuthRateLimitAction, key: string): void {
    const { max, windowMs } = limitsFor(action);
    const now = Date.now();
    const bucketKey = `${action}:${key}`;
    let bucket = this.buckets.get(bucketKey);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      this.buckets.set(bucketKey, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      throw new HttpException(
        'Too many requests. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
