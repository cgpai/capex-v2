import type { ProjectListBundle } from '@/services/capexProjectListApi';
import {
  invalidateProjectListCache,
  readProjectListCache,
  readProjectListCacheAnyAge,
  writeProjectListCache,
} from '@/services/capexProjectListApi';
import { projectListFiltersCacheKey } from '@/hooks/queries/fetchCapexProjectListQuery';
import { buildProjectListServerFilters } from '@/services/projectListQueryTypes';
import type { ProjectListSortOption } from '@/services/projectListQueryTypes';
import { readPeriodShellCache } from '@/lib/periodSelectionCache';
import { readCachedAuthUser } from '@/lib/authSessionCache';
import {
  PROJECT_LIST_DATA_POLICY,
  PROJECT_LIST_DISK_CACHE_VERSION,
  isStaleProjectListBundle,
} from '@/lib/projectListPipelineDebug';
import type { User } from '@/types';

export {
  readProjectListCache,
  readProjectListCacheAnyAge,
  writeProjectListCache,
  invalidateProjectListCache,
};

const FILTER_KEY = 'capex.projectList.filters.v1';
/** Legacy full-bundle disk (v2) — kept for backward compat reads only. */
const LEGACY_BUNDLE_PREFIX = 'capexProjectListCache:v2:';
/** Server-side table page responses (current architecture). */
const TABLE_PREFIX = PROJECT_LIST_DISK_CACHE_VERSION;
const TABLE_SHELL_SUFFIX = ':shell';

const TABLE_TTL_MS = 5 * 60 * 1000;

export type ProjectListFilterSelection = {
  /** @deprecated legacy single-period key */
  periodName?: string;
  selectedPeriods?: string[];
  searchTerm: string;
  selectedHUs: string[];
  selectedPriorities: string[];
  selectedFinishedTasks: string[];
  selectedBudgetFilter: string | null;
  selectedBudgetCategoryIds: string[];
  completionMin: number;
  completionMax: number;
  meetingArchetype: string | null;
  meetingAssetTypeGroup: string | null;
  itemsPerPage: number;
  sortBy?: ProjectListSortOption;
};

type CacheEnvelope<T> = {
  savedAt: number;
  payload: T;
  filtersKey?: string;
  isDefaultView?: boolean;
  dataPolicy?: string;
};

type TableShellMeta = { filtersKey: string; isDefaultView: boolean };

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

function tableCacheKey(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): string {
  const pn = periodName.trim();
  const fk = filtersKey.length > 64 ? filtersKey.slice(0, 64) : filtersKey;
  return `${TABLE_PREFIX}:${pn}:${userId}:${page}:${pageSize}:${fk}`;
}

function tableShellKey(periodName: string, userId: number): string {
  return `${TABLE_PREFIX}${TABLE_SHELL_SUFFIX}:${periodName.trim()}:${userId}`;
}

export function readProjectListFilterSelection(periodName?: string): ProjectListFilterSelection | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(FILTER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProjectListFilterSelection;
    if (!parsed) return null;
    const legacyPeriod = periodName?.trim();
    if (legacyPeriod && parsed.periodName && parsed.periodName !== legacyPeriod) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeProjectListFilterSelection(selection: ProjectListFilterSelection): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(FILTER_KEY, JSON.stringify(selection));
  } catch {
    /* quota */
  }
}

/** Build filtersKey aligned with table query (saved UI filters + scope). */
export function buildTableFiltersKeyForDisk(
  periodName: string,
  userId: number,
  page: number,
  pageSize: number,
  userScopes: { all: boolean; hus: Set<string>; archetypes: Set<string> },
  filterSelection?: ProjectListFilterSelection | null,
): string {
  const sel = filterSelection ?? readProjectListFilterSelection(periodName);
  const serverFilters = buildProjectListServerFilters({
    searchTerm: sel?.searchTerm ?? '',
    selectedHUs: sel?.selectedHUs ?? [],
    meetingFilters: {
      archetype: sel?.meetingArchetype ?? null,
      assetTypeGroup: sel?.meetingAssetTypeGroup ?? null,
    },
    selectedPriorities: sel?.selectedPriorities ?? [],
    selectedBudgetCategoryIds: sel?.selectedBudgetCategoryIds ?? [],
    selectedBudgetFilter: sel?.selectedBudgetFilter ?? null,
    selectedFinishedTasks: sel?.selectedFinishedTasks ?? [],
    completionRange: {
      min: sel?.completionMin ?? 0,
      max: sel?.completionMax ?? 100,
    },
    userScopes,
  });
  return projectListFiltersCacheKey({
    periodName,
    userId,
    page,
    pageSize,
    ...serverFilters,
  });
}

