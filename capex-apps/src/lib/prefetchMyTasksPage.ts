import type { QueryClient } from '@tanstack/react-query';
import { useBackendSession } from '@/lib/auth/authConstants';
import { useBeBffProxy } from '@/lib/capexBeClient';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import {
  fetchMyTasksPageBundle,
  MY_TASKS_STALE_MS,
  type MyTasksPageBundle,
} from '@/hooks/queries/fetchMyTasksPage';
import {
  readMyTasksCacheAnyAge,
  writeMyTasksCache,
} from '@/lib/myTasksDiskCache';
import type { User } from '@/types';

/** Hydrate TanStack Query from disk — instant paint after F5 without waiting for fetch. */
export function hydrateMyTasksFromDisk(
  queryClient: QueryClient,
  userId: number,
  periodName: string | undefined,
): boolean {
  if (!Number.isFinite(userId)) return false;
  const disk = readMyTasksCacheAnyAge(userId, periodName);
  if (!disk) return false;
  queryClient.setQueryData(queryKeys.myTasks.page(userId, periodName), disk);
  return true;
}

/**
 * Warm my-tasks cache on hover / nav — skips network when TanStack cache is still fresh.
 */
export function prefetchMyTasksPage(
  queryClient: QueryClient,
  currentUser: User,
  periodName: string | undefined,
): void {
  if (!currentUser?.id) return;

  const qk = queryKeys.myTasks.page(currentUser.id, periodName);
  hydrateMyTasksFromDisk(queryClient, currentUser.id, periodName);

  const state = queryClient.getQueryState<MyTasksPageBundle>(qk);
  if (
    state?.dataUpdatedAt &&
    Date.now() - state.dataUpdatedAt < MY_TASKS_STALE_MS &&
    queryClient.getQueryData(qk)
  ) {
    return;
  }

  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '').trim();
  const bff = useBeBffProxy();
  if (!base && !bff) return;

  void (async () => {
    if (!bff || !useBackendSession()) {
      const token = await getAccessTokenForBackend();
      if (!bff && !token) return;
    }
    await queryClient.prefetchQuery({
      queryKey: qk,
      staleTime: MY_TASKS_STALE_MS,
      queryFn: async () => {
        const bundle = await fetchMyTasksPageBundle(currentUser, periodName);
        writeMyTasksCache(currentUser.id, periodName, bundle);
        return bundle;
      },
    });
  })();
}
