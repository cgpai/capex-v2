import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { BudgetPeriod } from '../../types';
import type { BudgetHuPageBundle } from '../../services/budgetHuPageApi';
import { fetchBudgetHuProjectAssetCounts, fetchBudgetHuSyncStamp } from '../../services/budgetHuPageApi';
import { queryKeys } from '../../lib/query-keys';
import {
  fetchBudgetHuPageRemote,
  isAppBudgetPeriodStructureShell,
  type BudgetHuRemoteBundle,
} from '../../hooks/queries/fetchBudgetHuPageData';
import { isBudgetHuFreshFetch } from '../../lib/budgetHuFreshFetch';
import { invalidateRequestCache } from '../../lib/requestCache';
import {
  localHuProjectSignature,
  readStoredHuSyncFingerprint,
  writeStoredHuSyncFingerprint,
} from '../../lib/budgetHuSyncStamp';
import { fetchBudgetHuConfigBundle } from './fetchBudgetHuConfig';
import {
  hydrateBudgetHuPageFromDisk,
  prefetchBudgetHuPage,
} from '../../hooks/queries/warmBudgetHuCache';
import {
  countHuProjects,
  hasBudgetHuPageOnDisk,
  isBudgetPeriodLikelyPartial,
  readBudgetHuConfigCacheAnyAge,
  readBudgetHuPageCacheAnyAge,
  resolveBudgetHuPageForDisplay,
  resolveFullBudgetPeriodForDisplay,
} from '../../lib/budgetHuDiskCache';
import { cloneDeep } from '../../lib/clone';
import { recalculateBudgets } from '../../services/budgetService';
import { buildAssetCountMapFromPeriod, dedupeHuProjectsInPeriod, mergeRemotePeersPreservingLocalEdits, mergeScopedHuIntoPeriod } from './budgetHuHelpers';

/** Dedupe + bottom-up asset→project→unit aggregates so summary/table match nested assets. */
function normalizeBudgetPeriodTree(period: BudgetPeriod): BudgetPeriod {
  const next = cloneDeep(period);
  dedupeHuProjectsInPeriod(next);
  return recalculateBudgets(next);
}

/** Peer sync via backend stamp — keep light; only soft-refetch on real change. */
const HU_SYNC_POLL_MS = 8_000;
const STALE_MS = 5 * 60 * 1000;
const CONFIG_STALE_MS = 30 * 60 * 1000;
const GC_MS = 1000 * 60 * 30;

export type BudgetHuConfigSource = {
  routineAssetMaxBudget: number;
  categories: BudgetHuPageBundle['categories'];
  priorities: BudgetHuPageBundle['priorities'];
  workflows: BudgetHuPageBundle['workflows'];
  assetTypes: BudgetHuPageBundle['assetTypes'];
};

function resolveInitialEditedPeriod(
  periodName: string,
  userId: number,
  currentBudgetPeriod: BudgetPeriod | null | undefined,
  preloaded?: BudgetHuPageBundle | null,
): BudgetPeriod | null {
  if (typeof window === 'undefined') return null;
  const bundle = resolveBudgetHuPageForDisplay(
    periodName,
    userId,
    currentBudgetPeriod,
    preloaded,
  );
  if (
    bundle?.budgetPeriod &&
    !isAppBudgetPeriodStructureShell(bundle.budgetPeriod, periodName)
  ) {
    return normalizeBudgetPeriodTree(bundle.budgetPeriod);
  }
  const seed = resolveFullBudgetPeriodForDisplay(periodName, userId, currentBudgetPeriod);
  if (!seed) return null;
  return normalizeBudgetPeriodTree(seed);
}

