'use client';

import React, { useCallback } from 'react';
import type { ProjectPriorityConfig } from '@/types';
import { ConfigListHeader } from '@/features/configuration/shared/components/ConfigListHeader';
import { ConfigModalShell } from '@/features/configuration/shared/components/ConfigModalShell';
import { useProjectPriorityManagement } from '@/features/configuration/budget-project/hooks/useProjectPriorityManagement';
import { ProjectPriorityForm } from './ProjectPriorityForm';
import { ProjectPriorityTable } from './ProjectPriorityTable';

/** Data dari Configuration pack — disinkronkan lewat Realtime + patch CRUD lokal. */
export const ProjectPriorityManagement: React.FC<{
  priorities: ProjectPriorityConfig[];
  onPrioritiesPatched: (priorities: ProjectPriorityConfig[]) => void;
}> = ({ priorities, onPrioritiesPatched }) => {
  const displayPriorities = priorities ?? [];

  const handlePrioritiesPatched = useCallback(
    (next: ProjectPriorityConfig[]) => {
      onPrioritiesPatched(next);
    },
    [onPrioritiesPatched],
  );

  const { modal, save, toggleActive, remove } = useProjectPriorityManagement(
    displayPriorities,
    handlePrioritiesPatched,
  );

  return (
    <div>
      <ConfigListHeader
        title="Project Priorities"
        newButtonLabel="+ New Priority"
        onNew={() => modal.open()}
      />
      <ProjectPriorityTable
        priorities={displayPriorities}
        onEdit={(prio) => modal.open(prio)}
        onToggleActive={toggleActive}
        onDelete={remove}
      />
      {modal.isOpen && modal.draft && (
        <ConfigModalShell
          title={modal.isEditing ? 'Edit Project Priority' : 'Create Project Priority'}
          onClose={modal.close}
          onSave={save}
        >
          <ProjectPriorityForm draft={modal.draft} onChange={modal.patchDraft} />
        </ConfigModalShell>
      )}
    </div>
  );
};
