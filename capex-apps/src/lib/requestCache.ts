type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Lightweight in-memory request cache with in-flight dedupe.
 * Use for expensive read operations to reduce repeated loading.
 */
export async function withRequestCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs = 30_000,
): Promise<T> {
  const now = Date.now();
  const cached = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const running = inFlight.get(key) as Promise<T> | undefined;
  if (running) return running;

  const request = (async () => {
    const value = await fetcher();
    memoryCache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
    return value;
  })();

  inFlight.set(key, request);
  try {
    return await request;
  } finally {
    inFlight.delete(key);
  }
}

export function invalidateRequestCache(prefix?: string): void {
  if (!prefix) {
    memoryCache.clear();
    inFlight.clear();
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(prefix)) memoryCache.delete(key);
  }
  for (const key of inFlight.keys()) {
    if (key.startsWith(prefix)) inFlight.delete(key);
  }
}
