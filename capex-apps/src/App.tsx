
import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './components/organisms/Sidebar/Sidebar';
import { Header } from './components/organisms/Header/Header';
import { Page, TaskCurrentStatus, AdhocTaskStatus } from './types';
import type { BudgetMultiYear, BudgetPeriod, User, UserRole, ChangeSummary, Archetype, HospitalUnit, Notification, UserTask } from './types';
import {
  LazyDashboardPage,
  LazyExecutiveSummaryPage,
  LazyAIAnalyticsPage,
  LazyUserMonitoringPage,
  LazyDataMigrationPage,
  LazyCapexProjectListPage,
  LazyBDDConstructionPage,
  LazyMomDailySummaryPage,
  LazyMyTaskPage,
  LazyBudgetMultiYearPage,
  LazyBudgetPeriodPage,
  LazyBudgetArchetypePage,
  LazyBudgetHUPage,
  LazyPOUpdatePage,
  LazyGRUpdatePage,
  LazyFSUpdatePage,
  LazyFSApprovalPage,
  LazyFSRealizationPage,
  LazyConfigurationPage,
  LazyProfilePage,
  LazyLoginPage,
} from './screens/registry';
import * as budgetService from './services/budgetService';
import { getAccessTokenForBackend } from './lib/authSession';
import { UnsavedChangesModal } from './components/organisms/UnsavedChangesModal/UnsavedChangesModal';
import { Toast } from './components/atoms/Toast/Toast';
import { usePermissions } from './hooks/usePermissions';
import { readBddConstructionPreload } from './hooks/queries/fetchBddConstructionPageData';
import { useNavPrefetch } from './hooks/useNavPrefetch';
import { useTaskNotifications } from './hooks/useTaskNotifications';
import { isRecoveryFromUrl } from './lib/authSupabase';
import { ToastProvider, type ShowToastOptions } from './contexts/ToastContext';
import * as taskService from './services/taskService';
import * as notificationService from './services/notificationService';
import { NAV_ITEMS } from './constants';
import { pageToHref, pathnameToPage } from './lib/pageRoutes';
import { resolvePostLoginLandingPage } from './lib/postLoginLanding';
import {
  resolveProjectListTableForDisplay,
  defaultScopesForDiskPrefetch,
} from './lib/capexProjectListDiskCache';
import { queryKeys } from './lib/query-keys';
import {
  fetchAppBootstrapData,
  type AppBootstrapPayload,
} from './hooks/queries/fetchAppBootstrapData';
import { fetchAppInitPackFromBackend } from './services/appBootstrapApi';
import {
  hydrateCapexProjectListTableFromDisk,
  warmCapexProjectListTableCache,
  warmCapexProjectListTableCacheWithTimeout,
  LOGIN_CPL_PREFETCH_AWAIT_MS,
} from './lib/prefetchCapexProjectList';
import {
  hydrateBddConstructionTableFromDisk,
  warmBddConstructionTableCache,
} from './lib/prefetchBddConstruction';
import { areUserScopesReadyForList, pickEnrichedUserFromPack } from './lib/appUserBootstrap';
import {
  areShellPermissionsReady,
  mergeAuthIdentityUser,
} from './lib/auth/mergeAuthIdentityUser';
import { enrichUserAssignments } from './lib/userRoleResolution';
import {
  syncAppShellCaches,
  mergeBootstrapPreservingAuthPatch,
  clearShellCachePatchGuard,
  isShellCachePatchGuarded,
} from './lib/syncAppShellCaches';
import { prefetchPoUpdatePage, hydratePoUpdatePageFromDisk, readPoUpdateSnapshotAnyAge } from './hooks/queries/fetchPoUpdatePageData';
import { prefetchGrUpdatePage } from './hooks/queries/fetchGrUpdatePageData';
import {
  hydrateFsUpdatePageFromDisk,
  prefetchFsUpdatePage,
  readFsUpdateSnapshotAnyAge,
} from './hooks/queries/fetchFsUpdatePageData';
import {
  hydrateFsApprovalPageFromDisk,
  prefetchFsApprovalPage,
  readFsApprovalSnapshotAnyAge,
} from './hooks/queries/fetchFsApprovalPageData';
import {
  hydrateFsRealizationPageFromDisk,
  prefetchFsRealizationPage,
  readFsRealizationSnapshotAnyAge,
} from './hooks/queries/fetchFsRealizationPageData';
import { useNotificationsState } from './hooks/useNotificationsState';
import { PreAuthAppShell } from './components/organisms/PreAuthAppShell/PreAuthAppShell';
import {
  readCachedAuthUser,
  writeCachedAuthUser,
  clearCachedAuthUser,
} from './lib/authSessionCache';
import {
  readCachedRoles,
  writeCachedRoles,
  clearCachedRoles,
} from './lib/appRolesCache';
import {
  readCachedBootstrap,
  writeCachedBootstrap,
  clearCachedBootstrap,
} from './lib/appBootstrapCache';
import { AuthSessionSync } from './components/auth/AuthSessionSync';
import { SessionExpiryWarning } from './components/auth/SessionExpiryWarning';
import { registerAuthFailureHandler } from './lib/auth/authFailureHandler';
import {
  clearServerAuthCookies,
  fetchAuthMe,
  invalidateAuthProbeCache,
  invalidateStaleAuthCookies,
  logoutBackend,
  probeBackendSession,
  refreshBackendSessionCoordinated,
  setSessionCookieHint,
  shouldRunAuthSessionProbe,
} from './lib/auth/authApi';
import { clearPersistedQueryCache } from './lib/queryDehydrate';
import { clearTabSessionState } from './lib/auth/clearTabSessionState';
import { useBackendSession } from './lib/auth/authConstants';
import { isCapexBeConfigured } from './lib/capexBeClient';
import { useAuthStore } from './stores/authStore';
import { readInitialPeriodShellState, writePeriodShellCache } from './lib/periodSelectionCache';
import { prefetchDashboardBundle } from './lib/prefetchDashboardBundle';
import { prefetchExecutiveDashboard } from './lib/prefetchExecutiveDashboard';
import { prefetchBudgetSiloamPeriod } from './lib/prefetchBudgetSiloamPeriod';
import { prefetchBudgetMultiYearPage } from './lib/prefetchBudgetMultiYearPage';
import {
  hydrateConfigurationFromDisk,
  prefetchConfigurationPageCritical,
} from './lib/prefetchConfigurationPage';
import {
  refreshActiveConfigurationQueries,
  refreshBudgetHuMasterConfigQueries,
  subscribeConfigurationMasterChanged,
} from './lib/configurationCacheSync';
import type { ConfigSliceKey } from './services/configurationApi';
import { invalidateRequestCache } from './lib/requestCache';
import { scheduleStaggeredIdle } from './lib/scheduleIdlePrefetch';
import { prefetchMyTasksPage, hydrateMyTasksFromDisk } from './lib/prefetchMyTasksPage';
import { MY_TASKS_STALE_MS, resolveMyTasksForUser } from './hooks/queries/fetchMyTasksPage';
import { resolveMyTasksBundleForDisplay } from './lib/myTasksDiskCache';
import {
  hydrateBudgetHuPageFromDisk,
  prefetchBudgetHuPage,
  prefetchBudgetHuPageWithTimeout,
  prefetchBudgetHuUnitsIdle,
  warmBudgetHuConfigCache,
} from './hooks/queries/warmBudgetHuCache';
import {
  findHuInBudgetPeriod,
  foldNetworkBudgetSaveIntoAppPeriod,
  hasFullBudgetPeriodOnDisk,
  mergeBudgetPeriodMasterStructure,
  readBudgetHuFilterSelection,
  readBudgetPeriodCacheAnyAge,
  readInitialBudgetPeriodForShell,
  resolveBudgetHuPageForDisplay,
  resolveFullBudgetPeriodForDisplay,
  clearBudgetHuFilterSelection,
  writeBudgetHuFilterSelection,
  writeBudgetPeriodCache,
} from './lib/budgetHuDiskCache';

const initialPeriodShell = readInitialPeriodShellState();
const initialBootstrap = readCachedBootstrap();
const MAX_PERSISTED_OPEN_TASK_IDS = 3000;
const MAX_PERSISTED_REMINDER_KEYS = 6000;

function cloneRolesForApp(roles: UserRole[]): UserRole[] {
  return JSON.parse(JSON.stringify(roles)) as UserRole[];
}

function sameUserSession(a: User, b: User): boolean {
  if (a.id !== b.id) return false;
  if (a.username !== b.username || a.email !== b.email) return false;
  return JSON.stringify(a.assignments) === JSON.stringify(b.assignments);
}

function pushAuthSessionIfChanged(user: User, roleNames: string[]): void {
  if (!useBackendSession()) return;
  const prev = useAuthStore.getState().user;
  if (prev && sameUserSession(prev, user)) {
    const prevRoles = useAuthStore.getState().roles;
    if (JSON.stringify(prevRoles) === JSON.stringify(roleNames)) return;
  }
  queueMicrotask(() => useAuthStore.getState().setSession(user, roleNames));
}

function trimSetToNewest(set: Set<string>, maxSize: number): Set<string> {
  if (set.size <= maxSize) return set;
  const arr = Array.from(set);
  const trimmed = arr.slice(Math.max(0, arr.length - maxSize));
  return new Set(trimmed);
}

