'use client';

import { useCallback } from 'react';
import type { AssetTypeConfig, AssetTypeGroupConfig } from '@/types';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import { deleteConfigViaBeOrFallback, saveConfigViaBeOrFallback } from '@/services/configurationCrudApi';
import { useConfigEntityModal } from '@/features/configuration/shared/hooks/useConfigEntityModal';
import { buildAssetTypeGroupPayload } from '@/features/configuration/workflow/utils/assetTypeUtils';

export function useAssetTypeGroupManagement(
  displayGroups: AssetTypeGroupConfig[],
  displayTypes: AssetTypeConfig[],
  onPatched: (groups: AssetTypeGroupConfig[]) => void,
) {
  const { showToast } = useToast();
  const modal = useConfigEntityModal<AssetTypeGroupConfig>({ defaultDraft: { name: '' } });

  const save = useCallback(async () => {
    if (!modal.draft) return;
    const payload = buildAssetTypeGroupPayload(modal.draft);
    if (!payload) {
      showToast('Nama grup wajib diisi.', 'error');
      return;
    }
    try {
      const saved =
        (await saveConfigViaBeOrFallback('assetTypeGroup', payload)) ?? payload;
      const idx = displayGroups.findIndex((g) => g.id === saved.id);
      const next =
        idx >= 0
          ? displayGroups.map((g, i) => (i === idx ? (saved as AssetTypeGroupConfig) : g))
          : [...displayGroups, saved as AssetTypeGroupConfig];
      onPatched(next);
      modal.close();
      showToast('Asset Type Group berhasil disimpan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan Asset Type Group.', 'error');
    }
  }, [modal, displayGroups, onPatched, showToast]);

  const remove = useCallback(
    async (groupId: string) => {
      const isUsed = displayTypes.some((at) => at.groupId === groupId);
      if (isUsed) {
        showToast('Grup tidak dapat dihapus. Masih digunakan oleh satu atau lebih Asset Type.', 'error');
        return;
      }
      if (!window.confirm('Are you sure you want to delete this group?')) return;
      try {
        await deleteConfigViaBeOrFallback('assetTypeGroup', groupId);
        onPatched(displayGroups.filter((g) => g.id !== groupId));
        showToast('Asset Type Group berhasil dihapus.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Gagal menghapus Asset Type Group.', 'error');
      }
    },
    [displayGroups, displayTypes, onPatched, showToast],
  );

  return { modal, save, remove };
}
