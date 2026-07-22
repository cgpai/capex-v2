import React, { useCallback, useMemo, useRef } from 'react';
import { Vendor } from '../../../types';
import * as dataManagementService from '../../../services/dataManagementService';
import { useToast } from '../../../contexts/ToastContext';
import {
  textAsc,
  textDesc,
  useConfigListControls,
  type ConfigListSortOption,
} from '@/features/configuration/shared/hooks/useConfigListControls';
import { ConfigListToolbar } from '@/features/configuration/shared/components/ConfigListToolbar';

interface VendorManagementProps {
  vendors: Vendor[];
  onConfigChange: () => void;
  onOpenModal: (item: Partial<Vendor> | null) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export const VendorManagement: React.FC<VendorManagementProps> = ({
  vendors,
  onConfigChange,
  onOpenModal,
  onDelete,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSearchText = useCallback(
    (vendor: Vendor) =>
      [
        vendor.name,
        vendor.contactPerson,
        vendor.contactEmail,
        vendor.contactPhone,
        vendor.npwp,
        vendor.address,
      ]
        .filter(Boolean)
        .join(' '),
    [],
  );

  const sortOptions = useMemo<ConfigListSortOption<Vendor>[]>(
    () => [
      { value: 'name-asc', label: 'Name A→Z', compare: (a, b) => textAsc(a.name, b.name) },
      { value: 'name-desc', label: 'Name Z→A', compare: (a, b) => textDesc(a.name, b.name) },
      {
        value: 'contact-asc',
        label: 'Contact A→Z',
        compare: (a, b) => textAsc(a.contactPerson || '', b.contactPerson || ''),
      },
      {
        value: 'contact-desc',
        label: 'Contact Z→A',
        compare: (a, b) => textDesc(a.contactPerson || '', b.contactPerson || ''),
      },
    ],
    [],
  );

  const filterDefs = useMemo(
    () => [
      {
        key: 'hasNpwp',
        label: 'NPWP',
        allLabel: 'All NPWP',
        getValue: (vendor: Vendor) => (vendor.npwp?.trim() ? 'yes' : 'no'),
        formatOption: (value: string) => (value === 'yes' ? 'Has NPWP' : 'No NPWP'),
      },
    ],
    [],
  );

  const list = useConfigListControls(vendors, {
    getSearchText,
    sortOptions,
    filterDefs,
    defaultSort: 'name-asc',
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const result = await dataManagementService.importVendorsExcel(file);
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
        <h2 className="text-xl font-bold">Master Vendor Management</h2>
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
            + New Vendor
          </button>
        </div>
      </div>
      <ConfigListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search name, contact, email, NPWP…"
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
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact Person</th>
              <th className="px-4 py-3">Contact Info</th>
              <th className="px-4 py-3">NPWP</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.filteredItems.map((vendor) => (
              <tr key={vendor.id} className="border-b border-siloam-border hover:bg-siloam-bg">
                <td className="px-4 py-3 font-medium">{vendor.name}</td>
                <td className="px-4 py-3">{vendor.contactPerson}</td>
                <td className="px-4 py-3">
                  <div className="text-xs">{vendor.contactEmail}</div>
                  <div className="text-xs">{vendor.contactPhone}</div>
                </td>
                <td className="px-4 py-3 font-mono">{vendor.npwp}</td>
                <td className="px-4 py-3 space-x-2">
                  <button onClick={() => onOpenModal(vendor)} className="text-siloam-blue hover:underline">
                    Edit
                  </button>
                  <button
                    onClick={() => void onDelete(vendor.id)}
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
                  {vendors.length === 0
                    ? 'No vendors found.'
                    : 'No vendors match your search/filter.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
VendorManagement.displayName = 'VendorManagement';
