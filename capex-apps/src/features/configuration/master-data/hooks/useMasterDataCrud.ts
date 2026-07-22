'use client';

import { useCallback, useState } from 'react';
import type { ArchetypeConfig, HospitalUnitConfig, RegionalConfig } from '@/types';
import { deleteConfigViaBeOrFallback, saveConfigViaBeOrFallback } from '@/services/configurationCrudApi';

export type MasterDataType = 'regional' | 'archetype' | 'hu';

type MasterDataItem = RegionalConfig | ArchetypeConfig | HospitalUnitConfig;

export function useMasterDataCrud(onMasterDataChange: () => void) {
  const [modalState, setModalState] = useState<{
    isOpen: boolean;
    type: MasterDataType | null;
    data: MasterDataItem | null;
  }>({
    isOpen: false,
    type: null,
    data: null,
  });

  const openModal = useCallback((type: MasterDataType, data: MasterDataItem | null = null) => {
    let initialData: MasterDataItem;
    switch (type) {
      case 'regional':
        initialData = data || { id: '', code: '', name: '' };
        break;
      case 'archetype':
        initialData = data || { id: '', code: '', name: '' };
        break;
      case 'hu':
        initialData =
          data ||
          ({
            id: '',
            code: '',
            name: '',
            archetypeId: '',
            regionalId: '',
            huNumber: '',
            isPipeline: false,
          } as HospitalUnitConfig);
        break;
    }
    setModalState({ isOpen: true, type, data: initialData });
  }, []);

  const closeModal = useCallback(() => {
    setModalState({ isOpen: false, type: null, data: null });
  }, []);

  const save = useCallback(
    async (item: MasterDataItem) => {
      if (!modalState.type) return;
      const itemToSave = { ...item, id: item.id || `${modalState.type}-${Date.now()}` };
      switch (modalState.type) {
        case 'regional':
          await saveConfigViaBeOrFallback('regional', itemToSave);
          break;
        case 'archetype':
          await saveConfigViaBeOrFallback('archetype', itemToSave);
          break;
        case 'hu':
          await saveConfigViaBeOrFallback('hospitalUnit', {
            ...itemToSave,
            isPipeline: Boolean((itemToSave as HospitalUnitConfig).isPipeline),
          });
          break;
      }
      onMasterDataChange();
      closeModal();
    },
    [modalState.type, onMasterDataChange, closeModal],
  );

  const remove = useCallback(
    async (type: MasterDataType, id: string) => {
      if (!window.confirm(`Are you sure you want to delete this ${type}?`)) return;
      switch (type) {
        case 'regional':
          await deleteConfigViaBeOrFallback('regional', id);
          break;
        case 'archetype':
          await deleteConfigViaBeOrFallback('archetype', id);
          break;
        case 'hu':
          await deleteConfigViaBeOrFallback('hospitalUnit', id);
          break;
      }
      onMasterDataChange();
    },
    [onMasterDataChange],
  );

  return { modalState, openModal, closeModal, save, remove };
}
