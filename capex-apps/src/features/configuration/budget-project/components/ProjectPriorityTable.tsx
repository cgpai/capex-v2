'use client';

import React from 'react';
import type { ProjectPriorityConfig } from '@/types';
import { ConfigActiveStatusBadge } from '@/features/configuration/shared/components/ConfigActiveStatusBadge';
import { ConfigEntityTable } from '@/features/configuration/shared/components/ConfigEntityTable';

type ProjectPriorityTableProps = {
  priorities: ProjectPriorityConfig[];
  onEdit: (priority: ProjectPriorityConfig) => void;
  onToggleActive: (priority: ProjectPriorityConfig) => void;
  onDelete: (priority: ProjectPriorityConfig) => void;
};

export function ProjectPriorityTable({
  priorities,
  onEdit,
  onToggleActive,
  onDelete,
}: ProjectPriorityTableProps) {
  return (
    <ConfigEntityTable
      rows={priorities}
      columns={[
        {
          key: 'name',
          header: 'Priority Name',
          render: (prio) => <span className="font-medium">{prio.name}</span>,
        },
        {
          key: 'status',
          header: 'Status',
          render: (prio) => <ConfigActiveStatusBadge isActive={prio.isActive} />,
        },
      ]}
      renderActions={(prio) => (
        <>
          <button type="button" onClick={() => onEdit(prio)} className="text-siloam-blue hover:underline">
            Edit
          </button>
          <button type="button" onClick={() => onToggleActive(prio)} className="text-siloam-blue hover:underline">
            {prio.isActive ? 'Hide' : 'Show'}
          </button>
          <button type="button" onClick={() => onDelete(prio)} className="text-danger hover:underline">
            Delete
          </button>
        </>
      )}
    />
  );
}
