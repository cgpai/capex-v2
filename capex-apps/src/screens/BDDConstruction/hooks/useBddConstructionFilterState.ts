import { useMemo, useState } from 'react';
import { useDebouncedValue } from '../../BudgetHU/useDebouncedValue';

export type BddMeetingFilters = {
  archetype: string | null;
  assetTypeGroup: string | null;
};

export const BDD_SEARCH_DEBOUNCE_MS = 150;
export const BDD_COMPLETION_DEBOUNCE_MS = 400;
export const BDD_INITIAL_PAGE_SIZE = 25;

export function useBddConstructionFilterState() {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedHUs, setSelectedHUs] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [completionRange, setCompletionRange] = useState<{ min: number; max: number }>({
    min: 0,
    max: 100,
  });
  const [meetingFilters, setMeetingFilters] = useState<BddMeetingFilters>({
    archetype: null,
    assetTypeGroup: null,
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(BDD_INITIAL_PAGE_SIZE);

  const debouncedSearch = useDebouncedValue(searchTerm, BDD_SEARCH_DEBOUNCE_MS);
  const debouncedCompletionRange = useDebouncedValue(completionRange, BDD_COMPLETION_DEBOUNCE_MS);
  const isSearchStaging = searchTerm.trim() !== debouncedSearch.trim();

  const panelFiltersKey = useMemo(
    () =>
      JSON.stringify({
        search: debouncedSearch.trim(),
        hus: selectedHUs,
        priorities: selectedPriorities,
        completion: debouncedCompletionRange,
        meeting: meetingFilters,
      }),
    [debouncedSearch, selectedHUs, selectedPriorities, debouncedCompletionRange, meetingFilters],
  );

  return {
    searchTerm,
    setSearchTerm,
    selectedHUs,
    setSelectedHUs,
    selectedPriorities,
    setSelectedPriorities,
    completionRange,
    setCompletionRange,
    meetingFilters,
    setMeetingFilters,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    debouncedSearch,
    debouncedCompletionRange,
    isSearchStaging,
    panelFiltersKey,
  };
}
