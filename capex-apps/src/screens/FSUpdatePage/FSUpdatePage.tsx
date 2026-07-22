'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  useRef,
  lazy,
  Suspense,
  memo,
  useLayoutEffect,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Zap, FileSpreadsheet } from 'lucide-react';
import {
  User,
  UserRole,
  ChangeSummary,
  FeasibilityStudy,
  Page,
} from '../../types';
import * as taskService from '../../services/taskService';
import * as fsService from '../../services/fsService';
import { saveFsProjectsViaBackend } from '../../services/fsUpdateApi';
import { usePermissions } from '../../hooks/usePermissions';
import { formatCurrency } from '../../lib/formatter';
import { SpreadsheetTable, SpreadsheetColumn } from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { TaskFilterPanel } from '../../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { MeetingFilterBar } from '../../components/organisms/MeetingFilterBar/MeetingFilterBar';
import { queryKeys } from '../../lib/query-keys';
import {
  fetchFsUpdatePageData,
  hydrateFsUpdatePageFromDisk,
  readFsUpdateSnapshotAnyAge,
  resolveFsUpdateInitialData,
  type FsEnrichedProject,
  type FsUpdatePageData,
} from '../../hooks/queries/fetchFsUpdatePageData';
import { cloneDeep } from '../../lib/clone';
import * as configService from '../../services/configService';
import { useDebouncedValue } from '../BudgetHU/useDebouncedValue';
import {
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
  filterRowsByUserScope,
} from '../../lib/scopedFilterOptions';
import {
  type SortOption,
  type FsEditableProject,
  applyAutoFsApproval,
  buildFsChangeSummaryRows,
  computeFsUpdateSummary,
  diffChangedFsProjects,
  filterAndSortFsProjects,
  isFsUpdateSpecialProject,
  projectsWithNewFsApproval,
  resolveFsApproval,
  toFsProjectSavePatch,
} from './fsUpdateHelpers';
import { QuickFsUpdateModal } from './QuickFsUpdateModal';
import { FsSmartMigrationModal } from './FsSmartMigrationModal';

const STALE_MS = 120_000;
const GC_MS = 1000 * 60 * 30;
const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

const FSProposalModal = lazy(() =>
  import('../../components/organisms/FSProposalModal/FSProposalModal').then((m) => ({
    default: m.FSProposalModal,
  })),
);

const SORT_OPTIONS: { label: string; value: SortOption }[] = [
  { label: 'Project Name (A-Z)', value: 'projectName_asc' },
  { label: 'HU Name (A-Z)', value: 'huName_asc' },
  { label: 'Budget Plan (Highest First)', value: 'budgetPlan_desc' },
];

interface FSUpdatePageProps {
  periodName: string;
  currentUser: User;
  allRoles: UserRole[];
  preloadedSnapshot?: FsUpdatePageData | null;
  setIsPageDirty: (isDirty: boolean) => void;
  setPageActions: (actions: {
    onSave: () => Promise<void>;
    onCancel: () => void;
    getSummary: () => ChangeSummary | null;
  }) => void;
  showToast: (message: string, type?: 'success' | 'error') => void;
  onDataChange: () => void;
}

