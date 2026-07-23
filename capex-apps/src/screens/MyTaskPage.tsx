import React, {
  useState,
  useEffect,
  useLayoutEffect,
  useMemo,
  useCallback,
  lazy,
  Suspense,
  memo,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  User,
  UserRole,
  UserTask,
  TaskCurrentStatus,
  AdhocTaskStatus,
  Page,
} from '../types';
import { queryKeys } from '../lib/query-keys';
import {
  fetchMyTasksPageBundle,
  fetchMyTasksFilterMasterData,
  MY_TASKS_STALE_MS,
  type MyTasksPageBundle,
} from '../hooks/queries/fetchMyTasksPage';
import { hydrateMyTasksFromDisk } from '../lib/prefetchMyTasksPage';
import {
  resolveMyTasksBundleForDisplay,
  writeMyTasksCache,
  readMyTasksFilterSelection,
  writeMyTasksFilterSelection,
} from '../lib/myTasksDiskCache';
import { usePermissions } from '../hooks/usePermissions';
import { TaskCard } from '../components/molecules/TaskCard/TaskCard';
import { TaskFilterPanel } from '../components/organisms/TaskFilterPanel/TaskFilterPanel';
import { Dropdown } from '../components/molecules/Dropdown/Dropdown';
import { useDebouncedValue } from './CapexProjectList/hooks/useDebouncedValue';
import { MyTaskPageSkeleton } from './MyTask/MyTaskPageSkeleton';
import {
  MY_TASK_SORT_OPTIONS,
  type MyTaskSortOption,
  sanitizeTaskSearchInput,
  buildTaskDerivedFilterOptions,
  buildTaskDerivedAssignedRoleOptions,
  buildScopedArchetypeOptions,
  buildScopedHuOptions,
  mergeFilterOptionLists,
  filterMyTasksByUserScope,
  filterMyTasksByViewMode,
  filterAndSortMyTasks,
  paginateTasks,
  MY_TASK_VIEW_MODE_OPTIONS,
  type MyTaskViewMode,
} from './MyTask/listUtils';

const KanbanBoardLazy = lazy(() =>
  import('../components/organisms/KanbanBoard/KanbanBoard').then((m) => ({
    default: m.KanbanBoard,
  })),
);
const CompleteTaskModalLazy = lazy(() =>
  import('../components/organisms/CompleteTaskModal/CompleteTaskModal').then((m) => ({
    default: m.CompleteTaskModal,
  })),
);

const SEARCH_DEBOUNCE_MS = 200;
const INITIAL_PAGE_SIZE = 20;

interface MyTaskPageProps {
  currentUser: User | null;
  allRoles: UserRole[];
  /** Align task list with selected budget period (same as Capex list). */
  periodName?: string;
  /** Bundle from disk, read synchronously in App for first paint. */
  preloadedTasks?: MyTasksPageBundle | null;
}

const ShowCompletedFilter = memo(function ShowCompletedFilter({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center">
      <input
        id="show-completed"
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
      />
      <label htmlFor="show-completed" className="ml-2 text-sm font-medium text-siloam-text-primary">
        Show Completed Tasks
      </label>
    </div>
  );
});

