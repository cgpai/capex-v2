'use client';

import { useCallback } from 'react';
import type { AssetTagConfig } from '@/types';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import { useConfigCrud } from '@/features/configuration/shared/hooks/useConfigCrud';
import { useConfigEntityModal } from '@/features/configuration/shared/hooks/useConfigEntityModal';
import { buildAssetTagPayload } from '@/features/configuration/budget-project/utils/assetTagUtils';

export function useAssetTagManagement(onConfigChange: () => void) {
  const { showToast } = useToast();
  const modal = useConfigEntityModal<AssetTagConfig>({
    defaultDraft: { name: '', color: 'bg-gray-100 text-gray-800' },
  });

  const crud = useConfigCrud<AssetTagConfig>({
    entity: 'assetTag',
    saveLocal: (item) => configService.saveAssetTag(item),
    deleteLocal: (id) => configService.deleteAssetTag(id),
    onSuccess: () => {
      modal.close();
      onConfigChange();
    },
    successMessage: 'Tag berhasil disimpan.',
  });

  const save = useCallback(async () => {
    if (!modal.draft) return;
    const payload = buildAssetTagPayload(modal.draft);
    if (!payload) {
      showToast('Tag name is required.', 'error');
      return;
    }
    await crud.save(payload);
  }, [modal.draft, crud, showToast]);

  const remove = useCallback(
    async (id: string) => {
      if (!window.confirm('Are you sure you want to delete this tag?')) return;
      await crud.remove(id);
    },
    [crud],
  );

  return { modal, save, remove };
}
