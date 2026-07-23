import type {
  ArchetypeConfig,
  EnrichedAsset,
  HospitalUnitConfig,
  Project,
  ProjectPriorityConfig,
  Task,
  User,
  UserRole,
  WorkflowSet,
} from '../types';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { useBackendSession } from '../lib/auth/authConstants';
import {
  CapexBeHttpError,
  capexBeRequestUrl,
  isCapexBeNetworkError,
  isCapexBeUnauthorizedError,
  useBeBffProxy,
} from '../lib/capexBeClient';
import type { ProjectListQueryParams, ProjectListQueryResult } from './projectListQueryTypes';

export type ProjectListDebugInfo = {
  dataPolicy?: string;
  dbTruthCount?: number;
  dbMatchedCount?: number;
  afterProgressFilterCount?: number;
  returnedRowCount?: number;
  enrichDroppedCount?: number;
  cacheLayer?: string;
  usedProgressFilter?: boolean;
  defaultQuery?: boolean;
};

/** @deprecated Use CapexBeHttpError */
export class ProjectListHttpError extends CapexBeHttpError {
  constructor(message: string, status: number) {
    super(message, status);
    this.name = 'ProjectListHttpError';
  }
}

export function isProjectListUnauthorizedError(e: unknown): boolean {
  return isCapexBeUnauthorizedError(e);
}

export function isProjectListNetworkError(e: unknown): boolean {
  return isCapexBeNetworkError(e);
}

export interface ProjectListBundle {
  enrichedAssets: EnrichedAsset[];
  projects: Project[];
  workflows: WorkflowSet[];
  archetypes: ArchetypeConfig[];
  hus: HospitalUnitConfig[];
  users: User[];
  priorities: ProjectPriorityConfig[];
  allRoles: UserRole[];
  allTasks: Task[];
  assetLastTaskMap: Record<string, string>;
  /** Hanya diisi saat request paginated ke BE (lazy load). */
  totalAssetCount?: number;
  page?: number;
  pageSize?: number;
  _debug?: ProjectListDebugInfo;
}

/** Master config — fetched separately from slim table rows. */
export type ProjectListMasterBundle = Pick<
  ProjectListBundle,
  'workflows' | 'archetypes' | 'hus' | 'users' | 'priorities' | 'allRoles' | 'allTasks'
>;

export function bundleNeedsMaster(bundle: Pick<ProjectListBundle, 'workflows' | 'archetypes'>): boolean {
  return (bundle.workflows?.length ?? 0) === 0 && (bundle.archetypes?.length ?? 0) === 0;
}

export function attachMasterToBundle(
  bundle: ProjectListBundle,
  master: ProjectListMasterBundle,
): ProjectListBundle {
  return { ...bundle, ...master };
}

/** Master config for Capex Project List (workflows, users, roles, tasks, …). */
export async function fetchProjectListMaster(
  userId: number,
  accessToken?: string | null,
): Promise<ProjectListMasterBundle> {
  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }
  if (!bff && !accessToken) {
    throw new ProjectListHttpError('Missing authorization', 401);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/project-list/master'), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify({ userId }),
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    if (text.trim().startsWith('{')) {
      try {
        const j = JSON.parse(text) as { message?: string | string[] };
        const m = j.message;
        msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' && m ? m : msg;
      } catch {
        /* keep raw */
      }
    }
    throw new ProjectListHttpError(msg, res.status);
  }
  return res.json() as Promise<ProjectListMasterBundle>;
}

/** Aggregated Capex Project List payload from NestJS capexbe (single round-trip). */
export async function fetchProjectListBundle(
  periodName: string,
  userId: number,
  accessToken?: string | null,
  options?: { skipCache?: boolean; page?: number; pageSize?: number },
): Promise<ProjectListBundle> {
  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }
  if (!bff && !accessToken) {
    throw new ProjectListHttpError('Missing authorization', 401);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/project-list'), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify({
      periodName,
      userId,
      ...(options?.skipCache ? { skipCache: true } : {}),
      ...(options?.page != null ? { page: options.page } : {}),
      ...(options?.pageSize != null ? { pageSize: options.pageSize } : {}),
    }),
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    if (text.trim().startsWith('{')) {
      try {
        const j = JSON.parse(text) as { message?: string | string[] };
        const m = j.message;
        msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' && m ? m : msg;
      } catch {
        /* tetap pakai msg dari body mentah */
      }
    }
    throw new ProjectListHttpError(msg, res.status);
  }
  return res.json() as Promise<ProjectListBundle>;
}

