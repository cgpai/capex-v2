import type { AssetTagConfig } from '@/types';
import type { ProjectListBundle } from '@/services/capexProjectListApi';
import { projectListFiltersCacheKey } from '@/hooks/queries/fetchCapexProjectListQuery';
import type { ProjectListQueryParams } from '@/services/projectListQueryTypes';

export type BddConstructionTableBundle = ProjectListBundle & {
  tags: AssetTagConfig[];
};

const TABLE_PREFIX = 'bddConstructionTableCache:v1';
const TABLE_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = { savedAt: number; payload: T };

function tableCacheKey(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): string {
  return `${TABLE_PREFIX}:${periodName}:${userId}:${filtersKey}:${page}:${pageSize}`;
}

function readEnvelope<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      return JSON.parse(raw) as CacheEnvelope<T>;
    } catch {
      /* ignore */
    }
  }
  return null;
}

function writeEnvelope<T>(key: string, envelope: CacheEnvelope<T>): void {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.setItem(key, JSON.stringify(envelope));
    } catch {
      /* quota */
    }
  }
}

export function bddConstructionFiltersCacheKey(params: ProjectListQueryParams): string {
  return projectListFiltersCacheKey(params);
}

export function readBddConstructionTableCacheAnyAge(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): BddConstructionTableBundle | null {
  const key = tableCacheKey(periodName, userId, filtersKey, page, pageSize);
  const env = readEnvelope<BddConstructionTableBundle>(key);
  return env?.payload ?? null;
}

export function readBddConstructionTableCache(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): BddConstructionTableBundle | null {
  const key = tableCacheKey(periodName, userId, filtersKey, page, pageSize);
  const env = readEnvelope<BddConstructionTableBundle>(key);
  if (!env?.savedAt || Date.now() - env.savedAt > TABLE_TTL_MS) return null;
  return env.payload;
}

export function writeBddConstructionTableCache(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
  bundle: BddConstructionTableBundle,
): void {
  const key = tableCacheKey(periodName, userId, filtersKey, page, pageSize);
  writeEnvelope(key, { savedAt: Date.now(), payload: bundle });
}

export function invalidateBddConstructionTableCache(periodName: string, userId: number): void {
  if (typeof window === 'undefined') return;
  const prefix = `${TABLE_PREFIX}:${periodName}:${userId}:`;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* ignore */
    }
  }
}
