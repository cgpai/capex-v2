import { Injectable } from '@nestjs/common';
import { perfCacheDelete, perfCacheGet, perfCacheSet } from './perf-cache';

type ProcessEntry = { data: unknown; expiresAt: number };

@Injectable()
export class CacheAsideService {
  private readonly processCache = new Map<string, ProcessEntry>();
  private readonly inflight = new Map<string, Promise<unknown>>();

  getFromProcess<T>(key: string): T | null {
    const hit = this.processCache.get(key);
    if (!hit) return null;
    if (Date.now() > hit.expiresAt) {
      this.processCache.delete(key);
      return null;
    }
    return hit.data as T;
  }

  setProcess(key: string, data: unknown, ttlMs: number): void {
    this.processCache.set(key, { data, expiresAt: Date.now() + ttlMs });
  }

  async getShared<T>(key: string): Promise<T | null> {
    return perfCacheGet<T>(key);
  }

  async setShared(key: string, data: unknown, ttlMs: number): Promise<void> {
    await perfCacheSet(key, data, ttlMs);
  }

  async invalidate(key: string): Promise<void> {
    this.processCache.delete(key);
    this.inflight.delete(key);
    await perfCacheDelete(key);
  }

  async invalidateByPrefix(prefix: string): Promise<void> {
    for (const key of [...this.processCache.keys()]) {
      if (key.startsWith(prefix)) this.processCache.delete(key);
    }
    for (const key of [...this.inflight.keys()]) {
      if (key.startsWith(prefix)) this.inflight.delete(key);
    }
    await perfCacheDelete(prefix);
  }

  async dedupe<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const existing = this.inflight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const promise = loader().finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, promise);
    return promise;
  }

  /**
   * Process memory → shared Redis → loader, with inflight coalescing.
   */
  async getOrLoad<T>(
    key: string,
    ttlMs: number,
    loader: () => Promise<T>,
    options?: { skipCache?: boolean },
  ): Promise<T> {
    if (!options?.skipCache) {
      const processHit = this.getFromProcess<T>(key);
      if (processHit !== null) return processHit;

      const sharedHit = await this.getShared<T>(key);
      if (sharedHit !== null) {
        this.setProcess(key, sharedHit, ttlMs);
        return sharedHit;
      }
    }

    return this.dedupe(key, async () => {
      const value = await loader();
      this.setProcess(key, value, ttlMs);
      await this.setShared(key, value, ttlMs);
      return value;
    });
  }
}
