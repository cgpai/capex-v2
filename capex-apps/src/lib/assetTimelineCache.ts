import type { TimelineItem, UserRole } from '../types';
import { normAssetKey } from './assetKeys';

export type AssetTimelineCacheEntry = {
  items: TimelineItem[];
  roles: UserRole[];
  fetchedAt: number;
};

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, AssetTimelineCacheEntry>();
const inflight = new Map<string, Promise<AssetTimelineCacheEntry | null>>();

export function assetTimelineCacheKey(assetId: string, workflowSetId: string): string {
  return `${normAssetKey(assetId)}::${String(workflowSetId).trim()}`;
}

export function getCachedAssetTimeline(key: string): AssetTimelineCacheEntry | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry;
}

export function setCachedAssetTimeline(key: string, entry: AssetTimelineCacheEntry): void {
  cache.set(key, entry);
}

export function invalidateAssetTimelineCache(assetId?: string): void {
  if (!assetId) {
    cache.clear();
    inflight.clear();
    return;
  }
  const prefix = `${normAssetKey(assetId)}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
  for (const key of inflight.keys()) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

export function getAssetTimelineInflight(key: string): Promise<AssetTimelineCacheEntry | null> | undefined {
  return inflight.get(key);
}

export function setAssetTimelineInflight(
  key: string,
  promise: Promise<AssetTimelineCacheEntry | null>,
): void {
  inflight.set(key, promise);
  void promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key);
  });
}
