import type { QueryClient } from '@tanstack/react-query';
import type { ArchetypeConfig, HospitalUnitConfig, User, UserTask } from '@/types';
import * as taskService from '@/services/taskService';
import * as configService from '@/services/configService';
import { fetchMyTasks, isCapexBeConfigured, resolveMyTasksAccessToken } from '@/services/myTasksApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { CapexBeHttpError, isCapexBeNetworkError, useBeBffProxy } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';
import { queryKeys } from '@/lib/query-keys';
import { withRequestCache } from '@/lib/requestCache';
import {
  readMyTasksCache,
  readMyTasksCacheAnyAge,
  writeMyTasksCache,
} from '@/lib/myTasksDiskCache';

/** Shared stale window for my-tasks query, prefetch, and notification polling. */
export const MY_TASKS_STALE_MS = 5 * 60 * 1000;

const FILTER_MASTER_TTL_MS = 30 * 60 * 1000;

export type MyTasksPageBundle = {
  masterData: { archetypes: ArchetypeConfig[]; hus: HospitalUnitConfig[] };
  tasks: UserTask[];
};

export type MyTasksFilterMasterData = {
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
};

export function myTasksSnapshotKey(userId: number, periodName: string | undefined): string {
  return `${userId}:${periodName ?? ''}`;
}

/** @deprecated Use readMyTasksCache / readMyTasksCacheAnyAge from myTasksDiskCache. */
export function readMyTasksSnapshot(
  userId: number,
  periodName: string | undefined,
): MyTasksPageBundle | null {
  return readMyTasksCache(userId, periodName) ?? readMyTasksCacheAnyAge(userId, periodName);
}

function requestCacheKey(userId: number, periodName: string | undefined): string {
  return `my-tasks:bundle:${userId}:${periodName?.trim() ?? ''}`;
}

async function loadUserTasks(
  currentUser: User,
  periodName: string | undefined,
  options?: { skipCache?: boolean },
): Promise<UserTask[]> {
  const skipCache = !!options?.skipCache;
  const cacheKey = skipCache
    ? `${requestCacheKey(currentUser.id, periodName)}:skip`
    : requestCacheKey(currentUser.id, periodName);

  return withRequestCache(
    cacheKey,
    async () => {
      if (isCapexBeConfigured()) {
        const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
        if (!useBeBffProxy() && !token && !useBackendSession()) {
          throw new Error('Sesi tidak valid — login ulang untuk memuat task.');
        }
        try {
          return await fetchMyTasks(currentUser.id, token, periodName, skipCache);
        } catch (beErr) {
          if (isCapexBeNetworkError(beErr)) {
            console.warn('My tasks BE unreachable, using direct Supabase path:', beErr);
            return taskService.getTasksForUser(currentUser);
          }
          if (beErr instanceof CapexBeHttpError && beErr.status === 401) {
            throw beErr;
          }
          console.error('My tasks BE failed:', beErr);
          throw beErr instanceof Error ? beErr : new Error(String(beErr));
        }
      }
      return taskService.getTasksForUser(currentUser);
    },
    MY_TASKS_STALE_MS,
  );
}

/**
 * Tasks for notification polling — reuses TanStack cache / snapshot before hitting BE.
 */
export async function resolveMyTasksForUser(
  queryClient: QueryClient,
  currentUser: User,
  periodName: string | undefined,
  options?: { forceRefresh?: boolean },
): Promise<UserTask[]> {
  const queryKey = queryKeys.myTasks.page(currentUser.id, periodName);

  if (!options?.forceRefresh) {
    const cached = queryClient.getQueryData<MyTasksPageBundle>(queryKey);
    if (cached?.tasks) return cached.tasks;

    const state = queryClient.getQueryState<MyTasksPageBundle>(queryKey);
    if (
      state?.data?.tasks &&
      state.dataUpdatedAt > 0 &&
      Date.now() - state.dataUpdatedAt < MY_TASKS_STALE_MS
    ) {
      return state.data.tasks;
    }

    const snapshot =
      readMyTasksCache(currentUser.id, periodName) ??
      readMyTasksCacheAnyAge(currentUser.id, periodName);
    if (snapshot?.tasks) return snapshot.tasks;
  }

  const bundle = await queryClient.fetchQuery({
    queryKey,
    queryFn: () => fetchMyTasksPageBundle(currentUser, periodName),
    staleTime: MY_TASKS_STALE_MS,
  });
  return bundle.tasks;
}

/** Critical path: tasks only — no archetype/HU config on initial load. */
export async function fetchMyTasksPageBundle(
  currentUser: User,
  periodName: string | undefined,
  options?: { skipCache?: boolean },
): Promise<MyTasksPageBundle> {
  const tasks = await loadUserTasks(currentUser, periodName, options);
  const bundle: MyTasksPageBundle = {
    masterData: { archetypes: [], hus: [] },
    tasks,
  };
  writeMyTasksCache(currentUser.id, periodName, bundle);
  return bundle;
}

/** Lazy-loaded when user opens filter panel — cached via TanStack Query + requestCache. */
export async function fetchMyTasksFilterMasterData(): Promise<MyTasksFilterMasterData> {
  return withRequestCache(
    'my-tasks:filter-master',
    async () => {
      const [archetypes, hus] = await Promise.all([
        configService.getAllArchetypesConfig(),
        configService.getAllHospitalUnitsConfig(),
      ]);
      return { archetypes, hus };
    },
    FILTER_MASTER_TTL_MS,
  );
}