const CHUNK_SIZE = 200;

/**
 * Ambil bundle lengkap lewat BE dengan chunk pagination (satu alur dengan layar Project List).
 * Mengembalikan null jika `isCancelled()` menjadi true — jangan tulis cache / terapkan ke UI.
 */
export async function fetchProjectListBundleMerged(
  periodName: string,
  userId: number,
  accessToken?: string | null,
  opts?: {
    skipCache?: boolean;
    /** Dipanggil sekali saat total tersedia (respons paged → chunk pertama; non-paged → selesai satu ronde). */
    onTotalCount?: (total: number) => void;
    onProgress?: (loaded: number, total: number) => void;
    onPartial?: (partial: ProjectListBundle) => void;
    isCancelled?: () => boolean;
  },
): Promise<ProjectListBundle | null> {
  let page = 1;
  const accumulatedAssets: EnrichedAsset[] = [];
  const accProjects = new Map<string, Project>();
  let accLastMap: Record<string, string> = {};
  type Meta = Pick<
    ProjectListBundle,
    'workflows' | 'archetypes' | 'hus' | 'users' | 'priorities' | 'allRoles' | 'allTasks'
  >;
  let meta: Meta | null = null;
  let announcedTotal = false;
  let finalTotalForBundle: number | undefined;

  if (opts?.isCancelled?.()) return null;

  let done = false;
  while (!done) {
    if (opts?.isCancelled?.()) return null;

    const bundle = await fetchProjectListBundle(periodName, userId, accessToken, {
      ...(opts?.skipCache ? { skipCache: true } : {}),
      page,
      pageSize: CHUNK_SIZE,
    });

    if (opts?.isCancelled?.()) return null;

    if (!meta) {
      meta = {
        workflows: bundle.workflows,
        archetypes: bundle.archetypes,
        hus: bundle.hus,
        users: bundle.users,
        priorities: bundle.priorities,
        allRoles: bundle.allRoles,
        allTasks: bundle.allTasks,
      };
    }

    const isPaged = typeof bundle.totalAssetCount === 'number';
    if (isPaged) {
      finalTotalForBundle = bundle.totalAssetCount as number;
      if (!announcedTotal) {
        announcedTotal = true;
        opts?.onTotalCount?.(finalTotalForBundle);
      }
    }
    accumulatedAssets.push(...bundle.enrichedAssets);
    bundle.projects.forEach((p) => accProjects.set(String(p.id), p));
    accLastMap = { ...accLastMap, ...bundle.assetLastTaskMap };

    if (!isPaged) {
      finalTotalForBundle = accumulatedAssets.length;
    }

    const merged: ProjectListBundle = {
      ...(meta as ProjectListBundle),
      enrichedAssets: [...accumulatedAssets],
      projects: Array.from(accProjects.values()),
      assetLastTaskMap: accLastMap,
      totalAssetCount: isPaged ? (finalTotalForBundle as number) : accumulatedAssets.length,
      ...(isPaged ? { page, pageSize: bundle.pageSize ?? CHUNK_SIZE } : {}),
    };

    const totalHint = isPaged ? (bundle.totalAssetCount as number) : accumulatedAssets.length;
    opts?.onProgress?.(accumulatedAssets.length, totalHint || accumulatedAssets.length);
    if (!isPaged && !announcedTotal) {
      announcedTotal = true;
      opts?.onTotalCount?.(accumulatedAssets.length);
    }
    opts?.onPartial?.(merged);

    if (!isPaged) {
      done = true;
    } else {
      const totalRaw = bundle.totalAssetCount as number;
      const sizeUsed = bundle.pageSize ?? CHUNK_SIZE;
      if (totalRaw === 0) {
        done = true;
      } else if (page * sizeUsed >= totalRaw) {
        done = true;
      } else {
        page += 1;
      }
    }
  }

  if (opts?.isCancelled?.()) return null;

  if (!meta) {
    return null;
  }

  return {
    ...(meta as ProjectListBundle),
    enrichedAssets: accumulatedAssets,
    projects: Array.from(accProjects.values()),
    assetLastTaskMap: accLastMap,
    ...(finalTotalForBundle != null ? { totalAssetCount: finalTotalForBundle } : {}),
  };
}

/** v2: bump agar cache lama (mis. bundle parsial / sebelum perbaikan RLS) tidak dipakai lagi. */
const CACHE_KEY_PREFIX = 'capexProjectListCache:v2';
/** Stale-while-revalidate: show cached list instantly on repeat visits (within TTL). */
const CACHE_TTL_MS = 5 * 60 * 1000;

