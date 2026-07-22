'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { EnrichedAsset, User, UserRole, WorkflowSet, WorkflowStep } from '@/types';
import * as taskService from '@/services/taskService';
import {
  completeWorkflowTaskViaBe,
  isCapexBeConfigured,
  resolveMyTasksAccessToken,
} from '@/services/myTasksApi';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { resolveWorkflowActionableRole } from '@/lib/workflowRolePolicy';
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { findEnrichedAssetByCode } from './listUtils';

export type QuickTaskDoneModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (assetIds: string[]) => void;
  currentUser: User;
  /** Full asset pool for code lookup (client filter pool + visible rows). */
  lookupAssets: EnrichedAsset[];
  /** Server fallback when code is not in the local pool. */
  resolveAssetByCode?: (code: string) => Promise<EnrichedAsset | null>;
  allWorkflows: WorkflowSet[];
  allTasks: { id: string | number; name: string }[];
  allRoles: UserRole[];
  initialAssetCode?: string;
};

type WorkflowTaskOption = {
  taskId: string;
  name: string;
  order: number;
  step: WorkflowStep;
};

type RowStatus = 'idle' | 'pending' | 'success' | 'error' | 'skipped';

type QuickTaskRow = {
  id: string;
  assetCode: string;
  taskId: string;
  remark: string;
  status: RowStatus;
  message: string;
};

const DEFAULT_ROW_COUNT = 25;
const TRAILING_EMPTY_ROWS = 5;
let rowIdSeq = 0;

function newRow(partial?: Partial<QuickTaskRow>): QuickTaskRow {
  rowIdSeq += 1;
  return {
    id: `qtr-${rowIdSeq}`,
    assetCode: '',
    taskId: '',
    remark: '',
    status: 'idle',
    message: '',
    ...partial,
  };
}

function buildWorkflowTaskOptions(
  asset: EnrichedAsset,
  workflows: WorkflowSet[],
  tasks: { id: string | number; name: string }[],
): WorkflowTaskOption[] {
  const workflow = workflows.find((w) => String(w.id) === String(asset.workflowSetId));
  if (!workflow?.steps?.length) return [];
  return [...workflow.steps]
    .sort((a, b) => a.order - b.order)
    .map((step) => {
      const task = tasks.find((t) => String(t.id) === String(step.taskId));
      return {
        taskId: String(step.taskId),
        name: task?.name?.trim() || `Task ${step.order}`,
        order: step.order,
        step,
      };
    });
}

function isRowFilled(row: QuickTaskRow): boolean {
  return Boolean(row.assetCode.trim() || row.taskId.trim() || row.remark.trim());
}

function isRowComplete(row: QuickTaskRow): boolean {
  return Boolean(row.assetCode.trim() && row.taskId.trim() && row.remark.trim());
}

function resolveTaskId(taskInput: string, options: WorkflowTaskOption[]): string | null {
  const trimmed = taskInput.trim();
  if (!trimmed) return null;

  const byId = options.find((o) => o.taskId === trimmed);
  if (byId) return byId.taskId;

  const byOrder = options.find((o) => String(o.order) === trimmed);
  if (byOrder) return byOrder.taskId;

  const lower = trimmed.toLowerCase();
  const byExactName = options.find((o) => o.name.toLowerCase() === lower);
  if (byExactName) return byExactName.taskId;

  const orderPrefix = trimmed.match(/^(\d+)\.?\s*(.*)$/);
  if (orderPrefix) {
    const [, orderStr, namePart] = orderPrefix;
    const byOrderPrefix = options.find((o) => String(o.order) === orderStr);
    if (byOrderPrefix) return byOrderPrefix.taskId;
    if (namePart.trim()) {
      const partial = options.find((o) => o.name.toLowerCase().includes(namePart.trim().toLowerCase()));
      if (partial) return partial.taskId;
    }
  }

  const byPartialName = options.find((o) => o.name.toLowerCase().includes(lower));
  return byPartialName?.taskId ?? null;
}

function ensureTrailingEmptyRows(data: QuickTaskRow[]): QuickTaskRow[] {
  let lastFilled = -1;
  for (let i = data.length - 1; i >= 0; i -= 1) {
    if (isRowFilled(data[i])) {
      lastFilled = i;
      break;
    }
  }
  const needed = Math.max(DEFAULT_ROW_COUNT, lastFilled + 1 + TRAILING_EMPTY_ROWS);
  if (data.length >= needed) return data;
  return [...data, ...Array.from({ length: needed - data.length }, () => newRow())];
}