function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function safeWriteStorageArray(key: string, values: string[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

/** Periode beririsan dengan tahun kalender `year` (rentang tanggal dan/atau teks nama/multi-year). */
function budgetPeriodOverlapsCalendarYear(period: BudgetPeriod, year: number): boolean {
  const y = String(year);
  const label = `${period.periodName} ${period.multiYearName}`.toLowerCase();
  if (label.includes(y)) return true;
  if (!period.startDate?.trim() || !period.endDate?.trim()) return false;
  const start = new Date(period.startDate);
  const end = new Date(period.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);
  return start <= yearEnd && end >= yearStart;
}

/**
 * Default filter periode = yang relevan dengan tahun kalender `year` (mis. 2026).
 * `preferredMultiYearName` hanya dipakai sebagai tie-break, bukan membatasi kandidat
 * (supaya periode tahun berjalan tidak hilang bila `multiYearName` summary tidak selaras).
 */
function pickDefaultBudgetPeriodNameForYear(
  periods: BudgetPeriod[],
  year: number,
  preferredMultiYearName: string | null = null,
): string {
  if (periods.length === 0) return '';
  let pool = periods.filter((p) => budgetPeriodOverlapsCalendarYear(p, year));
  if (pool.length === 0) {
    pool = periods.filter((p) => p.periodName.toLowerCase().includes(String(year)));
  }
  if (pool.length === 0) pool = periods;
  const y = String(year);
  const sorted = [...pool].sort((a, b) => {
    const aHit = a.periodName.toLowerCase().includes(y) ? 0 : 1;
    const bHit = b.periodName.toLowerCase().includes(y) ? 0 : 1;
    if (aHit !== bHit) return aHit - bHit;
    if (preferredMultiYearName) {
      const ap = a.multiYearName === preferredMultiYearName ? 0 : 1;
      const bp = b.multiYearName === preferredMultiYearName ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const ta = a.startDate ? new Date(a.startDate).getTime() : 0;
    const tb = b.startDate ? new Date(b.startDate).getTime() : 0;
    if (tb !== ta) return tb - ta;
    return a.periodName.localeCompare(b.periodName);
  });
  return sorted[0]?.periodName ?? '';
}

type AppProps = {
  /** Server read of httpOnly session cookies — false on clean login (skip /me). */
  hasSessionCookies?: boolean;
};

const App: React.FC<AppProps> = ({ hasSessionCookies = false }) => {
  useEffect(() => {
    setSessionCookieHint(hasSessionCookies);
  }, [hasSessionCookies]);
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  const routePage = useMemo(() => pathnameToPage(pathname), [pathname]);
  const [dataInitialized, setDataInitialized] = useState(
    () => Boolean(initialBootstrap?.users?.length && initialBootstrap?.roles?.length),
  );
  /** false sampai probe /auth/me selesai — hindari LazyLoginPage saat reload masih memvalidasi cookie. */
  const [authProbeComplete, setAuthProbeComplete] = useState(false);

  // Global filter state
  const [allPeriods, setAllPeriods] = useState<BudgetPeriod[]>(
    () => initialBootstrap?.allPeriods?.length
      ? initialBootstrap.allPeriods
      : initialPeriodShell.allPeriods,
  );
  const [selectedPeriodName, setSelectedPeriodName] = useState<string>(initialPeriodShell.selectedPeriodName);
  const [currentBudgetPeriod, setCurrentBudgetPeriod] = useState<BudgetPeriod | null>(() =>
    readInitialBudgetPeriodForShell(),
  );
  const [isLoadingBudgetPeriod, setIsLoadingBudgetPeriod] = useState(false);
  const [selectedArchetypeId, setSelectedArchetypeId] = useState<string | null>(() => {
    const pn = initialPeriodShell.selectedPeriodName;
    return pn ? (readBudgetHuFilterSelection(pn)?.archetypeId ?? null) : null;
  });
  const [selectedHuId, setSelectedHuId] = useState<string | null>(() => {
    const pn = initialPeriodShell.selectedPeriodName;
    return pn ? (readBudgetHuFilterSelection(pn)?.huId ?? null) : null;
  });
  /** Locked filter from localStorage — never auto-overwrite with first HU while this is set. */
  const pinnedFilterRef = useRef(readBudgetHuFilterSelection(initialPeriodShell.selectedPeriodName));
  /** True only after user changes archetype/HU via Header controls. */
  const filterUserTouchedRef = useRef(false);

  // Global state for user and permissions
  const [allUsers, setAllUsers] = useState<User[]>(() => initialBootstrap?.users ?? []);
  const [allRoles, setAllRoles] = useState<UserRole[]>(
    () => initialBootstrap?.roles?.length ? initialBootstrap.roles : readCachedRoles(),
  );
  const [currentUser, setCurrentUser] = useState<User | null>(null);

  const {
    notifications,
    markAsRead: handleMarkNotificationAsRead,
    markAllAsRead: handleMarkAllNotificationsAsRead,
    invalidate: refreshNotifications,
    prependNotification,
  } = useNotificationsState(authProbeComplete ? (currentUser?.id ?? null) : null);

  // State for unsaved changes modal
  const [isPageDirty, setIsPageDirty] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<Page | null>(null);
  const [changeSummary, setChangeSummary] = useState<ChangeSummary | null>(null);
  const pageActionRefs = useRef<{ onSave: () => Promise<void>; onCancel: () => void; getSummary: () => ChangeSummary | null; }>({
      onSave: async () => {},
      onCancel: () => {},
      getSummary: () => null,
  });

  const [toast, setToast] = useState<{
    id: number;
    message: string;
    type: 'success' | 'error';
    title?: string;
  } | null>(null);
  const dismissToast = useCallback(() => setToast(null), []);
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [desktopNotificationsEnabled, setDesktopNotificationsEnabled] = useState(true);
  const [browserNotificationPermission, setBrowserNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const sentNotificationDedupeKeysRef = useRef<Set<string>>(new Set());
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;
  const desktopNotificationSettingKey = useMemo(
    () => (currentUser ? `desktop-notification-enabled-${currentUser.id}` : ''),
    [currentUser],
  );
  /**
   * Avoid forcing logout on a single transient `/auth/me` miss
   * (can happen right after login while cookie/session settles).
   */
  const backendUnauthedStreakRef = useRef(0);
  const [sidebarNavRevision, setSidebarNavRevision] = useState(0);
  /** Avoid remounting `<main>` during heavy data migration batches. */
  const activePageRef = useRef<Page>(routePage);
  const prevActivePageForMigrationRef = useRef<Page>(routePage);
  useEffect(() => {
    activePageRef.current = routePage;
  }, [routePage]);

  const showToast = useCallback(
    (message: string, type: 'success' | 'error' = 'success', options?: ShowToastOptions) => {
      setToast({ id: Date.now(), message, type, title: options?.title });
    },
    []
  );

  const pushNotification = useCallback((message: string, dedupeKey?: string) => {
    if (!currentUser) return;

    const stableKey =
      dedupeKey ?? `ephemeral-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    if (sentNotificationDedupeKeysRef.current.has(stableKey)) return;
    sentNotificationDedupeKeysRef.current.add(stableKey);

    const nextNotification: Notification = {
      id: notificationService.buildNotificationId(currentUser.id, stableKey),
      userId: currentUser.id,
      message,
      type: 'task',
      isRead: false,
      createdAt: new Date().toISOString(),
      linkToPage: Page.MyTask,
    };

    prependNotification(nextNotification);

    void notificationService.createNotification(nextNotification).catch((error) => {
      console.error('Failed to save notification:', error);
      sentNotificationDedupeKeysRef.current.delete(stableKey);
    });

    if (
      desktopNotificationsEnabled &&
      typeof window !== 'undefined' &&
      'Notification' in window &&
      Notification.permission === 'granted'
    ) {
      new window.Notification('Capex Reminder', {
        body: message,
        tag: `capex-task-${nextNotification.id}`,
      });
    }
  }, [currentUser, desktopNotificationsEnabled, prependNotification]);

  const permissions = usePermissions(currentUser, allRoles);

  const { resetTaskNotificationState } = useTaskNotifications({
    currentUser: authProbeComplete ? currentUser : null,
    userScopes: permissions.userScopes,
    selectedPeriodName,
    queryClient,
    desktopNotificationsEnabled,
    setDesktopNotificationsEnabled,
    setBrowserNotificationPermission,
    pushNotification,
    refreshNotifications,
  });

  const syncPeriodSelectionFromLists = useCallback((multiYears: BudgetMultiYear[], periods: BudgetPeriod[]) => {
    const currentYear = new Date().getFullYear();
    const currentMultiYear = multiYears.find((my) => currentYear >= my.startYear && currentYear <= my.endYear);
    const preferredMultiYearName = currentMultiYear?.name ?? null;

    setSelectedPeriodName((prev) => {
      if (periods.length === 0) {
        return prev;
      }
      if (prev && periods.some((p) => p.periodName === prev)) {
        return prev;
      }
      return pickDefaultBudgetPeriodNameForYear(periods, currentYear, preferredMultiYearName);
    });
  }, []);

  const screenQueryPredicate = useCallback(
    (q: { queryKey: unknown }) => Array.isArray(q.queryKey) && q.queryKey[0] === 'screen',
    [],
  );

  const refreshBudgetData = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: [...queryKeys.app.bootstrap] });
    await queryClient.invalidateQueries({ predicate: screenQueryPredicate });
  }, [queryClient, screenQueryPredicate]);

  /** Refresh ringan: hanya struktur list/summaries, tanpa fetch seluruh period detail. */
  const refreshBudgetListOnly = useCallback(async () => {
    const uid =
      currentUser?.id ??
      (typeof window !== 'undefined' ? parseInt(sessionStorage.getItem('currentUserId') || '', 10) : NaN);

    let multiYears: BudgetMultiYear[] = [];
    let summaries: BudgetPeriod[] = [];

    if (Number.isFinite(uid) && isCapexBeConfigured()) {
      const pack = await fetchAppInitPackFromBackend(null, uid);
      if (pack) {
        multiYears = pack.multiYears;
        summaries = pack.periodSummaries;
      }
    }

    if (!summaries.length) {
      const cached = queryClient.getQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap]);
      if (cached?.allPeriods?.length) {
        summaries = cached.allPeriods;
        multiYears = cached.multiYears ?? [];
      }
    }

    if (!summaries.length) {
      return;
    }

    setAllPeriods(summaries);
    syncPeriodSelectionFromLists(multiYears, summaries);
    queryClient.setQueryData<AppBootstrapPayload>([...queryKeys.app.bootstrap], (old) =>
      old ? { ...old, multiYears, allPeriods: summaries } : old,
    );
  }, [queryClient, syncPeriodSelectionFromLists, currentUser?.id]);

  const handleBudgetPageDataChange = useCallback(() => {
    void refreshBudgetListOnly();
  }, [refreshBudgetListOnly]);

  /** Sinkron pohon budget di shell setelah save di halaman anak — tanpa getBudgetByPeriodName penuh. */
  const handleBudgetPeriodSaved = useCallback(
    (next: BudgetPeriod) => {
      if (next.periodName.trim()) {
        writePeriodShellCache({
          selectedPeriodName: next.periodName.trim(),
          periodNames: allPeriods.length
            ? allPeriods.map((p) => p.periodName)
            : [next.periodName.trim()],
        });
      }
      setCurrentBudgetPeriod((prev) => {
        const merged =
          prev && prev.periodName === next.periodName
            ? foldNetworkBudgetSaveIntoAppPeriod(prev, next)
            : (JSON.parse(JSON.stringify(next)) as BudgetPeriod);
        const uid = currentUser?.id;
        if (uid && merged.periodName) {
          writeBudgetPeriodCache(merged.periodName, uid, merged);
        }
        return JSON.parse(JSON.stringify(merged)) as BudgetPeriod;
      });
      if (next.periodName.trim()) {
        queryClient.setQueryData(
          queryKeys.budgetSiloamPeriod.detail(next.periodName.trim()),
          (old: { budgetPeriod?: BudgetPeriod | null; categories?: unknown[] } | undefined) => ({
            budgetPeriod: next,
            categories: Array.isArray(old?.categories) ? old.categories : [],
          }),
        );
      }
    },
    [currentUser?.id, allPeriods, queryClient],
  );

  useEffect(() => {
    const fetchPeriodData = async () => {
        if (!authProbeComplete || !currentUser?.id) {
            if (authProbeComplete) {
                setCurrentBudgetPeriod(null);
                setIsLoadingBudgetPeriod(false);
            }
            return;
        }
        if (!selectedPeriodName) {
            setCurrentBudgetPeriod(null);
            setIsLoadingBudgetPeriod(false);
            return;
        }

        const uid = currentUser.id;

        const cachedFull = resolveFullBudgetPeriodForDisplay(
            selectedPeriodName,
            uid,
            currentBudgetPeriod,
        );

        const hasCachedFull = !!cachedFull;

        if (hasCachedFull) {
            setCurrentBudgetPeriod(cachedFull);
        } else {
            setIsLoadingBudgetPeriod(true);
        }

        try {
            const structure = await budgetService.getBudgetPeriodStructure(selectedPeriodName);
            if (structure?.archetypes?.length) {
                setCurrentBudgetPeriod((prev) =>
                  mergeBudgetPeriodMasterStructure(
                    hasCachedFull ? (prev ?? cachedFull!) : null,
                    structure.archetypes,
                    selectedPeriodName,
                  ),
                );
            } else if (!hasCachedFull) {
                setCurrentBudgetPeriod(null);
            }
        } catch (error) {
            console.error('Failed to fetch budget period structure:', error);
            if (!hasCachedFull) {
                setCurrentBudgetPeriod(null);
            }
        } finally {
            setIsLoadingBudgetPeriod(false);
        }
    };
    fetchPeriodData();
  }, [authProbeComplete, selectedPeriodName, currentUser?.id, queryClient]);

  /** Project list: tidak prefetch bundle berat di sini — hanya hydrate disk ringan (table shell). */
  useEffect(() => {
    if (!authProbeComplete || !selectedPeriodName?.trim() || !currentUser?.id) return;
    hydrateCapexProjectListTableFromDisk(queryClient, selectedPeriodName, currentUser.id);
  }, [authProbeComplete, selectedPeriodName, currentUser?.id, queryClient]);

  /** Hydrate disk → TanStack Query supaya Budget HU instant setelah F5. */
  useEffect(() => {
    if (!authProbeComplete || !currentUser?.id) return;
    warmBudgetHuConfigCache(queryClient, currentUser.id);
    if (selectedPeriodName?.trim()) {
      hydrateBudgetHuPageFromDisk(queryClient, selectedPeriodName, currentUser.id);
    }
  }, [authProbeComplete, currentUser?.id, selectedPeriodName, queryClient]);

  /** Bootstrap shell saja — master Configuration tidak di-refresh otomatis dari halaman operasional. */
  const refreshConfigData = useCallback(async () => {
    if (isShellCachePatchGuarded()) return;
    await queryClient.refetchQueries({ queryKey: [...queryKeys.app.bootstrap] });
  }, [queryClient]);

  /** Full sync after migration / dirty page. */
  const flushAllAppQueries = useCallback(async () => {
    await Promise.all([refreshBudgetData(), refreshConfigData(), refreshNotifications()]);
  }, [refreshBudgetData, refreshConfigData, refreshNotifications]);

  /** Hydrate TanStack Query dari cache sekali — jangan reset saat currentUser berubah. */
  const bootstrapQueryHydratedRef = useRef(false);
  useLayoutEffect(() => {
    if (bootstrapQueryHydratedRef.current) return;
    const boot = readCachedBootstrap();
    if (!boot) return;
    bootstrapQueryHydratedRef.current = true;
    queryClient.setQueryData(queryKeys.app.bootstrap, boot);
  }, [queryClient]);

  /** Probe sesi valid sebelum bootstrap — hindari UI/login dari cache stale. */
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let cancelled = false;

    const finishUnauthenticated = (options?: { clearServer?: boolean }) => {
      if (cancelled) return;
      invalidateAuthProbeCache();
      invalidateStaleAuthCookies();
      if (options?.clearServer !== false) {
        void clearServerAuthCookies();
      }
      clearCachedAuthUser();
      clearCachedRoles();
      clearCachedBootstrap();
      clearShellCachePatchGuard();
      clearPersistedQueryCache();
      sessionStorage.removeItem('currentUserId');
      setCurrentUser(null);
      queryClient.removeQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          (q.queryKey[0] === 'screen' || q.queryKey[0] === 'app'),
      });
      if (useBackendSession()) {
        clearTabSessionState();
      }
      queueMicrotask(() => {
        if (!cancelled) useAuthStore.getState().clearSession();
      });
      setDataInitialized(true);
    };

    const applyProbeUser = (u: User, roles?: string[], idleTimeoutMs?: number) => {
      if (cancelled) return;
      setCurrentUser((prev) => {
        const merged =
          prev?.id === u.id
            ? mergeAuthIdentityUser(
                { id: u.id, username: u.username, email: u.email },
                {
                  meAssignments: u.assignments,
                  roleSlugs: roles,
                  previous: prev,
                },
              )
            : u.assignments?.length
              ? u
              : mergeAuthIdentityUser(
                  { id: u.id, username: u.username, email: u.email },
                  { meAssignments: u.assignments, roleSlugs: roles },
                );
        writeCachedAuthUser(merged);
        return merged;
      });
      sessionStorage.setItem('currentUserId', String(u.id));
      queueMicrotask(() => {
        if (cancelled) return;
        const prev = useAuthStore.getState().user;
        const forStore =
          prev?.id === u.id
            ? mergeAuthIdentityUser(
                { id: u.id, username: u.username, email: u.email },
                {
                  meAssignments: u.assignments,
                  roleSlugs: roles,
                  previous: prev,
                },
              )
            : u;
        const roleNames =
          roles?.length
            ? roles
            : forStore.assignments.map((a) => a.roleName).filter(Boolean);
        useAuthStore.getState().setSession(forStore, roleNames, idleTimeoutMs);
      });
    };

    void (async () => {
      try {
        if (useBackendSession()) {
          const { probeOAuthCallbackIfPresent, isOAuthCallbackFromUrl } =
            await import('./lib/authAzure');
          await probeOAuthCallbackIfPresent();

          if (
            !shouldRunAuthSessionProbe({
              hasSessionCookies,
              oauthCallback: isOAuthCallbackFromUrl(),
            })
          ) {
            finishUnauthenticated({ clearServer: false });
            return;
          }

          let me = await probeBackendSession();
          if (cancelled) return;
          if (me?.authenticated && me.user) {
            applyProbeUser(
              mergeAuthIdentityUser(
                {
                  id: me.user.id,
                  username: me.user.username,
                  email: me.user.email,
                },
                {
                  meAssignments: me.user.assignments,
                  roleSlugs: me.user.roles,
                },
              ),
              me.user.roles,
              me.user.idleTimeoutMs,
            );
            if (initialBootstrap?.users?.length) {
              setDataInitialized(true);
            }
            return;
          }
          finishUnauthenticated();
          return;
        }

        finishUnauthenticated();
      } catch {
        if (!cancelled) setDataInitialized(true);
      } finally {
        if (!cancelled) setAuthProbeComplete(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasSessionCookies, queryClient]);

  const bootstrapQuery = useQuery({
    queryKey: queryKeys.app.bootstrap,
    queryFn: () => fetchAppBootstrapData(currentUser?.id),
    enabled: typeof window !== 'undefined' && authProbeComplete && !!currentUser,
    initialData: initialBootstrap ?? undefined,
    staleTime: 120_000,
    gcTime: 1000 * 60 * 60 * 24,
    retry: 1,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    /** Cache sudah ada → jangan block UI dengan refetch sync di mount. */
    refetchOnMount: !initialBootstrap?.users?.length,
  });

  const lastBootstrapSyncAtRef = useRef(0);

  useEffect(() => {
    if (!bootstrapQuery.isSuccess || !bootstrapQuery.data) return;
    const updatedAt = bootstrapQuery.dataUpdatedAt;
    if (lastBootstrapSyncAtRef.current === updatedAt) return;
    lastBootstrapSyncAtRef.current = updatedAt;
    let d = mergeBootstrapPreservingAuthPatch(bootstrapQuery.data, queryClient);
    const skipAuthOverwrite = isShellCachePatchGuarded();

    if (!skipAuthOverwrite) {
      setAllUsers(d.users);
      setAllRoles(d.roles);
      writeCachedRoles(d.roles);
    } else {
      writeCachedRoles(d.roles);
    }
    setAllPeriods(d.allPeriods);
    writeCachedBootstrap(d);
    syncPeriodSelectionFromLists(d.multiYears, d.allPeriods);
    if (!skipAuthOverwrite) {
      setCurrentUser((prev) => {
        if (!prev) return prev;
        const full = enrichUserAssignments(
          d.users.find((u) => u.id === prev.id) ?? prev,
          d.roles,
        );
        if (sameUserSession(prev, full)) return prev;
        writeCachedAuthUser(full);
        return full;
      });
    }
    setDataInitialized(true);
    const uid = currentUser?.id ?? parseInt(sessionStorage.getItem('currentUserId') || '', 10);
    const period =
      selectedPeriodName.trim() ||
      pickDefaultBudgetPeriodNameForYear(d.allPeriods, new Date().getFullYear(), null);
    if (Number.isFinite(uid) && period) {
      hydrateCapexProjectListTableFromDisk(queryClient, period, uid);
      prefetchBudgetHuPage(queryClient, period, uid, {
        hospitalUnitId: selectedHuId ?? undefined,
      });
    }
    if (Number.isFinite(uid)) {
      prefetchBudgetMultiYearPage(queryClient, uid);
    }
  }, [
    bootstrapQuery.isSuccess,
    bootstrapQuery.dataUpdatedAt,
    syncPeriodSelectionFromLists,
    currentUser?.id,
    selectedPeriodName,
    queryClient,
  ]);

  useEffect(() => {
    if (!selectedPeriodName && allPeriods.length === 0) return;
    writePeriodShellCache({
      selectedPeriodName,
      periodNames: allPeriods.map((p) => p.periodName),
    });
  }, [selectedPeriodName, allPeriods]);

  /** Pastikan filter periode terisi saat buka halaman budget yang membutuhkannya. */
  useEffect(() => {
    if (!authProbeComplete || !dataInitialized) return;
    if (
      routePage !== Page.BudgetPeriod &&
      routePage !== Page.BudgetArchetype &&
      routePage !== Page.BudgetHU
    ) {
      return;
    }
    if (selectedPeriodName.trim()) return;
    if (allPeriods.length === 0) return;
    syncPeriodSelectionFromLists(bootstrapQuery.data?.multiYears ?? [], allPeriods);
  }, [
    authProbeComplete,
    dataInitialized,
    routePage,
    selectedPeriodName,
    allPeriods,
    bootstrapQuery.data?.multiYears,
    syncPeriodSelectionFromLists,
  ]);

  /** Warm page caches — disk hydrate sync; network prefetch idle + route-first. */
  useLayoutEffect(() => {
    if (!authProbeComplete || !currentUser?.id) return;

    hydrateConfigurationFromDisk(queryClient, currentUser.id);

    if (!dataInitialized) return;

    if (!selectedPeriodName.trim()) return;

    const uid = currentUser.id;
    const period = selectedPeriodName;
    const huId = selectedHuId ?? undefined;

    hydratePoUpdatePageFromDisk(queryClient, uid, period);
    hydrateBudgetHuPageFromDisk(queryClient, period, uid);
    hydrateCapexProjectListTableFromDisk(queryClient, period, uid);
    hydrateMyTasksFromDisk(queryClient, uid, period || undefined);
    hydrateFsUpdatePageFromDisk(queryClient, period, uid);
    hydrateFsApprovalPageFromDisk(queryClient, period, uid);
    hydrateFsRealizationPageFromDisk(queryClient, period, uid);
    if (currentUser) {
      hydrateBddConstructionTableFromDisk(queryClient, period, currentUser);
    }

    const warmCurrentRoute = () => {
      switch (routePage) {
        case Page.BudgetHU:
          prefetchBudgetHuPage(queryClient, period, uid, { hospitalUnitId: huId });
          break;
        case Page.Dashboard:
          prefetchDashboardBundle(queryClient, period, uid);
          break;
        case Page.ExecutiveSummary:
          prefetchExecutiveDashboard(queryClient, period, uid, selectedArchetypeId ?? null);
          break;
        case Page.BudgetPeriod:
        case Page.BudgetArchetype:
          prefetchBudgetSiloamPeriod(queryClient, period, uid);
          break;
        case Page.CapexProjectList:
          void warmCapexProjectListTableCache(queryClient, period, uid);
          break;
        case Page.POUpdate:
          void prefetchPoUpdatePage(queryClient, uid, period);
          break;
        case Page.GRUpdate:
          void prefetchGrUpdatePage(queryClient, uid);
          break;
        case Page.FSUpdate:
          void prefetchFsUpdatePage(queryClient, period, uid);
          break;
        case Page.FSApproval:
          void prefetchFsApprovalPage(queryClient, period, uid);
          break;
        case Page.FSRealization:
          void prefetchFsRealizationPage(queryClient, period, uid);
          break;
        case Page.BudgetMultiYear:
          prefetchBudgetMultiYearPage(queryClient, uid);
          break;
        case Page.BDDConstruction:
          if (currentUser) {
            void warmBddConstructionTableCache(queryClient, period, currentUser);
          }
          break;
        case Page.MyTask:
          prefetchMyTasksPage(queryClient, currentUser, period || undefined);
          break;
        default:
          break;
      }
    };
    warmCurrentRoute();

    scheduleStaggeredIdle([
      () => prefetchBudgetHuPage(queryClient, period, uid, { hospitalUnitId: huId }),
      () => prefetchDashboardBundle(queryClient, period, uid),
      () => prefetchExecutiveDashboard(queryClient, period, uid),
      () => prefetchBudgetSiloamPeriod(queryClient, period, uid),
      () => void prefetchPoUpdatePage(queryClient, uid, period),
      () => prefetchBudgetMultiYearPage(queryClient, uid),
      () => void warmCapexProjectListTableCache(queryClient, period, uid),
      // GR + FS bundles are heavy — only on nav hover (useNavPrefetch) or when route is active.
    ]);
  }, [
    authProbeComplete,
    dataInitialized,
    currentUser,
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    routePage,
    queryClient,
  ]);

  const handlePeriodChange = useCallback(
    (name: string) => {
      setSelectedPeriodName(name);
      filterUserTouchedRef.current = false;
      pinnedFilterRef.current = readBudgetHuFilterSelection(name);
      const pin = pinnedFilterRef.current;
      setSelectedArchetypeId(pin?.archetypeId ?? null);
      setSelectedHuId(pin?.huId ?? null);
      if (currentUser?.id) {
        prefetchDashboardBundle(queryClient, name, currentUser.id);
        prefetchExecutiveDashboard(queryClient, name, currentUser.id);
        prefetchBudgetHuPage(queryClient, name, currentUser.id, {
          hospitalUnitId: pin?.huId ?? undefined,
        });
        hydrateBudgetHuPageFromDisk(queryClient, name, currentUser.id);
        hydrateCapexProjectListTableFromDisk(queryClient, name, currentUser.id);
        hydrateMyTasksFromDisk(queryClient, currentUser.id, name || undefined);
        hydrateFsUpdatePageFromDisk(queryClient, name, currentUser.id);
        hydrateFsApprovalPageFromDisk(queryClient, name, currentUser.id);
        hydrateFsRealizationPageFromDisk(queryClient, name, currentUser.id);
      }
      prefetchBudgetSiloamPeriod(queryClient, name, currentUser?.id);
    },
    [currentUser, queryClient],
  );

  useEffect(() => {
    if (!bootstrapQuery.isError) return;
    console.error('Error initializing application:', bootstrapQuery.error);
    setDataInitialized(true);
    showToast(
      `Error initializing application: ${
        bootstrapQuery.error instanceof Error ? bootstrapQuery.error.message : 'Unknown error'
      }. Please check console for details.`,
      'error',
    );
  }, [bootstrapQuery.isError, bootstrapQuery.error, showToast]);
  
  /** Sinkronkan sessionStorage dengan user dari cache localStorage (paint pertama). */
  useEffect(() => {
    if (!currentUser) return;
    if (!sessionStorage.getItem('currentUserId')) {
      sessionStorage.setItem('currentUserId', String(currentUser.id));
    }
  }, [currentUser]);

  const bumpSidebarNav = useCallback(() => {
    setSidebarNavRevision((n) => n + 1);
  }, []);

  const applyRolesToApp = useCallback(
    (roles: UserRole[]) => {
      const next = cloneRolesForApp(roles);
      const boot =
        queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap) ??
        readCachedBootstrap();
      const usersSource = allUsers.length ? allUsers : (boot?.users ?? []);
      const enrichedUsers = usersSource.map((u) => enrichUserAssignments(u, next));

      const syncedCurrent = syncAppShellCaches(queryClient, {
        roles: next,
        users: enrichedUsers,
        currentUser: currentUser
          ? enrichUserAssignments(currentUser, next)
          : null,
      });

      setAllRoles(next);
      if (enrichedUsers.length) setAllUsers(enrichedUsers);
      if (syncedCurrent) {
        setCurrentUser((prev) =>
          prev && sameUserSession(prev, syncedCurrent) ? prev : syncedCurrent,
        );
        const roleNames = syncedCurrent.assignments.map((a) => a.roleName).filter(Boolean);
        pushAuthSessionIfChanged(syncedCurrent, roleNames);
      }
      bumpSidebarNav();
    },
    [queryClient, bumpSidebarNav, allUsers, currentUser],
  );

  const applyUsersToApp = useCallback(
    (users: User[]) => {
      const enrichedUsers = users.map((u) => enrichUserAssignments(u, allRoles));

      const syncedCurrent = syncAppShellCaches(queryClient, {
        users: enrichedUsers,
        roles: allRoles,
        currentUser: currentUser
          ? enrichedUsers.find((u) => u.id === currentUser.id) ??
            enrichUserAssignments(currentUser, allRoles)
          : null,
      });

      setAllUsers(enrichedUsers);
      if (syncedCurrent) {
        setCurrentUser((prev) =>
          prev && sameUserSession(prev, syncedCurrent) ? prev : syncedCurrent,
        );
        const roleNames = syncedCurrent.assignments.map((a) => a.roleName).filter(Boolean);
        pushAuthSessionIfChanged(syncedCurrent, roleNames);
      }
      bumpSidebarNav();
    },
    [queryClient, bumpSidebarNav, allRoles, currentUser],
  );

  const visibleNavItems = useMemo(
    () => NAV_ITEMS.filter((item) => permissions.canAccessPage(item.label)),
    [permissions, sidebarNavRevision, allRoles, currentUser],
  );

  const showProfileNav = useMemo(
    () => permissions.canAccessPage(Page.Profile),
    [permissions, sidebarNavRevision, allRoles, currentUser],
  );

  const visibleArchetypes = useMemo(() => {
    if (!currentBudgetPeriod) return [];
    if (permissions.userScopes.all) return currentBudgetPeriod.archetypes;
    
    const relevantArchetypeNames = new Set(permissions.userScopes.archetypes);
    const relevantArchetypeIds = new Set(permissions.userScopes.archetypeIds);

    // If user has HU scopes, include the archetypes that contain those HUs.
    const relevantHuNames = permissions.userScopes.hus;
    const relevantHuIds = permissions.userScopes.huIds;
    currentBudgetPeriod.archetypes.forEach(arch => {
        if (arch.units.some(u => relevantHuNames.has(u.name) || relevantHuIds.has(u.id))) {
            relevantArchetypeNames.add(arch.name);
            relevantArchetypeIds.add(arch.id);
        }
    });
    return currentBudgetPeriod.archetypes.filter(arch =>
        relevantArchetypeIds.has(arch.id) || relevantArchetypeNames.has(arch.name)
    );
  }, [currentBudgetPeriod, permissions]);
  
  const visibleHUs = useMemo(() => {
    if (!selectedArchetypeId || !currentBudgetPeriod) return [];
    const archetype = currentBudgetPeriod.archetypes.find(a => a.id === selectedArchetypeId);
    if (!archetype) return [];
    const units =
      permissions.userScopes.all ||
      permissions.userScopes.archetypes.has(archetype.name) ||
      permissions.userScopes.archetypeIds.has(archetype.id)
        ? archetype.units
        : archetype.units.filter(u =>
            permissions.userScopes.hus.has(u.name) || permissions.userScopes.huIds.has(u.id)
          );
    const list = [...units].sort((a, b) =>
      String(a.code || a.name).localeCompare(String(b.code || b.name), 'id', {
        numeric: true,
        sensitivity: 'base',
      }),
    );
    // Keep pinned selection visible even if this archetype list is still partial.
    if (selectedHuId && !list.some((u) => String(u.id) === String(selectedHuId))) {
      for (const arch of currentBudgetPeriod.archetypes) {
        const hu = arch.units.find((u) => String(u.id) === String(selectedHuId));
        if (hu) {
          list.unshift(hu);
          break;
        }
      }
    }
    return list;
  }, [selectedArchetypeId, currentBudgetPeriod, permissions, selectedHuId]);

  useEffect(() => {
    if (!currentBudgetPeriod) return;

    const pn = selectedPeriodName.trim();

    // User picked archetype/unit — never snap back to an older pinned HU from localStorage.
    if (filterUserTouchedRef.current) {
      if (isLoadingBudgetPeriod) return;
      if (visibleArchetypes.length > 0) {
        if (
          !selectedArchetypeId ||
          !visibleArchetypes.some((a) => String(a.id) === String(selectedArchetypeId))
        ) {
          setSelectedArchetypeId(visibleArchetypes[0].id);
        }
      }
      if (visibleHUs.length > 0) {
        if (!selectedHuId || !visibleHUs.some((u) => String(u.id) === String(selectedHuId))) {
          setSelectedHuId(visibleHUs[0].id);
        }
      }
      return;
    }

    const pin =
      (pinnedFilterRef.current?.periodName === pn ? pinnedFilterRef.current : null) ??
      (pn ? readBudgetHuFilterSelection(pn) : null);

    // Prefer restoring the exact pinned HU (by id or code) anywhere in the period tree.
    if (pin?.huId || pin?.huCode) {
      const found = findHuInBudgetPeriod(currentBudgetPeriod, pin.huId, pin.huCode);
      if (found) {
        if (String(selectedArchetypeId) !== String(found.archetypeId)) {
          setSelectedArchetypeId(found.archetypeId);
        }
        if (String(selectedHuId) !== String(found.huId)) {
          setSelectedHuId(found.huId);
        }
        pinnedFilterRef.current = {
          periodName: pn,
          archetypeId: found.archetypeId,
          huId: found.huId,
          huCode: found.huCode || pin.huCode,
        };
        return;
      }

      // Pin exists but HU not in tree yet (partial cache / still loading) —
      // keep pinned ids and NEVER fall back to the first unit (that overwrote SHSS on refresh).
      if (pin.archetypeId && String(selectedArchetypeId) !== String(pin.archetypeId)) {
        setSelectedArchetypeId(pin.archetypeId);
      }
      if (pin.huId && String(selectedHuId) !== String(pin.huId)) {
        setSelectedHuId(pin.huId);
      }
      return;
    }

    if (isLoadingBudgetPeriod) return;

    // No pin: soft defaults only when empty / out of scope.
    if (visibleArchetypes.length > 0) {
      if (
        !selectedArchetypeId ||
        !visibleArchetypes.some((a) => String(a.id) === String(selectedArchetypeId))
      ) {
        setSelectedArchetypeId(visibleArchetypes[0].id);
      }
    }
    if (visibleHUs.length > 0) {
      if (!selectedHuId || !visibleHUs.some((u) => String(u.id) === String(selectedHuId))) {
        setSelectedHuId(visibleHUs[0].id);
      }
    }
  }, [
    currentBudgetPeriod,
    isLoadingBudgetPeriod,
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    visibleArchetypes,
    visibleHUs,
  ]);

  useEffect(() => {
    if (routePage !== Page.BudgetHU) return;
    if (!currentUser?.id || !selectedPeriodName.trim() || visibleHUs.length === 0) return;
    prefetchBudgetHuUnitsIdle(
      queryClient,
      selectedPeriodName,
      currentUser.id,
      visibleHUs.map((u) => u.id),
      selectedHuId,
    );
  }, [routePage, currentUser?.id, selectedPeriodName, visibleHUs, selectedHuId, queryClient]);

  useEffect(() => {
    if (isLoadingBudgetPeriod || !currentBudgetPeriod) return;
    if (!selectedPeriodName.trim() || !selectedArchetypeId || !selectedHuId) return;

    const pin = pinnedFilterRef.current;
    // Refuse to overwrite a pinned filter with an auto-picked different HU during hydration.
    if (
      pin &&
      pin.periodName === selectedPeriodName.trim() &&
      String(pin.huId) !== String(selectedHuId) &&
      !filterUserTouchedRef.current
    ) {
      return;
    }

    const huMeta =
      findHuInBudgetPeriod(currentBudgetPeriod, selectedHuId, null) ??
      (visibleHUs.find((u) => String(u.id) === String(selectedHuId))
        ? {
            archetypeId: selectedArchetypeId,
            huId: selectedHuId,
            huCode: String(
              visibleHUs.find((u) => String(u.id) === String(selectedHuId))?.code ?? '',
            ),
          }
        : null);
    if (!huMeta) return;

    writeBudgetHuFilterSelection(
      selectedPeriodName,
      selectedArchetypeId,
      selectedHuId,
      huMeta.huCode,
    );
    pinnedFilterRef.current = {
      periodName: selectedPeriodName.trim(),
      archetypeId: selectedArchetypeId,
      huId: selectedHuId,
      huCode: huMeta.huCode,
    };
  }, [
    selectedPeriodName,
    selectedArchetypeId,
    selectedHuId,
    isLoadingBudgetPeriod,
    currentBudgetPeriod,
    visibleHUs,
  ]);

  const handleArchetypeChange = (archetypeName: string) => {
    const archetype = visibleArchetypes.find((a) => a.name === archetypeName);
    const newArchetypeId = archetype ? archetype.id : null;
    filterUserTouchedRef.current = true;
    if (newArchetypeId !== selectedArchetypeId) {
      // Reset HU only when user really changes archetype,
      // not when data refresh remounts/reloads the same archetype.
      setSelectedHuId(null);
      pinnedFilterRef.current = null;
      clearBudgetHuFilterSelection();
    }
    setSelectedArchetypeId(newArchetypeId);
  };

  const formatHuLabel = useCallback((hu: { name: string; code?: string | null }) => {
    const code = (hu.code || '').trim();
    return code ? `${code} - ${hu.name}` : hu.name;
  }, []);

  const handleHUChange = useCallback(
    (huName: string) => {
      const hu = visibleHUs.find((u) => u.name === huName || formatHuLabel(u) === huName);
      filterUserTouchedRef.current = true;
      if (hu) {
        setSelectedHuId(hu.id);
        pinnedFilterRef.current = {
          periodName: selectedPeriodName.trim(),
          archetypeId: selectedArchetypeId || '',
          huId: hu.id,
          huCode: hu.code,
        };
        if (selectedPeriodName.trim() && selectedArchetypeId) {
          writeBudgetHuFilterSelection(selectedPeriodName, selectedArchetypeId, hu.id, hu.code);
        }
        if (currentUser?.id && selectedPeriodName.trim()) {
          void prefetchBudgetHuPage(queryClient, selectedPeriodName, currentUser.id, {
            hospitalUnitId: hu.id,
          });
        }
      } else {
        setSelectedHuId(null);
      }
    },
    [visibleHUs, formatHuLabel, selectedPeriodName, selectedArchetypeId, currentUser?.id, queryClient],
  );

  const handleHUHoverPrefetch = useCallback(
    (huId: string) => {
      if (!currentUser?.id || !selectedPeriodName.trim() || !huId.trim()) return;
      void prefetchBudgetHuPage(queryClient, selectedPeriodName, currentUser.id, {
        hospitalUnitId: huId,
      });
    },
    [currentUser?.id, selectedPeriodName, queryClient],
  );

  // Added CapexProjectList to pagesWithFilters to show the budget period selector in header
  const pagesWithFilters: Page[] = [Page.Dashboard, Page.BudgetPeriod, Page.BudgetArchetype, Page.BudgetHU, Page.FSUpdate, Page.FSApproval, Page.FSRealization, Page.DailyMOMSummary, Page.ExecutiveSummary, Page.BDDConstruction];
  const budgetEditingPages: Page[] = [Page.BudgetMultiYear, Page.BudgetPeriod, Page.BudgetArchetype, Page.BudgetHU, Page.POUpdate, Page.GRUpdate, Page.FSUpdate, Page.FSApproval];

  // User change handler removed - users can only login via LazyLoginPage
  // No more dropdown user selector in Sidebar

  // Login feature removed - auto-login is enabled

  // Logout feature removed - auto-login is always active

  const handleNavItemPrefetch = useNavPrefetch({
    router,
    queryClient,
    selectedPeriodName,
    selectedHuId,
    currentUser,
    permissions,
  });

  useEffect(() => {
    try {
      void router.prefetch(pageToHref(routePage));
    } catch {
      /* noop */
    }
  }, [router, routePage]);

  const handleNavigation = (targetPage: Page) => {
    setIsSidebarOpen(false);
    if (targetPage === routePage) return;

    if (isPageDirty && budgetEditingPages.includes(routePage)) {
        setChangeSummary(pageActionRefs.current.getSummary());
        setPendingNavigation(targetPage);
    } else {
        router.push(pageToHref(targetPage));
        setIsPageDirty(false);
    }
  };

  const handleModalSave = async () => {
    if (pendingNavigation) {
        await pageActionRefs.current.onSave();
        router.push(pageToHref(pendingNavigation));
        setPendingNavigation(null);
        setChangeSummary(null);
    }
  };

  const handleModalDiscard = () => {
      if (pendingNavigation) {
          pageActionRefs.current.onCancel();
          router.push(pageToHref(pendingNavigation));
          setPendingNavigation(null);
          setChangeSummary(null);
      }
  };

  const handleModalClose = () => {
      setPendingNavigation(null);
      setChangeSummary(null);
  };

  const setPageActions = useCallback((actions: { onSave: () => Promise<void>; onCancel: () => void; getSummary: () => ChangeSummary | null; }) => {
    pageActionRefs.current = actions;
  }, []);

  const shellPermissionsReady = areShellPermissionsReady(currentUser, allRoles, {
    dataInitialized,
    bootstrapFailed: bootstrapQuery.isError,
  });

  const renderPage = () => {
    if (!currentUser) {
      return null;
    }

    // Jangan tampilkan Access Denied sebelum assignments + role matrix siap.
    if (!shellPermissionsReady) {
      return (
        <div
          className="flex-1 p-4 md:p-8 h-screen flex items-center justify-center"
          aria-busy="true"
          aria-label="Memuat akses"
        >
          <div className="w-full max-w-md space-y-3 animate-pulse" aria-hidden>
            <div className="h-8 w-2/3 rounded-lg bg-siloam-border/50" />
            <div className="h-32 rounded-xl bg-siloam-border/30" />
            <div className="h-20 rounded-xl bg-siloam-border/20" />
          </div>
        </div>
      );
    }

    // Check if user has permission to access the current page
    if (!permissions.canAccessPage(routePage)) {
        return (
            <div className="flex-1 p-4 md:p-8 text-center h-screen flex items-center justify-center">
                <div className="bg-siloam-surface rounded-xl p-8 shadow-soft max-w-md">
                    <div className="text-6xl mb-4">🔒</div>
                    <h2 className="text-2xl font-bold text-siloam-text-primary mb-2">Access Denied</h2>
                    <p className="text-siloam-text-secondary mb-4">
                        You don't have permission to access this page.
                    </p>
                    <p className="text-sm text-siloam-text-secondary">
                        Please contact your administrator if you believe this is an error.
                    </p>
                    <button
                        type="button"
                        onClick={() => void goToFirstAccessibleSidebarPage()}
                        className="mt-6 bg-siloam-blue text-white px-6 py-2 rounded-xl hover:bg-siloam-blue/90 transition"
                    >
                        Go to first menu
                    </button>
                </div>
            </div>
        );
    }

    const commonPageProps = {
      setIsPageDirty: setIsPageDirty,
      setPageActions: setPageActions,
      showToast: showToast,
    };
    
    switch (routePage) {
      case Page.Dashboard:
        return <LazyDashboardPage periodName={selectedPeriodName} currentUser={currentUser} />;
      case Page.ExecutiveSummary:
        return (
          <LazyExecutiveSummaryPage
            periodName={selectedPeriodName}
            currentUser={currentUser}
            selectedArchetypeId={selectedArchetypeId}
            onArchetypeChange={setSelectedArchetypeId}
            visibleArchetypes={visibleArchetypes}
          />
        );
      case Page.AIAnalytics:
        return <LazyAIAnalyticsPage currentUser={currentUser} />;
      case Page.UserMonitoring:
        return <LazyUserMonitoringPage currentUser={currentUser} allRoles={allRoles} />;
      case Page.DataMigration:
        return <LazyDataMigrationPage currentUser={currentUser} />;
      case Page.CapexProjectList: {
        const preList =
          typeof window !== 'undefined' && currentUser
            ? resolveProjectListTableForDisplay(
                selectedPeriodName,
                currentUser.id,
                defaultScopesForDiskPrefetch(currentUser),
                null,
              )
            : null;
        const userScopesReady = areUserScopesReadyForList(
          currentUser,
          dataInitialized,
          allUsers,
        );
        return (
          <LazyCapexProjectListPage
            key={`cpl-${currentUser?.id ?? 0}`}
            currentUser={currentUser}
            periodName={selectedPeriodName}
            budgetPeriods={allPeriods}
            preloadedProjectList={preList}
            userScopesReady={userScopesReady}
          />
        );
      }
      case Page.BDDConstruction: {
        const hideUnassignedBdd =
          !!currentUser &&
          !currentUser.assignments.some(
            (a) => a.roleName === 'Super Admin' || a.roleName === 'BDD',
          );
        const bddPreload =
          typeof window !== 'undefined' && currentUser && selectedPeriodName
            ? readBddConstructionPreload(selectedPeriodName, currentUser.id, hideUnassignedBdd)
            : null;
        return (
          <LazyBDDConstructionPage
            key={`bdd-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            currentUser={currentUser}
            allRoles={allRoles}
            showToast={showToast}
            periodName={selectedPeriodName}
            preloadedSnapshot={bddPreload}
          />
        );
      }
      case Page.DailyMOMSummary:
        return (
          <LazyMomDailySummaryPage
            currentUser={currentUser}
            allRoles={allRoles}
            periodName={selectedPeriodName}
          />
        );
      case Page.MyTask: {
        const preTasks =
          typeof window !== 'undefined' && currentUser
            ? resolveMyTasksBundleForDisplay(currentUser.id, selectedPeriodName || undefined, null)
            : null;
        return (
          <LazyMyTaskPage
            key={`my-task-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            currentUser={currentUser}
            allRoles={allRoles}
            periodName={selectedPeriodName}
            preloadedTasks={preTasks}
          />
        );
      }
      case Page.BudgetMultiYear:
        return <LazyBudgetMultiYearPage 
                    allPeriods={allPeriods}
                    onDataChange={handleBudgetPageDataChange} 
                    currentUser={currentUser}
                    allRoles={allRoles}
                    {...commonPageProps} 
                />;
      case Page.BudgetPeriod:
        return (
          <LazyBudgetPeriodPage
            onBudgetPeriodSaved={handleBudgetPeriodSaved}
            periodName={selectedPeriodName}
            currentUser={currentUser}
            allRoles={allRoles}
            {...commonPageProps}
          />
        );
      case Page.BudgetArchetype:
        return (
          <LazyBudgetArchetypePage
            onDataChange={handleBudgetPageDataChange}
            onBudgetPeriodSaved={handleBudgetPeriodSaved}
            periodName={selectedPeriodName}
            archetypeId={selectedArchetypeId}
            currentUser={currentUser}
            allRoles={allRoles}
            {...commonPageProps}
          />
        );
      case Page.BudgetHU: {
        const preBudgetHu =
          typeof window !== 'undefined' && currentUser
            ? resolveBudgetHuPageForDisplay(
                selectedPeriodName,
                currentUser.id,
                currentBudgetPeriod,
                null,
              )
            : null;
        return (
          <LazyBudgetHUPage
            key={`bhu-${currentUser?.id ?? 0}`}
            onDataChange={handleBudgetPageDataChange}
            onBudgetPeriodSaved={handleBudgetPeriodSaved}
            periodName={selectedPeriodName}
            archetypeId={selectedArchetypeId}
            huId={selectedHuId}
            currentUser={currentUser}
            allRoles={allRoles}
            allUsers={allUsers}
            currentBudgetPeriod={currentBudgetPeriod}
            preloadedBudgetHuPage={preBudgetHu}
            {...commonPageProps}
          />
        );
      }
      case Page.POUpdate: {
        const poUpdatePreload =
          typeof window !== 'undefined' && currentUser && selectedPeriodName
            ? readPoUpdateSnapshotAnyAge(currentUser.id, selectedPeriodName)
            : null;
        return (
          <LazyPOUpdatePage
            key={`po-update-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            currentUser={currentUser}
            allRoles={allRoles}
            periodName={selectedPeriodName}
            preloadedSnapshot={poUpdatePreload}
            onDataChange={() => {
              refreshBudgetData();
              refreshConfigData();
            }}
            {...commonPageProps}
          />
        );
      }
      case Page.GRUpdate:
        return <LazyGRUpdatePage currentUser={currentUser} allRoles={allRoles} onDataChange={() => { refreshBudgetData(); refreshConfigData(); }} {...commonPageProps} />;
      case Page.FSUpdate: {
        const fsUpdatePreloadRaw =
          typeof window !== 'undefined' && currentUser && selectedPeriodName
            ? readFsUpdateSnapshotAnyAge(selectedPeriodName, currentUser.id)
            : null;
        const fsUpdatePreload =
          fsUpdatePreloadRaw && (fsUpdatePreloadRaw.editedData?.length ?? 0) > 0
            ? fsUpdatePreloadRaw
            : null;
        return (
          <LazyFSUpdatePage
            key={`fs-update-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            periodName={selectedPeriodName}
            currentUser={currentUser}
            allRoles={allRoles}
            preloadedSnapshot={fsUpdatePreload}
            onDataChange={() => {
              refreshBudgetData();
              refreshConfigData();
            }}
            {...commonPageProps}
          />
        );
      }
      case Page.FSApproval: {
        const fsApprovalPreload =
          typeof window !== 'undefined' && currentUser && selectedPeriodName
            ? readFsApprovalSnapshotAnyAge(selectedPeriodName, currentUser.id)
            : null;
        return (
          <LazyFSApprovalPage
            key={`fs-approval-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            periodName={selectedPeriodName}
            currentUser={currentUser}
            allRoles={allRoles}
            preloadedSnapshot={fsApprovalPreload}
            {...commonPageProps}
          />
        );
      }
      case Page.FSRealization: {
        const fsRealizationPreload =
          typeof window !== 'undefined' && currentUser && selectedPeriodName
            ? readFsRealizationSnapshotAnyAge(selectedPeriodName, currentUser.id)
            : null;
        return (
          <LazyFSRealizationPage
            key={`fs-realization-${currentUser?.id ?? 0}-${selectedPeriodName}`}
            periodName={selectedPeriodName}
            currentUser={currentUser}
            allRoles={allRoles}
            preloadedSnapshot={fsRealizationPreload}
            headerArchetypeId={selectedArchetypeId}
            headerHuId={selectedHuId}
            {...commonPageProps}
          />
        );
      }
      case Page.Configuration:
        return (
          <LazyConfigurationPage
            onConfigurationChange={refreshConfigData}
            onUsersListPatch={applyUsersToApp}
            onRolesListPatch={applyRolesToApp}
            currentUser={currentUser}
          />
        );
      case Page.Profile:
        return (
          <LazyProfilePage
            currentUser={currentUser}
            allRoles={allRoles}
            desktopNotificationsEnabled={desktopNotificationsEnabled}
            browserNotificationPermission={browserNotificationPermission}
            onDesktopNotificationsToggle={setDesktopNotificationsEnabled}
            onRequestDesktopPermission={async () => {
              if (typeof window === 'undefined' || !('Notification' in window)) {
                showToast('Browser ini tidak mendukung desktop notification.', 'error');
                return;
              }
              const permission = await Notification.requestPermission();
              setBrowserNotificationPermission(permission);
              if (permission === 'granted') {
                showToast('Desktop notification berhasil diaktifkan.', 'success');
              } else {
                showToast('Izin desktop notification belum diberikan.', 'error');
              }
            }}
          />
        );
      default:
        return <div className="flex-1 p-4 md:p-8">Page "{routePage}" not implemented yet.</div>;
    }
  };

  /** Restore + validasi sesi di background (SWR) — hanya saat sudah login. */
  useEffect(() => {
    if (!dataInitialized || !currentUser?.id) return;
    let cancelled = false;

    const applyUser = (u: User, roles?: string[], idleTimeoutMs?: number) => {
      if (cancelled) return;
      setCurrentUser((prev) => (prev && sameUserSession(prev, u) ? prev : u));
      writeCachedAuthUser(u);
      sessionStorage.setItem('currentUserId', String(u.id));
      queueMicrotask(() => {
        if (cancelled) return;
        const prev = useAuthStore.getState().user;
        if (!prev || !sameUserSession(prev, u)) {
          useAuthStore.getState().setSession(u, roles ?? [], idleTimeoutMs);
        }
      });
    };

    const usersSnapshot = allUsers;

    const clearLocalAuth = () => {
      if (cancelled) return;
      clearCachedAuthUser();
      clearCachedRoles();
      clearCachedBootstrap();
      clearShellCachePatchGuard();
      sessionStorage.removeItem('currentUserId');
      setCurrentUser(null);
      if (useBackendSession()) {
        clearTabSessionState();
      }
      queueMicrotask(() => {
        if (!cancelled) useAuthStore.getState().clearSession();
      });
    };

    const run = async () => {
      const savedUserId = sessionStorage.getItem('currentUserId');
      if (savedUserId && usersSnapshot.length > 0) {
        const parsed = parseInt(savedUserId, 10);
        if (Number.isFinite(parsed)) {
          const fromList = usersSnapshot.find((u) => u.id === parsed);
          if (fromList) applyUser(fromList);
        } else {
          sessionStorage.removeItem('currentUserId');
        }
      }

      try {
        if (useBackendSession()) {
          const me = await fetchAuthMe();
          if (cancelled) return;
          if (me?.authenticated && me.user) {
            backendUnauthedStreakRef.current = 0;
            let fromList = usersSnapshot.find((u) => u.id === me.user!.id);
            if (!fromList || (fromList.assignments?.length ?? 0) === 0) {
              const pack = await fetchAppInitPackFromBackend(null, me.user.id);
              if (pack?.users?.length) {
                setAllUsers(pack.users);
                setAllRoles(pack.roles);
                writeCachedRoles(pack.roles);
                setAllPeriods(pack.periodSummaries);
                const bootstrapPayload = {
                  users: pack.users,
                  roles: pack.roles,
                  multiYears: pack.multiYears,
                  allPeriods: pack.periodSummaries,
                };
                writeCachedBootstrap(bootstrapPayload);
                queryClient.setQueryData(queryKeys.app.bootstrap, bootstrapPayload);
                syncPeriodSelectionFromLists(pack.multiYears, pack.periodSummaries);
                setDataInitialized(true);
                fromList = pickEnrichedUserFromPack(pack, me.user.id) ?? fromList;
              }
            }
            const user =
              fromList ??
              mergeAuthIdentityUser(
                {
                  id: me.user.id,
                  username: me.user.username,
                  email: me.user.email,
                },
                {
                  meAssignments: me.user.assignments,
                  roleSlugs: me.user.roles,
                },
              );
            applyUser(user, me.user.roles, me.user.idleTimeoutMs);
            return;
          }
          if (!me?.authenticated) {
            const cachedUserId = readCachedAuthUser()?.id ?? null;
            const hasLocalAuthContext = Boolean(savedUserId || cachedUserId);
            if (!hasLocalAuthContext) {
              backendUnauthedStreakRef.current = 0;
              clearLocalAuth();
              return;
            }
            const refreshOk = hasSessionCookies
              ? await refreshBackendSessionCoordinated()
              : false;
            if (!cancelled && refreshOk) {
              const meAfterRefresh = await fetchAuthMe();
              if (meAfterRefresh?.authenticated && meAfterRefresh.user) {
                backendUnauthedStreakRef.current = 0;
                const hydratedUser = mergeAuthIdentityUser(
                  {
                    id: meAfterRefresh.user.id,
                    username: meAfterRefresh.user.username,
                    email: meAfterRefresh.user.email,
                  },
                  {
                    meAssignments: meAfterRefresh.user.assignments,
                    roleSlugs: meAfterRefresh.user.roles,
                  },
                );
                applyUser(hydratedUser, meAfterRefresh.user.roles, meAfterRefresh.user.idleTimeoutMs);
                return;
              }
            }

            backendUnauthedStreakRef.current += 1;
            if (backendUnauthedStreakRef.current < 2) {
              return;
            }

            clearLocalAuth();
          }
          return;
        }

        clearLocalAuth();
      } catch (e) {
        console.error('Session validation (background):', e);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [dataInitialized, allUsers.length, currentUser?.id]);

  // Handle login
  const handleLogin = useCallback(async (user: User) => {
    clearTabSessionState();
    backendUnauthedStreakRef.current = 0;
    setCurrentUser(user);
    writeCachedAuthUser(user);
    queueMicrotask(() => useAuthStore.getState().setSession(user));
    sessionStorage.setItem('currentUserId', user.id.toString());

    let effectiveUser = user;
    let rolesForLanding = allRoles;
    let periodsForDefault = allPeriods;

    const earlyPeriodForWarm =
      selectedPeriodName.trim() ||
      pickDefaultBudgetPeriodNameForYear(allPeriods, new Date().getFullYear(), null);
    if (earlyPeriodForWarm) {
      void warmCapexProjectListTableCache(queryClient, earlyPeriodForWarm, user.id);
    }

    const pack = await fetchAppInitPackFromBackend(null, user.id);
    if (pack?.users?.length) {
      setAllUsers(pack.users);
      setAllRoles(pack.roles);
      writeCachedRoles(pack.roles);
      setAllPeriods(pack.periodSummaries);
      syncPeriodSelectionFromLists(pack.multiYears, pack.periodSummaries);
      rolesForLanding = pack.roles;
      periodsForDefault = pack.periodSummaries;
      const full = pickEnrichedUserFromPack(pack, user.id);
      if (full) {
        effectiveUser = full;
        setCurrentUser(full);
        writeCachedAuthUser(full);
      }
      setDataInitialized(true);
      const bootstrapPayload = {
        users: pack.users,
        roles: pack.roles,
        multiYears: pack.multiYears,
        allPeriods: pack.periodSummaries,
      };
      writeCachedBootstrap(bootstrapPayload);
      queryClient.setQueryData(queryKeys.app.bootstrap, bootstrapPayload);
    }

    const periodForPrefetch =
      selectedPeriodName.trim() ||
      pickDefaultBudgetPeriodNameForYear(
        periodsForDefault,
        new Date().getFullYear(),
        null,
      );

    showToast(`Welcome back, ${effectiveUser.username}!`, 'success');
    const landing = await resolvePostLoginLandingPage(effectiveUser, rolesForLanding);

    if (periodForPrefetch) {
      const cplWarm = warmCapexProjectListTableCache(queryClient, periodForPrefetch, effectiveUser.id);
      if (landing === Page.CapexProjectList) {
        await Promise.race([
          cplWarm,
          new Promise<void>((r) => setTimeout(r, LOGIN_CPL_PREFETCH_AWAIT_MS)),
        ]);
      } else if (landing === Page.BudgetHU) {
        await prefetchBudgetHuPageWithTimeout(
          queryClient,
          periodForPrefetch,
          effectiveUser.id,
        );
      }
    }

    const href = pageToHref(landing);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      router.replace(href);
    } catch {
      window.location.assign(href);
    }
  }, [
    showToast,
    router,
    allRoles,
    allPeriods,
    selectedPeriodName,
    queryClient,
    syncPeriodSelectionFromLists,
  ]);

  const goToFirstAccessibleSidebarPage = useCallback(async () => {
    if (!currentUser) return;
    const landing = await resolvePostLoginLandingPage(currentUser, allRoles);
    handleNavigation(landing);
  }, [currentUser, allRoles, handleNavigation]);

  /** Login/buildAppUserFromRow can return empty scopes; merge from allUsers when it has richer assignments. */
  useEffect(() => {
    if (!dataInitialized || allUsers.length === 0) return;
    setCurrentUser(prev => {
      if (!prev) return prev;
      const full = allUsers.find(u => u.id === prev.id);
      if (!full) return prev;
      const scopeCount = (u: User) =>
        u.assignments.reduce((n, a) => n + (a.assignedScopes?.length ?? 0), 0);
      if (scopeCount(full) > scopeCount(prev)) {
        writeCachedAuthUser(full);
        return full;
      }
      return prev;
    });
  }, [dataInitialized, allUsers.length, currentUser?.id]);

  useEffect(() => {
    if (!dataInitialized || !currentUser) return;
    const budgetHuMasterSlices: ConfigSliceKey[] = [
      'assetTypeConfigs',
      'workflows',
      'budgetCategories',
      'projectPriorities',
    ];

    return subscribeConfigurationMasterChanged((slices) => {
      if (isShellCachePatchGuarded()) return;
      void (async () => {
        await refreshActiveConfigurationQueries(queryClient, slices, currentUser.id, {
          includeUserManaged: true,
        });
        if (slices.some((s) => budgetHuMasterSlices.includes(s))) {
          await refreshBudgetHuMasterConfigQueries(queryClient, currentUser.id);
        }
      })().catch((error) => {
        console.error('Configuration master sync failed:', error);
      });
    });
  }, [currentUser, dataInitialized, queryClient]);

  // After leaving Data Migration, sync data once (events were ignored on that page).
  useEffect(() => {
    const prev = prevActivePageForMigrationRef.current;
    prevActivePageForMigrationRef.current = routePage;
    if (!dataInitialized || !currentUser) return;
    if (prev !== Page.DataMigration || routePage === Page.DataMigration) return;

    void flushAllAppQueries().catch((error) => {
      console.error('Post-Data Migration refresh failed:', error);
    });
  }, [routePage, currentUser, dataInitialized, flushAllAppQueries]);

  // Handle logout
  const handleLogout = useCallback(async (options?: { skipBackend?: boolean }) => {
    sentNotificationDedupeKeysRef.current.clear();
    resetTaskNotificationState();
    invalidateAuthProbeCache();
    setCurrentUser(null);
    clearCachedAuthUser();
    clearCachedRoles();
    clearCachedBootstrap();
    clearShellCachePatchGuard();
    clearPersistedQueryCache();
    sessionStorage.removeItem('currentUserId');
    if (useBackendSession()) {
      if (!options?.skipBackend) {
        await logoutBackend({ allDevices: true });
      }
    }
    queueMicrotask(() => useAuthStore.getState().clearSession());
    void queryClient.removeQueries({ queryKey: ['notifications'] });
    void queryClient.removeQueries({
      predicate: (q) =>
        Array.isArray(q.queryKey) &&
        (q.queryKey[0] === 'screen' || q.queryKey[0] === 'app'),
    });

    const { signOutSupabaseAuth } = await import('./lib/authAzure');
    await signOutSupabaseAuth();

  showToast(
      options?.skipBackend
        ? 'Session ended after inactivity'
        : 'You have been logged out',
      'success',
    );
  }, [queryClient, showToast]);

  useEffect(() => {
    if (!useBackendSession()) return;
    return registerAuthFailureHandler(() => {
      void handleLogout({ skipBackend: true });
    });
  }, [handleLogout]);

  /** Link reset password harus dibuka di halaman login (/) agar LazyLoginPage memproses recovery hash. */
  useEffect(() => {
    if (typeof window === 'undefined' || !isRecoveryFromUrl()) return;

    const suffix = window.location.hash || window.location.search;
    const path = window.location.pathname;
    if (path !== '/' && path !== '') {
      window.location.replace(`/${suffix}`);
      return;
    }

    if (currentUser) {
      void handleLogout({ skipBackend: false });
      setAuthProbeComplete(true);
    }
  }, [currentUser, handleLogout]);

  // Tunggu probe /auth/me sebelum shell/login/prefetch — hindari 401 dari cache stale.
  if (!authProbeComplete) {
    return (
      <ToastProvider showToast={showToast}>
        <PreAuthAppShell />
        {toast && (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            title={toast.title}
            onClose={dismissToast}
          />
        )}
      </ToastProvider>
    );
  }

  if (!currentUser) {
    return (
      <ToastProvider showToast={showToast}>
        <div className="h-screen">
          <LazyLoginPage />
          {toast && (
            <Toast
              key={toast.id}
              message={toast.message}
              type={toast.type}
              title={toast.title}
              onClose={dismissToast}
            />
          )}
        </div>
      </ToastProvider>
    );
  }

  return (
    <ToastProvider showToast={showToast}>
    <AuthSessionSync onForceLogout={handleLogout} />
    <SessionExpiryWarning onSessionExpired={() => void handleLogout({ skipBackend: true })} />
    <div className="flex h-screen bg-siloam-bg text-siloam-text-primary font-inter">
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}
      
      {/* Sidebar: tampil segera setelah login; data master diisi paralel tanpa layar "Initializing". */}
      {currentUser && (
          <Sidebar 
            key={`sidebar-nav-${sidebarNavRevision}`}
            activePage={routePage} 
            onNavigate={handleNavigation}
            onNavItemPrefetch={handleNavItemPrefetch}
            currentUser={currentUser}
            visibleNavItems={visibleNavItems}
            showProfileNav={showProfileNav}
            allRoles={allRoles}
            navLoading={!shellPermissionsReady}
            isOpen={isSidebarOpen}
            onClose={() => setIsSidebarOpen(false)}
            onLogout={handleLogout}
          />
      )}
      <div className="flex-1 flex flex-col overflow-hidden">
        {currentUser && (
            <Header
                activePage={routePage}
                onMenuClick={() => setIsSidebarOpen(true)}
                notifications={notifications}
                onMarkAsRead={handleMarkNotificationAsRead}
                onMarkAllAsRead={handleMarkAllNotificationsAsRead}
                onNavigate={handleNavigation}
                showFilters={pagesWithFilters.includes(routePage)}
                
                // Filters
                allPeriods={allPeriods}
                selectedPeriodName={selectedPeriodName}
                onPeriodChange={handlePeriodChange}
                
                visibleArchetypes={visibleArchetypes}
                selectedArchetypeId={selectedArchetypeId}
                onArchetypeChange={handleArchetypeChange}
                
                visibleHUs={visibleHUs}
                selectedHuId={selectedHuId}
                onHUChange={handleHUChange}
                onHUHover={handleHUHoverPrefetch}
                isLoadingBudgetPeriod={isLoadingBudgetPeriod}
            />
        )}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
            <Suspense fallback={<div className="flex-1 p-8 text-siloam-text-secondary">Loading…</div>}>
              {renderPage()}
            </Suspense>
        </main>
      </div>

      <UnsavedChangesModal
        isOpen={!!pendingNavigation}
        onClose={handleModalClose}
        onSave={handleModalSave}
        onDiscard={handleModalDiscard}
        changeSummary={changeSummary}
      />
      {toast && (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          title={toast.title}
          onClose={dismissToast}
        />
      )}
    </div>
    </ToastProvider>
  );
};

export default App;