export function readProjectListTableCache(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): ProjectListBundle | null {
  const env = readFromStorages<ProjectListBundle>(
    tableCacheKey(periodName, userId, filtersKey, page, pageSize),
  );
  if (!env || !isFresh(env.savedAt, TABLE_TTL_MS)) return null;
  return env.payload;
}

/** Instant paint on F5 — may be slightly stale until background revalidate. */
function isStaleDiskBundle(bundle: ProjectListBundle | null | undefined): boolean {
  if (!bundle) return false;
  return isStaleProjectListBundle(bundle.totalAssetCount, bundle._debug as never);
}

export function readProjectListTableCacheAnyAge(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): ProjectListBundle | null {
  const env = readFromStorages<ProjectListBundle>(
    tableCacheKey(periodName, userId, filtersKey, page, pageSize),
  );
  if (!env?.payload) return null;
  if (env.dataPolicy && env.dataPolicy !== PROJECT_LIST_DATA_POLICY) return null;
  if (isStaleDiskBundle(env.payload)) return null;
  return env.payload;
}

/** Shell snapshot — only for default (All) table view; never reuse filtered totals. */
export function readProjectListTableShellAnyAge(
  periodName: string,
  userId: number,
  expectedFiltersKey?: string,
): ProjectListBundle | null {
  const env = readFromStorages<ProjectListBundle & TableShellMeta>(tableShellKey(periodName, userId));
  if (!env?.payload) return null;
  if (env.dataPolicy && env.dataPolicy !== PROJECT_LIST_DATA_POLICY) return null;
  if (env.isDefaultView !== true) return null;
  if (expectedFiltersKey && env.filtersKey && env.filtersKey !== expectedFiltersKey) return null;
  if (isStaleDiskBundle(env.payload)) return null;
  return env.payload;
}

