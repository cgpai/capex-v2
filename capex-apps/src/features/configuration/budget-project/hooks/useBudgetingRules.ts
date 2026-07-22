'use client';

import { useCallback, useEffect, useState } from 'react';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import { notifyAppConfigChanged, saveConfigViaBeOrFallback } from '@/services/configurationCrudApi';

export function useBudgetingRules(onConfigChange: () => void) {
  const { showToast } = useToast();
  const [maxBudget, setMaxBudget] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    const config = await configService.getAppConfig('routineAssetMaxBudget');
    if (config) {
      setMaxBudget(Number(config.value) || 0);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const nextConfig = { key: 'routineAssetMaxBudget', value: maxBudget };
      await saveConfigViaBeOrFallback('appConfig', nextConfig);

      const verified = await configService.getAppConfig('routineAssetMaxBudget');
      const persisted = Number(verified?.value);
      if (!Number.isFinite(persisted) || persisted !== maxBudget) {
        showToast('Penyimpanan gagal diverifikasi di database. Coba lagi.', 'error');
        return;
      }

      notifyAppConfigChanged();
      onConfigChange();
      showToast('Aturan budgeting berhasil disimpan.', 'success');
    } catch (error) {
      showToast(
        `Gagal menyimpan aturan: ${error instanceof Error ? error.message : String(error)}`,
        'error',
      );
    } finally {
      setIsSaving(false);
    }
  }, [maxBudget, onConfigChange, showToast]);

  return { maxBudget, setMaxBudget, isLoading, isSaving, save, reload: loadConfig };
}