function sameResolvedAsset(
  a: EnrichedAsset | null | undefined,
  b: EnrichedAsset | null | undefined,
): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  return String(a.id) === String(b.id);
}

function mergeResolvedAssets(
  prev: Map<string, EnrichedAsset | null>,
  incoming: Map<string, EnrichedAsset | null>,
): Map<string, EnrichedAsset | null> {
  let changed = false;
  const merged = new Map(prev);
  for (const [key, asset] of incoming) {
    if (!sameResolvedAsset(merged.get(key), asset)) {
      merged.set(key, asset);
      changed = true;
    }
  }
  return changed ? merged : prev;
}

function applyTaskDefaultsToRows(
  rows: QuickTaskRow[],
  resolvedAssets: Map<string, EnrichedAsset | null>,
  allWorkflows: WorkflowSet[],
  allTasks: { id: string | number; name: string }[],
): QuickTaskRow[] {
  let changed = false;
  const next = rows.map((row) => {
    const code = row.assetCode.trim().toLowerCase();
    if (!code) return row;
    const asset = resolvedAssets.get(code);
    if (!asset) return row;
    const options = buildWorkflowTaskOptions(asset, allWorkflows, allTasks);
    if (options.length === 0) return row;

    if (row.taskId) {
      if (options.some((o) => o.taskId === row.taskId)) return row;
      const resolved = resolveTaskId(row.taskId, options);
      if (!resolved) return row;
      changed = true;
      return { ...row, taskId: resolved };
    }

    changed = true;
    return { ...row, taskId: options[0].taskId };
  });
  return changed ? next : rows;
}

async function resolveRowAsset(
  code: string,
  lookupAssets: EnrichedAsset[],
  resolveAssetByCode?: (code: string) => Promise<EnrichedAsset | null>,
): Promise<EnrichedAsset | null> {
  const local = findEnrichedAssetByCode(lookupAssets, code);
  if (local) return local;
  if (!resolveAssetByCode) return null;
  return resolveAssetByCode(code);
}

async function completeOneTask(params: {
  asset: EnrichedAsset;
  taskId: string;
  remark: string;
  step: WorkflowStep;
  currentUser: User;
  allRoles: UserRole[];
}): Promise<void> {
  const { asset, taskId, remark, step, currentUser, allRoles } = params;
  const assignedRole = resolveWorkflowActionableRole(currentUser, step, allRoles);
  if (!assignedRole) {
    throw new Error('Tidak memiliki role untuk task ini.');
  }

  if (isCapexBeConfigured()) {
    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    try {
      await completeWorkflowTaskViaBe({
        userId: currentUser.id,
        accessToken,
        assetId: String(asset.id),
        taskId,
        remark,
        roleId: assignedRole.id,
      });
      return;
    } catch (beErr) {
      console.warn('Quick complete via BE failed, falling back:', beErr);
    }
  }

  const result = await taskService.markTaskAsDone(
    String(asset.id),
    taskId,
    remark,
    currentUser,
    assignedRole,
  );
  if (!result.success) throw new Error(result.message);
}

function statusLabel(row: QuickTaskRow): string {
  if (row.status === 'pending') return 'Memproses…';
  if (row.message) return row.message;
  if (row.status === 'idle' && isRowFilled(row) && !isRowComplete(row)) return 'Lengkapi semua kolom';
  return '—';
}

function statusClass(row: QuickTaskRow): string {
  if (row.status === 'success') return 'text-emerald-700';
  if (row.status === 'error') return 'text-danger';
  if (row.status === 'pending') return 'text-siloam-blue';
  if (row.status === 'skipped') return 'text-siloam-text-secondary';
  return 'text-siloam-text-secondary';
}

