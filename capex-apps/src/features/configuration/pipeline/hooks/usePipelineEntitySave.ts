'use client';

import { useCallback, useState } from 'react';
import type { MasterCatalogueItem, RoomConfig, Vendor } from '@/types';
import * as configService from '@/services/configService';
import { deleteConfigViaBeOrFallback, saveConfigViaBeOrFallback } from '@/services/configurationCrudApi';
import { useToast } from '@/contexts/ToastContext';
import { generateConfigEntityId } from '@/features/configuration/shared/utils/configIdGenerators';

type CatalogueModalState = { isOpen: boolean; item: Partial<MasterCatalogueItem> | null };
type RoomModalState = { isOpen: boolean; room: Partial<RoomConfig> | null };
type VendorModalState = { isOpen: boolean; item: Partial<Vendor> | null };

const EMPTY_CATALOGUE: Partial<MasterCatalogueItem> = {
  id: '',
  rdsCode: '',
  name: '',
  category: '',
  price: 0,
};

const EMPTY_ROOM: Partial<RoomConfig> = {
  id: '',
  name: '',
};

const EMPTY_VENDOR: Partial<Vendor> = {
  id: '',
  name: '',
  address: '',
  contactPerson: '',
  contactEmail: '',
  contactPhone: '',
  npwp: '',
};

export function usePipelineEntitySave(
  refreshMasterCatalogue: () => void,
  refreshRooms: () => void,
  refreshVendors: () => void,
) {
  const { showToast } = useToast();
  const [catalogueModalState, setCatalogueModalState] = useState<CatalogueModalState>({
    isOpen: false,
    item: null,
  });
  const [roomModalState, setRoomModalState] = useState<RoomModalState>({
    isOpen: false,
    room: null,
  });
  const [vendorModalState, setVendorModalState] = useState<VendorModalState>({
    isOpen: false,
    item: null,
  });
  const [isSaving, setIsSaving] = useState(false);

  const openCatalogueModal = useCallback((item: Partial<MasterCatalogueItem> | null) => {
    setCatalogueModalState({ isOpen: true, item: item ? { ...item } : { ...EMPTY_CATALOGUE } });
  }, []);

  const closeCatalogueModal = useCallback(() => {
    setCatalogueModalState({ isOpen: false, item: null });
  }, []);

  const openRoomModal = useCallback((room: Partial<RoomConfig> | null) => {
    setRoomModalState({ isOpen: true, room: room ? { ...room } : { ...EMPTY_ROOM } });
  }, []);

  const closeRoomModal = useCallback(() => {
    setRoomModalState({ isOpen: false, room: null });
  }, []);

  const openVendorModal = useCallback((item: Partial<Vendor> | null) => {
    setVendorModalState({ isOpen: true, item: item ? { ...item } : { ...EMPTY_VENDOR } });
  }, []);

  const closeVendorModal = useCallback(() => {
    setVendorModalState({ isOpen: false, item: null });
  }, []);

  const handleSaveCatalogueItem = useCallback(
    async (item: MasterCatalogueItem) => {
      const nextItem: MasterCatalogueItem = {
        ...item,
        id: item.id?.trim() || generateConfigEntityId('cat', item.rdsCode || item.name || 'item'),
      };
      setIsSaving(true);
      try {
        await saveConfigViaBeOrFallback('masterCatalogue', nextItem);
        closeCatalogueModal();
        refreshMasterCatalogue();
        showToast('Item katalog berhasil disimpan.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menyimpan item katalog.', 'error');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [closeCatalogueModal, refreshMasterCatalogue, showToast],
  );

  const handleDeleteCatalogueItem = useCallback(
    async (id: string) => {
      if (!window.confirm('Are you sure you want to delete this catalogue item? This action cannot be undone.')) {
        return;
      }
      try {
        await deleteConfigViaBeOrFallback('masterCatalogue', id);
        refreshMasterCatalogue();
        showToast('Item katalog berhasil dihapus.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menghapus item katalog.', 'error');
      }
    },
    [refreshMasterCatalogue, showToast],
  );

  const handleSaveRoom = useCallback(
    async (room: RoomConfig) => {
      const nextRoom: RoomConfig = {
        ...room,
        id: room.id?.trim() || generateConfigEntityId('room', room.name || 'room'),
      };
      setIsSaving(true);
      try {
        await saveConfigViaBeOrFallback('room', nextRoom);
        closeRoomModal();
        refreshRooms();
        showToast('Ruangan berhasil disimpan.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menyimpan ruangan.', 'error');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [closeRoomModal, refreshRooms, showToast],
  );

  const handleDeleteRoom = useCallback(
    async (id: string) => {
      if (!window.confirm('Are you sure you want to delete this room?')) return;
      try {
        await deleteConfigViaBeOrFallback('room', id);
        refreshRooms();
        showToast('Ruangan berhasil dihapus.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menghapus ruangan.', 'error');
      }
    },
    [refreshRooms, showToast],
  );

  const handleSaveVendor = useCallback(
    async (vendor: Vendor) => {
      const nextVendor: Vendor = {
        ...vendor,
        id: vendor.id?.trim() || generateConfigEntityId('vend', vendor.name || 'vendor'),
      };
      setIsSaving(true);
      try {
        await saveConfigViaBeOrFallback('vendor', nextVendor);
        closeVendorModal();
        refreshVendors();
        showToast('Vendor berhasil disimpan.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menyimpan vendor.', 'error');
        throw e;
      } finally {
        setIsSaving(false);
      }
    },
    [closeVendorModal, refreshVendors, showToast],
  );

  const handleDeleteVendor = useCallback(
    async (id: string) => {
      if (!window.confirm('Are you sure you want to delete this vendor? This action cannot be undone.')) {
        return;
      }
      try {
        await deleteConfigViaBeOrFallback('vendor', id);
        refreshVendors();
        showToast('Vendor berhasil dihapus.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Gagal menghapus vendor.', 'error');
      }
    },
    [refreshVendors, showToast],
  );

  return {
    catalogueModalState,
    roomModalState,
    vendorModalState,
    isSaving,
    openCatalogueModal,
    closeCatalogueModal,
    openRoomModal,
    closeRoomModal,
    openVendorModal,
    closeVendorModal,
    handleSaveCatalogueItem,
    handleDeleteCatalogueItem,
    handleSaveRoom,
    handleDeleteRoom,
    handleSaveVendor,
    handleDeleteVendor,
  };
}
