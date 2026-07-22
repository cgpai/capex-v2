'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useDebouncedValue } from '@/screens/CapexProjectList/hooks/useDebouncedValue';

export const DEFAULT_PAGE_SIZE = 25;
export const DEFAULT_SEARCH_DEBOUNCE_MS = 280;

export type UsePagedListScreenOptions = {
  /** Non-search filter state — combined with debounced search to reset page to 1. */
  filterResetKey?: string;
  initialPage?: number;
  initialPageSize?: number;
  searchDebounceMs?: number;
};

export type UsePagedListScreenResult = {
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  debouncedSearch: string;
  isSearchStaging: boolean;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  setItemsPerPage: (size: number) => void;
  resetPage: () => void;
  totalPages: (totalCount: number) => number;
  pageRangeLabel: (totalCount: number) => { from: number; to: number };
  goToPreviousPage: () => void;
  goToNextPage: (totalCount: number) => void;
};

export function usePagedListScreen({
  filterResetKey = '',
  initialPage = 1,
  initialPageSize = DEFAULT_PAGE_SIZE,
  searchDebounceMs = DEFAULT_SEARCH_DEBOUNCE_MS,
}: UsePagedListScreenOptions): UsePagedListScreenResult {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(initialPageSize);

  const debouncedSearch = useDebouncedValue(searchTerm, searchDebounceMs);
  const isSearchStaging = searchTerm.trim() !== debouncedSearch.trim();
  const compositeFilterKey = `${filterResetKey}\u0001${debouncedSearch}`;

  const filtersKeyRef = useRef('');
  useLayoutEffect(() => {
    if (filtersKeyRef.current !== compositeFilterKey) {
      filtersKeyRef.current = compositeFilterKey;
      setCurrentPage(1);
    }
  }, [compositeFilterKey]);

  const resetPage = useCallback(() => setCurrentPage(1), []);

  const totalPages = useCallback(
    (totalCount: number) => Math.max(1, Math.ceil(totalCount / itemsPerPage)),
    [itemsPerPage],
  );

  const pageRangeLabel = useCallback(
    (totalCount: number) => {
      if (totalCount <= 0) return { from: 0, to: 0 };
      const from = (currentPage - 1) * itemsPerPage + 1;
      const to = Math.min(currentPage * itemsPerPage, totalCount);
      return { from, to };
    },
    [currentPage, itemsPerPage],
  );

  const goToPreviousPage = useCallback(() => {
    setCurrentPage((p) => Math.max(1, p - 1));
  }, []);

  const goToNextPage = useCallback(
    (totalCount: number) => {
      setCurrentPage((p) => Math.min(totalPages(totalCount), p + 1));
    },
    [totalPages],
  );

  return useMemo(
    () => ({
      searchTerm,
      setSearchTerm,
      debouncedSearch,
      isSearchStaging,
      currentPage,
      setCurrentPage,
      itemsPerPage,
      setItemsPerPage,
      resetPage,
      totalPages,
      pageRangeLabel,
      goToPreviousPage,
      goToNextPage,
    }),
    [
      searchTerm,
      debouncedSearch,
      isSearchStaging,
      currentPage,
      itemsPerPage,
      resetPage,
      totalPages,
      pageRangeLabel,
      goToPreviousPage,
      goToNextPage,
    ],
  );
}
