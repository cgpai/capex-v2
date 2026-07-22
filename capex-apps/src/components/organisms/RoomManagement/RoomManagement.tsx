import React, { useCallback, useMemo, useRef } from 'react';
import { RoomConfig } from '../../../types';
import * as dataManagementService from '../../../services/dataManagementService';
import { useToast } from '../../../contexts/ToastContext';
import {
  textAsc,
  textDesc,
  useConfigListControls,
  type ConfigListSortOption,
} from '@/features/configuration/shared/hooks/useConfigListControls';
import { ConfigListToolbar } from '@/features/configuration/shared/components/ConfigListToolbar';

interface RoomManagementProps {
  rooms: RoomConfig[];
  onConfigChange: () => void;
  onOpenModal: (room: Partial<RoomConfig> | null) => void;
  onDelete: (id: string) => void | Promise<void>;
}

export const RoomManagement: React.FC<RoomManagementProps> = ({
  rooms,
  onConfigChange,
  onOpenModal,
  onDelete,
}) => {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getSearchText = useCallback((room: RoomConfig) => room.name || '', []);

  const sortOptions = useMemo<ConfigListSortOption<RoomConfig>[]>(
    () => [
      { value: 'name-asc', label: 'Name A→Z', compare: (a, b) => textAsc(a.name, b.name) },
      { value: 'name-desc', label: 'Name Z→A', compare: (a, b) => textDesc(a.name, b.name) },
    ],
    [],
  );

  const list = useConfigListControls(rooms, {
    getSearchText,
    sortOptions,
    defaultSort: 'name-asc',
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const result = await dataManagementService.importRoomsExcel(file);
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
        <h2 className="text-xl font-bold">Master Rooms Management</h2>
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
            + New Room
          </button>
        </div>
      </div>
      <ConfigListToolbar
        search={list.search}
        onSearchChange={list.setSearch}
        searchPlaceholder="Search room name…"
        sortValue={list.sortValue}
        onSortChange={list.setSortValue}
        sortOptions={list.sortOptions}
        resultCount={list.resultCount}
        totalCount={list.totalCount}
        hasActiveControls={list.hasActiveControls}
        onClear={list.clearFilters}
      />
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
            <tr>
              <th className="px-4 py-3">Room Name</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {list.filteredItems.map((room) => (
              <tr key={room.id} className="border-b border-siloam-border hover:bg-siloam-bg">
                <td className="px-4 py-3 font-medium">{room.name}</td>
                <td className="px-4 py-3 space-x-2">
                  <button onClick={() => onOpenModal(room)} className="text-siloam-blue hover:underline">
                    Edit
                  </button>
                  <button onClick={() => void onDelete(room.id)} className="text-danger hover:underline">
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {list.filteredItems.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center py-8 text-siloam-text-secondary">
                  {rooms.length === 0
                    ? 'No rooms found. Add one to get started.'
                    : 'No rooms match your search.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
RoomManagement.displayName = 'RoomManagement';