export function QuickTaskDoneModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  lookupAssets,
  resolveAssetByCode,
  allWorkflows,
  allTasks,
  allRoles,
  initialAssetCode = '',
}: QuickTaskDoneModalProps) {
  const [rows, setRows] = useState<QuickTaskRow[]>(() => [newRow()]);
  const [globalError, setGlobalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedAssets, setResolvedAssets] = useState<Map<string, EnrichedAsset | null>>(new Map());
  const [resolvingCodes, setResolvingCodes] = useState<Set<string>>(new Set());
  const resolveTimerRef = useRef<number | null>(null);
  const prevRowsRef = useRef<QuickTaskRow[]>([]);
  const lookupAssetsRef = useRef(lookupAssets);
  const resolveAssetByCodeRef = useRef(resolveAssetByCode);
  const resolvedAssetsRef = useRef(resolvedAssets);

  lookupAssetsRef.current = lookupAssets;
  resolveAssetByCodeRef.current = resolveAssetByCode;
  resolvedAssetsRef.current = resolvedAssets;

  const assetCodesKey = useMemo(
    () =>
      [...new Set(rows.map((r) => r.assetCode.trim().toLowerCase()).filter(Boolean))]
        .sort()
        .join('\u0001'),
    [rows],
  );

  const commitResolvedAssets = useCallback(
    (incoming: Map<string, EnrichedAsset | null>) => {
      const merged = mergeResolvedAssets(resolvedAssetsRef.current, incoming);
      if (merged === resolvedAssetsRef.current) return;

      resolvedAssetsRef.current = merged;
      setResolvedAssets(merged);

      setRows((prev) => {
        const next = applyTaskDefaultsToRows(prev, merged, allWorkflows, allTasks);
        if (next === prev) return prev;
        prevRowsRef.current = next;
        return next;
      });
    },
    [allWorkflows, allTasks],
  );

  const taskOptionsForAsset = useCallback(
    (asset: EnrichedAsset | null | undefined): WorkflowTaskOption[] => {
      if (!asset) return [];
      return buildWorkflowTaskOptions(asset, allWorkflows, allTasks);
    },
    [allWorkflows, allTasks],
  );

  const taskOptionsForRow = useCallback(
    (row: QuickTaskRow): WorkflowTaskOption[] => {
      const code = row.assetCode.trim().toLowerCase();
      if (!code) return [];
      return taskOptionsForAsset(resolvedAssets.get(code));
    },
    [resolvedAssets, taskOptionsForAsset],
  );

  const resetForm = useCallback(() => {
    const empty = new Map<string, EnrichedAsset | null>();
    resolvedAssetsRef.current = empty;
    setRows([newRow()]);
    setGlobalError('');
    setResolvedAssets(empty);
    setResolvingCodes(new Set());
    prevRowsRef.current = [];
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const initial = initialAssetCode.trim();
    setRows(
      ensureTrailingEmptyRows(
        initial
          ? [newRow({ assetCode: initial }), ...Array.from({ length: DEFAULT_ROW_COUNT - 1 }, () => newRow())]
          : Array.from({ length: DEFAULT_ROW_COUNT }, () => newRow()),
      ),
    );
    setGlobalError('');
    const empty = new Map<string, EnrichedAsset | null>();
    resolvedAssetsRef.current = empty;
    setResolvedAssets(empty);
    setResolvingCodes(new Set());
    prevRowsRef.current = [];
  }, [isOpen, initialAssetCode]);

  useEffect(() => {
    if (!isOpen || !assetCodesKey) return;

    const codes = assetCodesKey.split('\u0001');
    const nextResolved = new Map<string, EnrichedAsset | null>();

    for (const code of codes) {
      const sync = findEnrichedAssetByCode(lookupAssetsRef.current, code);
      if (sync) {
        nextResolved.set(code, sync);
      }
    }

    if (nextResolved.size > 0) {
      commitResolvedAssets(nextResolved);
    }

    const pendingCodes = codes.filter((code) => !nextResolved.has(code));
    const resolveAssetByCode = resolveAssetByCodeRef.current;
    if (pendingCodes.length === 0 || !resolveAssetByCode) return undefined;

    if (resolveTimerRef.current != null) {
      window.clearTimeout(resolveTimerRef.current);
    }

    resolveTimerRef.current = window.setTimeout(() => {
      setResolvingCodes(new Set(pendingCodes));
      void Promise.all(
        pendingCodes.map(async (code) => {
          const asset = await resolveAssetByCode(code);
          return [code, asset] as const;
        }),
      ).then((results) => {
        commitResolvedAssets(new Map(results));
        setResolvingCodes(new Set());
      });
    }, 300);

    return () => {
      if (resolveTimerRef.current != null) {
        window.clearTimeout(resolveTimerRef.current);
      }
    };
  }, [isOpen, assetCodesKey, commitResolvedAssets]);

  const handleDataChange = useCallback(
    (newData: QuickTaskRow[]) => {
      const normalized = ensureTrailingEmptyRows(
        newData.map((row) => {
          const prev = prevRowsRef.current.find((r) => r.id === row.id);
          const assetCodeChanged = Boolean(prev && prev.assetCode !== row.assetCode);
          const code = row.assetCode.trim().toLowerCase();
          const asset = resolvedAssetsRef.current.get(code);
          const options = asset ? buildWorkflowTaskOptions(asset, allWorkflows, allTasks) : [];

          let taskId = assetCodeChanged ? '' : row.taskId;
          if (taskId && options.length > 0 && !options.some((o) => o.taskId === taskId)) {
            taskId = resolveTaskId(taskId, options) ?? '';
          }

          return {
            ...row,
            taskId,
            status: row.status === 'success' || row.status === 'error' ? row.status : 'idle',
            message: row.status === 'success' || row.status === 'error' ? row.message : '',
          };
        }),
      );
      prevRowsRef.current = normalized;
      setRows(normalized);
    },
    [allWorkflows, allTasks],
  );

  const addRow = useCallback(() => {
    setRows((prev) => [...prev, ...Array.from({ length: 5 }, () => newRow())]);
  }, []);

  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return ensureTrailingEmptyRows(prev.filter((r) => r.id !== id));
    });
  }, []);

  const completableRows = useMemo(() => rows.filter(isRowComplete), [rows]);
  const partialRows = useMemo(
    () => rows.filter((r) => isRowFilled(r) && !isRowComplete(r)),
    [rows],
  );

  const assetHintForRow = useCallback(
    (row: QuickTaskRow): string => {
      const code = row.assetCode.trim();
      if (!code) return '';
      const key = code.toLowerCase();
      if (resolvingCodes.has(key)) return 'Mencari asset…';
      const asset = resolvedAssets.get(key);
      if (asset) return asset.assetName;
      if (resolvedAssets.has(key)) return 'Asset tidak ditemukan';
      return '';
    },
    [resolvedAssets, resolvingCodes],
  );

  const columns = useMemo((): SpreadsheetColumn<QuickTaskRow>[] => {
    return [
      {
        id: 'assetCode',
        header: 'Kode Asset',
        accessor: 'assetCode',
        isEditable: !isSubmitting,
        editorType: 'text',
      },
      {
        id: 'taskId',
        header: 'Task Done',
        accessor: 'taskId',
        editorType: 'select',
        alwaysShowEditor: true,
        isEditable: (row) => !isSubmitting && taskOptionsForRow(row).length > 0,
        editorDisabled: (row) => isSubmitting || resolvingCodes.has(row.assetCode.trim().toLowerCase()),
        selectOptions: (row) => {
          const options = taskOptionsForRow(row);
          if (options.length === 0) {
            const code = row.assetCode.trim();
            if (!code) {
              return [{ value: '', label: '— Isi kode asset —' }];
            }
            if (resolvingCodes.has(code.toLowerCase())) {
              return [{ value: '', label: 'Mencari asset…' }];
            }
            return [{ value: '', label: '— Asset tidak ditemukan —' }];
          }
          return [
            { value: '', label: '— Pilih task —' },
            ...options.map((opt) => ({
              value: opt.taskId,
              label: `${opt.order}. ${opt.name}`,
            })),
          ];
        },
      },
      {
        id: 'remark',
        header: 'Remark',
        accessor: 'remark',
        isEditable: !isSubmitting,
        editorType: 'text',
      },
      {
        id: 'assetHint',
        header: 'Nama Asset',
        accessor: (row) => assetHintForRow(row),
        formatCellDisplay: (_, row) => {
          const hint = assetHintForRow(row);
          if (!hint) return '—';
          const key = row.assetCode.trim().toLowerCase();
          const isFound = Boolean(resolvedAssets.get(key));
          const isPending = resolvingCodes.has(key);
          return (
            <span
              className={
                isPending
                  ? 'text-siloam-text-secondary'
                  : isFound
                    ? 'text-emerald-700'
                    : 'text-amber-700'
              }
              title={hint}
            >
              {hint}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        accessor: (row) => statusLabel(row),
        formatCellDisplay: (_, row) => (
          <span className={statusClass(row)}>{statusLabel(row)}</span>
        ),
      },
      {
        id: 'actions',
        header: '',
        accessor: (row) => row.id,
        align: 'center',
        formatCellDisplay: (_, row) =>
          rows.length > 1 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={(e) => {
                e.stopPropagation();
                removeRow(row.id);
              }}
              className="rounded-lg p-1 text-siloam-text-secondary hover:bg-red-50 hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
              aria-label="Hapus baris"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null,
      },
    ];
  }, [
    isSubmitting,
    assetHintForRow,
    resolvedAssets,
    resolvingCodes,
    rows.length,
    removeRow,
    taskOptionsForRow,
  ]);

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setGlobalError('');

    if (partialRows.length > 0) {
      setGlobalError(
        'Beberapa baris belum lengkap. Isi kode asset, task, dan remark — atau kosongkan baris yang tidak dipakai.',
      );
      return;
    }

    if (completableRows.length === 0) {
      setGlobalError('Isi minimal satu baris lengkap (kode asset, task, dan remark).');
      return;
    }

    setIsSubmitting(true);
    const succeededAssetIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    const patchRow = (id: string, patch: Partial<QuickTaskRow>) => {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    for (const row of rows) {
      if (!isRowComplete(row)) {
        if (!isRowFilled(row)) {
          patchRow(row.id, { status: 'skipped', message: 'Dilewati' });
        }
        continue;
      }

      patchRow(row.id, { status: 'pending', message: '' });

      const asset = await resolveRowAsset(row.assetCode, lookupAssets, resolveAssetByCode);
      if (!asset) {
        failCount += 1;
        patchRow(row.id, { status: 'error', message: 'Asset tidak ditemukan' });
        continue;
      }

      const options = buildWorkflowTaskOptions(asset, allWorkflows, allTasks);
      const selected = options.find((o) => o.taskId === row.taskId);
      if (!selected) {
        failCount += 1;
        patchRow(row.id, { status: 'error', message: 'Task tidak valid' });
        continue;
      }

      try {
        await completeOneTask({
          asset,
          taskId: selected.taskId,
          remark: row.remark.trim(),
          step: selected.step,
          currentUser,
          allRoles,
        });
        successCount += 1;
        succeededAssetIds.push(String(asset.id));
        patchRow(row.id, { status: 'success', message: 'Berhasil' });
      } catch (e) {
        failCount += 1;
        patchRow(row.id, {
          status: 'error',
          message: e instanceof Error ? e.message : 'Gagal',
        });
      }
    }

    setIsSubmitting(false);

    if (successCount > 0) {
      onSuccess([...new Set(succeededAssetIds)]);
    }

    if (failCount === 0 && successCount > 0) {
      resetForm();
      onClose();
      return;
    }

    if (successCount === 0) {
      setGlobalError('Tidak ada task yang berhasil diselesaikan. Periksa pesan error per baris.');
    } else {
      setGlobalError(`${successCount} berhasil, ${failCount} gagal. Perbaiki baris yang gagal lalu simpan lagi.`);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-task-done-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-siloam-border bg-siloam-surface shadow-soft">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-siloam-border p-5">
          <div>
            <h3 id="quick-task-done-title" className="text-lg font-bold text-siloam-text-primary">
              Quick Edit Task
            </h3>
            <p className="mt-1 text-sm text-siloam-text-secondary">
              Mode spreadsheet — paste dari Excel (Kode Asset, Task, Remark). Task dipilih dari dropdown workflow asset.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="shrink-0 rounded-lg px-2 py-1 text-sm text-siloam-text-secondary hover:bg-siloam-bg disabled:opacity-50"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          <SpreadsheetTable
            columns={columns}
            data={rows}
            onDataChange={handleDataChange}
            rowHeaderAccessor="id"
            maxHeight="min(52vh, 480px)"
            windowRows={false}
            createRowOnPaste={newRow}
          />

          <button
            type="button"
            disabled={isSubmitting}
            onClick={addRow}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-dashed border-siloam-border px-3 py-2 text-sm text-siloam-text-secondary transition hover:border-siloam-blue hover:text-siloam-blue disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            Tambah baris
          </button>

          {globalError ? <p className="mt-3 text-sm text-danger">{globalError}</p> : null}
          {completableRows.length > 0 ? (
            <p className="mt-2 text-xs text-siloam-text-secondary">
              {completableRows.length} baris siap disimpan
              {partialRows.length > 0 ? ` · ${partialRows.length} baris belum lengkap` : ''}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-siloam-border p-5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="rounded-xl border border-siloam-border px-4 py-2 text-sm hover:bg-siloam-bg disabled:opacity-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={() => {
              void handleSubmit();
            }}
            disabled={isSubmitting || completableRows.length === 0}
            className="rounded-xl bg-siloam-blue px-4 py-2 text-sm text-white hover:bg-siloam-blue/90 disabled:cursor-not-allowed disabled:bg-gray-400"
          >
            {isSubmitting
              ? 'Menyimpan…'
              : `Simpan ${completableRows.length > 0 ? `(${completableRows.length})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}
