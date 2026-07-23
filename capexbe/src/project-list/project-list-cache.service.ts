import { Injectable } from '@nestjs/common';
import { perfCacheDelete, perfCacheDeleteByPrefix } from '../shared/perf-cache';
import { CACHE_TTL_MS } from '../shared/cache-keys';

/**
 * Cache-aside invalidation for Capex Project List (full bundle + server-side query pages).
 */
@Injectable()
export class ProjectListCacheService {
  private readonly responseCache = new Map<string, { expiresAt: number }>();
  private readonly inflight = new Set<string>();

  private normPeriod(periodName: string): string {
    return periodName.trim().toLowerCase();
  }

  private fullBundleKey(userId: number, periodName: string): string {
    return `project-list:${userId}::${periodName}`;
  }

  /** Drop in-process + Redis caches for one user/period (call after INSERT/UPDATE/DELETE). */
  async invalidateForPeriod(userId: number, periodName: string): Promise<void> {
    await this.invalidateQueryPagesForPeriod(userId, periodName);
    await this.invalidateBddScanForPeriod(userId, periodName);
    if (process.env.PERF_CACHE_LOG !== '0') {
      console.info(
        `[project-list-cache] invalidate user=${userId} period=${periodName} keys=bundle+query-prefix+bdd-scan`,
      );
    }
  }

  /** Page/query caches only — keeps BDD scan cache for skipCache refetches. */
  async invalidateQueryPagesForPeriod(userId: number, periodName: string): Promise<void> {
    const pn = this.normPeriod(periodName);
    const bundleKey = this.fullBundleKey(userId, periodName);
    this.responseCache.delete(bundleKey);
    this.inflight.delete(bundleKey);
    await perfCacheDelete(bundleKey);
    await perfCacheDeleteByPrefix(`app:table:project-list:query:${userId}:${pn}:`);
    await perfCacheDeleteByPrefix(`app:table:project-list:page:${userId}:${pn}:`);
  }

  async invalidateBddScanForPeriod(userId: number, periodName: string): Promise<void> {
    const pn = this.normPeriod(periodName);
    await perfCacheDeleteByPrefix(`app:table:bdd-construction:scan:${userId}:${pn}:`);
  }

  /** Invalidate all periods for a user (e.g. task update when period unknown). */
  async invalidateForUser(userId: number): Promise<void> {
    for (const key of [...this.responseCache.keys()]) {
      if (key.startsWith(`project-list:${userId}::`)) this.responseCache.delete(key);
    }
    await perfCacheDeleteByPrefix(`app:table:project-list:query:${userId}:`);
    await perfCacheDeleteByPrefix(`project-list:${userId}::`);
    if (process.env.PERF_CACHE_LOG !== '0') {
      console.info(`[project-list-cache] invalidate all periods user=${userId}`);
    }
  }

  registerProcessCacheKey(key: string, ttlMs: number): void {
    this.responseCache.set(key, { expiresAt: Date.now() + ttlMs });
  }

  trackInflight(key: string): void {
    this.inflight.add(key);
  }

  clearInflight(key: string): void {
    this.inflight.delete(key);
  }

  getQueryTtlMs(): number {
    return CACHE_TTL_MS.TABLE;
  }
}
