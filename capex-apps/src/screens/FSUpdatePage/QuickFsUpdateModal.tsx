'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { User } from '@/types';
import * as taskService from '@/services/taskService';
import { saveFsProjectsViaBackend } from '@/services/fsUpdateApi';
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import type { FsEnrichedProject } from '../../hooks/queries/fetchFsUpdatePageData';
import {
  applyAutoFsApproval,
  findFsProjectByCode,
  isFsUpdateSpecialProject,
  projectsWithNewFsApproval,
  toFsProjectSavePatch,
} from './fsUpdateHelpers';

export type QuickFsUpdateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectIds: string[]) => void;
  currentUser: User;
  periodName: string;
  lookupProjects: FsEnrichedProject[];
  initialProjectCode?: string;
};

type RowStatus = 'idle' | 'pending' | 'success' | 'error' | 'skipped';

type QuickFsRow = {
  id: string;
  projectCode: string;
  axCode: string;
  approvedBudget: number;
  targetBudgetStart: string;
  budgetRevenuePermonth: number;
  status: RowStatus;
  message: string;
};

const DEFAULT_ROW_COUNT = 25;
const TRAILING_EMPTY_ROWS = 5;
let rowIdSeq = 0;

function newRow(partial?: Partial<QuickFsRow>): QuickFsRow {
  rowIdSeq += 1;
  return {
    id: `qfs-${rowIdSeq}`,
    projectCode: '',
    axCode: '',
    approvedBudget: 0,
    targetBudgetStart: '',
    budgetRevenuePermonth: 0,
    status: 'idle',
    message: '',
    ...partial,
  };
}

function isRowFilled(row: QuickFsRow): boolean {
  return Boolean(
    row.projectCode.trim() ||
      row.axCode.trim() ||
      row.approvedBudget > 0 ||
      row.targetBudgetStart.trim() ||
      row.budgetRevenuePermonth > 0,
  );
}

function isRowComplete(row: QuickFsRow): boolean {
  if (!row.projectCode.trim()) return false;
  return Boolean(
    row.axCode.trim() ||
      row.approvedBudget > 0 ||
      row.targetBudgetStart.trim() ||
      row.budgetRevenuePermonth > 0,
  );
}

