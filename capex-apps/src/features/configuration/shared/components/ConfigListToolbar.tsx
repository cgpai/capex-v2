'use client';

import React from 'react';
import type { ConfigListFilterDef, ConfigListSortOption } from '@/features/configuration/shared/hooks/useConfigListControls';

type ConfigListToolbarProps<T> = {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  sortValue: string;
  onSortChange: (value: string) => void;
  sortOptions: ConfigListSortOption<T>[];
  filterDefs?: ConfigListFilterDef<T>[];
  filters?: Record<string, string>;
  filterOptionLists?: Record<string, Array<{ value: string; label: string }>>;
  onFilterChange?: (key: string, value: string) => void;
  resultCount: number;
  totalCount: number;
  hasActiveControls?: boolean;
  onClear?: () => void;
  compact?: boolean;
};

export function ConfigListToolbar<T>({
  search,
  onSearchChange,
  searchPlaceholder = 'Search…',
  sortValue,
  onSortChange,
  sortOptions,
  filterDefs = [],
  filters = {},
  filterOptionLists = {},
  onFilterChange,
  resultCount,
  totalCount,
  hasActiveControls = false,
  onClear,
  compact = false,
}: ConfigListToolbarProps<T>) {
  const inputClass = compact
    ? 'w-full border border-siloam-border rounded-lg px-2.5 py-1.5 text-xs bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue'
    : 'w-full sm:w-64 border border-siloam-border rounded-xl px-3 py-2 text-sm bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue';
  const selectClass = compact
    ? 'border border-siloam-border rounded-lg px-2 py-1.5 text-xs bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue'
    : 'border border-siloam-border rounded-xl px-3 py-2 text-sm bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue';

  return (
    <div className={`space-y-2 ${compact ? 'mb-2' : 'mb-4'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className={inputClass}
          aria-label="Search"
        />
        <select
          value={sortValue}
          onChange={(e) => onSortChange(e.target.value)}
          className={selectClass}
          aria-label="Sort"
        >
          {sortOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {filterDefs.map((def) => (
          <select
            key={def.key}
            value={filters[def.key] ?? ''}
            onChange={(e) => onFilterChange?.(def.key, e.target.value)}
            className={selectClass}
            aria-label={def.label}
          >
            <option value="">{def.allLabel ?? `All ${def.label}`}</option>
            {(filterOptionLists[def.key] ?? []).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        ))}
        {hasActiveControls && onClear && (
          <button
            type="button"
            onClick={onClear}
            className={`text-siloam-text-secondary hover:text-siloam-text-primary underline ${
              compact ? 'text-xs' : 'text-sm'
            }`}
          >
            Reset
          </button>
        )}
      </div>
      <p className={`text-siloam-text-secondary ${compact ? 'text-[11px]' : 'text-xs'}`}>
        Showing {resultCount} of {totalCount}
      </p>
    </div>
  );
}
