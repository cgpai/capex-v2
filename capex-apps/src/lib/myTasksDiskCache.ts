import type { MyTasksPageBundle } from '@/hooks/queries/fetchMyTasksPage';
import type { MyTaskSortOption, MyTaskViewMode } from '@/screens/MyTask/listUtils';
import { readPeriodShellCache } from '@/lib/periodSelectionCache';
import { readCachedAuthUser } from '@/lib/authSessionCache';

const DISK_PREFIX = 'capexMyTasksCache:v2:';
const LEGACY_SNAPSHOT_PREFIX = 'page-snapshot:my-tasks:';
const FILTER_KEY = 'capex.myTasks.filters.v2';

/** Table TTL — align with MY_TASKS_STALE_MS / BE table cache. */
export const MY_TASKS_DISK_TTL_MS = 5 * 60 * 1000;

type CacheEnvelope<T> = { savedAt: number; payload: T };

export type MyTasksFilterSelection = {
  periodName: string;
  showCompleted: boolean;
  searchTerm: string;
  selectedArchetypes: string[];
  selectedHUs: string[];
  selectedAssignedRoles: string[];
  taskViewMode: MyTaskViewMode;
  sortBy: MyTaskSortOption;
  itemsPerPage: number;
};

function cacheKey(userId: number, periodName: string | undefined): string {
  return `${DISK_PREFIX}${userId}:${periodName?.trim() ?? ''}`;
}

function legacySnapshotKey(userId: number, periodName: string | undefined): string {
  return `${LEGACY_SNAPSHOT_PREFIX}${userId}:${periodName ?? ''}`;
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

function isFresh(savedAt: number): boolean {
  return !!savedAt && Date.now() - savedAt <= MY_TASKS_DISK_TTL_MS;
}

/** Migrate legacy page-snapshot entries into v1 disk cache. */
function readLegacySnapshot(userId: number, periodName: string | undefined): MyTasksPageBundle | null {
  if (typeof window === 'undefined') return null;
  const storageKey = legacySnapshotKey(userId, periodName);
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return null;
    const envelope = JSON.parse(raw) as { ts?: number; data?: MyTasksPageBundle };
    if (!envelope?.data) return null;
    writeMyTasksCache(userId, periodName, envelope.data);
    window.localStorage.removeItem(storageKey);
    return envelope.data;
  } catch {
    return null;
  }
}

export function readMyTasksCache(
  userId: number,
  periodName: string | undefined,
): MyTasksPageBundle | null {
  const env = readFromStorages<MyTasksPageBundle>(cacheKey(userId, periodName));
  if (env && isFresh(env.savedAt)) return env.payload;
  const legacy = readLegacySnapshot(userId, periodName);
  if (legacy) return legacy;
  return null;
}

/** Instant paint on F5 — may be slightly stale until background revalidate. */
export function readMyTasksCacheAnyAge(
  userId: number,
  periodName: string | undefined,
): MyTasksPageBundle | null {
  const env = readFromStorages<MyTasksPageBundle>(cacheKey(userId, periodName));
  if (env?.payload) return env.payload;
  return readLegacySnapshot(userId, periodName);
}

export function writeMyTasksCache(
  userId: number,
  periodName: string | undefined,
  bundle: MyTasksPageBundle,
): void {
  if (!Number.isFinite(userId)) return;
  writeToStorages(cacheKey(userId, periodName), bundle);
}

export function invalidateMyTasksDiskCache(userId: number, periodName: string | undefined): void {
  if (typeof window === 'undefined') return;
  const key = cacheKey(userId, periodName);
  const legacyKey = legacySnapshotKey(userId, periodName);
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      storage.removeItem(key);
      storage.removeItem(legacyKey);
    } catch {
      /* noop */
    }
  }
}

export function invalidateAllMyTasksDiskCache(): void {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(DISK_PREFIX) || k?.startsWith(LEGACY_SNAPSHOT_PREFIX)) {
          keys.push(k);
        }
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

export function hasMyTasksOnDisk(userId: number, periodName: string | undefined): boolean {
  return !!readMyTasksCacheAnyAge(userId, periodName);
}

export function resolveMyTasksBundleForDisplay(
  userId: number,
  periodName: string | undefined,
  preloaded?: MyTasksPageBundle | null,
): MyTasksPageBundle | null {
  if (preloaded?.tasks != null) return preloaded;
  if (!Number.isFinite(userId)) return preloaded ?? null;
  if (typeof window === 'undefined') return preloaded ?? null;
  return (
    readMyTasksCache(userId, periodName) ??
    readMyTasksCacheAnyAge(userId, periodName) ??
    preloaded ??
    null
  );
}

/** Sync read for App boot — tasks for current user + selected period. */
export function readInitialMyTasksForShell(): MyTasksPageBundle | null {
  if (typeof window === 'undefined') return null;
  const shell = readPeriodShellCache();
  const user = readCachedAuthUser();
  if (!user?.id) return null;
  return readMyTasksCacheAnyAge(user.id, shell?.selectedPeriodName ?? undefined);
}

export function readMyTasksFilterSelection(periodName: string): MyTasksFilterSelection | null {
  if (typeof window === 'undefined' || !periodName.trim()) return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MyTasksFilterSelection;
    if (parsed?.periodName !== periodName.trim()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeMyTasksFilterSelection(selection: MyTasksFilterSelection): void {
  if (typeof window === 'undefined' || !selection.periodName.trim()) return;
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(selection));
  } catch {
    /* quota */
  }
}