function resolveDiskPageSeed(
  periodName: string,
  userId: number,
  canView: boolean,
  currentBudgetPeriod: BudgetPeriod | null | undefined,
  preloadedBudgetHuPage?: BudgetHuPageBundle | null,
): BudgetHuRemoteBundle | undefined {
  if (!periodName.trim() || !canView) return undefined;
  const resolved = resolveBudgetHuPageForDisplay(
    periodName,
    userId,
    currentBudgetPeriod,
    preloadedBudgetHuPage,
  );
  if (resolved) return { ...resolved, source: 'bundle' as const };
  const disk = readBudgetHuPageCacheAnyAge(periodName, userId);
  return disk ? { ...disk, source: 'bundle' as const } : undefined;
}

function resolveDiskConfigSeed(
  userId: number,
  canView: boolean,
  preloadedBudgetHuPage?: BudgetHuPageBundle | null,
) {
  if (!canView) return null;
  return (
    readBudgetHuConfigCacheAnyAge(userId) ??
    (preloadedBudgetHuPage
      ? {
          routineAssetMaxBudget: preloadedBudgetHuPage.routineAssetMaxBudget,
          categories: preloadedBudgetHuPage.categories,
          priorities: preloadedBudgetHuPage.priorities,
          workflows: preloadedBudgetHuPage.workflows,
          assetTypes: preloadedBudgetHuPage.assetTypes,
        }
      : null)
  );
}

export type BudgetHuPagePipelineConfig = {
  queryClient: QueryClient;
  periodName: string;
  huId: string | null;
  userId: number;
  canView: boolean;
  isDirtyRef: MutableRefObject<boolean>;
  updateIsDirty: (dirty: boolean) => void;
  currentBudgetPeriod?: BudgetPeriod | null;
  preloadedBudgetHuPage?: BudgetHuPageBundle | null;
};

export type BudgetHuPagePipeline = {
  editedData: BudgetPeriod | null;
  setEditedData: Dispatch<SetStateAction<BudgetPeriod | null>>;
  serverPeriodRef: MutableRefObject<BudgetPeriod | null>;
  displayPeriod: BudgetPeriod | null;
  remoteBundle: BudgetHuRemoteBundle | undefined;
  configSource: BudgetHuConfigSource | null;
  huRemoteQuery: UseQueryResult<BudgetHuRemoteBundle>;
  configQuery: UseQueryResult<Awaited<ReturnType<typeof fetchBudgetHuConfigBundle>>>;
  hasHuData: boolean;
  hasPageOnDisk: boolean;
  isInitialLoad: boolean;
  bootstrapReady: boolean;
  isBackgroundRefresh: boolean;
  loadError: string | null;
  setLoadError: Dispatch<SetStateAction<string | null>>;
  assetCountByProjectId: Map<string, number>;
  resetPipelineForContextChange: () => void;
};

