import type { QueryClient } from '@tanstack/react-query';
import type { User } from '@/types';
import { useBackendSession } from '@/lib/auth/authConstants';
import { useBeBffProxy } from '@/lib/capexBeClient';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  bddConstructionFiltersCacheKey,
  readBddConstructionTableCacheAnyAge,
  writeBddConstructionTableCache,
} from '@/lib/bddConstructionDiskCache';
import { buildProjectListServerFilters } from '@/services/projectListQueryTypes';
import { fetchBddConstructionQueryPage } from '@/hooks/queries/fetchBddConstructionQuery';
import { defaultScopesForDiskPrefetch } from '@/lib/capexProjectListDiskCache';

const TABLE_STALE_MS = 5 * 60 * 1000;
const DEFAULT_PREFETCH_PAGE_SIZE = 25;

function hideUnassignedBddForUser(user: User): boolean {
  return !user.assignments.some((a) => a.roleName === 'Super Admin' || a.roleName === 'BDD');
}

export function hydrateBddConstructionTableFromDisk(
  queryClient: QueryClient,
  periodName: string,
  user: User,
  page = 1,
  pageSize = DEFAULT_PREFETCH_PAGE_SIZE,
): boolean {
  const trimmed = periodName?.trim();
  if (!trimmed || !Number.isFinite(user.id)) return false;

  const scopes = defaultScopesForDiskPrefetch();
  const filtersKey = bddConstructionFiltersCacheKey({
    periodName: trimmed,
    userId: user.id,
    page,
    pageSize,
    ...buildProjectListServerFilters({
      searchTerm: '',
      selectedHUs: [],
      meetingFilters: { archetype: null, assetTypeGroup: null },
      selectedPriorities: [],
      selectedBudgetCategoryIds: [],
      selectedBudgetFilter: null,
      selectedFinishedTasks: [],
      completionRange: { min: 0, max: 100 },
      userScopes: scopes,
      bddConstructionOnly: true,
      hideUnassignedBdd: hideUnassignedBddForUser(user),
    }),
  });

  const disk = readBddConstructionTableCacheAnyAge(trimmed, user.id, filtersKey, page, pageSize);
  if (!disk) return false;

  queryClient.setQueryData(
    queryKeys.bddConstruction.table(trimmed, user.id, filtersKey, page, pageSize),
    disk,
  );
  return true;
}

/** Prefetch halaman tabel pertama BDD — route-first / nav hover. */
export async function warmBddConstructionTableCache(
  queryClient: QueryClient,
  periodName: string,
  user: User,
  options?: { awaitMs?: number },
): Promise<void> {
  const trimmed = periodName?.trim();
  if (!trimmed || !Number.isFinite(user.id)) return;
  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '').trim();
  if (!base) return;

  const bff = useBeBffProxy();
  const token = bff && useBackendSession() ? null : await getAccessTokenForBackend();
  if (!bff && !token) return;

  const pageSize = DEFAULT_PREFETCH_PAGE_SIZE;
  const scopes = defaultScopesForDiskPrefetch();
  const serverFilters = buildProjectListServerFilters({
    searchTerm: '',
    selectedHUs: [],
    meetingFilters: { archetype: null, assetTypeGroup: null },
    selectedPriorities: [],
    selectedBudgetCategoryIds: [],
    selectedBudgetFilter: null,
    selectedFinishedTasks: [],
    completionRange: { min: 0, max: 100 },
    userScopes: scopes,
    bddConstructionOnly: true,
    hideUnassignedBdd: hideUnassignedBddForUser(user),
  });
  const filtersKey = bddConstructionFiltersCacheKey({
    periodName: trimmed,
    userId: user.id,
    page: 1,
    pageSize,
    ...serverFilters,
  });
  const qk = queryKeys.bddConstruction.table(trimmed, user.id, filtersKey, 1, pageSize);

  hydrateBddConstructionTableFromDisk(queryClient, trimmed, user, 1, pageSize);

  const existingState = queryClient.getQueryState(qk);
  if (
    existingState?.dataUpdatedAt &&
    Date.now() - existingState.dataUpdatedAt < TABLE_STALE_MS &&
    queryClient.getQueryData(qk)
  ) {
    return;
  }

  const prefetch = queryClient.prefetchQuery({
    queryKey: qk,
    staleTime: TABLE_STALE_MS,
    queryFn: async () => {
      const bundle = await fetchBddConstructionQueryPage(
        {
          periodName: trimmed,
          userId: user.id,
          page: 1,
          pageSize,
          skipCache: false,
          ...serverFilters,
        },
        token,
      );
      if (bundle) {
        writeBddConstructionTableCache(trimmed, user.id, filtersKey, 1, pageSize, bundle);
      }
      return bundle;
    },
  });

  const cap = options?.awaitMs;
  if (cap != null && cap > 0) {
    await Promise.race([prefetch, new Promise<void>((r) => setTimeout(r, cap))]);
    return;
  }
  await prefetch;
}
