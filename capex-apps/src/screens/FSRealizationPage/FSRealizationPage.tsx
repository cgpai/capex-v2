'use client';

import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, UserRole, ChangeSummary, FSRealization, Page } from '../../types';
import * as fsService from '../../services/fsService';
import { usePermissions } from '../../hooks/usePermissions';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { formatCurrency } from '../../lib/formatter';
import { queryKeys } from '../../lib/query-keys';
import {
  fetchFsRealizationPageData,
  hydrateFsRealizationPageFromDisk,
  readFsRealizationSnapshotAnyAge,
  resolveFsRealizationInitialData,
  type EnrichedFS,
  type FsRealizationPageData,
} from '../../hooks/queries/fetchFsRealizationPageData';
import { useFsScreenQuery } from '../../hooks/useFsScreenQuery';
import { FsScreenRefreshChrome } from '../../components/molecules/FsScreenRefreshChrome/FsScreenRefreshChrome';
import { useDebouncedValue } from '../BudgetHU/useDebouncedValue';
import * as configService from '../../services/configService';
import {
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
  filterRowsByUserScope,
} from '../../lib/scopedFilterOptions';
import {
  collectFilterOptions,
  filterAndSortFsRealizationList,
  toFsApprovedBudgetIdr,
  type FsRealizationSortOption,
} from './fsRealizationHelpers';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

const SORT_OPTIONS: { label: string; value: FsRealizationSortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'Unit (A-Z)', value: 'huName_asc' },
  { label: 'Network (A-Z)', value: 'archetypeName_asc' },
  { label: 'Approved Budget (Highest First)', value: 'amount_desc' },
  { label: 'Approved Budget (Lowest First)', value: 'amount_asc' },
  { label: 'Plan Revenue Start (Earliest)', value: 'plannedRevenueStartDate_asc' },
  { label: 'Plan Revenue Start (Latest)', value: 'plannedRevenueStartDate_desc' },
  { label: 'Monthly Revenue Plan (Highest First)', value: 'monthlyRevenuePlan_desc' },
  { label: 'Monthly Revenue Plan (Lowest First)', value: 'monthlyRevenuePlan_asc' },
];

const FSRealizationModal = lazy(() =>
  import('../../components/organisms/FSRealizationModal/FSRealizationModal').then((m) => ({
    default: m.FSRealizationModal,
  })),
);