function ensureTrailingEmptyRows(data: QuickFsRow[]): QuickFsRow[] {
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

function applyProjectDefaultsToRows(
  rows: QuickFsRow[],
  resolvedProjects: Map<string, FsEnrichedProject | null>,
): QuickFsRow[] {
  let changed = false;
  const next = rows.map((row) => {
    const code = row.projectCode.trim().toLowerCase();
    if (!code) return row;
    const project = resolvedProjects.get(code);
    if (!project || isFsUpdateSpecialProject(project)) return row;

    const patch: Partial<QuickFsRow> = {};
    if (!row.axCode.trim() && project.axCode) patch.axCode = project.axCode;
    if (!row.approvedBudget && project.approvedBudget) patch.approvedBudget = project.approvedBudget;
    if (!row.targetBudgetStart.trim() && project.targetBudgetStart) {
      patch.targetBudgetStart = project.targetBudgetStart;
    }
    if (!row.budgetRevenuePermonth && project.budgetRevenuePermonth) {
      patch.budgetRevenuePermonth = project.budgetRevenuePermonth;
    }
    if (Object.keys(patch).length === 0) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}

function statusLabel(row: QuickFsRow): string {
  if (row.status === 'pending') return 'Memproses…';
  if (row.message) return row.message;
  if (row.status === 'idle' && isRowFilled(row) && !isRowComplete(row)) {
    return 'Isi kode project dan minimal satu field FS';
  }
  return '—';
}

function statusClass(row: QuickFsRow): string {
  if (row.status === 'success') return 'text-emerald-700';
  if (row.status === 'error') return 'text-danger';
  if (row.status === 'pending') return 'text-siloam-blue';
  if (row.status === 'skipped') return 'text-siloam-text-secondary';
  return 'text-siloam-text-secondary';
}

export function QuickFsUpdateModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  periodName,
  lookupProjects,
  initialProjectCode = '',
}: QuickFsUpdateModalProps) {
  const [rows, setRows] = useState<QuickFsRow[]>(() => [newRow()]);
  const [globalError, setGlobalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedProjects, setResolvedProjects] = useState<Map<string, FsEnrichedProject | null>>(
    new Map(),
  );
  const prevRowsRef = useRef<QuickFsRow[]>([]);
  const lookupProjectsRef = useRef(lookupProjects);

  lookupProjectsRef.current = lookupProjects;

  const projectCodesKey = useMemo(
    () =>
      [...new Set(rows.map((r) => r.projectCode.trim().toLowerCase()).filter(Boolean))]
        .sort()
        .join('\u0001'),
    [rows],
  );

  const resetForm = useCallback(() => {
    setRows([newRow()]);
    setGlobalError('');
    setResolvedProjects(new Map());
    prevRowsRef.current = [];
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const initial = initialProjectCode.trim();
    setRows(
      ensureTrailingEmptyRows(
        initial
          ? [newRow({ projectCode: initial }), ...Array.from({ length: DEFAULT_ROW_COUNT - 1 }, () => newRow())]
          : Array.from({ length: DEFAULT_ROW_COUNT }, () => newRow()),
      ),
    );
    setGlobalError('');
    setResolvedProjects(new Map());
    prevRowsRef.current = [];
  }, [isOpen, initialProjectCode]);

  useEffect(() => {
    if (!isOpen || !projectCodesKey) return;

    const codes = projectCodesKey.split('\u0001');
    const nextResolved = new Map<string, FsEnrichedProject | null>();
    for (const code of codes) {
      nextResolved.set(code, findFsProjectByCode(lookupProjectsRef.current, code));
    }

    setResolvedProjects((prev) => {
      let changed = false;
      const merged = new Map(prev);
      for (const [key, project] of nextResolved) {
        if ((merged.get(key)?.id ?? null) !== (project?.id ?? null)) {
          merged.set(key, project);
          changed = true;
        }
      }
      if (!changed) return prev;
      setRows((current) => applyProjectDefaultsToRows(current, merged));
      return merged;
    });
  }, [isOpen, projectCodesKey]);

  const handleDataChange = useCallback((newData: QuickFsRow[]) => {
    const normalized = ensureTrailingEmptyRows(
      newData.map((row) => {
        const prev = prevRowsRef.current.find((r) => r.id === row.id);
        const projectCodeChanged = Boolean(prev && prev.projectCode !== row.projectCode);

        return {
          ...row,
          axCode: projectCodeChanged ? '' : row.axCode,
          approvedBudget: projectCodeChanged ? 0 : row.approvedBudget,
          targetBudgetStart: projectCodeChanged ? '' : row.targetBudgetStart,
          budgetRevenuePermonth: projectCodeChanged ? 0 : row.budgetRevenuePermonth,
          status: row.status === 'success' || row.status === 'error' ? row.status : 'idle',
          message: row.status === 'success' || row.status === 'error' ? row.message : '',
        };
      }),
    );
    prevRowsRef.current = normalized;
    setRows(normalized);
  }, []);

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

  const projectHintForRow = useCallback(
    (row: QuickFsRow): string => {
      const code = row.projectCode.trim();
      if (!code) return '';
      const key = code.toLowerCase();
      const project = resolvedProjects.get(key);
      if (project) {
        if (isFsUpdateSpecialProject(project)) return 'Project khusus — tidak bisa diedit';
        return project.projectName;
      }
      if (resolvedProjects.has(key)) return 'Project tidak ditemukan';
      return '';
    },
    [resolvedProjects],
  );

  const columns = useMemo((): SpreadsheetColumn<QuickFsRow>[] => {
    return [
      {
        id: 'projectCode',
        header: 'Kode Project',
        accessor: 'projectCode',
        isEditable: !isSubmitting,
      },
      {
        id: 'axCode',
        header: 'AX Code',
        accessor: 'axCode',
        isEditable: !isSubmitting,
      },
      {
        id: 'approvedBudget',
        header: 'Approved Budget',
        accessor: 'approvedBudget',
        isEditable: !isSubmitting,
        isNumeric: true,
      },
      {
        id: 'targetBudgetStart',
        header: 'Target Budget Start',
        accessor: 'targetBudgetStart',
        isEditable: !isSubmitting,
        editorType: 'date',
      },
      {
        id: 'budgetRevenuePermonth',
        header: 'Budget Revenue/Month',
        accessor: 'budgetRevenuePermonth',
        isEditable: !isSubmitting,
        isNumeric: true,
      },
      {
        id: 'projectHint',
        header: 'Nama Project',
        accessor: (row) => projectHintForRow(row),
        formatCellDisplay: (_, row) => {
          const hint = projectHintForRow(row);
          if (!hint) return '—';
          const key = row.projectCode.trim().toLowerCase();
          const project = resolvedProjects.get(key);
          const isFound = Boolean(project);
          const isSpecial = project ? isFsUpdateSpecialProject(project) : false;
          return (
            <span
              className={
                isSpecial ? 'text-amber-700' : isFound ? 'text-emerald-700' : 'text-amber-700'
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
  }, [isSubmitting, projectHintForRow, resolvedProjects, rows.length, removeRow]);

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setGlobalError('');

    if (partialRows.length > 0) {
      setGlobalError(
        'Beberapa baris belum lengkap. Isi kode project dan minimal satu field FS — atau kosongkan baris yang tidak dipakai.',
      );
      return;
    }

    if (completableRows.length === 0) {
      setGlobalError('Isi minimal satu baris lengkap (kode project + data FS).');
      return;
    }

    setIsSubmitting(true);
    const succeededProjectIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    const patchRow = (id: string, patch: Partial<QuickFsRow>) => {
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

      const project = findFsProjectByCode(lookupProjectsRef.current, row.projectCode);
      if (!project) {
        failCount += 1;
        patchRow(row.id, { status: 'error', message: 'Project tidak ditemukan' });
        continue;
      }
      if (isFsUpdateSpecialProject(project)) {
        failCount += 1;
        patchRow(row.id, { status: 'error', message: 'Project khusus — tidak bisa diedit' });
        continue;
      }

      const updatedProject = applyAutoFsApproval({
        ...project,
        axCode: row.axCode.trim() || undefined,
        approvedBudget: row.approvedBudget || 0,
        targetBudgetStart: row.targetBudgetStart.trim() || undefined,
        budgetRevenuePermonth: row.budgetRevenuePermonth || 0,
      });

      try {
        const saved = await saveFsProjectsViaBackend(currentUser.id, periodName, [
          toFsProjectSavePatch(updatedProject),
        ]);
        if (!saved.ok) {
          failCount += 1;
          patchRow(row.id, { status: 'error', message: saved.error || 'Gagal simpan' });
          continue;
        }

        const newlyApproved = projectsWithNewFsApproval([project], [updatedProject]);
        if (newlyApproved.length > 0) {
          const assetIds = newlyApproved.flatMap((p) => p.assets.map((a) => a.id));
          if (assetIds.length > 0) {
            await taskService.triggerSystemTaskBatch(assetIds, 'BUDGET_APPROVED', currentUser);
          }
        }

        successCount += 1;
        succeededProjectIds.push(String(project.id));
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
      onSuccess([...new Set(succeededProjectIds)]);
    }

    if (failCount === 0 && successCount > 0) {
      resetForm();
      onClose();
      return;
    }

    if (successCount === 0) {
      setGlobalError('Tidak ada FS yang berhasil disimpan. Periksa pesan error per baris.');
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
      aria-labelledby="quick-fs-update-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-siloam-border bg-siloam-surface shadow-soft">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-siloam-border p-5">
          <div>
            <h3 id="quick-fs-update-title" className="text-lg font-bold text-siloam-text-primary">
              Quick Edit FS & Approved Budget
            </h3>
            <p className="mt-1 text-sm text-siloam-text-secondary">
              Mode spreadsheet — paste dari Excel (Kode Project, AX Code, Approved Budget, Target
              Budget Start, Budget Revenue/Month). Nama project terisi otomatis setelah kode dikenali.
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
