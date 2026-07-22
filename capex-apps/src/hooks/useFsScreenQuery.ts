import { useLayoutEffect, useMemo, useRef } from 'react';
import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { hasPageSnapshotOnDisk } from '@/lib/pageSnapshotCache';
import { useDebouncedValue } from '@/screens/BudgetHU/useDebouncedValue';

const DEFAULT_GC_MS = 1000 * 60 * 30;
const DEFAULT_SEARCH_DEBOUNCE_MS = 200;

export type FsScreenQueryConfig<T extends { periodName: string }> = {
  periodName: string;
  userId: number;
  canView: boolean;
  queryKey: QueryKey;
  queryFn: () => Promise<T | null>;
  snapshotStorageKey: string;
  resolveInitialData: (
    queryClient: ReturnType<typeof useQueryClient>,
    periodName: string,
    userId: number,
  ) => T | undefined;
  hydrateFromDisk: (
    queryClient: ReturnType<typeof useQueryClient>,
    periodName: string,
    userId: number,
  ) => boolean;
  readSnapshotAnyAge: (periodName: string, userId: number) => T | null;
  preloadedSnapshot?: T | null;
  staleTime: number;
  gcTime?: number;
  getRowCount: (data: T | null | undefined) => number;
  searchTerm?: string;
  searchDebounceMs?: number;
};

export function useFsScreenQuery<T extends { periodName: string }>({
  periodName,
  userId,
  canView,
  queryKey,
  queryFn,
  snapshotStorageKey,
  resolveInitialData,
  hydrateFromDisk,
  readSnapshotAnyAge,
  preloadedSnapshot,
  staleTime,
  gcTime = DEFAULT_GC_MS,
  getRowCount,
  searchTerm = '',
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: FsScreenQueryConfig<T>) {
  const queryClient = useQueryClient();
  const scopeKey = `${periodName}:${userId}`;
  const scopeKeyRef = useRef(scopeKey);
  const diskSeedRef = useRef<T | undefined>(undefined);
  const initialUpdatedAtRef = useRef<number | undefined>(undefined);

  // Freeze disk seed per period/user so parent re-parses of preloadedSnapshot do not retrigger hydration.
  if (scopeKeyRef.current !== scopeKey) {
    scopeKeyRef.current = scopeKey;
    diskSeedRef.current = undefined;
    initialUpdatedAtRef.current = undefined;
  }
  if (diskSeedRef.current === undefined) {
    if (preloadedSnapshot) {
      diskSeedRef.current = preloadedSnapshot;
    } else if (periodName.trim() && userId) {
      diskSeedRef.current = readSnapshotAnyAge(periodName, userId) ?? undefined;
    }
  }
  const diskSeed = diskSeedRef.current;

  const initialPageData = useMemo(
    () => resolveInitialData(queryClient, periodName, userId) ?? diskSeed,
    [queryClient, periodName, userId, resolveInitialData, diskSeed],
  );

  if (initialPageData && initialUpdatedAtRef.current === undefined) {
    initialUpdatedAtRef.current = Date.now() - staleTime - 1;
  }

  const debouncedSearch = useDebouncedValue(searchTerm, searchDebounceMs);
  const isSearchActive = debouncedSearch.trim().length > 0;
  const isSearchStaging = searchTerm.trim() !== debouncedSearch.trim();

  const snapshotKey = `${snapshotStorageKey}:${periodName}:${userId}`;
  const mayUseDiskSeed = !!diskSeed;

  useLayoutEffect(() => {
    if (!periodName.trim() || !canView) return;
    if (queryClient.getQueryData<T>(queryKey)) return;

    hydrateFromDisk(queryClient, periodName, userId);
    if (queryClient.getQueryData<T>(queryKey)) return;

    if (diskSeedRef.current) {
      queryClient.setQueryData(queryKey, diskSeedRef.current);
    }
  }, [periodName, userId, canView, queryClient, queryKey, hydrateFromDisk]);

  const fsQuery = useQuery<T, Error>({
    queryKey,
    queryFn: async () => {
      const result = await queryFn();
      if (!result) {
        throw new Error(`Failed to load FS screen data for ${periodName}`);
      }
      return result;
    },
    enabled: !!periodName.trim() && canView,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: true,
    initialData: mayUseDiskSeed ? (initialPageData ?? diskSeed) : initialPageData,
    initialDataUpdatedAt: initialUpdatedAtRef.current,
    placeholderData: (prev) => prev,
  });

  const activeData = (fsQuery.data ?? diskSeed) as T | undefined;
  const hasListData = getRowCount(activeData) > 0 || getRowCount(diskSeed) > 0;
  const hasSnapshotOnDisk =
    !!diskSeed || (!!periodName.trim() && !!userId && hasPageSnapshotOnDisk(snapshotKey));

  const isBlockingLoad = fsQuery.isPending && !hasListData && !hasSnapshotOnDisk;
  const isBackgroundRefresh =
    hasListData && fsQuery.isFetching && !fsQuery.isPending && !isSearchStaging;
  const isFilterRefreshing =
    isSearchStaging || (isSearchActive && (fsQuery.isFetching || fsQuery.isPending));

  return {
    fsQuery,
    diskSeed,
    activeData: activeData ?? undefined,
    debouncedSearch,
    isSearchActive,
    isSearchStaging,
    hasListData,
    hasSnapshotOnDisk,
    isBlockingLoad,
    isBackgroundRefresh,
    isFilterRefreshing,
  };
}
