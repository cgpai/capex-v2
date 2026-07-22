'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layers, Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { Task, UserRole, WorkflowSet } from '@/types';
import { SpreadsheetTable, type SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { useToast } from '@/contexts/ToastContext';
import * as configService from '@/services/configService';
import { dispatchConfigurationMasterChanged } from '@/lib/configurationCacheSync';
import {
  addStepToWorkflowGroup,
  buildWorkflowSetsFromSpreadsheetRows,
  createEmptyWorkflowStepRow,
  createNewWorkflowGroup,
  getDeletedWorkflowIds,
  getTriggerTaskOptionsForRow,
  getWorkflowGroupLabels,
  removeWorkflowGroup,
  syncWorkflowNameInGroup,
  syncWorkflowRowDerivedFields,
  workflowsToSpreadsheetRows,
  type WorkflowSetSpreadsheetRow,
  type WorkflowSpreadsheetValidation,
} from '@/features/configuration/workflow/utils/workflowSpreadsheetUtils';
import {
  mergePastedWorkflowRows,
  parseClipboardToWorkflowRows,
  WORKFLOW_PASTE_TEMPLATE_EXAMPLE,
} from '@/features/configuration/workflow/utils/workflowSpreadsheetClipboard';
import { SpreadsheetPasteToolbar } from './SpreadsheetPasteToolbar';
import { RoleCheckboxDropdown } from './RoleCheckboxDropdown';
import { WorkflowTriggerDropdown } from './WorkflowTriggerDropdown';

type WorkflowSetSpreadsheetProps = {
  workflows: WorkflowSet[];
  tasks: Task[];
  roles: UserRole[];
  onSaved: () => void;
  onEditDetail?: (workflow: WorkflowSet | null) => void;
};

function isFirstStepInGroup(row: WorkflowSetSpreadsheetRow, rows: WorkflowSetSpreadsheetRow[]): boolean {
  const group = rows.filter((r) => r.workflowGroupId === row.workflowGroupId);
  const minOrder = Math.min(...group.map((r) => r.stepOrder || 1));
  return (row.stepOrder || 1) === minOrder;
}

export function WorkflowSetSpreadsheet({
  workflows,
  tasks,
  roles,
  onSaved,
  onEditDetail,
}: WorkflowSetSpreadsheetProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<WorkflowSetSpreadsheetRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<WorkflowSpreadsheetValidation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const groupLabels = useMemo(() => getWorkflowGroupLabels(rows), [rows]);

  const taskSelectOptions = useMemo(
    () => tasks.map((t) => ({ value: t.name, label: t.name })),
    [tasks],
  );

  const resetFromWorkflows = useCallback(() => {
    const data = workflowsToSpreadsheetRows(workflows, tasks, roles);
    setRows(data);
    setValidationErrors([]);
    setDirty(false);
  }, [workflows, tasks, roles]);

  useEffect(() => {
    resetFromWorkflows();
  }, [resetFromWorkflows]);

  const runValidation = useCallback(
    (nextRows: WorkflowSetSpreadsheetRow[]) => {
      const { errors } = buildWorkflowSetsFromSpreadsheetRows(nextRows, tasks, roles, workflows);
      setValidationErrors(errors);
      return errors;
    },
    [tasks, roles, workflows],
  );

  const applyRows = useCallback(
    (next: WorkflowSetSpreadsheetRow[]) => {
      setRows(next);
      setDirty(true);
      runValidation(next);
    },
    [runValidation],
  );

  const handleDataChange = useCallback(
    (next: WorkflowSetSpreadsheetRow[], changedRowId?: string, field?: keyof WorkflowSetSpreadsheetRow) => {
      let merged = next;
      if (changedRowId && field === 'workflowName') {
        const changed = next.find((r) => r.id === changedRowId);
        if (changed) {
          merged = syncWorkflowNameInGroup(next, changedRowId, changed.workflowName);
        }
      }
      applyRows(merged);
    },
    [applyRows],
  );

  const handleAddWorkflow = useCallback(() => {
    applyRows([...rows, ...createNewWorkflowGroup(1)]);
  }, [applyRows, rows]);

  const handleAddStep = useCallback(() => {
    if (rows.length === 0) {
      applyRows(createNewWorkflowGroup(1));
      return;
    }
    const lastGroupId = rows[rows.length - 1]?.workflowGroupId;
    if (!lastGroupId) return;
    applyRows(addStepToWorkflowGroup(rows, lastGroupId));
  }, [applyRows, rows]);

  const handleRemoveGroup = useCallback(
    (workflowGroupId: string) => {
      const label = groupLabels.get(workflowGroupId) ?? 'workflow ini';
      if (!window.confirm(`Hapus ${label} beserta semua step-nya?`)) return;
      applyRows(removeWorkflowGroup(rows, workflowGroupId));
    },
    [applyRows, groupLabels, rows],
  );

  const patchRow = useCallback(
    (rowId: string, patch: Partial<WorkflowSetSpreadsheetRow>) => {
      let next = rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
      if (patch.taskName !== undefined) {
        next = next.map((r) => {
          if (r.id !== rowId) return r;
          const allowed = new Set(
            getTriggerTaskOptionsForRow({ ...r, ...patch }, next, tasks).map((t) => t.id),
          );
          const triggeringTaskIds = r.triggeringTaskIds.filter((id) => allowed.has(id));
          return syncWorkflowRowDerivedFields({ ...r, ...patch, triggeringTaskIds }, roles, tasks);
        });
      } else {
        next = next.map((r) =>
          r.id === rowId ? syncWorkflowRowDerivedFields({ ...r, ...patch }, roles, tasks) : r,
        );
      }
      applyRows(next);
    },
    [applyRows, rows, roles, tasks],
  );

  const columns: SpreadsheetColumn<WorkflowSetSpreadsheetRow>[] = useMemo(
    () => [
      {
        id: 'workflowGroup',
        header: 'Grup',
        accessor: (item) => groupLabels.get(item.workflowGroupId) ?? '—',
        formatCellDisplay: (_v, item) => groupLabels.get(item.workflowGroupId) ?? '—',
      },
      {
        id: 'workflowName',
        header: 'Workflow Name *',
        accessor: 'workflowName',
        isEditable: (row) => !row._markedDelete,
      },
      {
        id: 'stepOrder',
        header: 'Step #',
        accessor: 'stepOrder',
        isEditable: (row) => !row._markedDelete,
        isNumeric: true,
        numericDisplay: 'plain',
        align: 'right',
      },
      {
        id: 'taskName',
        header: 'Task *',
        accessor: 'taskName',
        isEditable: (row) => !row._markedDelete,
        editorType: 'select',
        alwaysShowEditor: true,
        selectOptions: taskSelectOptions,
      },
      {
        id: 'roleIds',
        header: 'Roles',
        accessor: (item) => (
          <RoleCheckboxDropdown
            roles={roles}
            selectedIds={item.roleIds}
            onChange={(roleIds) => patchRow(item.id, { roleIds })}
            disabled={!!item._markedDelete}
          />
        ),
      },
      {
        id: 'slaDays',
        header: 'SLA',
        accessor: 'slaDays',
        isEditable: (row) => !row._markedDelete,
        isNumeric: true,
        numericDisplay: 'plain',
        align: 'right',
      },
      {
        id: 'taskScore',
        header: 'Score %',
        accessor: 'taskScore',
        isEditable: (row) => !row._markedDelete,
        isNumeric: true,
        numericDisplay: 'plain',
        align: 'right',
      },
      {
        id: 'milestoneScore',
        header: 'Milestone %',
        accessor: 'milestoneScore',
        isEditable: (row) => !row._markedDelete,
        formatCellDisplay: (value) => (value === '' || value == null ? '—' : String(value)),
      },
      {
        id: 'triggeringTaskIds',
        header: 'Triggers',
        accessor: (item) => (
          <WorkflowTriggerDropdown
            options={getTriggerTaskOptionsForRow(item, rows, tasks)}
            selectedIds={item.triggeringTaskIds}
            onChange={(triggeringTaskIds) => patchRow(item.id, { triggeringTaskIds })}
            disabled={!!item._markedDelete}
          />
        ),
      },
      {
        id: '_actions',
        header: '',
        accessor: (item) => (
          <div className="flex items-center justify-center gap-1">
            {onEditDetail && item.workflowId && isFirstStepInGroup(item, rows) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const existing = workflows.find((w) => w.id === item.workflowId);
                  onEditDetail(existing ?? null);
                }}
                className="px-2 py-1 text-xs text-siloam-blue hover:underline"
                title="Edit detail workflow"
              >
                Detail
              </button>
            )}
            {isFirstStepInGroup(item, rows) && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveGroup(item.workflowGroupId);
                }}
                className="px-2 py-1 text-xs text-danger hover:underline"
                title="Hapus seluruh workflow"
              >
                Hapus WF
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                applyRows(rows.filter((r) => r.id !== item.id));
              }}
              className="p-1.5 text-siloam-text-secondary hover:text-danger rounded-md hover:bg-red-50"
              title="Hapus step"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
        align: 'center',
      },
    ],
    [applyRows, groupLabels, handleRemoveGroup, onEditDetail, patchRow, roles, rows, taskSelectOptions, tasks, workflows],
  );

  const handleSave = useCallback(async () => {
    const { workflows: toSave, errors } = buildWorkflowSetsFromSpreadsheetRows(rows, tasks, roles, workflows);
    setValidationErrors(errors);
    if (errors.length > 0) {
      showToast('Perbaiki error validasi sebelum menyimpan.', 'error');
      return;
    }

    const toDelete = getDeletedWorkflowIds(rows, workflows);
    if (toSave.length === 0 && toDelete.length === 0) {
      showToast('Tidak ada perubahan untuk disimpan.', 'error');
      return;
    }

    if (toDelete.length > 0) {
      const names = toDelete.map((id) => workflows.find((w) => w.id === id)?.name ?? id).join(', ');
      if (!window.confirm(`Workflow berikut akan dihapus: ${names}. Lanjutkan?`)) {
        return;
      }
    }

    setIsSaving(true);
    try {
      for (const wf of toSave) {
        await configService.saveWorkflowSet(wf);
      }
      for (const id of toDelete) {
        await configService.deleteWorkflowSet(id);
      }
      dispatchConfigurationMasterChanged(['workflows']);
      showToast('Workflow Sets berhasil disimpan.', 'success');
      setDirty(false);
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan Workflow Sets.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [rows, tasks, roles, workflows, showToast, onSaved]);

  const handlePasteText = useCallback(
    (text: string) => {
      const pasted = parseClipboardToWorkflowRows(text, roles, tasks);
      if (pasted.length === 0) {
        showToast('Tidak ada baris valid. Pastikan format tab-separated (dari Excel/Sheets).', 'error');
        return;
      }
      const merged = mergePastedWorkflowRows(rows, pasted);
      applyRows(merged);
      const groupCount = new Set(pasted.map((r) => r.workflowGroupId)).size;
      showToast(`${pasted.length} step (${groupCount} workflow) ditempel dari clipboard.`, 'success');
    },
    [applyRows, roles, rows, showToast, tasks],
  );

  const onTableDataChange = useCallback(
    (next: WorkflowSetSpreadsheetRow[]) => {
      const prevById = new Map(rows.map((r) => [r.id, r]));
      let changedRowId: string | undefined;
      let changedField: keyof WorkflowSetSpreadsheetRow | undefined;
      let taskNameChanged = false;
      for (const row of next) {
        const prev = prevById.get(row.id);
        if (!prev) continue;
        if (prev.workflowName !== row.workflowName) {
          changedRowId = row.id;
          changedField = 'workflowName';
          break;
        }
        if (prev.taskName !== row.taskName) {
          changedRowId = row.id;
          changedField = 'taskName';
          taskNameChanged = true;
          break;
        }
      }

      if (taskNameChanged && changedRowId) {
        const row = next.find((r) => r.id === changedRowId);
        if (row) {
          const allowed = new Set(
            getTriggerTaskOptionsForRow(row, next, tasks).map((t) => t.id),
          );
          const patched = next.map((r) =>
            r.id === changedRowId
              ? syncWorkflowRowDerivedFields(
                  { ...r, triggeringTaskIds: r.triggeringTaskIds.filter((id) => allowed.has(id)) },
                  roles,
                  tasks,
                )
              : r,
          );
          handleDataChange(patched, changedRowId, changedField);
          return;
        }
      }

      handleDataChange(next, changedRowId, changedField);
    },
    [handleDataChange, rows, roles, tasks],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-siloam-text-primary">Workflow Sets</h3>
          <p className="text-xs text-siloam-text-secondary mt-0.5">
            Tambah workflow satu per satu dengan <strong>Workflow Baru</strong>, atau tempel blok data dari
            Excel/Sheets. Baris berurutan dengan nama workflow sama = satu grup. Total score per grup 100%.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleAddWorkflow}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm bg-siloam-blue text-white rounded-lg hover:bg-siloam-blue/90"
          >
            <Layers className="w-4 h-4" />
            Workflow Baru
          </button>
          <button
            type="button"
            onClick={handleAddStep}
            disabled={rows.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-siloam-border rounded-lg hover:bg-siloam-bg disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Step
          </button>
          <button
            type="button"
            onClick={resetFromWorkflows}
            disabled={!dirty}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-siloam-border rounded-lg hover:bg-siloam-bg disabled:opacity-50"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm bg-siloam-blue text-white rounded-lg hover:bg-siloam-blue/90 disabled:opacity-60"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>

      <SpreadsheetPasteToolbar
        templateHeader={WORKFLOW_PASTE_TEMPLATE_EXAMPLE.split('\n')[0] ?? ''}
        templateExample={WORKFLOW_PASTE_TEMPLATE_EXAMPLE}
        formatHint="Kolom: Workflow Name, Step #, Task, Roles, SLA, Score %, Milestone %, Triggers. Setelah paste, sesuaikan Roles dan Triggers lewat dropdown di tabel."
        onPasteText={handlePasteText}
        disabled={isSaving}
      />

      {validationErrors.length > 0 && (
        <div className="text-sm bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 max-h-32 overflow-y-auto">
          <ul className="list-disc pl-5 space-y-0.5">
            {validationErrors.map((e) => (
              <li key={`${e.rowId}-${e.message}`}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-siloam-border bg-siloam-bg/50 p-8 text-center">
          <p className="text-sm text-siloam-text-secondary mb-4">
            Belum ada workflow. Klik <strong>Workflow Baru</strong> atau tempel data dari clipboard di area paste
            di atas.
          </p>
          <button
            type="button"
            onClick={handleAddWorkflow}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm bg-siloam-blue text-white rounded-lg hover:bg-siloam-blue/90"
          >
            <Layers className="w-4 h-4" />
            Workflow Baru
          </button>
        </div>
      ) : (
        <SpreadsheetTable
          columns={columns}
          data={rows}
          onDataChange={onTableDataChange}
          rowHeaderAccessor="id"
          maxHeight="min(55vh, 480px)"
          createRowOnPaste={() => {
            const lastGroup = rows[rows.length - 1]?.workflowGroupId;
            return lastGroup
              ? createEmptyWorkflowStepRow(rows.length, lastGroup)
              : createNewWorkflowGroup(1)[0];
          }}
        />
      )}
    </div>
  );
}
