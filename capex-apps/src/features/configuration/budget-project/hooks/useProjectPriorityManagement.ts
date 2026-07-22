'use client';

import { useCallback } from 'react';
import type { ProjectPriorityConfig } from '@/types';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from '@/services/configurationCrudApi';
import { useConfigEntityModal } from '@/features/configuration/shared/hooks/useConfigEntityModal';
import { buildProjectPriorityPayload } from '@/features/configuration/budget-project/utils/projectPriorityUtils';

export function useProjectPriorityManagement(
  displayPriorities: ProjectPriorityConfig[],
  onPrioritiesPatched: (priorities: ProjectPriorityConfig[]) => void,
) {
  const { showToast } = useToast();
  const modal = useConfigEntityModal<ProjectPriorityConfig>({
    defaultDraft: { name: '', isActive: true },
  });

  const save = useCallback(async () => {
    if (!modal.draft) return;
    const payload = buildProjectPriorityPayload(modal.draft);
    if (!payload) {
      showToast('Priority name is required.', 'error');
      return;
    }
    try {
      await saveConfigViaBeOrFallback('projectPriority', payload);
      const idx = displayPriorities.findIndex((p) => p.id === payload.id);
      const next =
        idx >= 0
          ? displayPriorities.map((p, i) => (i === idx ? payload : p))
          : [...displayPriorities, payload];
      onPrioritiesPatched(next);
      modal.close();
      showToast('Prioritas berhasil disimpan.', 'success');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Save failed', 'error');
    }
  }, [modal, displayPriorities, onPrioritiesPatched, showToast]);

  const toggleActive = useCallback(
    async (priority: ProjectPriorityConfig) => {
      const updated = { ...priority, isActive: !priority.isActive };
      try {
        await saveConfigViaBeOrFallback('projectPriority', updated);
        onPrioritiesPatched(displayPriorities.map((p) => (p.id === updated.id ? updated : p)));
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Save failed', 'error');
      }
    },
    [displayPriorities, onPrioritiesPatched, showToast],
  );

  const remove = useCallback(
    async (priority: ProjectPriorityConfig) => {
      if (
        !window.confirm(
          `Are you sure you want to delete priority '${priority.name}'? This action cannot be undone.`,
        )
      ) {
        return;
      }
      try {
        await deleteConfigViaBeOrFallback('projectPriority', priority.id);
        onPrioritiesPatched(displayPriorities.filter((p) => p.id !== priority.id));
        showToast('Deleted successfully.', 'success');
      } catch (err) {
        showToast(err instanceof Error ? err.message : 'Delete failed', 'error');
      }
    },
    [displayPriorities, onPrioritiesPatched, showToast],
  );

  return { modal, save, toggleActive, remove };
}
