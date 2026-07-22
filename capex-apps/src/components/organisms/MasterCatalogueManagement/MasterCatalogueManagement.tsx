import React, { useCallback, useMemo, useRef } from 'react';
import { MasterCatalogueItem } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import * as dataManagementService from '../../../services/dataManagementService';
import { useToast } from '../../../contexts/ToastContext';
import {
  numberAsc,
  numberDesc,
  textAsc,
  textDesc,
  useConfigListControls,
  type ConfigListSortOption,
} from '@/features/configuration/shared/hooks/useConfigListControls';
import { ConfigListToolbar } from '@/features/configuration/shared/components/ConfigListToolbar';

interface MasterCatalogueManagementProps {
  catalogue: MasterCatalogueItem[];
  onConfigChange: () => void;
  onOpenModal: (item: Partial<MasterCatalogueItem> | null) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export const MasterCatalogueManagement: React.FC<MasterCatalogueManagementProps> = ({
  catalogue,
  onConfigChange,
  onOpenModal,
  onDelete,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSearchText = useCallback(
    (item: MasterCatalogueItem) => [item.rdsCode, item.name, item.category].join(' '),
    [],
  );

  const sortOptions = useMemo<ConfigListSortOption<MasterCatalogueItem>[]>(
    () => [
      { value: 'name-asc', label: 'Name A→Z', compare: (a, b) => textAsc(a.name, b.name) },
      { value: 'name-desc', label: 'Name Z→A', compare: (a, b) => textDesc(a.name, b.name) },
      {
        value: 'rds-asc',
        label: 'RDS A→Z',
        compare: (a, b) => textAsc(a.rdsCode, b.rdsCode),
      },
      {
        value: 'rds-desc',
        label: 'RDS Z→A',
        compare: (a, b) => textDesc(a.rdsCode, b.rdsCode),
      },
      {
        value: 'category-asc',
        label: 'Category A→Z',
        compare: (a, b) => textAsc(a.category || '', b.category || ''),
      },
      {
        value: 'price-asc',
        label: 'Price ↑',
        compare: (a, b) => numberAsc(a.price || 0, b.price || 0),
      },
      {
        value: 'price-desc',
        label: 'Price ↓',
        compare: (a, b) => numberDesc(a.price || 0, b.price || 0),
      },
    ],
    [],
  );

  const filterDefs = useMemo(
    () => [
      {
        key: 'category',
        label: 'Category',
        allLabel: 'All Categories',
        getValue: (item: MasterCatalogueItem) => String(item.category ?? '').trim(),
      },
    ],
    [],
  );

  const list = useConfigListControls(catalogue, {
    getSearchText,
    sortOptions,
    filterDefs,
    defaultSort: 'name-asc',
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const result = await dataManagementService.importMasterCatalogueExcel(file);
      showToast(result.message, result.success ? 'success' : 'error');
      if (result.success) {
        onConfigChange();
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <div className="p-6 bg-siloam-surface rounded-xl shadow-soft">
      <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
        <h2 className="text-xl font-bold">Master Catalogue Management</h2>
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileUpload}
            className="hidden"
            accept=".xlsx, .xls"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="bg-siloam-green text-white px-4 py-2 rounded-xl hover:bg-siloam-green/90 transition shadow-soft text-sm"
          >
            Upload
          </button>
          <button
            onClick={() => onOpenModal(null)}
            className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft text-sm"
          >
            + New Item
          </button>
        </div>
      </div>
      <ConfigListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search RDS, name, category…"
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
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
            <tr>
              <th className="px-4 py-3">RDS Code</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.filteredItems.map((item) => (
              <tr key={item.id} className="border-b border-siloam-border hover:bg-siloam-bg">
                <td className="px-4 py-3 font-mono">{item.rdsCode}</td>
                <td className="px-4 py-3 font-medium">{item.name}</td>
                <td className="px-4 py-3">{item.category}</td>
                <td className="px-4 py-3 text-right">{formatCurrency(item.price)}</td>
                <td className="px-4 py-3 space-x-2">
                  <button onClick={() => onOpenModal(item)} className="text-siloam-blue hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => void onDelete(item.id)}
                    className="text-danger hover:underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {list.filteredItems.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-8 text-siloam-text-secondary">
                  {catalogue.length === 0
                    ? 'No catalogue items found. Add one to get started.'
                    : 'No items match your search/filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
MasterCatalogueManagement.displayName = 'MasterCatalogueManagement';
