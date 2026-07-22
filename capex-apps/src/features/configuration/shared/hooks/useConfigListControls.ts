'use client';

import { useMemo, useState } from 'react';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

export type ConfigListSortOption<T> = {
  value: string;
  label: string;
  compare: (a: T, b: T) => number;
};

export type ConfigListFilterDef<T> = {
  key: string;
  label: string;
  allLabel?: string;
  getValue: (item: T) => string;
  /** Optional display label for a raw filter value. */
  formatOption?: (value: string) => string;
};

export type ConfigListFilterState = Record<string, string>;

const EMPTY_FILTER_DEFS: ConfigListFilterDef<never>[] = [];

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'id', { sensitivity: 'base', numeric: true });
}

export function textAsc(a: string, b: string): number {
  return compareText(a, b);
}

export function textDesc(a: string, b: string): number {
  return compareText(b, a);
}

export function numberAsc(a: number, b: number): number {
  return a - b;
}

export function numberDesc(a: number, b: number): number {
  return b - a;
}

type UseConfigListControlsOptions<T> = {
  getSearchText: (item: T) => string;
  sortOptions: ConfigListSortOption<T>[];
  filterDefs?: ConfigListFilterDef<T>[];
  defaultSort?: string;
  searchDebounceMs?: number;
};

export function useConfigListControls<T>(items: T[], options: UseConfigListControlsOptions<T>) {
  const {
    getSearchText,
    sortOptions,
    filterDefs = EMPTY_FILTER_DEFS as ConfigListFilterDef<T>[],
    defaultSort,
    searchDebounceMs = 280,
  } = options;

  const initialSort = defaultSort ?? sortOptions[0]?.value ?? '';
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, searchDebounceMs);
  const [sortValue, setSortValue] = useState(initialSort);
  const [filters, setFilters] = useState<ConfigListFilterState>(() =>
    Object.fromEntries(filterDefs.map((f) => [f.key, ''])),
  );

  const setFilter = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setSearch('');
    setFilters(Object.fromEntries(filterDefs.map((f) => [f.key, ''])));
    setSortValue(initialSort);
  };

  const filterOptionLists = useMemo(() => {
    const map: Record<string, Array<{ value: string; label: string }>> = {};
    for (const def of filterDefs) {
      const values = new Set<string>();
      for (const item of items) {
        const raw = String(def.getValue(item) ?? '').trim();
        if (raw) values.add(raw);
      }
      map[def.key] = [...values]
        .sort((a, b) => compareText(a, b))
        .map((value) => ({
          value,
          label: def.formatOption?.(value) ?? value,
        }));
    }
    return map;
  }, [items, filterDefs]);

  const filteredItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let next = items;

    if (q) {
      next = next.filter((item) => getSearchText(item).toLowerCase().includes(q));
    }

    for (const def of filterDefs) {
      const selected = filters[def.key];
      if (!selected) continue;
      next = next.filter((item) => String(def.getValue(item) ?? '') === selected);
    }

    const sorter = sortOptions.find((s) => s.value === sortValue) ?? sortOptions[0];
    if (sorter) {
      next = [...next].sort(sorter.compare);
    }

    return next;
  }, [items, debouncedSearch, filters, filterDefs, getSearchText, sortOptions, sortValue]);

  const hasActiveControls =
    search.trim().length > 0 ||
    sortValue !== initialSort ||
    filterDefs.some((f) => !!filters[f.key]);

  return {
    search,
    setSearch,
    sortValue,
    setSortValue,
    filters,
    setFilter,
    clearFilters,
    filteredItems,
    filterOptionLists,
    resultCount: filteredItems.length,
    totalCount: items.length,
    hasActiveControls,
    sortOptions,
    filterDefs,
  };
}