const FsUpdateExtraFilters = memo(function FsUpdateExtraFilters({
  showOnlyNotFSApproved,
  onShowOnlyNotFSApprovedChange,
  focusNeedingApproval,
  onFocusNeedingApprovalChange,
}: {
  showOnlyNotFSApproved: boolean;
  onShowOnlyNotFSApprovedChange: (checked: boolean) => void;
  focusNeedingApproval: boolean;
  onFocusNeedingApprovalChange: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center">
        <input
          id="show-only-not-fs-approved"
          type="checkbox"
          checked={showOnlyNotFSApproved}
          onChange={(e) => onShowOnlyNotFSApprovedChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="show-only-not-fs-approved" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Show only projects not FS Approved (Default)
        </label>
      </div>
      <div className="flex items-center">
        <input
          id="focus-approval"
          type="checkbox"
          checked={focusNeedingApproval}
          onChange={(e) => onFocusNeedingApprovalChange(e.target.checked)}
          className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
        />
        <label htmlFor="focus-approval" className="ml-2 text-sm font-medium text-siloam-text-primary">
          Focus on items needing Approval
        </label>
      </div>
    </div>
  );
});

export const FSUpdatePage: React.FC<FSUpdatePageProps> = ({
  periodName,
  currentUser,
  allRoles,
  preloadedSnapshot,
  setIsPageDirty,
  setPageActions,
  showToast,
  onDataChange,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.FSUpdate, 'view');
  const canEdit = permissions.canOperateOnPage(Page.FSUpdate, 'edit');
  const canCreateFS = permissions.isAllowed('FS Update', 'create');

  const [editedData, setEditedData] = useState<FsEditableProject[]>([]);
  const serverProjectsRef = useRef<FsEditableProject[]>([]);
  const scopeKeyRef = useRef(`${periodName}:${currentUser.id}`);
  const diskSeedRef = useRef<FsUpdatePageData | undefined>(undefined);

  if (scopeKeyRef.current !== `${periodName}:${currentUser.id}`) {
    scopeKeyRef.current = `${periodName}:${currentUser.id}`;
    diskSeedRef.current = undefined;
  }
  if (diskSeedRef.current === undefined) {
    const disk =
      preloadedSnapshot ??
      (periodName.trim() && currentUser.id
        ? readFsUpdateSnapshotAnyAge(periodName, currentUser.id) ?? undefined
        : undefined);
    diskSeedRef.current = (disk?.editedData?.length ?? 0) > 0 ? disk : undefined;
  }

  const initialPageData = useMemo(() => {
    const resolved =
      resolveFsUpdateInitialData(queryClient, periodName, currentUser.id) ?? diskSeedRef.current;
    if ((resolved?.editedData?.length ?? 0) > 0) return resolved;
    return undefined;
  }, [queryClient, periodName, currentUser.id]);

  useLayoutEffect(() => {
    if (!periodName.trim() || !canView) return;
    if (queryClient.getQueryData(queryKeys.fsUpdate.page(periodName, currentUser.id))) return;

    hydrateFsUpdatePageFromDisk(queryClient, periodName, currentUser.id);
    if (queryClient.getQueryData(queryKeys.fsUpdate.page(periodName, currentUser.id))) return;

    if (diskSeedRef.current) {
      queryClient.setQueryData(
        queryKeys.fsUpdate.page(periodName, currentUser.id),
        diskSeedRef.current,
      );
    }
  }, [periodName, currentUser.id, canView, queryClient]);

  const fsQuery = useQuery({
    queryKey: queryKeys.fsUpdate.page(periodName, currentUser.id),
    queryFn: async () => {
      const result = await fetchFsUpdatePageData(periodName, currentUser.id);
      if (!result) {
        throw new Error(`Failed to load FS Update data for ${periodName}`);
      }
      return result;
    },
    enabled: !!periodName.trim() && !!currentUser.id && canView,
    staleTime: STALE_MS,
    gcTime: GC_MS,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: 'always',
    initialData: initialPageData,
    initialDataUpdatedAt: initialPageData ? Date.now() - STALE_MS - 1 : undefined,
    placeholderData: (prev) => prev,
  });

  const pageData = fsQuery.data ?? diskSeedRef.current;

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

  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [focusNeedingApproval, setFocusNeedingApproval] = useState(false);
  const [showOnlyNotFSApproved, setShowOnlyNotFSApproved] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('projectName_asc');
  const [meetingFilters, setMeetingFilters] = useState<{ archetype: string | null }>({ archetype: null });
  const [selectedProjectForFS, setSelectedProjectForFS] = useState<FsEnrichedProject | null>(null);
  const [viewFS, setViewFS] = useState<FeasibilityStudy | null>(null);
  const [isQuickFsModalOpen, setIsQuickFsModalOpen] = useState(false);
  const [isFsMigrationOpen, setIsFsMigrationOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(INITIAL_PAGE_SIZE);

  const [isDirty, setIsDirtyInternal] = useState(false);
  const updateIsDirty = useCallback(
    (dirty: boolean) => {
      setIsDirtyInternal(dirty);
      setIsPageDirty(dirty);
    },
    [setIsPageDirty],
  );

  const handleMeetingFilterChange = useCallback(
    (filters: { archetype: string | null; assetTypeGroup: string | null }) => {
      setMeetingFilters({ archetype: filters.archetype });
    },
    [],
  );

  const displayData = useMemo(
    () => (isDirty ? editedData : (pageData?.editedData ?? [])),
    [isDirty, editedData, pageData?.editedData],
  );

  const masterData = pageData?.masterData ?? {
    archetypes: masterArchetypes,
    hus: masterHus,
    assetTypes: [],
    assetTypeGroups: [],
  };

  const filterArchetypes =
    masterData.archetypes.length > 0 ? masterData.archetypes : masterArchetypes;
  const filterHus = masterData.hus.length > 0 ? masterData.hus : masterHus;

  const scopedDisplayData = useMemo(
    () =>
      filterRowsByUserScope(displayData, permissions.userScopes, {
        archetypes: filterArchetypes,
        hus: filterHus,
      }),
    [displayData, permissions.userScopes, filterArchetypes, filterHus],
  );

  const fsByProjectId = pageData?.fsByProjectId ?? {};

  const fsSummary = useMemo(
    () => computeFsUpdateSummary(scopedDisplayData, fsByProjectId),
    [scopedDisplayData, fsByProjectId],
  );

  const showTableLoading =
    scopedDisplayData.length === 0 &&
    (fsQuery.isLoading || fsQuery.isPending || (fsQuery.isFetching && !pageData?.editedData?.length));
  const isBackgroundRefresh = fsQuery.isFetching && scopedDisplayData.length > 0;

  useEffect(() => {
    if (fsQuery.isError) {
      console.error('Error loading FS data:', fsQuery.error);
      showToast('Failed to load project data.', 'error');
    }
  }, [fsQuery.isError, fsQuery.error, showToast]);

  useEffect(() => {
    if (!pageData?.editedData?.length || isDirty) return;
    serverProjectsRef.current = cloneDeep(pageData.editedData);
  }, [pageData?.editedData, isDirty]);

  useEffect(() => {
    updateIsDirty(false);
    setEditedData([]);
    setCurrentPage(1);
    setSearchTerm('');
    serverProjectsRef.current = [];
  }, [periodName, updateIsDirty]);

  const mergeRowPatch = useCallback((original: FsEditableProject, patch: FsEditableProject) => {
    const merged = applyAutoFsApproval({ ...original, ...patch });
    if (patch.__fsApprovalChecked !== undefined) {
      merged.__fsApprovalChecked = patch.__fsApprovalChecked;
      merged.fsApproval = patch.__fsApprovalChecked;
    }
    return merged;
  }, []);

  const handleDataChange = useCallback(
    (newData: FsEditableProject[]) => {
      const changesMap = new Map(newData.map((item) => [item.id, item]));
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(pageData?.editedData ?? []);
        if (prev.length === 0) {
          serverProjectsRef.current = cloneDeep(pageData?.editedData ?? []);
        }
        return base.map((originalItem) => {
          const patch = changesMap.get(originalItem.id);
          return patch ? mergeRowPatch(originalItem, patch) : originalItem;
        });
      });
      updateIsDirty(true);
    },
    [pageData?.editedData, mergeRowPatch, updateIsDirty],
  );

  const handleFSApprovalChange = useCallback(
    (projectId: string, isChecked: boolean) => {
      setEditedData((prev) => {
        const base = prev.length > 0 ? prev : cloneDeep(pageData?.editedData ?? []);
        if (prev.length === 0) {
          serverProjectsRef.current = cloneDeep(pageData?.editedData ?? []);
        }
        return base.map((project) =>
          project.id === projectId
            ? { ...project, __fsApprovalChecked: isChecked, fsApproval: isChecked }
            : project,
        );
      });
      updateIsDirty(true);
    },
    [pageData?.editedData, updateIsDirty],
  );

  const handleSaveFSProposal = useCallback(
    async (fsData: Omit<FeasibilityStudy, 'createdAt' | 'updatedAt'>) => {
      if (!selectedProjectForFS) return;
      if (!canCreateFS) {
        showToast('Anda tidak memiliki izin untuk membuat atau menginput FS.', 'error');
        return;
      }
      try {
        await fsService.createFSProposal(fsData, { userId: currentUser.id });
        for (const asset of selectedProjectForFS.assets) {
          await taskService.triggerSystemTask(asset.id, 'FS_REQUEST', currentUser);
        }
        showToast('FS Proposal created successfully!', 'success');
        setSelectedProjectForFS(null);
        await queryClient.invalidateQueries({
          queryKey: queryKeys.fsUpdate.page(periodName, currentUser.id),
        });
      } catch (err) {
        console.error('Failed to create FS proposal:', err);
        showToast('Failed to create FS Proposal.', 'error');
      }
    },
    [selectedProjectForFS, canCreateFS, currentUser, showToast, queryClient, periodName],
  );

  const handleViewFS = useCallback(
    async (project: FsEnrichedProject) => {
      if (!project.fsId) return;
      try {
        const fs = await fsService.getFeasibilityStudyById(project.fsId, { userId: currentUser.id });
        if (fs) setViewFS(fs);
      } catch (err) {
        console.error('Failed to load FS:', err);
        showToast('Failed to load FS details.', 'error');
      }
    },
    [currentUser, showToast],
  );

  const handleSave = useCallback(async () => {
    const changedProjects = diffChangedFsProjects(serverProjectsRef.current, editedData);

    if (changedProjects.length === 0) {
      showToast('No changes to save.', 'success');
      updateIsDirty(false);
      return;
    }

    try {
      const saved = await saveFsProjectsViaBackend(
        currentUser.id,
        periodName,
        changedProjects.map(toFsProjectSavePatch),
      );
      if (!saved.ok) {
        showToast(saved.error || 'Failed to save changes — backend unavailable.', 'error');
        return;
      }

      const newlyApproved = projectsWithNewFsApproval(serverProjectsRef.current, editedData);
      if (newlyApproved.length > 0) {
        const allAssetIds = newlyApproved.flatMap((project) => project.assets.map((asset) => asset.id));
        await taskService.triggerSystemTaskBatch(allAssetIds, 'BUDGET_APPROVED', currentUser);
      }

      showToast(
        `Successfully updated ${changedProjects.length} project(s).${
          newlyApproved.length > 0
            ? ` FS Approval triggered for ${newlyApproved.length} project(s).`
            : ''
        }`,
        'success',
      );
      onDataChange();
      serverProjectsRef.current = cloneDeep(editedData);
      updateIsDirty(false);
      setEditedData([]);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.fsUpdate.page(periodName, currentUser.id),
      });
    } catch (err) {
      console.error('Failed to save FS updates:', err);
      showToast('Failed to save changes.', 'error');
    }
  }, [
    editedData,
    currentUser,
    onDataChange,
    showToast,
    queryClient,
    updateIsDirty,
    periodName,
  ]);

  const handleCancel = useCallback(() => {
    setEditedData([]);
    updateIsDirty(false);
  }, [updateIsDirty]);

  const getChangeSummary = useCallback((): ChangeSummary | null => {
    if (!isDirty) return null;
    const rows = buildFsChangeSummaryRows(serverProjectsRef.current, editedData);
    if (rows.length === 0) return null;
    return { title: 'FS (Approved Budget) Updates', changes: rows };
  }, [isDirty, editedData]);

  useEffect(() => {
    setPageActions({ onSave: handleSave, onCancel: handleCancel, getSummary: getChangeSummary });
  }, [handleSave, handleCancel, getChangeSummary, setPageActions]);

  const filteredAndSortedData = useMemo(
    () =>
      filterAndSortFsProjects(scopedDisplayData, {
        showOnlyNotFSApproved,
        focusNeedingApproval,
        debouncedSearch,
        selectedHUs,
        meetingArchetype: meetingFilters.archetype,
        sortBy,
      }),
    [
      scopedDisplayData,
      showOnlyNotFSApproved,
      focusNeedingApproval,
      debouncedSearch,
      selectedHUs,
      meetingFilters.archetype,
      sortBy,
    ],
  );

  const totalPages = Math.max(1, Math.ceil(filteredAndSortedData.length / itemsPerPage));

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredAndSortedData.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredAndSortedData, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, selectedHUs, focusNeedingApproval, showOnlyNotFSApproved, sortBy, meetingFilters]);

  const scopedArchetypeOptions = useMemo(
    () =>
      buildScopedArchetypeOptions(filterArchetypes, permissions.userScopes, filterHus),
    [filterArchetypes, filterHus, permissions.userScopes],
  );

  const huOptions = useMemo(
    () => buildScopedHuOptions(filterHus, filterArchetypes, permissions.userScopes),
    [filterHus, filterArchetypes, permissions.userScopes],
  );

  useEffect(() => {
    if (
      meetingFilters.archetype &&
      scopedArchetypeOptions.length > 0 &&
      !scopedArchetypeOptions.includes(meetingFilters.archetype)
    ) {
      setMeetingFilters({ archetype: null });
    }
  }, [meetingFilters.archetype, scopedArchetypeOptions]);

  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const viewFsProject = useMemo(() => {
    if (!viewFS) return null;
    return scopedDisplayData.find((p) => p.id === viewFS.projectId) ?? null;
  }, [viewFS, scopedDisplayData]);

  const lookupProjects = useMemo(
    () => (isDirty ? editedData : (pageData?.editedData ?? [])),
    [isDirty, editedData, pageData?.editedData],
  );

  const columns: SpreadsheetColumn<FsEditableProject>[] = useMemo(
    () => [
      { header: 'Project Code', accessor: 'projectCode' },
      { header: 'Project Name', accessor: 'projectName' },
      {
        header: 'AX Code',
        accessor: 'axCode',
        isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
      },
      {
        header: 'Budget Plan',
        accessor: 'budgetPlan',
        isNumeric: true,
        formatCellDisplay: (value) => formatCurrency(Number(value) || 0),
      },
      {
        header: 'Approved Budget',
        accessor: 'approvedBudget',
        isNumeric: true,
        isEditable: (item) => canEdit && !isFsUpdateSpecialProject(item),
      },
      {
        header: 'Target Budget Start',
        accessor: 'targetBudgetStart',
        isEditable: canEdit,
        editorType: 'date',
      },
      {
        header: 'Budget Revenue Permonth',
        accessor: 'budgetRevenuePermonth',
        isNumeric: true,
        isEditable: canEdit,
      },
      {
        header: 'Assets Not FS Approved',
        accessor: (item) => item.assetsNotFSApprovedCount ?? 0,
        align: 'center',
        numericDisplay: 'plain',
      },
      {
        header: 'FS Status',
        accessor: (item) => item.fsStatus || 'Not Submitted',
        formatCellDisplay: (_, item) => {
          const status = item.fsStatus || 'Not Submitted';
          let statusColorClass = 'text-siloam-text-secondary';
          if (status === 'Approved' || status === 'Approved with Notes') {
            statusColorClass = 'text-siloam-green font-medium';
          } else if (status === 'Pending') {
            statusColorClass = 'text-warning font-medium';
          } else if (status === 'Rejected') {
            statusColorClass = 'text-danger font-medium';
          }
          return <span className={statusColorClass}>{status}</span>;
        },
      },
      {
        header: 'FS Action',
        accessor: (item) => item.id,
        align: 'center',
        formatCellDisplay: (_, project) => {
          const status = project.fsStatus || 'Not Submitted';
          if (isFsUpdateSpecialProject(project)) {
            return <span className="text-xs text-siloam-text-secondary">N/A</span>;
          }
          if (status === 'Not Submitted') {
            return canCreateFS ? (
              <button
                type="button"
                onClick={() => setSelectedProjectForFS(project)}
                className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
              >
                Create FS
              </button>
            ) : (
              <span className="text-xs text-siloam-text-secondary">View only</span>
            );
          }
          return (
            <button
              type="button"
              onClick={() => void handleViewFS(project)}
              className="px-3 py-1 border border-siloam-border text-siloam-text-primary text-xs rounded-lg hover:bg-siloam-bg"
            >
              View FS
            </button>
          );
        },
      },
      {
        header: 'FS Approval',
        accessor: (item) => resolveFsApproval(item),
        align: 'center',
        formatCellDisplay: (_, project) => (
          <div className="flex justify-center items-center h-full px-4 py-3">
            <input
              type="checkbox"
              checked={resolveFsApproval(project)}
              onChange={(e) => handleFSApprovalChange(project.id, e.target.checked)}
              disabled={!canEdit || isFsUpdateSpecialProject(project)}
              className="h-5 w-5 text-siloam-blue rounded border-gray-300 focus:ring-siloam-blue disabled:opacity-50"
              title="FS Approval - Check when FS is approved"
            />
          </div>
        ),
      },
    ],
    [canEdit, canCreateFS, handleFSApprovalChange, handleViewFS],
  );

  if (!periodName) {
    return (
      <div className="text-center p-8 text-siloam-text-secondary">
        Please select a Budget Period from the top menu to view data.
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold">Feasibility Study (FS) & Approved Budget Updates</h2>
          {isBackgroundRefresh ? (
            <p className="text-xs text-siloam-text-secondary mt-1">Memperbarui data di latar…</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS yang Diajukan (Jumlah QTY)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-text-primary">
            {fsSummary.submittedQty.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Amount (Diajukan)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-blue">
            {formatCurrency(fsSummary.submittedAmountIdr)}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Approved Qty
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-green">
            {fsSummary.approvedQty.toLocaleString('id-ID')}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Amount (Approved)
          </p>
          <p className="mt-1 text-2xl font-bold text-siloam-green">
            {formatCurrency(fsSummary.approvedAmountIdr)}
          </p>
        </div>
        <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
            Total FS Belum Diapproved
          </p>
          <p className="mt-1 text-2xl font-bold text-warning">
            {fsSummary.notApprovedQty.toLocaleString('id-ID')}
          </p>
        </div>
      </div>

      <MeetingFilterBar
        onFilterChange={handleMeetingFilterChange}
        archetypeOptions={scopedArchetypeOptions}
        showAssetGroupFilter={false}
      />

      <TaskFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        toolbarLeading={
          canEdit ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsQuickFsModalOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-100"
                aria-label="Quick edit FS"
              >
                <Zap className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Quick FS</span>
              </button>
              <button
                type="button"
                onClick={() => setIsFsMigrationOpen(true)}
                className="flex items-center gap-1.5 rounded-xl border border-blue-300 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-800 transition hover:bg-blue-100"
                aria-label="Smart migration FS from Excel"
              >
                <FileSpreadsheet className="h-4 w-4" aria-hidden />
                <span className="hidden sm:inline">Smart Migration</span>
              </button>
            </div>
          ) : null
        }
        huOptions={huOptions}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        extraFilters={
          <FsUpdateExtraFilters
            showOnlyNotFSApproved={showOnlyNotFSApproved}
            onShowOnlyNotFSApprovedChange={setShowOnlyNotFSApproved}
            focusNeedingApproval={focusNeedingApproval}
            onFocusNeedingApprovalChange={setFocusNeedingApproval}
          />
        }
      >
        <div className="w-64">
          <Dropdown
            label="Sort by"
            options={SORT_OPTIONS.map((o) => o.label)}
            selectedValue={sortLabel}
            onSelect={(label) => {
              const selectedValue = SORT_OPTIONS.find((o) => o.label === label)?.value;
              if (selectedValue) setSortBy(selectedValue);
            }}
          />
        </div>
      </TaskFilterPanel>

      <div className="bg-siloam-surface rounded-xl shadow-soft p-6 relative min-h-[12rem]">
        {isBackgroundRefresh ? (
          <>
            <div
              className="pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden rounded-full bg-siloam-border"
              aria-hidden
            >
              <div className="h-full w-1/3 rounded-full bg-siloam-blue/70 animate-pulse" />
            </div>
            <div className="pointer-events-none absolute right-3 top-2 z-10 rounded border border-siloam-border bg-siloam-bg/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary">
              Sinkron
            </div>
          </>
        ) : null}
        <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue mb-4">
          <strong>Note:</strong> Approved Budget for &apos;Network Pipeline&apos; and &apos;General & Routine
          Assets&apos; projects are automatically synced with their Budget Plan and cannot be edited here.
        </div>
        {showTableLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-sm text-siloam-text-secondary gap-2">
            <span
              className="inline-block h-5 w-5 rounded-full border-2 border-siloam-border border-t-siloam-blue animate-spin"
              aria-hidden
            />
            <span>Memuat data project…</span>
          </div>
        ) : paginatedData.length > 0 ? (
          <SpreadsheetTable
            columns={columns}
            data={paginatedData as FsEditableProject[]}
            onDataChange={handleDataChange}
            rowHeaderAccessor="projectName"
          />
        ) : (
          <div className="py-12 text-center text-sm text-siloam-text-secondary">
            {fsQuery.isError ? (
              <span>Gagal memuat data. Periksa koneksi backend lalu refresh halaman.</span>
            ) : scopedDisplayData.length > 0 ? (
              <span>
                Tidak ada project yang cocok dengan filter saat ini. Coba matikan &quot;Show only
                projects not FS Approved&quot; atau reset filter.
              </span>
            ) : (
              <span>Tidak ada data project untuk periode {periodName}.</span>
            )}
          </div>
        )}
      </div>

      {filteredAndSortedData.length > 0 ? (
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
          <div className="text-sm text-siloam-text-secondary">
            Showing {Math.min(filteredAndSortedData.length, (currentPage - 1) * itemsPerPage + 1)} -{' '}
            {Math.min(currentPage * itemsPerPage, filteredAndSortedData.length)} of{' '}
            {filteredAndSortedData.length} projects
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
                <option value={200}>200</option>
              </select>
            </div>
            {totalPages > 1 ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Previous
                </button>
                <span className="text-sm text-siloam-text-secondary">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                >
                  Next
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {canEdit ? (
        <QuickFsUpdateModal
          isOpen={isQuickFsModalOpen}
          onClose={() => setIsQuickFsModalOpen(false)}
          onSuccess={() => {
            showToast('Data FS berhasil diperbarui.', 'success');
            onDataChange();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.fsUpdate.page(periodName, currentUser.id),
            });
          }}
          currentUser={currentUser}
          periodName={periodName}
          lookupProjects={lookupProjects}
        />
      ) : null}

      {canEdit ? (
        <FsSmartMigrationModal
          isOpen={isFsMigrationOpen}
          onClose={() => setIsFsMigrationOpen(false)}
          onSuccess={() => {
            onDataChange();
            void queryClient.invalidateQueries({
              queryKey: queryKeys.fsUpdate.page(periodName, currentUser.id),
            });
          }}
          currentUser={currentUser}
          periodName={periodName}
          showToast={showToast}
        />
      ) : null}

      {selectedProjectForFS && canCreateFS ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={selectedProjectForFS}
            onClose={() => setSelectedProjectForFS(null)}
            onSave={handleSaveFSProposal}
          />
        </Suspense>
      ) : null}

      {viewFS && viewFsProject ? (
        <Suspense fallback={null}>
          <FSProposalModal
            project={viewFsProject}
            existingFS={viewFS}
            onClose={() => setViewFS(null)}
            onSave={async () => {}}
            readOnly
          />
        </Suspense>
      ) : null}
    </div>
  );
};

FSUpdatePage.displayName = 'FSUpdatePage';
