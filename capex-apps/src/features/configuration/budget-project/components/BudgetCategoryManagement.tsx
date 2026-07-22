'use client';

import React from 'react';
import type { BudgetCategoryConfig } from '@/types';
import { ConfigListHeader } from '@/features/configuration/shared/components/ConfigListHeader';
import { ConfigModalShell } from '@/features/configuration/shared/components/ConfigModalShell';
import { ConfigActiveStatusBadge } from '@/features/configuration/shared/components/ConfigActiveStatusBadge';
import { ConfigEntityTable } from '@/features/configuration/shared/components/ConfigEntityTable';
import { useBudgetCategoryManagement } from '@/features/configuration/budget-project/hooks/useBudgetCategoryManagement';
import { DeleteCategoryConfirmationModal } from './DeleteCategoryConfirmationModal';

export const BudgetCategoryManagement: React.FC<{
  categories: BudgetCategoryConfig[];
  onConfigChange: () => void;
}> = ({ categories, onConfigChange }) => {
  const { modal, save, toggleActive, openDeleteModal, deleteModal } =
    useBudgetCategoryManagement(onConfigChange);

  return (
    <div>
      <ConfigListHeader
        title="Budget Categories"
        newButtonLabel="+ New Category"
        onNew={() => modal.open()}
      />
      <ConfigEntityTable
        rows={categories}
        columns={[
          {
            key: 'name',
            header: 'Category Name',
            render: (cat) => <span className="font-medium">{cat.name}</span>,
          },
          {
            key: 'status',
            header: 'Status',
            render: (cat) => <ConfigActiveStatusBadge isActive={cat.isActive} />,
          },
        ]}
        renderActions={(cat) => (
          <>
            <button type="button" onClick={() => modal.open(cat)} className="text-siloam-blue hover:underline">
              Edit
            </button>
            <button type="button" onClick={() => toggleActive(cat)} className="text-siloam-blue hover:underline">
              {cat.isActive ? 'Hide' : 'Show'}
            </button>
            <button type="button" onClick={() => openDeleteModal(cat)} className="text-danger hover:underline">
              Delete
            </button>
          </>
        )}
      />
      {modal.isOpen && modal.draft && (
        <ConfigModalShell
          title={modal.isEditing ? 'Edit Budget Category' : 'Create Budget Category'}
          onClose={modal.close}
          onSave={save}
        >
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Category Name</label>
            <input
              type="text"
              value={modal.draft.name || ''}
              onChange={(e) => modal.patchDraft({ name: e.target.value })}
              className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
          </div>
        </ConfigModalShell>
      )}
      <DeleteCategoryConfirmationModal
        isOpen={deleteModal.isOpen}
        onClose={deleteModal.close}
        onConfirmDelete={deleteModal.confirmDelete}
        onHideInstead={deleteModal.hideInstead}
        category={deleteModal.category}
        totalValue={deleteModal.totalValue}
      />
    </div>
  );
};