export function clearProjectListTableShell(periodName: string, userId: number): void {
  if (typeof window === 'undefined') return;
  const key = tableShellKey(periodName.trim(), userId);
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

/** Drop one table page cache entry so the next fetch is fresh (e.g. after CRUD). */
export function clearProjectListTableCachePage(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
): void {
  if (typeof window === 'undefined') return;
  if (!periodName.trim() || !Number.isFinite(userId) || !filtersKey) return;
  const key = tableCacheKey(periodName.trim(), userId, filtersKey, page, pageSize);
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

export function writeProjectListTableCache(
  periodName: string,
  userId: number,
  filtersKey: string,
  page: number,
  pageSize: number,
  bundle: ProjectListBundle,
  opts?: { isDefaultView?: boolean },
): void {
  if (!periodName.trim() || !Number.isFinite(userId)) return;
  const envelope: CacheEnvelope<ProjectListBundle> = {
    savedAt: Date.now(),
    payload: bundle,
    dataPolicy: PROJECT_LIST_DATA_POLICY,
  };
  writeToStorages(tableCacheKey(periodName, userId, filtersKey, page, pageSize), envelope.payload);
  // Persist policy on shell envelope (table page keys use writeToStorages without policy — re-write with meta)
  try {
    if (typeof window !== 'undefined') {
      const pageKey = tableCacheKey(periodName, userId, filtersKey, page, pageSize);
      const fullEnvelope = { ...envelope, payload: bundle };
      writeEnvelope(window.sessionStorage, pageKey, fullEnvelope);
      writeEnvelope(window.localStorage, pageKey, fullEnvelope);
    }
  } catch {
    /* quota */
  }
  if (opts?.isDefaultView) {
    const shellEnvelope: CacheEnvelope<ProjectListBundle> = {
      savedAt: Date.now(),
      payload: bundle,
      filtersKey,
      isDefaultView: true,
      dataPolicy: PROJECT_LIST_DATA_POLICY,
    };
    if (typeof window !== 'undefined') {
      writeEnvelope(window.sessionStorage, tableShellKey(periodName, userId), shellEnvelope);
      writeEnvelope(window.localStorage, tableShellKey(periodName, userId), shellEnvelope);
    }
  }
}

export function hasProjectListTableOnDisk(periodName: string, userId: number): boolean {
  if (readProjectListTableShellAnyAge(periodName, userId)) return true;
  return !!readProjectListCacheAnyAge(periodName, userId);
}

/**
 * Sync read for App / page initializer — table cache first, then legacy bundle.
 */
export function resolveProjectListTableForDisplay(
  periodName: string,
  userId: number,
  userScopes: { all: boolean; hus: Set<string>; archetypes: Set<string> },
  preloaded?: ProjectListBundle | null,
): ProjectListBundle | null {
  if (preloaded?.enrichedAssets != null) return preloaded;
  if (!periodName.trim() || !Number.isFinite(userId)) return preloaded ?? null;
  if (typeof window === 'undefined') return preloaded ?? null;

  const saved = readProjectListFilterSelection(periodName);
  const pageSize = saved?.itemsPerPage ?? 20;
  const filtersKey = buildTableFiltersKeyForDisk(
    periodName,
    userId,
    1,
    pageSize,
    userScopes,
    saved,
  );

  const isDefaultSaved =
    !saved?.meetingArchetype &&
    !saved?.meetingAssetTypeGroup &&
    !saved?.searchTerm?.trim() &&
    !(saved?.selectedHUs?.length) &&
    !(saved?.selectedPriorities?.length) &&
    !(saved?.selectedFinishedTasks?.length) &&
    !saved?.selectedBudgetFilter &&
    !(saved?.selectedBudgetCategoryIds?.length) &&
    (saved?.completionMin ?? 0) === 0 &&
    (saved?.completionMax ?? 100) === 100;

  return (
    readProjectListTableCache(periodName, userId, filtersKey, 1, pageSize) ??
    readProjectListTableCacheAnyAge(periodName, userId, filtersKey, 1, pageSize) ??
    (isDefaultSaved ? readProjectListTableShellAnyAge(periodName, userId, filtersKey) : null) ??
    readProjectListCache(periodName, userId) ??
    readProjectListCacheAnyAge(periodName, userId) ??
    preloaded ??
    null
  );
}

/** @deprecated use resolveProjectListTableForDisplay */
export function resolveProjectListBundleForDisplay(
  periodName: string,
  userId: number,
  preloaded?: ProjectListBundle | null,
): ProjectListBundle | null {
  if (preloaded?.enrichedAssets?.length != null) return preloaded;
  if (!periodName.trim() || !Number.isFinite(userId)) return null;
  if (typeof window === 'undefined') return preloaded ?? null;
  return (
    readProjectListTableShellAnyAge(periodName, userId) ??
    readProjectListCache(periodName, userId) ??
    readProjectListCacheAnyAge(periodName, userId) ??
    preloaded ??
    null
  );
}

export function readInitialProjectListForShell(
  userScopes?: { all: boolean; hus: Set<string>; archetypes: Set<string> },
): ProjectListBundle | null {
  if (typeof window === 'undefined') return null;
  const shell = readPeriodShellCache();
  const user = readCachedAuthUser();
  if (!shell?.selectedPeriodName || !user?.id) return null;
  const scopes = userScopes ?? { all: true, hus: new Set<string>(), archetypes: new Set<string>() };
  return resolveProjectListTableForDisplay(shell.selectedPeriodName, user.id, scopes, null);
}

export function hasProjectListOnDisk(periodName: string, userId: number): boolean {
  return hasProjectListTableOnDisk(periodName, userId);
}

/** Hapus table + legacy bundle disk entries. */
export function invalidateAllCapexProjectListDiskCache(): void {
  if (typeof window === 'undefined') return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k?.startsWith(TABLE_PREFIX) || k?.startsWith(LEGACY_BUNDLE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

export function invalidateCapexProjectListDiskCache(periodName: string, userId: number): void {
  invalidateProjectListCache(periodName, userId);
  clearProjectListTableShell(periodName, userId);
  if (typeof window === 'undefined') return;
  const pn = periodName.trim();
  for (const storage of [window.sessionStorage, window.localStorage]) {
    try {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (
          k &&
          k.startsWith(`${TABLE_PREFIX}:${pn}:${userId}:`) &&
          !k.includes(TABLE_SHELL_SUFFIX)
        ) {
          keys.push(k);
        }
      }
      keys.forEach((k) => storage.removeItem(k));
    } catch {
      /* noop */
    }
  }
}

/** Default scopes for prefetch before assignments hydrate (Super Admin paint). */
export function defaultScopesForDiskPrefetch(_user?: User | null): {
  all: boolean;
  hus: Set<string>;
  archetypes: Set<string>;
} {
  return { all: true, hus: new Set(), archetypes: new Set() };
}
