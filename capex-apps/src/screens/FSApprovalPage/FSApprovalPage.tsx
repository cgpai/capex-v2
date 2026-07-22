'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { User, UserRole, ChangeSummary, Page, FSConclusion, FINAL_FS_APPROVAL_CONCLUSIONS } from '../../types';
import * as fsService from '../../services/fsService';
import * as budgetService from '../../services/budgetService';
import * as taskService from '../../services/taskService';
import { usePermissions } from '../../hooks/usePermissions';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { FSApprovalStatusModal } from '../../components/organisms/FSApprovalStatusModal/FSApprovalStatusModal';
import { NumericInput } from '../../components/atoms/NumericInput/NumericInput';
import { queryKeys } from '../../lib/query-keys';
import {
  fetchFsApprovalPageData,
  hydrateFsApprovalPageFromDisk,
  readFsApprovalSnapshotAnyAge,
  resolveFsApprovalInitialData,
  type EnrichedFS,
  type FsApprovalPageData,
} from '../../hooks/queries/fetchFsApprovalPageData';
import { useFsScreenQuery } from '../../hooks/useFsScreenQuery';
import { FsScreenRefreshChrome } from '../../components/molecules/FsScreenRefreshChrome/FsScreenRefreshChrome';
import { cloneDeep } from '../../lib/clone';
import { useDebouncedValue } from '../BudgetHU/useDebouncedValue';
import {
  collectFilterOptions,
  diffChangedFsRecords,
  filterAndSortFsApprovalList,
  type FsApprovalSortOption,
} from './fsApprovalHelpers';
import * as configService from '../../services/configService';
import {
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
  filterRowsByUserScope,
} from '../../lib/scopedFilterOptions';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

const SORT_OPTIONS: { label: string; value: FsApprovalSortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'Payback in Month (Low → High)', value: 'paybackPeriod_asc' },
  { label: 'Payback in Month (High → Low)', value: 'paybackPeriod_desc' },
  { label: 'Amount (Highest First)', value: 'amount_desc' },
  { label: 'Amount (Lowest First)', value: 'amount_asc' },
];

function conclusionColorClass(status: string): string {
  if (status === 'Approved' || status === 'Approved with Notes') return 'text-siloam-green font-medium';
  if (status === 'Pending') return 'text-warning font-medium';
  if (status === 'Rejected') return 'text-danger font-medium';
  return 'text-siloam-text-secondary';
}

interface FSApprovalPageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: FsApprovalPageData | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
}

