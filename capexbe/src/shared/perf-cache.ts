type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

export type PerfCacheEvent = 'hit' | 'miss' | 'set' | 'delete' | 'refresh' | 'error';

const memoryCache = new Map<string, CacheEntry>();
let redisClient: any | null = null;
let redisClientPromise: Promise<any | null> | null = null;
let redisHealthy = false;

function pruneMemoryCache(): void {
  const now = Date.now();
  for (const [k, v] of memoryCache.entries()) {
    if (v.expiresAt <= now) {
      memoryCache.delete(k);
    }
  }
}

function logCache(event: PerfCacheEvent, key: string, detail?: string): void {
  if (process.env.PERF_CACHE_LOG === '0') return;
  const msg = detail ? `[perf-cache] ${event} ${key} (${detail})` : `[perf-cache] ${event} ${key}`;
  if (event === 'error') {
    console.warn(msg);
  } else if (process.env.NODE_ENV !== 'production' || process.env.PERF_CACHE_LOG === '1') {
    console.debug(msg);
  }
}

async function connectRedis(): Promise<any | null> {
  if (redisClient && redisHealthy) return redisClient;
  const redisUrl = process.env.REDIS_URL?.trim();
  if (!redisUrl) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { createClient } = require('redis');
    const client = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 3000),
      },
    });
    client.on('error', (err: Error) => {
      redisHealthy = false;
      logCache('error', 'redis', err.message);
    });
    client.on('ready', () => {
      redisHealthy = true;
    });
    await client.connect();
    redisClient = client;
    redisHealthy = true;
    return client;
  } catch (err) {
    logCache('error', 'redis-connect', err instanceof Error ? err.message : 'unknown');
    redisClient = null;
    redisHealthy = false;
    return null;
  }
}

async function getRedisClient(): Promise<any | null> {
  if (redisClientPromise) return redisClientPromise;
  redisClientPromise = connectRedis();
  return redisClientPromise;
}

export async function perfCacheHealthCheck(): Promise<boolean> {
  const redis = await getRedisClient();
  if (!redis) return false;
  try {
    await redis.ping();
    redisHealthy = true;
    return true;
  } catch {
    redisHealthy = false;
    return false;
  }
}

export async function perfCacheGet<T>(key: string): Promise<T | null> {
  pruneMemoryCache();
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) {
    logCache('hit', key, 'memory');
    return mem.value as T;
  }

  const redis = await getRedisClient();
  if (!redis) {
    logCache('miss', key, 'no-redis');
    return null;
  }
  try {
    const raw = await redis.get(key);
    if (!raw) {
      logCache('miss', key, 'redis');
      return null;
    }
    const parsed = JSON.parse(raw) as T;
    memoryCache.set(key, { expiresAt: Date.now() + 60_000, value: parsed });
    logCache('hit', key, 'redis');
    return parsed;
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'get');
    return null;
  }
}

export async function perfCacheSet(key: string, value: unknown, ttlMs: number): Promise<void> {
  const expiresAt = Date.now() + ttlMs;
  memoryCache.set(key, { expiresAt, value });
  logCache('set', key, `${Math.floor(ttlMs / 1000)}s`);

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    const ttlSec = Math.max(1, Math.floor(ttlMs / 1000));
    await redis.set(key, JSON.stringify(value), { EX: ttlSec });
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'set');
  }
}

export async function perfCacheDelete(key: string): Promise<void> {
  memoryCache.delete(key);
  logCache('delete', key);
  const redis = await getRedisClient();
  if (!redis) return;
  try {
    await redis.del(key);
  } catch (err) {
    logCache('error', key, err instanceof Error ? err.message : 'del');
  }
}

/** Invalidate all keys sharing a prefix (memory + Redis SCAN). */
export async function perfCacheDeleteByPrefix(prefix: string): Promise<void> {
  for (const key of [...memoryCache.keys()]) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  logCache('delete', prefix, 'prefix');

  const redis = await getRedisClient();
  if (!redis) return;
  try {
    let cursor = 0;
    do {
      const reply = await redis.scan(cursor, { MATCH: `${prefix}*`, COUNT: 100 });
      cursor = Number(reply.cursor);
      const keys: string[] = reply.keys || [];
      if (keys.length > 0) {
        await redis.del(keys);
      }
    } while (cursor !== 0);
  } catch (err) {
    logCache('error', prefix, err instanceof Error ? err.message : 'scan-del');
  }
}

export async function perfCacheRefresh<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number,
): Promise<T> {
  const value = await fetcher();
  await perfCacheSet(key, value, ttlMs);
  logCache('refresh', key);
  return value;
}
