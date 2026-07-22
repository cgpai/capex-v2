'use client';

import { useCallback, useState } from 'react';
import type { AssetTypeConfig, AssetTypeGroupConfig, User } from '@/types';
import * as configService from '@/services/configService';
import * as budgetService from '@/services/budgetService';
import { useToast } from '@/contexts/ToastContext';
import { deleteConfigViaBeOrFallback, saveConfigViaBeOrFallback } from '@/services/configurationCrudApi';
import { useConfigEntityModal } from '@/features/configuration/shared/hooks/useConfigEntityModal';
import { buildAssetTypePayload } from '@/features/configuration/workflow/utils/assetTypeUtils';

export function useAssetTypeManagement(
  displayTypes: AssetTypeConfig[],
  displayGroups: AssetTypeGroupConfig[],
  onPatched: (types: AssetTypeConfig[]) => void,
  currentUser: User,
) {
  const { showToast } = useToast();
  const modal = useConfigEntityModal<AssetTypeConfig>({
    defaultDraft: { name: '', workflowSetId: '', isActive: true },
  });
  const [deleteTarget, setDeleteTarget] = useState<AssetTypeConfig | null>(null);
  const [migrateSource, setMigrateSource] = useState<AssetTypeConfig | null>(null);
  const [usageRefreshKey, setUsageRefreshKey] = useState(0);

  const upsertType = useCallback(
    async (payload: AssetTypeConfig) => {
      const saved =
        (await saveConfigViaBeOrFallback('assetTypeConfig', payload)) ?? payload;
      const normalized = saved as AssetTypeConfig;
      const idx = displayTypes.findIndex((t) => t.id === normalized.id);
      const next =
        idx >= 0
          ? displayTypes.map((t, i) => (i === idx ? normalized : t))
          : [...displayTypes, normalized];
      onPatched(next);
      return normalized;
    },
    [displayTypes, onPatched],
  );

  const save = useCallback(async () => {
    if (!modal.draft) return;
    const payload = buildAssetTypePayload(modal.draft);
    if (!payload) {
      showToast('Nama dan Workflow wajib diisi.', 'error');
      return;
    }
    try {
      await upsertType(payload);
      modal.close();
      showToast('Asset Type berhasil disimpan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan Asset Type.', 'error');
    }
  }, [modal, upsertType, showToast]);

  const toggleActive = useCallback(
    async (assetType: AssetTypeConfig) => {
      const updated = { ...assetType, isActive: !assetType.isActive };
      try {
        await upsertType(updated);
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal memperbarui status Asset Type.', 'error');
      }
    },
    [upsertType, showToast],
  );

  const openMigrate = useCallback((assetType: AssetTypeConfig) => {
    setMigrateSource(assetType);
  }, []);

  const closeMigrate = useCallback(() => {
    setMigrateSource(null);
  }, []);

  const confirmMigrate = useCallback(
    async (migrationTargetId: string) => {
      if (!migrateSource) return;
      if (migrationTargetId === migrateSource.id) {
        showToast('Pilih Asset Type tujuan yang berbeda.', 'error');
        return;
      }
      try {
        const { updatedCount } = await budgetService.migrateAssetTypesAndRecalculate(
          migrateSource.id,
          migrationTargetId,
          currentUser,
        );
        setMigrateSource(null);
        setUsageRefreshKey((k) => k + 1);
        showToast(
          updatedCount > 0
            ? `${updatedCount} asset berhasil dipindahkan ke type lain.`
            : 'Tidak ada asset yang perlu dipindahkan.',
          'success',
        );
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal memindahkan data asset.', 'error');
      }
    },
    [migrateSource, currentUser, showToast],
  );

  const openDelete = useCallback((assetType: AssetTypeConfig) => {
    setDeleteTarget(assetType);
  }, []);

  const closeDelete = useCallback(() => {
    setDeleteTarget(null);
  }, []);

  const confirmDelete = useCallback(
    async (migrationTargetId?: string) => {
      if (!deleteTarget) return;
      try {
        const { count } = await budgetService.isAssetTypeInUse(deleteTarget, currentUser.id);
        if (count > 0) {
          if (!migrationTargetId) {
            showToast('Pilih Asset Type tujuan migrasi.', 'error');
            return;
          }
          await budgetService.migrateAssetTypesAndRecalculate(
            deleteTarget.id,
            migrationTargetId,
            currentUser,
          );
        }
        await deleteConfigViaBeOrFallback('assetTypeConfig', deleteTarget.id);
        onPatched(displayTypes.filter((t) => t.id !== deleteTarget.id));
        setDeleteTarget(null);
        setUsageRefreshKey((k) => k + 1);
        showToast('Asset Type berhasil dihapus.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal menghapus Asset Type.', 'error');
      }
    },
    [deleteTarget, currentUser, displayTypes, onPatched, showToast],
  );

  return {
    modal,
    save,
    toggleActive,
    deleteTarget,
    migrateSource,
    openMigrate,
    closeMigrate,
    confirmMigrate,
    openDelete,
    closeDelete,
    confirmDelete,
    usageRefreshKey,
    displayGroups,
  };
}
