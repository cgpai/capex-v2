'use client';

import React, { useCallback, useMemo } from 'react';
import type { ArchetypeConfig, HospitalUnitConfig, RegionalConfig } from '@/types';
import type { MasterDataType } from '@/features/configuration/master-data/hooks/useMasterDataCrud';
import {
  textAsc,
  textDesc,
  useConfigListControls,
  type ConfigListFilterDef,
  type ConfigListSortOption,
} from '@/features/configuration/shared/hooks/useConfigListControls';
import { ConfigListToolbar } from '@/features/configuration/shared/components/ConfigListToolbar';

type MasterDataItem = RegionalConfig | ArchetypeConfig | HospitalUnitConfig;

type MasterDataColumnProps = {
  title: string;
  type: MasterDataType;
  items: MasterDataItem[];
  archetypes: ArchetypeConfig[];
  regionals: RegionalConfig[];
  onNew: () => void;
  onEdit: (item: MasterDataItem) => void;
  onDelete: (id: string) => void;
};

export function MasterDataColumn({
  title,
  type,
  items,
  archetypes,
  regionals,
  onNew,
  onEdit,
  onDelete,
}: MasterDataColumnProps) {
  const archetypeNameById = useMemo(
    () => new Map(archetypes.map((a) => [a.id, a.name])),
    [archetypes],
  );
  const regionalNameById = useMemo(
    () => new Map(regionals.map((r) => [r.id, r.name])),
    [regionals],
  );

  const getSearchText = useCallback(
    (item: MasterDataItem) => {
      const parts = [item.name, item.code];
      if (type === 'hu' && 'huNumber' in item) {
        parts.push(String(item.huNumber ?? ''));
        parts.push(archetypeNameById.get(item.archetypeId) ?? '');
        parts.push(regionalNameById.get(item.regionalId) ?? '');
      }
      return parts.join(' ');
    },
    [type, archetypeNameById, regionalNameById],
  );

  const sortOptions = useMemo<ConfigListSortOption<MasterDataItem>[]>(() => {
    const base: ConfigListSortOption<MasterDataItem>[] = [
      { value: 'name-asc', label: 'Name A→Z', compare: (a, b) => textAsc(a.name, b.name) },
      { value: 'name-desc', label: 'Name Z→A', compare: (a, b) => textDesc(a.name, b.name) },
      { value: 'code-asc', label: 'Code A→Z', compare: (a, b) => textAsc(a.code, b.code) },
      { value: 'code-desc', label: 'Code Z→A', compare: (a, b) => textDesc(a.code, b.code) },
    ];
    if (type === 'hu') {
      base.push({
        value: 'hu-asc',
        label: 'HU No ↑',
        compare: (a, b) =>
          textAsc(
            String(('huNumber' in a && a.huNumber) || ''),
            String(('huNumber' in b && b.huNumber) || ''),
          ),
      });
    }
    return base;
  }, [type]);

  const filterDefs = useMemo<ConfigListFilterDef<MasterDataItem>[]>(() => {
    if (type !== 'hu') return [];
    return [
      {
        key: 'archetypeId',
        label: 'Network',
        allLabel: 'All Networks',
        getValue: (item) => ('archetypeId' in item ? String(item.archetypeId ?? '') : ''),
        formatOption: (id) => archetypeNameById.get(id) ?? id,
      },
      {
        key: 'regionalId',
        label: 'Regional',
        allLabel: 'All Regionals',
        getValue: (item) => ('regionalId' in item ? String(item.regionalId ?? '') : ''),
        formatOption: (id) => regionalNameById.get(id) ?? id,
      },
    ];
  }, [type, archetypeNameById, regionalNameById]);

  const list = useConfigListControls(items, {
    getSearchText,
    sortOptions,
    filterDefs,
    defaultSort: 'name-asc',
  });

  return (
    <div className="bg-siloam-bg p-4 rounded-xl space-y-3">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
        <button
          type="button"
          onClick={onNew}
          className="bg-siloam-blue text-white text-xs px-2.5 py-1.5 rounded-lg hover:bg-siloam-blue/90"
        >
          + New
        </button>
      </div>
      <ConfigListToolbar
        compact
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder={`Search ${title.toLowerCase()}…`}
        sortValue={list.sortValue}
        onSortChange={list.setSortValue}
        sortOptions={list.sortOptions}
        filterDefs={list.filterDefs}
        filters={list.filters}
        filterOptionLists={list.filterOptionLists}
        onFilterChange={list.setFilter}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
        hasActiveControls={list.hasActiveControls}
        onClear={list.clearFilters}
      />
      <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
        {list.filteredItems.map((item) => (
          <div key={item.id} className="bg-siloam-surface p-2.5 rounded-lg border border-siloam-border group">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-siloam-text-primary">{item.name}</p>
                  {type === 'hu' && 'huNumber' in item && item.huNumber && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">
                      #{item.huNumber}
                    </span>
                  )}
                </div>
                <p className="text-xs text-siloam-text-secondary">{item.code}</p>
                {type === 'hu' && 'archetypeId' in item && (
                  <div className="text-xs mt-1 flex flex-wrap gap-1">
                    <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full">
                      {archetypeNameById.get(item.archetypeId) || 'N/A'}
                    </span>
                    <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full">
                      {regionalNameById.get(item.regionalId) || 'N/A'}
                    </span>
                    {'isPipeline' in item && item.isPipeline ? (
                      <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">
                        Pipeline
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
              <div className="text-sm space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button type="button" onClick={() => onEdit(item)} className="text-siloam-blue hover:underline">
                  Edit
                </button>
                <button type="button" onClick={() => onDelete(item.id)} className="text-danger hover:underline">
                  Del
                </button>
              </div>
            </div>
          </div>
        ))}
        {list.filteredItems.length === 0 && (
          <p className="text-center py-6 text-xs text-siloam-text-secondary">
            {items.length === 0 ? 'No items yet.' : 'No items match your search/filter.'}
          </p>
        )}
      </div>
    </div>
  );
}