type ProjectListCacheEnvelope = { savedAt: number; bundle: ProjectListBundle };
const cacheKey = (periodName: string, userId: number) => `${CACHE_KEY_PREFIX}:${periodName}:${userId}`;

function readStorageEnvelope(storage: Storage | undefined, key: string): ProjectListCacheEnvelope | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as ProjectListCacheEnvelope;
  } catch {
    return null;
  }
}

function writeStorageEnvelope(storage: Storage | undefined, key: string, envelope: ProjectListCacheEnvelope): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(envelope));
  } catch {
    // ignore quota / unavailable storage
  }
}

function readProjectListCacheEnvelope(periodName: string, userId: number): ProjectListCacheEnvelope | null {
  if (typeof window === 'undefined') return null;
  const key = cacheKey(periodName, userId);
  const fromSession = readStorageEnvelope(window.sessionStorage, key);
  if (fromSession) return fromSession;
  const fromLocal = readStorageEnvelope(window.localStorage, key);
  if (fromLocal) {
    // Promote local cache to session cache for faster subsequent reads in this tab.
    writeStorageEnvelope(window.sessionStorage, key, fromLocal);
    return fromLocal;
  }
  return null;
}

export function readProjectListCache(periodName: string, userId: number): ProjectListBundle | null {
  const parsed = readProjectListCacheEnvelope(periodName, userId);
  if (!parsed) return null;
  if (!parsed.savedAt || Date.now() - parsed.savedAt > CACHE_TTL_MS) return null;
  return parsed.bundle;
}

/** Read cached bundle even if expired (for instant first paint before background revalidate). */
export function readProjectListCacheAnyAge(periodName: string, userId: number): ProjectListBundle | null {
  const parsed = readProjectListCacheEnvelope(periodName, userId);
  return parsed?.bundle ?? null;
}

export function writeProjectListCache(periodName: string, userId: number, bundle: ProjectListBundle): void {
  if (typeof window === 'undefined') return;
  const key = cacheKey(periodName, userId);
  const envelope = { savedAt: Date.now(), bundle };
  writeStorageEnvelope(window.sessionStorage, key, envelope);
  writeStorageEnvelope(window.localStorage, key, envelope);
}

/** Call after local row updates so the next load does not show stale completion / last task. */
export function invalidateProjectListCache(periodName: string, userId: number): void {
  if (typeof window === 'undefined') return;
  const key = cacheKey(periodName, userId);
  try {
    window.sessionStorage.removeItem(key);
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Warm sessionStorage for other budget periods in idle time so switching the year dropdown is instant.
 */
/** Server-side search/filter/pagination — table source of truth. */
export async function fetchProjectListQuery(
  params: ProjectListQueryParams,
  accessToken?: string | null,
): Promise<ProjectListQueryResult> {
  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }
  if (!bff && !accessToken) {
    throw new ProjectListHttpError('Missing authorization', 401);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/project-list/query'), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify({
      periodName: params.periodName,
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      skipCache: params.skipCache ?? false,
      exportAll: params.exportAll ?? false,
      search: params.search,
      huNames: params.huNames,
      archetypeName: params.archetypeName,
      assetTypeGroupName: params.assetTypeGroupName,
      priorityNames: params.priorityNames,
      budgetCategoryIds: params.budgetCategoryIds,
      budgetFilter: params.budgetFilter,
      completionMin: params.completionMin,
      completionMax: params.completionMax,
      finishedTasks: params.finishedTasks,
      scopeAll: params.scopeAll,
      scopeHuNames: params.scopeHuNames,
      scopeArchetypeNames: params.scopeArchetypeNames,
      bddConstructionOnly: params.bddConstructionOnly ?? false,
      hideUnassignedBdd: params.hideUnassignedBdd ?? false,
      sortBy: params.sortBy,
    }),
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    if (text.trim().startsWith('{')) {
      try {
        const j = JSON.parse(text) as { message?: string | string[] };
        const m = j.message;
        msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' && m ? m : msg;
      } catch {
        /* keep raw */
      }
    }
    throw new ProjectListHttpError(msg, res.status);
  }
  return res.json() as Promise<ProjectListQueryResult>;
}