export const FSApprovalPage: React.FC<FSApprovalPageProps> = ({
  periodName,
  currentUser,
  allRoles,
  preloadedSnapshot,
  setIsPageDirty,
  setPageActions,
  showToast,
}) => {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSApproval, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSApproval, 'edit');

  const [editedData, setEditedData] = useState<EnrichedFS[]>([]);
  const serverFsRef = useRef<EnrichedFS[]>([]);

  const [searchTerm, setSearchTerm] = useState('');
  const emailLinkFocus = searchParams.get('focus');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>([]);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [paybackMin, setPaybackMin] = useState<number | undefined>(undefined);
  const [paybackMax, setPaybackMax] = useState<number | undefined>(undefined);
  const [paybackMinActive, setPaybackMinActive] = useState(false);
  const [paybackMaxActive, setPaybackMaxActive] = useState(false);
  const [sortBy, setSortBy] = useState<FsApprovalSortOption>('projectName_asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  const [statusModalFs, setStatusModalFs] = useState<EnrichedFS | null>(null);

  const [isDirty, setIsDirtyInternal] = useState(false);
  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const {
    fsQuery,
    diskSeed,
    isBlockingLoad,
    isBackgroundRefresh,
    isFilterRefreshing,
    hasListData,
    isSearchStaging,
  } = useFsScreenQuery<FsApprovalPageData>({
    periodName,
    userId: currentUser.id,
    canView,
    queryKey: queryKeys.fsApproval.page(periodName, currentUser.id),
    queryFn: () => fetchFsApprovalPageData(periodName, currentUser.id),
    snapshotStorageKey: 'fs-approval',
    resolveInitialData: resolveFsApprovalInitialData,
    hydrateFromDisk: hydrateFsApprovalPageFromDisk,
    readSnapshotAnyAge: readFsApprovalSnapshotAnyAge,
    preloadedSnapshot,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    getRowCount: (data) => data?.allFS?.length ?? 0,
    searchTerm,
    searchDebounceMs: SEARCH_DEBOUNCE_MS,
  });

  const pageData = fsQuery.data ?? diskSeed;

  const displayData = useMemo(
    () => (isDirty ? editedData : (pageData?.allFS ?? [])),
    [isDirty, editedData, pageData?.allFS],
  );

  const [masterArchetypes, setMasterArchetypes] = useState<
    Awaited<ReturnType<typeof configService.getAllArchetypesConfig>>
  >([]);
  const [masterHus, setMasterHus] = useState<
    Awaited<ReturnType<typeof configService.getAllHospitalUnitsConfig>>
  >([]);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      configService.getAllArchetypesConfig(),
      configService.getAllHospitalUnitsConfig(),
    ]).then(([archetypes, hus]) => {
      if (!cancelled) {
        setMasterArchetypes(archetypes);
        setMasterHus(hus);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const scopedDisplayData = useMemo(
    () =>
      filterRowsByUserScope(displayData, permissions.userScopes, {
        archetypes: masterArchetypes,
        hus: masterHus,
      }),
    [displayData, permissions.userScopes, masterArchetypes, masterHus],
  );

  const filterOptions = useMemo(() => {
    const fromData = collectFilterOptions(scopedDisplayData);
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
      categories: fromData.categories,
    };
  }, [scopedDisplayData, masterArchetypes, masterHus, permissions.userScopes]);

  const effectiveSelectedArchetypes = useMemo(() => {
    const allowed = new Set(filterOptions.archetypes);
    return selectedArchetypes.filter((a) => allowed.has(a));
  }, [selectedArchetypes, filterOptions.archetypes]);

  const effectiveSelectedHUs = useMemo(() => {
    const allowed = new Set(filterOptions.hus);
    return selectedHUs.filter((h) => allowed.has(h));
  }, [selectedHUs, filterOptions.hus]);

  useEffect(() => {
    if (fsQuery.isError) {
      console.error('Error loading FS Approval data:', fsQuery.error);
      showToast('Failed to load FS data.', 'error');
    }
  }, [fsQuery.isError, fsQuery.error, showToast]);

  useEffect(() => {
    if (!fsQuery.data?.allFS || isDirty) return;
    serverFsRef.current = cloneDeep(fsQuery.data.allFS);
  }, [fsQuery.data?.allFS, isDirty]);

  const resetLocalFilters = useCallback(() => {
    setPaybackMin(undefined);
    setPaybackMax(undefined);
    setPaybackMinActive(false);
    setPaybackMaxActive(false);
    setSortBy('projectName_asc');
  }, []);

  useEffect(() => {
    updateIsDirty(false);
    setCurrentPage(1);
    setSearchTerm('');
    setSelectedArchetypes([]);
    setSelectedHUs([]);
    setSelectedCategories([]);
    resetLocalFilters();
    if (!periodName) {
      setEditedData([]);
      serverFsRef.current = [];
    }
  }, [periodName, updateIsDirty, resetLocalFilters]);

  useEffect(() => {
    const fsId = searchParams.get('fsId')?.trim();
    if (fsId) setSearchTerm(fsId);
  }, [searchParams]);

  const filteredData = useMemo(
    () =>
      filterAndSortFsApprovalList(scopedDisplayData, {
        debouncedSearch,
        selectedArchetypes: effectiveSelectedArchetypes,
        selectedHUs: effectiveSelectedHUs,
        selectedCategories,
        paybackMin: paybackMinActive ? paybackMin : undefined,
        paybackMax: paybackMaxActive ? paybackMax : undefined,
        sortBy,
      }),
    [
      scopedDisplayData,
      debouncedSearch,
      effectiveSelectedArchetypes,
      effectiveSelectedHUs,
      selectedCategories,
      paybackMin,
      paybackMax,
      paybackMinActive,
      paybackMaxActive,
      sortBy,
    ],
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
    selectedCategories,
    paybackMin,
    paybackMax,
    paybackMinActive,
    paybackMaxActive,
    sortBy,
    itemsPerPage,
  ]);

  const handleStatusModalConfirm = useCallback(
    (status: FSConclusion, followUpAction: string) => {
      if (!statusModalFs) return;
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(pageData?.allFS ?? []);
        if (prev.length === 0) {
          serverFsRef.current = cloneDeep(pageData?.allFS ?? []);
        }
        return base.map((row) =>
          row.id === statusModalFs.id
            ? { ...row, conclusion: status, followUpAction: followUpAction || null }
            : row,
        );
      });
      updateIsDirty(true);
      setStatusModalFs(null);
      showToast('Status diperbarui. Klik Save Changes untuk menyimpan.', 'success');
    },
    [statusModalFs, pageData?.allFS, updateIsDirty, showToast],
  );

  const handleSave = useCallback(async () => {
    const baseEdited = editedData.length > 0 ? editedData : displayData;
    const changedFS = diffChangedFsRecords(serverFsRef.current, baseEdited);

    if (changedFS.length === 0) {
      showToast('No changes to save.', 'success');
      updateIsDirty(false);
      return;
    }

    try {
      await Promise.all(
        changedFS.map((fs) => {
          const { archetypeName, huName, projectName, capexCategoryName, ...fsUpdates } = fs;
          return fsService.updateFSProposal(fs.id, fsUpdates, { userId: currentUser.id });
        }),
      );

      const fsWithNewApprovalDecision = changedFS.filter((fs) => {
        const original = serverFsRef.current.find((o) => o.id === fs.id);
        if (!original || original.conclusion === fs.conclusion) return false;
        return FINAL_FS_APPROVAL_CONCLUSIONS.includes(fs.conclusion as FSConclusion);
      });

      if (fsWithNewApprovalDecision.length > 0) {
        const period = await budgetService.getBudgetByPeriodName(periodName);
        if (period) {
          const projectIds = new Set(
            fsWithNewApprovalDecision.map((fs) => String(fs.projectId).trim()),
          );
          const assetIds: string[] = [];
          period.archetypes.forEach((arch) => {
            arch.units.forEach((unit) => {
              unit.projects.forEach((project) => {
                if (projectIds.has(String(project.id).trim())) {
                  project.assets.forEach((asset) => assetIds.push(asset.id));
                }
              });
            });
          });
          if (assetIds.length > 0) {
            await taskService.triggerSystemTaskBatch(assetIds, 'FS_APPROVAL', currentUser);
          }
        }
      }

      const hasApprovalDecision = changedFS.some((fs) =>
        FINAL_FS_APPROVAL_CONCLUSIONS.includes(fs.conclusion as FSConclusion),
      );
      const emailNote = hasApprovalDecision
        ? ' Email notifications are being sent to requestors in the background.'
        : '';
      const triggerNote =
        fsWithNewApprovalDecision.length > 0
          ? ` Workflow trigger "When FS Approval" applied for ${fsWithNewApprovalDecision.length} FS.`
          : '';
      showToast(
        `Successfully updated ${changedFS.length} FS Proposal(s).${emailNote}${triggerNote}`,
        'success',
      );
      serverFsRef.current = cloneDeep(baseEdited);
      setEditedData(cloneDeep(baseEdited));
      updateIsDirty(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.fsApproval.page(periodName, currentUser.id),
      });
    } catch (err) {
      console.error('Failed to save FS Approval updates:', err);
      showToast('Failed to save changes.', 'error');
    }
  }, [editedData, displayData, showToast, queryClient, periodName, currentUser, updateIsDirty]);

  const handleCancel = useCallback(() => {
    setEditedData(cloneDeep(serverFsRef.current));
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;
    const originalFSMap = new Map(serverFsRef.current.map((p) => [p.id, p]));
    const changes: { item: string; before: string; after: string }[] = [];

    const rows = editedData.length > 0 ? editedData : displayData;
    rows.forEach((editedFS) => {
      const originalFS = originalFSMap.get(editedFS.id);
      if (!originalFS) return;

      if (originalFS.conclusion !== editedFS.conclusion) {
        changes.push({
          item: `${editedFS.projectName} Conclusion`,
          before: String(originalFS.conclusion),
          after: String(editedFS.conclusion),
        });
      }
      if (originalFS.followUpAction !== editedFS.followUpAction) {
        changes.push({
          item: `${editedFS.projectName} Follow Up`,
          before: originalFS.followUpAction || 'None',
          after: editedFS.followUpAction || 'None',
        });
      }
    });

    if (changes.length === 0) return null;
    return { title: 'FS Approval Updates', changes };
  }, [isDirty, editedData, displayData]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const columns: SpreadsheetColumn<EnrichedFS>[] = useMemo(
    () => [
      { header: 'Network', accessor: 'archetypeName' },
      { header: 'Unit', accessor: 'huName' },
      { header: 'Project Name', accessor: 'projectName' },
      { header: 'Capex Category', accessor: 'capexCategoryName' },
      { header: 'New FS / Revision', accessor: 'fsType' },
      { header: 'Amount [Rp mn]', accessor: 'amount', isNumeric: true },
      { header: 'IRR', accessor: (item) => `${item.irr}%` },
      {
        id: 'paybackPeriod',
        header: 'Payback in Month',
        accessor: 'paybackPeriod',
        isNumeric: true,
        numericDisplay: 'plain',
        align: 'right',
      },
      { header: 'NPV [Rp mn]', accessor: 'npv', isNumeric: true },
      { header: 'ROI', accessor: (item) => `${item.roi}%` },
      {
        header: 'Conclusion',
        accessor: (item) => (
          <span className={`px-3 py-2.5 inline-block ${conclusionColorClass(String(item.conclusion))}`}>
            {item.conclusion}
          </span>
        ),
      },
      {
        header: 'Follow Up action',
        accessor: (item) => (
          <span className="px-3 py-2.5 inline-block text-siloam-text-primary">
            {item.followUpAction || '—'}
          </span>
        ),
      },
      {
        header: 'Action',
        accessor: (item) =>
          canEdit ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setStatusModalFs(item);
              }}
              className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
            >
              Edit Status
            </button>
          ) : (
            <span className="text-xs text-siloam-text-secondary">View only</span>
          ),
        align: 'center',
      },
    ],
    [canEdit],
  );

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const paybackFilterNode = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-siloam-text-secondary">Payback in Month (range)</p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 flex-1">
          <input
            type="checkbox"
            checked={paybackMinActive}
            onChange={(e) => setPaybackMinActive(e.target.checked)}
            className="h-4 w-4 rounded border-siloam-border text-siloam-blue"
          />
          <span className="text-xs text-siloam-text-secondary shrink-0">Min</span>
          <NumericInput
            value={paybackMin ?? 0}
            onValueChange={setPaybackMin}
            disabled={!paybackMinActive}
            allowDecimal={false}
            align="center"
            className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg text-sm disabled:opacity-50"
          />
        </label>
        <span className="text-siloam-text-secondary font-bold">–</span>
        <label className="flex items-center gap-2 flex-1">
          <input
            type="checkbox"
            checked={paybackMaxActive}
            onChange={(e) => setPaybackMaxActive(e.target.checked)}
            className="h-4 w-4 rounded border-siloam-border text-siloam-blue"
          />
          <span className="text-xs text-siloam-text-secondary shrink-0">Max</span>
          <NumericInput
            value={paybackMax ?? 0}
            onValueChange={setPaybackMax}
            disabled={!paybackMaxActive}
            allowDecimal={false}
            align="center"
            className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg text-sm disabled:opacity-50"
          />
        </label>
      </div>
    </div>
  );

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
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">FS Approval Board</h2>
          {isBlockingLoad ? (
            <p className="text-xs text-siloam-text-secondary mt-1 flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full border-2 border-siloam-blue border-t-transparent animate-spin" />
              Memuat data…
            </p>
          ) : isBackgroundRefresh ? (
            <p className="text-xs text-siloam-text-secondary mt-1">Memperbarui data di latar…</p>
          ) : null}
          {emailLinkFocus === 'approve' || emailLinkFocus === 'reject' ? (
            <p className="text-xs text-siloam-blue mt-1">
              Opened from email link — review the FS below, update Conclusion, then Save Changes.
            </p>
          ) : null}
        </div>
        {isDirty && canEdit ? (
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
            >
              Save Changes
            </button>
          </div>
        ) : null}
      </div>

      {scopedDisplayData.length > 0 ? (
        <TaskFilterPanel
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          searchPlaceholder="Search project, unit, archetype, category, payback…"
          huOptions={filterOptions.hus}
          selectedHUs={selectedHUs}
          setSelectedHUs={setSelectedHUs}
          archetypeOptions={filterOptions.archetypes}
          selectedArchetypes={selectedArchetypes}
          setSelectedArchetypes={setSelectedArchetypes}
          categoryOptions={filterOptions.categories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
          onResetFilters={resetLocalFilters}
          extraFilters={paybackFilterNode}
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
          blockingMessage="Memuat data FS Approval…"
          filterMessage={isSearchStaging ? 'Mencari…' : 'Memfilter…'}
        />
        {scopedDisplayData.length > 0 ? (
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
                No FS proposals match the current filters.
              </p>
            )}

            {filteredData.length > 0 ? (
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
                <div className="text-sm text-siloam-text-secondary">
                  Showing {Math.min(filteredData.length, (currentPage - 1) * itemsPerPage + 1)} -{' '}
                  {Math.min(currentPage * itemsPerPage, filteredData.length)} of {filteredData.length}{' '}
                  proposals
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
            <p className="text-sm">Memuat data FS Approval…</p>
          </div>
        ) : (
          <div className="text-center py-12 text-siloam-text-secondary space-y-2">
            <p className="font-medium text-siloam-text-primary">Belum ada FS Proposal untuk periode ini</p>
            <p className="text-sm max-w-lg mx-auto">
              Halaman FS Approval menampilkan data dari FS Proposal yang dibuat di{' '}
              <strong>Budget HU</strong> (bukan checkbox FS Approval di FS Update). Buat atau edit FS Proposal
              pada project di Budget HU, lalu kembali ke halaman ini.
            </p>
          </div>
        )}
      </div>

      {statusModalFs ? (
        <FSApprovalStatusModal
          projectName={statusModalFs.projectName}
          currentStatus={String(statusModalFs.conclusion)}
          currentFollowUp={statusModalFs.followUpAction || ''}
          onClose={() => setStatusModalFs(null)}
          onConfirm={handleStatusModalConfirm}
        />
      ) : null}
    </div>
  );
};

FSApprovalPage.displayName = 'FSApprovalPage';