export function useBudgetHuPagePipeline({
  queryClient,
  periodName,
  huId,
  userId,
  canView,
  isDirtyRef,
  updateIsDirty,
  currentBudgetPeriod,
  preloadedBudgetHuPage,
}: BudgetHuPagePipelineConfig): BudgetHuPagePipeline {
  const lastAppliedBundleRef = useRef<BudgetHuRemoteBundle | null>(null);
  const hydrationPeriodRef = useRef('');
  const hydrationContextRef = useRef('');
  const preloadAppliedRef = useRef(false);
  const serverPeriodRef = useRef<BudgetPeriod | null>(null);
  const editedDataRef = useRef<BudgetPeriod | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [editedData, setEditedData] = useState<BudgetPeriod | null>(() => {
    const seed = resolveInitialEditedPeriod(
      periodName,
      userId,
      currentBudgetPeriod,
      preloadedBudgetHuPage,
    );
    if (seed) {
      preloadAppliedRef.current = true;
      serverPeriodRef.current = cloneDeep(seed);
    }
    return seed;
  });

  editedDataRef.current = editedData;

  const diskPageSeed = useMemo(
    () =>
      resolveDiskPageSeed(
        periodName,
        userId,
        canView,
        currentBudgetPeriod,
        preloadedBudgetHuPage,
      ),
    [periodName, userId, canView, currentBudgetPeriod, preloadedBudgetHuPage],
  );

  const diskConfigSeed = useMemo(
    () => resolveDiskConfigSeed(userId, canView, preloadedBudgetHuPage),
    [userId, canView, preloadedBudgetHuPage],
  );

  const likelyPartialDiskCache = useMemo(
    () => isBudgetPeriodLikelyPartial(diskPageSeed?.budgetPeriod),
    [diskPageSeed?.budgetPeriod],
  );

  const mayUseDiskSeed = Boolean(diskPageSeed?.budgetPeriod) && !likelyPartialDiskCache;

  /** Disk cache is period-wide — only reuse as query seed when this HU already has projects. */
  const diskSeedHasCurrentHuProjects = useMemo(
    () => countHuProjects(diskPageSeed?.budgetPeriod, huId) > 0,
    [diskPageSeed?.budgetPeriod, huId],
  );

  const useDiskSeedForHuQuery =
    mayUseDiskSeed && (!huId?.trim() || diskSeedHasCurrentHuProjects);

  const applyPageBundle = useCallback(
    (bundle: BudgetHuPageBundle | BudgetHuRemoteBundle) => {
      if (
        !bundle.budgetPeriod ||
        isAppBudgetPeriodStructureShell(bundle.budgetPeriod, periodName)
      ) {
        return;
      }
      lastAppliedBundleRef.current = {
        ...bundle,
        source: 'bundle' as const,
      };

      const current = editedDataRef.current;

      // Dirty session: keep local edits, fold in peer projects so realtime creates appear immediately.
      if (isDirtyRef.current && current) {
        const peerMerged = normalizeBudgetPeriodTree(
          mergeRemotePeersPreservingLocalEdits(current, bundle.budgetPeriod),
        );
        serverPeriodRef.current = normalizeBudgetPeriodTree(bundle.budgetPeriod);
        setEditedData(peerMerged);
        return;
      }

      const scopedHuId =
        'scopedHuId' in bundle ? String((bundle as BudgetHuRemoteBundle).scopedHuId ?? '').trim() : '';

      // HU-scoped payload: merge into existing tree (keep other HUs already visited).
      if (scopedHuId && current && !isAppBudgetPeriodStructureShell(current, periodName)) {
        const merged = normalizeBudgetPeriodTree(
          mergeScopedHuIntoPeriod(current, bundle.budgetPeriod, scopedHuId),
        );
        serverPeriodRef.current = cloneDeep(merged);
        setEditedData(merged);
        return;
      }

      // Clean session: server is absolute source of truth (fixes stale disk codes / ghost rows).
      const next = normalizeBudgetPeriodTree(bundle.budgetPeriod);
      serverPeriodRef.current = cloneDeep(next);
      setEditedData(next);
    },
    [periodName, isDirtyRef],
  );

  const resetPipelineForContextChange = useCallback(() => {
    lastAppliedBundleRef.current = null;
    hydrationPeriodRef.current = '';
    hydrationContextRef.current = '';
    preloadAppliedRef.current = false;
    serverPeriodRef.current = null;
    setEditedData(null);
    setLoadError(null);
  }, []);

  useLayoutEffect(() => {
    if (!periodName.trim() || !canView) return;

    const periodKey = periodName.trim();
    const contextKey = `${periodKey}:${userId}:${huId ?? ''}`;
    const periodChanged = hydrationPeriodRef.current !== periodKey;
    const contextChanged = hydrationContextRef.current !== contextKey;
    if (periodChanged) {
      hydrationPeriodRef.current = periodKey;
      lastAppliedBundleRef.current = null;
      preloadAppliedRef.current = false;
    }
    if (contextChanged) {
      hydrationContextRef.current = contextKey;
    }

    // Prefer instant disk hydrate for this HU; prefetch network when cache is cold.
    hydrateBudgetHuPageFromDisk(queryClient, periodName, userId, {
      hospitalUnitId: huId ?? undefined,
    });
    if (!useDiskSeedForHuQuery || likelyPartialDiskCache) {
      void prefetchBudgetHuPage(queryClient, periodName, userId, {
        hospitalUnitId: huId ?? undefined,
      });
    }

    const shouldSeedLocal =
      periodChanged || (!preloadAppliedRef.current && !isDirtyRef.current);
    if (shouldSeedLocal) {
      const seed = resolveInitialEditedPeriod(
        periodName,
        userId,
        currentBudgetPeriod,
        preloadedBudgetHuPage,
      );
      if (seed) {
        preloadAppliedRef.current = true;
        // seed already normalized via resolveInitialEditedPeriod / apply path
        const next = normalizeBudgetPeriodTree(seed);
        serverPeriodRef.current = cloneDeep(next);
        setEditedData(next);
      } else if (periodChanged) {
        serverPeriodRef.current = null;
        setEditedData(null);
      }
    }

    if (
      diskPageSeed &&
      (periodChanged || !lastAppliedBundleRef.current) &&
      useDiskSeedForHuQuery
    ) {
      applyPageBundle(diskPageSeed);
    }
  }, [
    periodName,
    userId,
    huId,
    canView,
    queryClient,
    diskPageSeed,
    applyPageBundle,
    currentBudgetPeriod,
    preloadedBudgetHuPage,
    useDiskSeedForHuQuery,
    likelyPartialDiskCache,
  ]);

  const warmHuSeed = useMemo((): BudgetHuRemoteBundle | undefined => {
    if (!huId?.trim() || !periodName.trim()) return undefined;
    const cached = queryClient.getQueryData<BudgetHuRemoteBundle>(
      queryKeys.budgetHu.page(periodName, userId, huId),
    );
    if (cached?.budgetPeriod && countHuProjects(cached.budgetPeriod, huId) > 0) {
      return cached;
    }
    if (useDiskSeedForHuQuery && diskPageSeed) return diskPageSeed as BudgetHuRemoteBundle;
    return undefined;
  }, [queryClient, periodName, userId, huId, useDiskSeedForHuQuery, diskPageSeed]);

  const hasWarmHuCache = Boolean(warmHuSeed);

  const huRemoteQuery = useQuery({
    queryKey: queryKeys.budgetHu.page(periodName, userId, huId),
    queryFn: () =>
      fetchBudgetHuPageRemote(periodName, userId, {
        skipCache: isBudgetHuFreshFetch(),
        hospitalUnitId: huId || undefined,
        omitConfig: true,
      }),
    enabled: !!periodName.trim() && canView && !!huId?.trim(),
    staleTime: hasWarmHuCache || diskSeedHasCurrentHuProjects ? STALE_MS : 0,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: hasWarmHuCache ? false : likelyPartialDiskCache || !useDiskSeedForHuQuery ? 'always' : false,
    initialData: warmHuSeed,
    placeholderData: (prev) => prev ?? warmHuSeed,
  });

  const configQuery = useQuery({
    queryKey: queryKeys.budgetHu.config(),
    queryFn: () => fetchBudgetHuConfigBundle(userId),
    enabled: !!periodName.trim() && canView,
    staleTime: CONFIG_STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: diskConfigSeed ? false : true,
    initialData: diskConfigSeed ?? undefined,
    placeholderData: (prev) => prev ?? diskConfigSeed ?? undefined,
  });

  const remoteBundle = huRemoteQuery.data;

  const displayPeriod = useMemo((): BudgetPeriod | null => {
    if (editedData && !isAppBudgetPeriodStructureShell(editedData, periodName)) {
      return editedData;
    }
    const resolved = resolveFullBudgetPeriodForDisplay(
      periodName,
      userId,
      currentBudgetPeriod,
    );
    if (resolved) return resolved;
    if (remoteBundle?.budgetPeriod) return remoteBundle.budgetPeriod;
    if (diskPageSeed?.budgetPeriod) return diskPageSeed.budgetPeriod;
    return null;
  }, [
    editedData,
    periodName,
    userId,
    currentBudgetPeriod,
    remoteBundle?.budgetPeriod,
    diskPageSeed?.budgetPeriod,
  ]);

  const seedAssetCountMap = useMemo(
    () => buildAssetCountMapFromPeriod(editedData ?? displayPeriod),
    [editedData, displayPeriod],
  );

  const assetCountQuery = useQuery({
    queryKey: queryKeys.budgetHu.assetCounts(periodName, userId),
    queryFn: () => fetchBudgetHuProjectAssetCounts(periodName, userId),
    enabled: !!periodName.trim() && canView,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnMount: likelyPartialDiskCache || seedAssetCountMap.size === 0 ? 'always' : false,
    placeholderData: (prev) =>
      prev ?? (seedAssetCountMap.size > 0 ? Object.fromEntries(seedAssetCountMap) : undefined),
  });

  const assetCountByProjectId = useMemo(() => {
    const map = new Map<string, number>(seedAssetCountMap);
    const remote = assetCountQuery.data;
    if (remote) {
      for (const [projectId, count] of Object.entries(remote)) {
        const n = Number(count) || 0;
        if (n > (map.get(projectId) ?? 0)) {
          map.set(projectId, n);
        }
      }
    }
    return map;
  }, [seedAssetCountMap, assetCountQuery.data]);

  const configSource = configQuery.data ?? diskConfigSeed;

  const hasHuData = useMemo(() => {
    if (!periodName.trim() || !displayPeriod) return false;
    return !isAppBudgetPeriodStructureShell(displayPeriod, periodName);
  }, [displayPeriod, periodName]);

  const hasPageOnDisk = useMemo(
    () =>
      !!diskPageSeed?.budgetPeriod ||
      (!!periodName.trim() &&
        !!userId &&
        hasBudgetHuPageOnDisk(periodName, userId)),
    [diskPageSeed?.budgetPeriod, periodName, userId],
  );

  const hasListData =
    hasHuData ||
    !!editedData ||
    !!diskPageSeed?.budgetPeriod ||
    !!remoteBundle?.budgetPeriod;

  const currentHuProjectCount = countHuProjects(editedData ?? displayPeriod, huId);

  const hasHuShell = useMemo(() => {
    if (!huId?.trim() || !displayPeriod) return false;
    return displayPeriod.archetypes.some((arch) =>
      arch.units.some((unit) => unit.id === huId),
    );
  }, [displayPeriod, huId]);

  const isInitialLoad =
    !!huId?.trim() &&
    huRemoteQuery.isPending &&
    !huRemoteQuery.data &&
    !hasWarmHuCache &&
    currentHuProjectCount === 0 &&
    !hasHuShell &&
    !huRemoteQuery.isError;

  const huQuerySettled =
    !huId?.trim() || huRemoteQuery.isSuccess || huRemoteQuery.isError;

  const bootstrapReady = !isInitialLoad && huQuerySettled;

  const isBackgroundRefresh =
    !isInitialLoad &&
    hasListData &&
    (huRemoteQuery.isFetching || configQuery.isFetching) &&
    !huRemoteQuery.isPending;

  useEffect(() => {
    if (!periodName) {
      resetPipelineForContextChange();
      updateIsDirty(false);
      return;
    }
    setLoadError(null);
  }, [periodName, resetPipelineForContextChange, updateIsDirty]);

  useEffect(() => {
    if (!huRemoteQuery.isSuccess || !huRemoteQuery.data?.budgetPeriod) return;
    if (huRemoteQuery.isPlaceholderData && mayUseDiskSeed) return;
    applyPageBundle(huRemoteQuery.data);
  }, [
    huRemoteQuery.isSuccess,
    huRemoteQuery.data,
    huRemoteQuery.isPlaceholderData,
    mayUseDiskSeed,
    applyPageBundle,
  ]);

  useEffect(() => {
    if (huRemoteQuery.isError) {
      console.error('Failed to fetch HU data:', huRemoteQuery.error);
      if (!hasListData && !hasPageOnDisk) {
        setLoadError('Failed to load budget data for the Hospital Unit.');
      }
      return;
    }
    if (
      !huRemoteQuery.isPending &&
      !huRemoteQuery.data?.budgetPeriod &&
      !resolveFullBudgetPeriodForDisplay(periodName, userId, currentBudgetPeriod)
    ) {
      serverPeriodRef.current = null;
      setEditedData(null);
    }
  }, [
    huRemoteQuery.isError,
    huRemoteQuery.error,
    huRemoteQuery.isPending,
    huRemoteQuery.data,
    hasListData,
    hasPageOnDisk,
    periodName,
    userId,
    currentBudgetPeriod,
  ]);

  // Soft peer sync: stamp-only on open; page refetch only when fingerprint / codes diverge.
  useEffect(() => {
    if (!periodName.trim() || !huId?.trim() || !canView || !userId) return;
    if (typeof window === 'undefined') return;

    let cancelled = false;
    let inFlight = false;
    let lastFingerprint = readStoredHuSyncFingerprint(userId, periodName, huId);
    const pageCacheKey = huId
      ? `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}:hu:${huId}`
      : `app:table:budget-hu:page:${userId}:${periodName.trim().toLowerCase()}`;
    const countsCacheKey = `app:table:budget-hu:asset-counts:${userId}:${periodName.trim().toLowerCase()}`;

    /** Soft client refetch — no Nest skipCache (avoids Redis wipe + cold rebuild). */
    const softRefetchPage = async () => {
      invalidateRequestCache(pageCacheKey);
      invalidateRequestCache(countsCacheKey);
      await Promise.all([
        queryClient.refetchQueries({
          queryKey: queryKeys.budgetHu.page(periodName, userId, huId),
        }),
        queryClient.refetchQueries({
          queryKey: queryKeys.budgetHu.assetCounts(periodName, userId),
        }),
      ]);
    };

    const tick = async () => {
      if (cancelled || inFlight) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      inFlight = true;
      try {
        const stamp = await fetchBudgetHuSyncStamp(periodName, userId, huId);
        if (cancelled || !stamp?.fingerprint) return;

        const prevFp = lastFingerprint;
        const fpChanged = !!prevFp && stamp.fingerprint !== prevFp;
        const localSig = localHuProjectSignature(editedDataRef.current, huId);
        const codeMismatch =
          !isDirtyRef.current &&
          !!stamp.projectSignature &&
          localSig !== stamp.projectSignature;

        if (isDirtyRef.current) {
          lastFingerprint = stamp.fingerprint;
          writeStoredHuSyncFingerprint(userId, periodName, huId, stamp.fingerprint);
          if (!fpChanged) return;
          await softRefetchPage();
          return;
        }

        if (!fpChanged && !codeMismatch) {
          lastFingerprint = stamp.fingerprint;
          writeStoredHuSyncFingerprint(userId, periodName, huId, stamp.fingerprint);
          return;
        }

        // Cold open before local hydrate: let mount page query own the first bundle.
        if (!prevFp && !editedDataRef.current) {
          return;
        }

        await softRefetchPage();
        lastFingerprint = stamp.fingerprint;
        writeStoredHuSyncFingerprint(userId, periodName, huId, stamp.fingerprint);
      } catch (error) {
        console.error('Budget HU peer sync failed:', error);
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const intervalId = window.setInterval(() => {
      void tick();
    }, HU_SYNC_POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void tick();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [periodName, huId, userId, canView, queryClient, isDirtyRef]);

  return {
    editedData,
    setEditedData,
    serverPeriodRef,
    displayPeriod,
    remoteBundle,
    configSource,
    huRemoteQuery,
    configQuery,
    hasHuData,
    hasPageOnDisk,
    isInitialLoad,
    bootstrapReady,
    isBackgroundRefresh,
    loadError,
    setLoadError,
    assetCountByProjectId,
    resetPipelineForContextChange,
  };
}
