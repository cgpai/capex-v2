'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import type { Task } from '@/types';
import { SpreadsheetTable, type SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { useToast } from '@/contexts/ToastContext';
import * as configService from '@/services/configService';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from '@/services/configurationCrudApi';
import {
  createEmptyTaskRow,
  getDeletedTaskIds,
  getTaskRowTriggerEvents,
  spreadsheetRowToTask,
  TASK_TRIGGER_EVENT_HINT,
  taskRowTriggerEventsToCsv,
  tasksToSpreadsheetRows,
  validateTaskSpreadsheetRows,
  type TaskMasterSpreadsheetRow,
  type TaskSpreadsheetValidation,
} from '@/features/configuration/workflow/utils/workflowSpreadsheetUtils';
import {
  mergePastedTaskRows,
  parseClipboardToTaskRows,
  TASK_PASTE_TEMPLATE_EXAMPLE,
} from '@/features/configuration/workflow/utils/workflowSpreadsheetClipboard';
import { SpreadsheetPasteToolbar } from './SpreadsheetPasteToolbar';
import { SystemTriggerDropdown } from './SystemTriggerDropdown';
import type { SystemTriggerEvent } from '@/types';

const DEFAULT_EMPTY_ROWS = 3;

type TaskMasterSpreadsheetProps = {
  tasks: Task[];
  onSaved: () => void;
  onEditDetail?: (task: Task | null) => void;
};

export function TaskMasterSpreadsheet({ tasks, onSaved, onEditDetail }: TaskMasterSpreadsheetProps) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<TaskMasterSpreadsheetRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<TaskSpreadsheetValidation[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const resetFromTasks = useCallback(() => {
    const data = tasksToSpreadsheetRows(tasks);
    setRows(data.length > 0 ? data : Array.from({ length: DEFAULT_EMPTY_ROWS }, (_, i) => createEmptyTaskRow(i)));
    setValidationErrors([]);
    setDirty(false);
  }, [tasks]);

  useEffect(() => {
    resetFromTasks();
  }, [resetFromTasks]);

  const handleDataChange = useCallback((next: TaskMasterSpreadsheetRow[]) => {
    const normalized = next.map((r) =>
      r.isSystemTriggered === 'no' ? { ...r, triggerEventsCsv: '' } : r,
    );
    setRows(normalized);
    setDirty(true);
    setValidationErrors(validateTaskSpreadsheetRows(normalized));
  }, []);

  const handleAddRows = useCallback((count = 1) => {
    setRows((prev) => [...prev, ...Array.from({ length: count }, (_, i) => createEmptyTaskRow(i))]);
    setDirty(true);
  }, []);

  const patchTaskRow = useCallback((rowId: string, patch: Partial<TaskMasterSpreadsheetRow>) => {
    setRows((prev) => {
      const next = prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r));
      setValidationErrors(validateTaskSpreadsheetRows(next));
      return next;
    });
    setDirty(true);
  }, []);

  const columns: SpreadsheetColumn<TaskMasterSpreadsheetRow>[] = useMemo(
    () => [
      {
        id: 'name',
        header: 'Task Name *',
        accessor: 'name',
        isEditable: (row) => !row._markedDelete,
      },
      {
        id: 'description',
        header: 'Description',
        accessor: 'description',
        isEditable: (row) => !row._markedDelete,
      },
      {
        id: 'sla',
        header: 'SLA (days)',
        accessor: 'slaToComplete',
        isEditable: (row) => !row._markedDelete,
        isNumeric: true,
        numericDisplay: 'plain',
        align: 'right',
      },
      {
        id: 'system',
        header: 'System Triggered',
        accessor: 'isSystemTriggered',
        isEditable: (row) => !row._markedDelete,
        editorType: 'select',
        alwaysShowEditor: true,
        selectOptions: [
          { value: 'no', label: 'No' },
          { value: 'yes', label: 'Yes' },
        ],
      },
      {
        id: 'triggers',
        header: 'Trigger Events',
        accessor: (item) =>
          item.isSystemTriggered === 'yes' ? (
            <SystemTriggerDropdown
              selected={getTaskRowTriggerEvents(item)}
              onChange={(events: SystemTriggerEvent[]) =>
                patchTaskRow(item.id, { triggerEventsCsv: taskRowTriggerEventsToCsv(events) })
              }
              disabled={!!item._markedDelete}
            />
          ) : (
            <span className="block px-2 py-2 text-xs text-siloam-text-secondary">Aktifkan System Triggered</span>
          ),
      },
      {
        id: '_actions',
        header: '',
        accessor: (item) => (
          <div className="flex items-center justify-center gap-1">
            {onEditDetail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const existing = tasks.find((t) => t.id === item.id);
                  onEditDetail(existing ?? null);
                }}
                className="px-2 py-1 text-xs text-siloam-blue hover:underline"
                title="Edit detail"
              >
                Detail
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setRows((prev) => {
                  if (item._isNew) return prev.filter((r) => r.id !== item.id);
                  return prev.map((r) => (r.id === item.id ? { ...r, _markedDelete: !r._markedDelete } : r));
                });
                setDirty(true);
              }}
              className={`p-1.5 rounded-md ${item._markedDelete ? 'text-siloam-green bg-green-50' : 'text-siloam-text-secondary hover:text-danger hover:bg-red-50'}`}
              title={item._markedDelete ? 'Batalkan hapus' : 'Tandai hapus'}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ),
        align: 'center',
      },
    ],
    [onEditDetail, patchTaskRow, tasks],
  );

  const handleSave = useCallback(async () => {
    const errors = validateTaskSpreadsheetRows(rows);
    setValidationErrors(errors);
    if (errors.length > 0) {
      showToast('Perbaiki error validasi sebelum menyimpan.', 'error');
      return;
    }

    const activeRows = rows.filter((r) => !r._markedDelete && r.name.trim());
    if (activeRows.length === 0 && getDeletedTaskIds(rows, tasks).length === 0) {
      showToast('Tidak ada perubahan untuk disimpan.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      for (const row of activeRows) {
        const partial = spreadsheetRowToTask(row);
        const taskToSave = {
          ...partial,
          id: row._isNew ? `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` : row.id,
        } as Task;
        await saveConfigViaBeOrFallback('task', taskToSave);
      }

      for (const id of getDeletedTaskIds(rows, tasks)) {
        await deleteConfigViaBeOrFallback('task', id);
      }

      showToast('Task Master berhasil disimpan.', 'success');
      setDirty(false);
      onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Gagal menyimpan Task Master.', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [rows, tasks, showToast, onSaved]);

  const handlePasteText = useCallback(
    (text: string) => {
      const pasted = parseClipboardToTaskRows(text);
      if (pasted.length === 0) {
        showToast('Tidak ada baris valid. Pastikan format tab-separated (dari Excel/Sheets).', 'error');
        return;
      }
      const merged = mergePastedTaskRows(rows, pasted);
      handleDataChange(merged);
      showToast(`${pasted.length} task ditempel dari clipboard.`, 'success');
    },
    [handleDataChange, rows, showToast],
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-siloam-text-primary">Task Master</h3>
          <p className="text-xs text-siloam-text-secondary mt-0.5">
            Edit cepat seperti spreadsheet. System Triggered = Yes → pilih trigger event via dropdown.
            Kode event (paste): {TASK_TRIGGER_EVENT_HINT}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => handleAddRows(1)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm border border-siloam-border rounded-lg hover:bg-siloam-bg"
          >
            <Plus className="w-4 h-4" />
            Baris
          </button>
          <button
            type="button"
            onClick={resetFromTasks}
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
        templateHeader={TASK_PASTE_TEMPLATE_EXAMPLE.split('\n')[0] ?? ''}
        templateExample={TASK_PASTE_TEMPLATE_EXAMPLE}
        formatHint="Kolom: Task Name, Description, SLA, System Triggered (yes/no), Trigger Events. Setelah paste, pilih trigger event lewat dropdown."
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

      <SpreadsheetTable
        columns={columns}
        data={rows.map((r) => (r._markedDelete ? { ...r, name: `[HAPUS] ${r.name}` } : r))}
        onDataChange={(next) => {
          const byId = new Map(rows.map((r) => [r.id, r]));
          const restored = next.map((r) => {
            const orig = byId.get(r.id);
            let name = r.name;
            let markedDelete = orig?._markedDelete;
            if (typeof name === 'string' && name.startsWith('[HAPUS] ')) {
              name = name.replace(/^\[HAPUS\] /, '');
              markedDelete = true;
            }
            return {
              ...r,
              name,
              _markedDelete: markedDelete,
              _isNew: orig?._isNew,
            };
          });
          handleDataChange(restored);
        }}
        rowHeaderAccessor="id"
        maxHeight="min(50vh, 420px)"
        createRowOnPaste={() => createEmptyTaskRow()}
      />
    </div>
  );
}
