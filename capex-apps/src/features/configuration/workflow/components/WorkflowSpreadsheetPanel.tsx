'use client';

import React from 'react';
import type { Task, UserRole, WorkflowSet } from '@/types';
import { TaskMasterSpreadsheet } from './TaskMasterSpreadsheet';
import { WorkflowSetSpreadsheet } from './WorkflowSetSpreadsheet';

type WorkflowSpreadsheetPanelProps = {
  tasks: Task[];
  workflows: WorkflowSet[];
  roles: UserRole[];
  onSaved: () => void;
  onEditTaskDetail?: (task: Task | null) => void;
  onEditWorkflowDetail?: (workflow: WorkflowSet | null) => void;
};

export function WorkflowSpreadsheetPanel({
  tasks,
  workflows,
  roles,
  onSaved,
  onEditTaskDetail,
  onEditWorkflowDetail,
}: WorkflowSpreadsheetPanelProps) {
  return (
    <div className="space-y-8 rounded-xl border border-siloam-border bg-siloam-bg/40 p-5">
      <div>
        <h3 className="text-base font-bold text-siloam-text-primary">Spreadsheet Quick Edit</h3>
        <p className="text-sm text-siloam-text-secondary mt-1">
          Mode terpisah untuk input massal. Tempel data dari Excel/Sheets (Ctrl+V) atau salin template contoh.
        </p>
      </div>

      <TaskMasterSpreadsheet tasks={tasks} onSaved={onSaved} onEditDetail={onEditTaskDetail} />

      <WorkflowSetSpreadsheet
        workflows={workflows}
        tasks={tasks}
        roles={roles}
        onSaved={onSaved}
        onEditDetail={onEditWorkflowDetail}
      />
    </div>
  );
}
