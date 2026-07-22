'use client';

import { useCallback, useState } from 'react';
import type { BudgetCategoryConfig } from '@/types';
import * as configService from '@/services/configService';
import * as budgetService from '@/services/budgetService';
import { useToast } from '@/contexts/ToastContext';
import { useConfigCrud } from '@/features/configuration/shared/hooks/useConfigCrud';
import { useConfigEntityModal } from '@/features/configuration/shared/hooks/useConfigEntityModal';
import { buildBudgetCategoryPayload } from '@/features/configuration/budget-project/utils/budgetCategoryUtils';

export function useBudgetCategoryManagement(onConfigChange: () => void) {
  const { showToast } = useToast();
  const modal = useConfigEntityModal<BudgetCategoryConfig>({
    defaultDraft: { name: '', isActive: true },
  });
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [categoryToDelete, setCategoryToDelete] = useState<BudgetCategoryConfig | null>(null);
  const [deleteConfirmationValue, setDeleteConfirmationValue] = useState(0);

  const crud = useConfigCrud<BudgetCategoryConfig>({
    entity: 'budgetCategory',
    saveLocal: (item) => configService.saveBudgetCategory(item),
    deleteLocal: (id) => configService.deleteBudgetCategory(id),
    onSuccess: () => {
      modal.close();
      onConfigChange();
    },
    successMessage: 'Kategori berhasil disimpan.',
  });

  const save = useCallback(async () => {
    if (!modal.draft) return;
    const payload = buildBudgetCategoryPayload(modal.draft);
    if (!payload) {
      showToast('Category name is required.', 'error');
      return;
    }
    await crud.save(payload);
  }, [modal.draft, crud, showToast]);

  const toggleActive = useCallback(
    async (category: BudgetCategoryConfig) => {
      await crud.toggleActive(category);
      onConfigChange();
    },
    [crud, onConfigChange],
  );

  const openDeleteModal = useCallback(async (category: BudgetCategoryConfig) => {
    const totalValue = await budgetService.getAggregatedBudgetForCategory(category.id);
    setDeleteConfirmationValue(totalValue);
    setCategoryToDelete(category);
    setIsDeleteModalOpen(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    setCategoryToDelete(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!categoryToDelete) return;
    await crud.remove(categoryToDelete.id);
    closeDeleteModal();
  }, [categoryToDelete, crud, closeDeleteModal]);

  const hideInstead = useCallback(async () => {
    if (categoryToDelete?.isActive) {
      await crud.save({ ...categoryToDelete, isActive: false });
    }
    closeDeleteModal();
  }, [categoryToDelete, crud, closeDeleteModal]);

  return {
    modal,
    save,
    toggleActive,
    openDeleteModal,
    deleteModal: {
      isOpen: isDeleteModalOpen,
      category: categoryToDelete,
      totalValue: deleteConfirmationValue,
      close: closeDeleteModal,
      confirmDelete,
      hideInstead,
    },
  };
}
