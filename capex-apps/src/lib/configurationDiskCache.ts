import type { ConfigurationDataPack } from '@/services/configurationApi';
import { readCachedAuthUser } from '@/lib/authSessionCache';
import {
  isMinimalConfigurationReady,
  mergeConfigurationPack,
} from '@/features/configuration/core/configurationPageUtils';

const PACK_PREFIX = 'capexConfigurationPackCache:v1';

/** Table-ish slices — background revalidate after 5m. */
const PACK_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = { savedAt: number; payload: T };

function packKey(userId: number) {
  return `${PACK_PREFIX}:${userId}`;
}

function readEnvelope<T>(storage: Storage | undefined, key: string): CacheEnvelope<T> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEnvelope<T>;
  } catch {
    return null;
  }
}

function writeEnvelope<T>(storage: Storage | undefined, key: string, envelope: CacheEnvelope<T>): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    /* quota */
  }
}

function readFromStorages<T>(key: string): CacheEnvelope<T> | null {
  if (typeof window === 'undefined') return null;
  const fromSession = readEnvelope<T>(window.sessionStorage, key);
  if (fromSession) return fromSession;
  const fromLocal = readEnvelope<T>(window.localStorage, key);
  if (fromLocal) {
    writeEnvelope(window.sessionStorage, key, fromLocal);
    return fromLocal;
  }
  return null;
}

function writeToStorages<T>(key: string, payload: T): void {
  if (typeof window === 'undefined') return;
  const envelope = { savedAt: Date.now(), payload };
  writeEnvelope(window.sessionStorage, key, envelope);
  writeEnvelope(window.localStorage, key, envelope);
}

function isFresh(savedAt: number, ttlMs: number): boolean {
  return !!savedAt && Date.now() - savedAt <= ttlMs;
}

export function readConfigurationPackCache(userId: number): Partial<ConfigurationDataPack> | null {
  const env = readFromStorages<Partial<ConfigurationDataPack>>(packKey(userId));
  if (!env || !isFresh(env.savedAt, PACK_TTL_MS)) return null;
  return env.payload;
}

/** Instant paint on F5 — may be slightly stale until background revalidate. */
export function readConfigurationPackCacheAnyAge(userId: number): Partial<ConfigurationDataPack> | null {
  const env = readFromStorages<Partial<ConfigurationDataPack>>(packKey(userId));
  return env?.payload ?? null;
}

export function writeConfigurationPackCache(
  userId: number,
  pack: Partial<ConfigurationDataPack>,
  options?: { replace?: boolean },
): void {
  if (!Number.isFinite(userId)) return;
  const toWrite = options?.replace
    ? pack
    : mergeConfigurationPack(readConfigurationPackCacheAnyAge(userId), pack);
  writeToStorages(packKey(userId), toWrite);
}

export function hasMinimalConfigurationOnDisk(userId: number): boolean {
  return isMinimalConfigurationReady(readConfigurationPackCacheAnyAge(userId));
}

export function readInitialConfigurationPackForShell(): Partial<ConfigurationDataPack> | null {
  if (typeof window === 'undefined') return null;
  const user = readCachedAuthUser();
  if (!user?.id) return null;
  return readConfigurationPackCacheAnyAge(user.id);
}

export function invalidateConfigurationDiskCache(userId?: number): void {
  if (typeof window === 'undefined') return;
  const prefix = userId != null ? packKey(userId) : PACK_PREFIX;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(prefix)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}