const MyTaskMobileGrid = memo(function MyTaskMobileGrid({
  tasks,
  onCompleteClick,
}: {
  tasks: UserTask[];
  onCompleteClick: (task: UserTask) => void;
}) {
  if (tasks.length === 0) {
    return (
      <div className="text-center p-12 bg-siloam-surface rounded-xl shadow-soft">
        <p className="text-siloam-text-secondary">No tasks match your criteria.</p>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-6">
      {tasks.map((task) => (
        <TaskCard
          key={task.id}
          task={task}
          onCompleteClick={() => onCompleteClick(task)}
        />
      ))}
    </div>
  );
});

const MyTaskPaginationBar = memo(function MyTaskPaginationBar({
  totalCount,
  currentPage,
  itemsPerPage,
  totalPages,
  onPageChange,
  onItemsPerPageChange,
}: {
  totalCount: number;
  currentPage: number;
  itemsPerPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
}) {
  if (totalCount <= 0) return null;

  const from = (currentPage - 1) * itemsPerPage + 1;
  const to = Math.min(currentPage * itemsPerPage, totalCount);

  return (
    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pt-4 border-t border-siloam-border">
      <div className="text-sm text-siloam-text-secondary">
        Showing {from} - {to} of {totalCount} tasks
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <label className="text-sm text-siloam-text-secondary">Per page:</label>
          <select
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 py-1 border border-siloam-border rounded bg-siloam-bg text-sm focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          >
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onPageChange(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
              Previous
            </button>
            <span className="text-sm text-siloam-text-secondary">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 border border-siloam-border rounded bg-siloam-bg text-sm hover:bg-siloam-surface disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

export const MyTaskPage: React.FC<MyTaskPageProps> = ({
  currentUser,
  allRoles,
  periodName,
  preloadedTasks,
}) => {
  const queryClient = useQueryClient();
  const permissions = usePermissions(currentUser, allRoles);
  const canView = permissions.canOperateOnPage(Page.MyTask, 'view');
  const canViewAllUserTasks = permissions.userScopes.all;
  const [taskToComplete, setTaskToComplete] = useState<UserTask | null>(null);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  const savedFilters = useMemo(
    () => (periodName?.trim() ? readMyTasksFilterSelection(periodName) : null),
    [periodName],
  );

  const diskTasksSeed = useMemo((): MyTasksPageBundle | undefined => {
    if (!currentUser) return undefined;
    const resolved = resolveMyTasksBundleForDisplay(
      currentUser.id,
      periodName,
      preloadedTasks,
    );
    if (resolved?.tasks?.length === 0) return undefined;
    return resolved ?? undefined;
  }, [currentUser?.id, periodName, preloadedTasks]);

  const shouldSkipServerCache = diskTasksSeed?.tasks?.length === 0;

  const tasksQuery = useQuery({
    queryKey: currentUser
      ? queryKeys.myTasks.page(currentUser.id, periodName)
      : ['screen', 'my-tasks', 'idle'],
    queryFn: async () => {
      const bundle = await fetchMyTasksPageBundle(currentUser!, periodName, {
        skipCache: shouldSkipServerCache,
      });
      writeMyTasksCache(currentUser!.id, periodName, bundle);
      return bundle;
    },
    enabled: !!currentUser && canView,
    staleTime: MY_TASKS_STALE_MS,
    gcTime: 1000 * 60 * 60 * 24,
    refetchOnWindowFocus: false,
    refetchOnReconnect: true,
    refetchOnMount: !diskTasksSeed || shouldSkipServerCache,
    initialData: diskTasksSeed,
    placeholderData: (previousData) => previousData ?? diskTasksSeed,
  });

  const filterMasterQuery = useQuery({
    queryKey: queryKeys.myTasks.filterMaster(),
    queryFn: fetchMyTasksFilterMasterData,
    enabled: filterPanelOpen,
    staleTime: 5 * 60_000,
    gcTime: 1000 * 60 * 60,
    refetchOnWindowFocus: false,
  });

  const tasks = tasksQuery.data?.tasks ?? [];
  const masterArchetypes = filterMasterQuery.data?.archetypes ?? [];
  const masterHus = filterMasterQuery.data?.hus ?? [];

  const error = tasksQuery.isError
    ? tasksQuery.error instanceof Error
      ? tasksQuery.error.message
      : 'Failed to load your tasks. Please try again later.'
    : null;

  const showBlockingSkeleton =
    tasksQuery.isPending && !diskTasksSeed && tasks.length === 0;
  const isBackgroundRefetch = tasksQuery.isFetching && tasks.length > 0;

  const [showCompleted, setShowCompleted] = useState(() => savedFilters?.showCompleted ?? false);
  const [searchTerm, setSearchTerm] = useState(() => savedFilters?.searchTerm ?? '');
  const debouncedSearchTerm = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS);
  const [selectedArchetypes, setSelectedArchetypes] = useState<string[]>(
    () => savedFilters?.selectedArchetypes ?? [],
  );
  const [selectedHUs, setSelectedHUs] = useState<string[]>(() => savedFilters?.selectedHUs ?? []);
  const [selectedAssignedRoles, setSelectedAssignedRoles] = useState<string[]>(
    () => savedFilters?.selectedAssignedRoles ?? [],
  );
  const [taskViewMode, setTaskViewMode] = useState<MyTaskViewMode>(() => {
    if (savedFilters?.taskViewMode) return savedFilters.taskViewMode;
    return canViewAllUserTasks ? 'all_users' : 'my_tasks_only';
  });
  const [sortBy, setSortBy] = useState<MyTaskSortOption>(
    () => savedFilters?.sortBy ?? 'targetDate_desc',
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(
    () => savedFilters?.itemsPerPage ?? INITIAL_PAGE_SIZE,
  );

  useLayoutEffect(() => {
    if (!currentUser?.id) return;
    hydrateMyTasksFromDisk(queryClient, currentUser.id, periodName);
  }, [currentUser?.id, periodName, queryClient]);

  useEffect(() => {
    if (!periodName?.trim()) return;
    writeMyTasksFilterSelection({
      periodName: periodName.trim(),
      showCompleted,
      searchTerm,
      selectedArchetypes,
      selectedHUs,
      selectedAssignedRoles,
      taskViewMode,
      sortBy,
      itemsPerPage,
    });
  }, [
    periodName,
    showCompleted,
    searchTerm,
    selectedArchetypes,
    selectedHUs,
    selectedAssignedRoles,
    taskViewMode,
    sortBy,
    itemsPerPage,
  ]);

  const scopedTasks = useMemo(() => {
    const byScope = filterMyTasksByUserScope(tasks, permissions.userScopes);
    if (!currentUser || !canViewAllUserTasks) return byScope;
    return filterMyTasksByViewMode(byScope, taskViewMode, currentUser, allRoles);
  }, [tasks, permissions.userScopes, canViewAllUserTasks, taskViewMode, currentUser, allRoles]);

  const taskDerivedOptions = useMemo(() => buildTaskDerivedFilterOptions(scopedTasks), [scopedTasks]);
  const assignedRoleOptions = useMemo(
    () => buildTaskDerivedAssignedRoleOptions(scopedTasks),
    [scopedTasks],
  );

  const scopedArchetypeOptions = useMemo(() => {
    const fromMaster = buildScopedArchetypeOptions(
      masterArchetypes,
      permissions.userScopes,
      masterHus,
    );
    return mergeFilterOptionLists(fromMaster, taskDerivedOptions.archetypeNames);
  }, [masterArchetypes, masterHus, permissions.userScopes, taskDerivedOptions.archetypeNames]);

  const scopedHuOptions = useMemo(() => {
    const fromMaster = buildScopedHuOptions(masterHus, masterArchetypes, permissions.userScopes);
    return mergeFilterOptionLists(fromMaster, taskDerivedOptions.huNames);
  }, [masterHus, masterArchetypes, permissions.userScopes, taskDerivedOptions.huNames]);

  const effectiveArchetypes = useMemo(() => {
    const allowed = new Set(scopedArchetypeOptions);
    return selectedArchetypes.filter((a) => allowed.has(a));
  }, [selectedArchetypes, scopedArchetypeOptions]);

  const effectiveHUs = useMemo(() => {
    const allowed = new Set(scopedHuOptions);
    return selectedHUs.filter((h) => allowed.has(h));
  }, [selectedHUs, scopedHuOptions]);

  const effectiveAssignedRoles = useMemo(() => {
    const allowed = new Set(assignedRoleOptions);
    return selectedAssignedRoles.filter((role) => allowed.has(role));
  }, [selectedAssignedRoles, assignedRoleOptions]);

  const searchLower = useMemo(
    () => sanitizeTaskSearchInput(debouncedSearchTerm).toLowerCase(),
    [debouncedSearchTerm],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [searchLower, effectiveArchetypes, effectiveHUs, effectiveAssignedRoles, showCompleted, sortBy, taskViewMode]);

  const processedTasks = useMemo(
    () =>
      filterAndSortMyTasks(scopedTasks, {
        showCompleted,
        searchLower,
        selectedArchetypes: effectiveArchetypes,
        selectedHUs: effectiveHUs,
        selectedAssignedRoles: effectiveAssignedRoles,
        sortBy,
      }),
    [
      scopedTasks,
      showCompleted,
      searchLower,
      effectiveArchetypes,
      effectiveHUs,
      effectiveAssignedRoles,
      sortBy,
    ],
  );

  const paginatedTasks = useMemo(
    () => paginateTasks(processedTasks, currentPage, itemsPerPage),
    [processedTasks, currentPage, itemsPerPage],
  );

  const totalPages = Math.max(1, Math.ceil(processedTasks.length / itemsPerPage));

  const handleSearchChange = useCallback((term: string) => {
    setSearchTerm(sanitizeTaskSearchInput(term));
  }, []);

  const handleConfirmCompletion = useCallback(() => {
    if (!currentUser || !taskToComplete) return;
    const queryKey = queryKeys.myTasks.page(currentUser.id, periodName);
    const completedId = taskToComplete.id;
    const doneStatus =
      taskToComplete.type === 'adhoc' ? AdhocTaskStatus.Done : TaskCurrentStatus.Done;

    queryClient.setQueryData<MyTasksPageBundle>(queryKey, (old) => {
      if (!old) return old;
      const next: MyTasksPageBundle = {
        ...old,
        tasks: old.tasks.map((t) =>
          t.id === completedId ? { ...t, status: doneStatus } : t,
        ),
      };
      writeMyTasksCache(currentUser.id, periodName, next);
      return next;
    });
  }, [currentUser, periodName, taskToComplete, queryClient]);

  const handleDropOnDone = useCallback(
    (taskId: string) => {
      const task = scopedTasks.find((t) => t.id === taskId);
      if (
        task &&
        task.status !== TaskCurrentStatus.Done &&
        task.status !== AdhocTaskStatus.Done
      ) {
        setTaskToComplete(task);
      }
    },
    [scopedTasks],
  );

  const handleCompleteClick = useCallback((task: UserTask) => {
    setTaskToComplete(task);
  }, []);

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  const handleItemsPerPageChange = useCallback((size: number) => {
    setItemsPerPage(size);
    setCurrentPage(1);
  }, []);

  const handleFilterVisibilityChange = useCallback((visible: boolean) => {
    setFilterPanelOpen(visible);
  }, []);

  const sortLabel =
    MY_TASK_SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? '';

  const extraFiltersNode = useMemo(
    () => <ShowCompletedFilter checked={showCompleted} onChange={setShowCompleted} />,
    [showCompleted],
  );

  if (!canView) {
    return (
      <div className="text-center p-8 text-danger">You do not have permission to view this page.</div>
    );
  }

  if (showBlockingSkeleton) {
    return <MyTaskPageSkeleton />;
  }

  if (error && tasks.length === 0) {
    return <div className="text-center p-8 text-danger">{error}</div>;
  }

  return (
    <div className="space-y-6 h-full flex flex-col">
      {isBackgroundRefetch && (
        <div
          className="h-0.5 w-full bg-siloam-blue/30 overflow-hidden shrink-0"
          aria-hidden
        >
          <div className="h-full w-1/3 bg-siloam-blue animate-pulse" />
        </div>
      )}
      {error && tasks.length > 0 && (
        <p className="text-sm text-danger px-1" role="status">
          {error} — showing cached tasks.
        </p>
      )}

      <TaskFilterPanel
        searchTerm={searchTerm}
        setSearchTerm={handleSearchChange}
        archetypeOptions={scopedArchetypeOptions.length > 0 ? scopedArchetypeOptions : undefined}
        selectedArchetypes={selectedArchetypes}
        setSelectedArchetypes={setSelectedArchetypes}
        huOptions={scopedHuOptions}
        selectedHUs={selectedHUs}
        setSelectedHUs={setSelectedHUs}
        assignedRoleOptions={assignedRoleOptions}
        selectedAssignedRoles={selectedAssignedRoles}
        setSelectedAssignedRoles={setSelectedAssignedRoles}
        taskViewModeOptions={canViewAllUserTasks ? MY_TASK_VIEW_MODE_OPTIONS : undefined}
        taskViewMode={taskViewMode}
        setTaskViewMode={(mode) => setTaskViewMode(mode as MyTaskViewMode)}
        extraFilters={extraFiltersNode}
        onFilterVisibilityChange={handleFilterVisibilityChange}
      >
        <div className="w-64">
          <Dropdown
            label="Sort by"
            options={MY_TASK_SORT_OPTIONS.map((o) => o.label)}
            selectedValue={sortLabel}
            onSelect={(label) => {
              const selectedValue = MY_TASK_SORT_OPTIONS.find((o) => o.label === label)?.value;
              if (selectedValue) setSortBy(selectedValue);
            }}
          />
        </div>
      </TaskFilterPanel>

      <div className="hidden md:block flex-1 overflow-y-auto min-h-0">
        <Suspense
          fallback={
            <div className="flex gap-6 h-full min-h-[280px] animate-pulse">
              <div className="flex-1 bg-siloam-bg rounded-xl" />
              <div className="flex-1 bg-siloam-bg rounded-xl" />
            </div>
          }
        >
          <KanbanBoardLazy
            tasks={paginatedTasks}
            onDropOnDone={handleDropOnDone}
            onCompleteClick={handleDropOnDone}
          />
        </Suspense>
      </div>

      <div className="md:hidden flex-1 overflow-y-auto min-h-0">
        <MyTaskMobileGrid tasks={paginatedTasks} onCompleteClick={handleCompleteClick} />
      </div>

      <MyTaskPaginationBar
        totalCount={processedTasks.length}
        currentPage={currentPage}
        itemsPerPage={itemsPerPage}
        totalPages={totalPages}
        onPageChange={handlePageChange}
        onItemsPerPageChange={handleItemsPerPageChange}
      />

      {currentUser && (
        <Suspense fallback={null}>
          <CompleteTaskModalLazy
            isOpen={!!taskToComplete}
            onClose={() => setTaskToComplete(null)}
            onConfirm={handleConfirmCompletion}
            task={taskToComplete}
            currentUser={currentUser}
          />
        </Suspense>
      )}
    </div>
  );
};
