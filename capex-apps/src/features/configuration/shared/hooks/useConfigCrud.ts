'use client';

import { useCallback } from 'react';
import { useToast } from '@/contexts/ToastContext';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
  type ConfigurationCrudEntity,
} from '@/services/configurationCrudApi';

type UseConfigCrudOptions<T extends object> = {
  entity: ConfigurationCrudEntity;
  saveLocal: (item: T) => Promise<void>;
  deleteLocal?: (id: string) => Promise<void>;
  onSuccess: () => void;
  successMessage: string;
  deleteSuccessMessage?: string;
};

export function useConfigCrud<T extends object>(opts: UseConfigCrudOptions<T>) {
  const { showToast } = useToast();

  const save = useCallback(
    async (item: T) => {
      try {
        await saveConfigViaBeOrFallback(opts.entity, item);
        opts.onSuccess();
        showToast(opts.successMessage, 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
        throw e;
      }
    },
    [opts, showToast],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!opts.deleteLocal) return;
      try {
        await deleteConfigViaBeOrFallback(opts.entity, id);
        opts.onSuccess();
        showToast(opts.deleteSuccessMessage ?? 'Deleted successfully.', 'success');
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Delete failed', 'error');
        throw e;
      }
    },
    [opts, showToast],
  );

  const toggleActive = useCallback(
    async (item: T & { isActive: boolean }) => {
      try {
        const updated = { ...item, isActive: !item.isActive } as T;
        await saveConfigViaBeOrFallback(opts.entity, updated);
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Save failed', 'error');
        throw e;
      }
    },
    [opts, showToast],
  );

  return { save, remove, toggleActive };
}
