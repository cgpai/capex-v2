import type { Query } from '@tanstack/react-query';

/** Hanya cache query `app` / `screen` — hindari persist query sensitif atau sekali pakai. */
export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey;
  if (!Array.isArray(key) || key.length === 0) return false;
  const root = key[0];
  return root === 'app' || root === 'screen';
}

export const TANSTACK_PERSIST_STORAGE_KEY = 'capex.tanstack-query.v1';

/** Remove persisted TanStack cache (logout / guest — no stale data in localStorage). */
export function clearPersistedQueryCache(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(TANSTACK_PERSIST_STORAGE_KEY);
  } catch {
    /* private mode */
  }
}

/**
 * Filter untuk `dehydrateOptions.shouldDehydrateQuery` (persist ke localStorage).
 * Hanya `success`: query `pending` ikut diserialisasi dengan promise internal; jika fetch
 * dibatalkan (navigasi, remount), rehydrate menolak dengan CancelledError dan memenuhi log error.
 */
export function shouldDehydratePersistedQuery(query: Query): boolean {
  if (!shouldPersistQuery(query)) return false;
  return query.state.status === 'success';
}
