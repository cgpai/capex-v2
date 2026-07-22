'use client';

import React from 'react';
import type { AssetTagConfig } from '@/types';
import { ConfigListHeader } from '@/features/configuration/shared/components/ConfigListHeader';
import { ConfigModalShell } from '@/features/configuration/shared/components/ConfigModalShell';
import { ConfigEntityTable } from '@/features/configuration/shared/components/ConfigEntityTable';
import { useAssetTagManagement } from '@/features/configuration/budget-project/hooks/useAssetTagManagement';
import { AssetTagForm } from './AssetTagColorPicker';

export const AssetTagManagement: React.FC<{
  tags: AssetTagConfig[];
  onConfigChange: () => void;
}> = ({ tags, onConfigChange }) => {
  const { modal, save, remove } = useAssetTagManagement(onConfigChange);

  return (
    <div>
      <ConfigListHeader
        title="Priority For Asset"
        newButtonLabel="+ New Priority"
        onNew={() => modal.open()}
      />
      <ConfigEntityTable
        rows={tags}
        columns={[
          {
            key: 'name',
            header: 'Priority Name',
            render: (tag) => <span className="font-medium">{tag.name}</span>,
          },
          {
            key: 'preview',
            header: 'Preview',
            render: (tag) => (
              <span className={`px-2 py-1 text-xs font-bold rounded ${tag.color}`}>{tag.name}</span>
            ),
          },
        ]}
        renderActions={(tag) => (
          <>
            <button type="button" onClick={() => modal.open(tag)} className="text-siloam-blue hover:underline">
              Edit
            </button>
            <button type="button" onClick={() => remove(tag.id)} className="text-danger hover:underline">
              Delete
            </button>
          </>
        )}
      />
      {modal.isOpen && modal.draft && (
        <ConfigModalShell
          title={modal.isEditing ? 'Edit Asset Priority' : 'Create Asset Priority'}
          onClose={modal.close}
          onSave={save}
        >
          <AssetTagForm draft={modal.draft} onChange={modal.patchDraft} />
        </ConfigModalShell>
      )}
    </div>
  );
};