/** Server-side export — single request with exportAll (bounded by BE cap). */
export async function fetchProjectListExport(
  params: Omit<ProjectListQueryParams, 'page' | 'pageSize'>,
  accessToken?: string | null,
): Promise<ProjectListQueryResult> {
  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }
  if (!bff && !accessToken) {
    throw new ProjectListHttpError('Missing authorization', 401);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/project-list/export'), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify({
      periodName: params.periodName,
      userId: params.userId,
      skipCache: params.skipCache ?? true,
      search: params.search,
      huNames: params.huNames,
      archetypeName: params.archetypeName,
      assetTypeGroupName: params.assetTypeGroupName,
      priorityNames: params.priorityNames,
      budgetCategoryIds: params.budgetCategoryIds,
      budgetFilter: params.budgetFilter,
      completionMin: params.completionMin,
      completionMax: params.completionMax,
      finishedTasks: params.finishedTasks,
      scopeAll: params.scopeAll,
      scopeHuNames: params.scopeHuNames,
      scopeArchetypeNames: params.scopeArchetypeNames,
      bddConstructionOnly: params.bddConstructionOnly ?? false,
      hideUnassignedBdd: params.hideUnassignedBdd ?? false,
      sortBy: params.sortBy,
    }),
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    let msg = text || `${res.status} ${res.statusText}`;
    if (text.trim().startsWith('{')) {
      try {
        const j = JSON.parse(text) as { message?: string | string[] };
        const m = j.message;
        msg = Array.isArray(m) ? m.join('; ') : typeof m === 'string' && m ? m : msg;
      } catch {
        /* keep raw */
      }
    }
    throw new ProjectListHttpError(msg, res.status);
  }
  return res.json() as Promise<ProjectListQueryResult>;
}

/** Screen page-bundle alias — same contract as `/project-list/query`. */
export async function fetchProjectListPageBundle(
  params: ProjectListQueryParams,
  accessToken?: string | null,
): Promise<ProjectListQueryResult> {
  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }
  if (!bff && !accessToken) {
    throw new ProjectListHttpError('Missing authorization', 401);
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/project-list/page-bundle'), {
    method: 'POST',
    headers,
    credentials: bff ? 'include' : 'same-origin',
    body: JSON.stringify({
      periodName: params.periodName,
      userId: params.userId,
      page: params.page,
      pageSize: params.pageSize,
      skipCache: params.skipCache ?? false,
      exportAll: params.exportAll ?? false,
      search: params.search,
      huNames: params.huNames,
      archetypeName: params.archetypeName,
      assetTypeGroupName: params.assetTypeGroupName,
      priorityNames: params.priorityNames,
      budgetCategoryIds: params.budgetCategoryIds,
      budgetFilter: params.budgetFilter,
      completionMin: params.completionMin,
      completionMax: params.completionMax,
      finishedTasks: params.finishedTasks,
      scopeAll: params.scopeAll,
      scopeHuNames: params.scopeHuNames,
      scopeArchetypeNames: params.scopeArchetypeNames,
      bddConstructionOnly: params.bddConstructionOnly ?? false,
      hideUnassignedBdd: params.hideUnassignedBdd ?? false,
      sortBy: params.sortBy,
    }),
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    return fetchProjectListQuery(params, accessToken);
  }
  return res.json() as Promise<ProjectListQueryResult>;
}

export function prefetchProjectListBundles(
  periodNames: string[],
  currentPeriod: string,
  userId: number,
  getAccessToken: () => Promise<string | null>,
): void {
  if (typeof window === 'undefined') return;
  const base = process.env.NEXT_PUBLIC_CAPEXBE_URL?.replace(/\/$/, '');
  if (!base?.trim()) return;

  const bff = useBeBffProxy();

  const run = () => {
    void (async () => {
      let prefetchedAlternate = 0;
      const maxAlternatePrefetch = 1;
      for (const p of periodNames) {
        if (p === currentPeriod) continue;
        if (readProjectListCache(p, userId)) continue;
        if (prefetchedAlternate >= maxAlternatePrefetch) break;
        try {
          const token = bff && useBackendSession() ? null : await getAccessToken();
          if (!bff && !token) return;
          const bundle = await fetchProjectListBundleMerged(p, userId, token);
          if (bundle) {
            writeProjectListCache(p, userId, bundle);
            prefetchedAlternate += 1;
          }
        } catch {
          // ignore prefetch failures
        }
      }
    })();
  };

  const w = window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number };
  if (w.requestIdleCallback) w.requestIdleCallback(run, { timeout: 12000 });
  else setTimeout(run, 2000);
}