interface FSRealizationPageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: FsRealizationPageData | null;
  headerArchetypeId?: string | null;
  headerHuId?: string | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const FSRealizationPage: React.FC<FSRealizationPageProps> = ({
  periodName,
  currentUser,
  allRoles,
  preloadedSnapshot,
  headerArchetypeId = null,
  headerHuId = null,
  setIsPageDirty,
  setPageActions,
  showToast,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSRealization, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSRealization, 'edit');

  const [selectedFS, setSelectedFS] = useState<EnrichedFS | null>(null);
  const [realizations, setRealizations] = useState<FSRealization[]>([]);
  const [isModalLoading, setIsModalLoading] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<FsRealizationSortOption>('projectName_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  const {
    fsQuery,
    diskSeed,
    isBlockingLoad,
    isBackgroundRefresh,
    isFilterRefreshing,
    hasListData,
    isSearchStaging,
  } = useFsScreenQuery<FsRealizationPageData>({
    periodName,
    userId: currentUser.id,
    canView,
    queryKey: queryKeys.fsRealization.page(periodName, currentUser.id),
    queryFn: () => fetchFsRealizationPageData(periodName, currentUser.id),
    snapshotStorageKey: 'fs-realization',
    resolveInitialData: resolveFsRealizationInitialData,
    hydrateFromDisk: hydrateFsRealizationPageFromDisk,
    readSnapshotAnyAge: readFsRealizationSnapshotAnyAge,
    preloadedSnapshot,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    getRowCount: (data) => data?.allFS?.length ?? 0,
    searchTerm,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
  });

  const pageData = fsQuery.data ?? diskSeed;
  const allFS = pageData?.allFS ?? [];

  const [masterArchetypes, setMasterArchetypes] = useState<
    Awaited<ReturnType<typeof configService.getAllArchetypesConfig>>
  >([]);
  const [masterHus, setMasterHus] = useState<
    Awaited<ReturnType<typeof configService.getAllHospitalUnitsConfig>>
  >([]);
  const [isMasterConfigLoading, setIsMasterConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setIsMasterConfigLoading(true);
    void Promise.all([
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
    ]).then(([archetypes, hus]) => {
      if (!cancelled) {
        setMasterArchetypes(archetypes);
        setMasterHus(hus);
        setIsMasterConfigLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const needsScopeResolution =
    !permissions.userScopes.all &&
    (permissions.userScopes.archetypeIds.size > 0 || permissions.userScopes.huIds.size > 0);
  const isScopePending = isMasterConfigLoading && needsScopeResolution;

  const scopedAllFS = useMemo(
    () =>
      filterRowsByUserScope(allFS, permissions.userScopes, {
        archetypes: masterArchetypes,
        hus: masterHus,
      }),
    [allFS, permissions.userScopes, masterArchetypes, masterHus],
  );

  const filterOptions = useMemo(() => {
    const fromData = collectFilterOptions(scopedAllFS);
    if (permissions.userScopes.all) return fromData;

    const scopedArch = buildScopedArchetypeOptions(
      masterArchetypes,
      permissions.userScopes,
      masterHus,
    );
    const scopedHu = buildScopedHuOptions(masterHus, masterArchetypes, permissions.userScopes);
    const archSet = new Set(scopedArch);
    const huSet = new Set(scopedHu);

    return {
      archetypes:
        scopedArch.length > 0
          ? fromData.archetypes.filter((a) => archSet.has(a))
          : fromData.archetypes.filter((a) => permissions.userScopes.archetypes.has(a)),
      hus:
        scopedHu.length > 0
          ? fromData.hus.filter((h) => huSet.has(h))
          : fromData.hus.filter((h) => permissions.userScopes.hus.has(h)),
    };
  }, [scopedAllFS, masterArchetypes, masterHus, permissions.userScopes]);

  const effectiveSelectedArchetypes = useMemo(() => {
    const allowed = new Set(filterOptions.archetypes);
    return selectedArchetypes.filter((a) => allowed.has(a));
  }, [selectedArchetypes, filterOptions.archetypes]);

  const effectiveSelectedHUs = useMemo(() => {
    const allowed = new Set(filterOptions.hus);
    return selectedHUs.filter((h) => allowed.has(h));
  }, [selectedHUs, filterOptions.hus]);

  useEffect(() => {
    if (!periodName.trim() || !canView) return;
    void queryClient.invalidateQueries({
      queryKey: queryKeys.fsRealization.page(periodName, currentUser.id),
    });
  }, [periodName, currentUser.id, canView, queryClient]);

  useEffect(() => {
    if (fsQuery.isError) {
      console.error('Error loading FS Realization data:', fsQuery.error);
      showToast('Failed to load FS data.', 'error');
    }
  }, [fsQuery.isError, fsQuery.error, showToast]);

  useEffect(() => {
    setPageActions({
      onSave: async () => {},
      onCancel: () => {},
      getSummary: () => null,
    });
    setIsPageDirty(false);
  }, [setPageActions, setIsPageDirty]);

  const resetLocalFilters = useCallback(() => {
    setSortBy('projectName_asc');
  }, []);

  useEffect(() => {
    setCurrentPage(1);
    setSearchTerm('');
    setSelectedArchetypes([]);
    setSelectedHUs([]);
    resetLocalFilters();
  }, [periodName, resetLocalFilters]);

  const headerScopeKey = `${periodName}:${headerArchetypeId ?? ''}:${headerHuId ?? ''}`;
  const lastHeaderScopeKeyRef = React.useRef('');

  useEffect(() => {
    if (lastHeaderScopeKeyRef.current === headerScopeKey) return;
    lastHeaderScopeKeyRef.current = headerScopeKey;

    if (!headerArchetypeId && !headerHuId) {
      setSelectedArchetypes([]);
      setSelectedHUs([]);
      return;
    }
    if (isMasterConfigLoading) return;

    const nextArchetypes: string[] = [];
    const nextHus: string[] = [];

    if (headerArchetypeId) {
      const arch = masterArchetypes.find((a) => String(a.id) === String(headerArchetypeId));
      if (arch?.name) nextArchetypes.push(arch.name);
    }

    if (headerHuId) {
      const hu = masterHus.find((h) => String(h.id) === String(headerHuId));
      if (hu?.name) nextHus.push(hu.name);
    }

    setSelectedArchetypes(nextArchetypes);
    setSelectedHUs(nextHus);
  }, [
    headerScopeKey,
    headerArchetypeId,
    headerHuId,
    isMasterConfigLoading,
    masterArchetypes,
    masterHus,
  ]);

  const filteredData = useMemo(
    () =>
      filterAndSortFsRealizationList(scopedAllFS, {
        debouncedSearch,
        selectedArchetypes: effectiveSelectedArchetypes,
        selectedHUs: effectiveSelectedHUs,
        sortBy,
      }),
    [scopedAllFS, debouncedSearch, effectiveSelectedArchetypes, effectiveSelectedHUs, sortBy],
  );

  const totalPages = Math.max(1, Math.ceil(filteredData.length / itemsPerPage));

  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredData.slice(start, start + itemsPerPage);
  }, [filteredData, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    debouncedSearch,
    selectedArchetypes,
    selectedHUs,
    sortBy,
    itemsPerPage,
    headerArchetypeId,
    headerHuId,
  ]);

  const handleOpenModal = useCallback(
    async (fs: EnrichedFS) => {
      setIsModalLoading(true);
      setSelectedFS(fs);
      try {
        const existingRealizations = await fsService.getFSRealizations(fs.id, { userId: currentUser.id });
        setRealizations(existingRealizations);
      } catch (err) {
        console.error('Error loading realizations:', err);
        showToast('Failed to load realizations.', 'error');
        setSelectedFS(null);
      } finally {
        setIsModalLoading(false);
      }
    },
    [currentUser.id, showToast],
  );

  const handleSaveRealizations = useCallback(
    async (newRealizations: Omit<FSRealization, 'createdAt' | 'updatedAt'>[], actualStartDate: string) => {
      if (!selectedFS) return;
      try {
        if (selectedFS.actualRevenueStartDate !== actualStartDate) {
          await fsService.updateFSProposal(
            selectedFS.id,
            { actualRevenueStartDate: actualStartDate },
            { userId: currentUser.id },
          );
        }

        await Promise.all(
          newRealizations.map((r) =>
            fsService.saveFSRealization(r as FSRealization, { userId: currentUser.id }),
          ),
        );

        showToast('Realizations saved successfully.', 'success');
        setSelectedFS(null);
        setRealizations([]);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.fsRealization.page(periodName, currentUser.id),
        });
      } catch (err) {
        console.error('Error saving realizations:', err);
        showToast('Failed to save realizations.', 'error');
      }
    },
    [selectedFS, currentUser.id, showToast, queryClient, periodName],
  );

  const handleCloseModal = useCallback(() => {
    setSelectedFS(null);
    setRealizations([]);
  }, []);

  const columns: SpreadsheetColumn<EnrichedFS>[] = useMemo(
    () => [
      { header: 'Network', accessor: 'archetypeName' },
      { header: 'Unit', accessor: 'huName' },
      { header: 'Project Name', accessor: 'projectName' },
      { header: 'Capex Category', accessor: 'capexCategoryName' },
      { header: 'FS Type', accessor: 'fsType' },
      {
        header: 'Approved Budget',
        accessor: (item) => formatCurrency(toFsApprovedBudgetIdr(item.amount)),
        isNumeric: true,
      },
      { header: 'Plan Revenue Start', accessor: 'plannedRevenueStartDate' },
      { header: 'Actual Revenue Start', accessor: (item) => item.actualRevenueStartDate || 'Not Set' },
      {
        header: 'Monthly Revenue Plan',
        accessor: (item) => formatCurrency(item.monthlyRevenuePlan),
        isNumeric: true,
      },
      {
        header: 'Action',
        accessor: (item) => (
          <button
            type="button"
            onClick={() => void handleOpenModal(item)}
            disabled={isModalLoading && selectedFS?.id === item.id}
            className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90 disabled:opacity-50"
          >
            {canEdit ? 'Update Realization' : 'View Realization'}
          </button>
        ),
      },
    ],
    [canEdit, handleOpenModal, isModalLoading, selectedFS?.id],
  );

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold">FS Realization Tracking</h2>
        {isBlockingLoad ? (
          <p className="text-xs text-siloam-text-secondary mt-1 flex items-center gap-1.5">
            <span className="inline-block h-3 w-3 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
            Memuat data…
          </p>
        ) : isBackgroundRefresh ? (
          <p className="text-xs text-siloam-text-secondary mt-1">Memperbarui data di latar…</p>
        ) : scopedAllFS.length > 0 ? (
          <p className="text-xs text-siloam-text-secondary mt-1">
            {scopedAllFS.length} approved NR project{scopedAllFS.length === 1 ? '' : 's'} in your scope
            {filteredData.length !== scopedAllFS.length
              ? ` · ${filteredData.length} shown after filters`
              : ''}
          </p>
        ) : null}
      </div>

      {periodName ? (
        <TaskFilterPanel
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchPlaceholder="Search project, unit, network, category, revenue date…"
          huOptions={filterOptions.hus}
          selectedHUs={selectedHUs}
          setSelectedHUs={setSelectedHUs}
          archetypeOptions={filterOptions.archetypes}
          selectedArchetypes={selectedArchetypes}
          setSelectedArchetypes={setSelectedArchetypes}
          onResetFilters={resetLocalFilters}
        >
          <div className="w-64">
            <Dropdown
              label="Sort by"
              options={SORT_OPTIONS.map((o) => o.label)}
              selectedValue={sortLabel}
              onSelect={(label) => {
                const selected = SORT_OPTIONS.find((o) => o.label === label)?.value;
                if (selected) setSortBy(selected);
              }}
            />
          </div>
        </TaskFilterPanel>
      ) : null}

      <div className="bg-siloam-surface rounded-xl shadow-soft p-6 space-y-4 relative">
        <FsScreenRefreshChrome
          isBlockingLoad={isBlockingLoad}
          isBackgroundRefresh={isBackgroundRefresh}
          isFilterRefreshing={isFilterRefreshing}
          hasListData={hasListData}
          blockingMessage="Memuat data FS Realization…"
          filterMessage={isSearchStaging ? 'Mencari…' : 'Memfilter…'}
        />
        <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue">
          <strong>Note:</strong> Hanya menampilkan FS dengan kategori budget{' '}
          <strong>New Revenue Generating (NR)</strong> yang berstatus Approved atau Approved with Notes.
        </div>

        {isScopePending ? (
          <div className="text-center py-12 text-siloam-text-secondary flex flex-col items-center gap-3">
            <span className="inline-block h-6 w-6 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
            <p className="text-sm">Memuat scope unit…</p>
          </div>
        ) : scopedAllFS.length > 0 ? (
          <>
            {paginatedData.length > 0 ? (
              <SpreadsheetTable
                columns={columns}
                data={paginatedData}
                onDataChange={() => {}}
                rowHeaderAccessor="projectName"
              />
            ) : (
              <p className="text-center py-8 text-siloam-text-secondary">
                No projects match the current filters.
              </p>
            )}

            {filteredData.length > 0 ? (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
                <div className="text-sm text-siloam-text-secondary">
                  Showing {Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} -{' '}
                  {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length} projects
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-siloam-text-secondary">Per page:</label>
                    <select
                      value={itemsPerPage}
                      onChange={(e) => {
                        setItemsPerPage(Number(e.target.value));
                        setCurrentPage(1);
                      }}
                      className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    >
                      <option value={20}>20</option>
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                    </select>
                  </div>
                  {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 text-sm"
                      >
                        Previous
                      </button>
                      <span className="text-sm text-siloam-text-secondary">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 text-sm"
                      >
                        Next
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        ) : isBlockingLoad ? (
          <div className="text-center py-12 text-siloam-text-secondary flex flex-col items-center gap-3">
            <span className="inline-block h-6 w-6 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
            <p className="text-sm">Memuat data FS Realization…</p>
          </div>
        ) : (
          <p className="text-center py-8 text-siloam-text-secondary">
            No approved NR (New Revenue Generating) feasibility studies found for this period in your unit scope.
          </p>
        )}
      </div>

      {selectedFS ? (
        <Suspense fallback={null}>
          <FSRealizationModal
            fs={selectedFS}
            existingRealizations={realizations}
            onClose={handleCloseModal}
            onSave={handleSaveRealizations}
            readOnly={!canEdit}
          />
        </Suspense>
      ) : null}
    </div>
  );
};

FSRealizationPage.displayName = 'FSRealizationPage';
