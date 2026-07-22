import { Injectable, HttpException, HttpStatus } from '@nestjs/common';

type Bucket = { count: number; resetAt: number };

@Injectable()
export class LoginRateLimiterService {
  private readonly buckets = new Map<string, Bucket>();
  private readonly maxAttempts = 8;
  private readonly windowMs = 15 * 60 * 1000;

  assertAllowed(key: string): void {
    const now = Date.now();
    let bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + this.windowMs };
      this.buckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > this.maxAttempts) {
      throw new HttpException(
        'Too many login attempts. Try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
