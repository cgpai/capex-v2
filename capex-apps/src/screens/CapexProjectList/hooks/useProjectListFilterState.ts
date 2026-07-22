import { useEffect, useMemo, useRef, useState, useDeferredValue, type Dispatch, type SetStateAction, type MutableRefObject } from 'react';
import type { User } from '../../../types';
import type { ProjectListSortOption } from '../../../services/projectListQueryTypes';
import { DEFAULT_PROJECT_LIST_SORT } from '../../../services/projectListQueryTypes';
import {
  readProjectListFilterSelection,
  writeProjectListFilterSelection,
} from '../../../lib/capexProjectListDiskCache';
import { useDebouncedValue } from './useDebouncedValue';

export type MeetingFilters = {
  archetype: string | null;
  assetTypeGroup: string | null;
};

export type ProjectListFilterState = {
  selectedPeriods: string[];
  setSelectedPeriods: Dispatch<SetStateAction<string[]>>;
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  selectedHUs: string[];
  setSelectedHUs: Dispatch<SetStateAction<string[]>>;
  selectedPriorities: string[];
  setSelectedPriorities: Dispatch<SetStateAction<string[]>>;
  selectedFinishedTasks: string[];
  setSelectedFinishedTasks: Dispatch<SetStateAction<string[]>>;
  selectedBudgetFilter: string | null;
  setSelectedBudgetFilter: Dispatch<SetStateAction<string | null>>;
  completionRange: { min: number; max: number };
  setCompletionRange: Dispatch<SetStateAction<{ min: number; max: number }>>;
  meetingFilters: MeetingFilters;
  setMeetingFilters: Dispatch<SetStateAction<MeetingFilters>>;
  selectedBudgetCategoryIds: string[];
  setSelectedBudgetCategoryIds: Dispatch<SetStateAction<string[]>>;
  currentPage: number;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  itemsPerPage: number;
  setItemsPerPage: Dispatch<SetStateAction<number>>;
  sortBy: ProjectListSortOption;
  setSortBy: Dispatch<SetStateAction<ProjectListSortOption>>;
  debouncedSearchTerm: string;
  deferredClientSearchTerm: string;
  isSearchActive: boolean;
  isSearchStaging: boolean;
  panelFiltersKey: string;
  prevPanelFiltersKeyRef: MutableRefObject<string>;
};

export function useProjectListFilterState(
  currentUser: User | null,
  initialSelectedPeriods: string[],
): ProjectListFilterState {
  const saved = useRef(
    typeof window !== 'undefined' ? readProjectListFilterSelection() : null,
  );

  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => initialSelectedPeriods);
  const [searchTerm, setSearchTerm] = useState(() => saved.current?.searchTerm ?? '');
  const [selectedHUs, setSelectedHUs] = useState<string[]>(() => saved.current?.selectedHUs ?? []);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>(
    () => saved.current?.selectedPriorities ?? [],
  );
  const [selectedFinishedTasks, setSelectedFinishedTasks] = useState<string[]>(
    () => saved.current?.selectedFinishedTasks ?? [],
  );
  const [selectedBudgetFilter, setSelectedBudgetFilter] = useState<string | null>(
    () => saved.current?.selectedBudgetFilter ?? null,
  );
  const [completionRange, setCompletionRange] = useState<{ min: number; max: number }>(() => ({
    min: saved.current?.completionMin ?? 0,
    max: saved.current?.completionMax ?? 100,
  }));
  const [meetingFilters, setMeetingFilters] = useState<MeetingFilters>(() => ({
    archetype: saved.current?.meetingArchetype ?? null,
    assetTypeGroup: saved.current?.meetingAssetTypeGroup ?? null,
  }));
  const [selectedBudgetCategoryIds, setSelectedBudgetCategoryIds] = useState<string[]>(
    () => saved.current?.selectedBudgetCategoryIds ?? [],
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(() => saved.current?.itemsPerPage ?? 20);
  const [sortBy, setSortBy] = useState<ProjectListSortOption>(
    () => saved.current?.sortBy ?? DEFAULT_PROJECT_LIST_SORT,
  );

  const debouncedSearchTerm = useDebouncedValue(searchTerm, 150);
  /** Deferred after debounce — client pool O(N) filter runs here, not on every keystroke. */
  const deferredClientSearchTerm = useDeferredValue(debouncedSearchTerm);
  const isSearchActive = searchTerm.trim().length > 0;
  const isSearchStaging =
    isSearchActive && searchTerm.trim() !== debouncedSearchTerm.trim();

  /**
   * Panel side-effects: debounced search avoids reset storm when client pool serves filters.
   * Immediate searchTerm is handled separately for server-path stale-row clearing.
   */
  const panelFiltersKey = useMemo(
    () =>
      [
        selectedHUs.join('\u0001'),
        selectedPriorities.join('\u0001'),
        selectedFinishedTasks.join('\u0001'),
        selectedBudgetFilter ?? '',
        selectedBudgetCategoryIds.join('\u0001'),
        completionRange.min,
        completionRange.max,
        debouncedSearchTerm.trim().toLowerCase(),
      ].join('\u0002'),
    [
      selectedHUs.join('\u0001'),
      selectedPriorities.join('\u0001'),
      selectedFinishedTasks.join('\u0001'),
      selectedBudgetFilter,
      selectedBudgetCategoryIds.join('\u0001'),
      completionRange.min,
      completionRange.max,
      debouncedSearchTerm,
    ],
  );
  const prevPanelFiltersKeyRef = useRef(panelFiltersKey);

  const filterSelectionSnapshot = useMemo(
    () => ({
      selectedPeriods,
      searchTerm,
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      selectedBudgetCategoryIds,
      completionMin: completionRange.min,
      completionMax: completionRange.max,
      meetingArchetype: meetingFilters.archetype,
      meetingAssetTypeGroup: meetingFilters.assetTypeGroup,
      itemsPerPage,
      sortBy,
    }),
    [
      selectedPeriods,
      searchTerm,
      selectedHUs,
      selectedPriorities,
      selectedFinishedTasks,
      selectedBudgetFilter,
      selectedBudgetCategoryIds,
      completionRange.min,
      completionRange.max,
      meetingFilters.archetype,
      meetingFilters.assetTypeGroup,
      itemsPerPage,
      sortBy,
    ],
  );
  const debouncedFilterSelection = useDebouncedValue(filterSelectionSnapshot, 400);

  useEffect(() => {
    if (!currentUser) return;
    writeProjectListFilterSelection(debouncedFilterSelection);
  }, [currentUser, debouncedFilterSelection]);

  return {
    selectedPeriods,
    setSelectedPeriods,
    searchTerm,
    setSearchTerm,
    selectedHUs,
    setSelectedHUs,
    selectedPriorities,
    setSelectedPriorities,
    selectedFinishedTasks,
    setSelectedFinishedTasks,
    selectedBudgetFilter,
    setSelectedBudgetFilter,
    completionRange,
    setCompletionRange,
    meetingFilters,
    setMeetingFilters,
    selectedBudgetCategoryIds,
    setSelectedBudgetCategoryIds,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    sortBy,
    setSortBy,
    debouncedSearchTerm,
    deferredClientSearchTerm,
    isSearchActive,
    isSearchStaging,
    panelFiltersKey,
    prevPanelFiltersKeyRef,
  };
}
