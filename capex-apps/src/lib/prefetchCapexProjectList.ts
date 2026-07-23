import type { QueryClient } from '@tanstack/react-query';
import { useBackendSession } from '@/lib/auth/authConstants';
import { useBeBffProxy } from '@/lib/capexBeClient';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  buildTableFiltersKeyForDisk,
  defaultScopesForDiskPrefetch,
  readProjectListFilterSelection,
  readProjectListTableCacheAnyAge,
  readProjectListTableShellAnyAge,
} from '@/lib/capexProjectListDiskCache';
import { fetchCapexProjectListMaster } from '@/hooks/queries/fetchCapexProjectListMaster';

const TABLE_STALE_MS = 5 * 60 * 1000;
const PREFETCH_TIMEOUT_MS = 8_000;
/** Max wait after login before navigating — balance fast redirect vs. warm cache for CPL landing. */
export const LOGIN_CPL_PREFETCH_AWAIT_MS = 1_000;
const DEFAULT_PREFETCH_PAGE_SIZE = 20;

/** Hydrate table TanStack Query dari disk — paint instan setelah F5. */
export function hydrateCapexProjectListTableFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  filtersKey?: string,
  page = 1,
  pageSize = 25,
  options?: { allowShellFallback?: boolean },
): boolean {
  const trimmed = periodName?.trim();
  if (!trimmed || !Number.isFinite(userId)) return false;

  const fk =
    filtersKey ??
    buildTableFiltersKeyForDisk(trimmed, userId, page, pageSize, defaultScopesForDiskPrefetch());
  const disk =
    readProjectListTableCacheAnyAge(trimmed, userId, fk, page, pageSize) ??
    (options?.allowShellFallback ? readProjectListTableShellAnyAge(trimmed, userId) : null);
  if (!disk) return false;

  queryClient.setQueryData(
    queryKeys.capexProjectList.table(trimmed, userId, fk, page, pageSize),
    disk,
  );
  return true;
}

/** @deprecated legacy bundle hydrate — no-op unless legacy disk exists; prefer table hydrate. */
export function hydrateCapexProjectListFromDisk(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
): boolean {
  return hydrateCapexProjectListTableFromDisk(queryClient, periodName, userId);
}

/**
 * Warm disk hydrate + master config only.
 * Table rows load on screen mount / pagination click (server page-by-page).
 */
export async function warmCapexProjectListTableCache(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  options?: { awaitMs?: number },
): Promise<void> {
  const trimmed = periodName?.trim();
  if (!trimmed || !Number.isFinite(userId)) return;
  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '').trim();
  if (!base) return;

  const bff = useBeBffProxy();
  const token = bff && useBackendSession() ? null : await getAccessTokenForBackend();
  if (!bff && !token) return;

  const saved = readProjectListFilterSelection(trimmed);
  const pageSize = saved?.itemsPerPage ?? DEFAULT_PREFETCH_PAGE_SIZE;
  const scopes = defaultScopesForDiskPrefetch();
  const filtersKey = buildTableFiltersKeyForDisk(trimmed, userId, 1, pageSize, scopes, saved);

  hydrateCapexProjectListTableFromDisk(queryClient, trimmed, userId, filtersKey, 1, pageSize);

  const masterPrefetch = queryClient.prefetchQuery({
    queryKey: queryKeys.capexProjectList.master(userId),
    staleTime: TABLE_STALE_MS,
    queryFn: () => fetchCapexProjectListMaster(userId, token),
  });

  const cap = options?.awaitMs;
  if (cap != null && cap > 0) {
    await Promise.race([masterPrefetch, new Promise<void>((r) => setTimeout(r, cap))]);
    return;
  }
  await masterPrefetch;
}

export function warmCapexProjectListTableCacheWithTimeout(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  timeoutMs = PREFETCH_TIMEOUT_MS,
): Promise<void> {
  return warmCapexProjectListTableCache(queryClient, periodName, userId, { awaitMs: timeoutMs });
}

/** @deprecated — jangan panggil global; gunakan warmCapexProjectListTableCache pada nav/login. */
export async function warmCapexProjectListCache(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  options?: { awaitPartialMs?: number },
): Promise<void> {
  return warmCapexProjectListTableCache(queryClient, periodName, userId, {
    awaitMs: options?.awaitPartialMs,
  });
}

export function warmCapexProjectListCacheWithTimeout(
  queryClient: QueryClient,
  periodName: string,
  userId: number,
  timeoutMs = PREFETCH_TIMEOUT_MS,
): Promise<void> {
  return warmCapexProjectListTableCacheWithTimeout(queryClient, periodName, userId, timeoutMs);
}
