'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { EnrichedAsset, User } from '@/types';
import * as taskService from '@/services/taskService';
import { savePoChangedAssetsViaBackend } from '@/hooks/useAssetUpdateSave';
import {
  SpreadsheetTable,
  type SpreadsheetColumn,
} from '../../components/organisms/SpreadsheetTable/SpreadsheetTable';
import { findEnrichedAssetByCode } from '../CapexProjectList/listUtils';
import { poDateToTaskCompletedAt } from './poUpdateHelpers';

export type QuickPoUpdateModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (assetIds: string[]) => void;
  currentUser: User;
  lookupAssets: EnrichedAsset[];
  assetHasPOMap: Map<string, boolean>;
  initialAssetCode?: string;
};

type RowStatus = 'idle' | 'pending' | 'success' | 'error' | 'skipped';

type QuickPoRow = {
  id: string;
  assetCode: string;
  cprId: string;
  poNumber: string;
  poDate: string;
  consumedBudget: number;
  status: RowStatus;
  message: string;
};

const DEFAULT_ROW_COUNT = 25;
const TRAILING_EMPTY_ROWS = 5;
let rowIdSeq = 0;

function newRow(partial?: Partial<QuickPoRow>): QuickPoRow {
  rowIdSeq += 1;
  return {
    id: `qpo-${rowIdSeq}`,
    assetCode: '',
    cprId: '',
    poNumber: '',
    poDate: '',
    consumedBudget: 0,
    status: 'idle',
    message: '',
    ...partial,
  };
}

function isRowFilled(row: QuickPoRow): boolean {
  return Boolean(
    row.assetCode.trim() ||
      row.cprId.trim() ||
      row.poNumber.trim() ||
      row.consumedBudget > 0,
  );
}

function isRowComplete(row: QuickPoRow): boolean {
  if (!row.assetCode.trim()) return false;
  return Boolean(row.cprId.trim() || row.poNumber.trim() || row.consumedBudget > 0);
}

function ensureTrailingEmptyRows(data: QuickPoRow[]): QuickPoRow[] {
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

function applyAssetDefaultsToRows(
  rows: QuickPoRow[],
  resolvedAssets: Map<string, EnrichedAsset | null>,
): QuickPoRow[] {
  let changed = false;
  const next = rows.map((row) => {
    const code = row.assetCode.trim().toLowerCase();
    if (!code) return row;
    const asset = resolvedAssets.get(code);
    if (!asset) return row;

    const patch: Partial<QuickPoRow> = {};
    if (!row.cprId.trim() && asset.cprId) patch.cprId = asset.cprId;
    if (!row.poNumber.trim() && asset.poNumber) patch.poNumber = asset.poNumber;
    if (!row.poDate.trim() && asset.poDate) patch.poDate = asset.poDate;
    if (!row.consumedBudget && asset.consumedBudget) patch.consumedBudget = asset.consumedBudget;
    if (Object.keys(patch).length === 0) return row;
    changed = true;
    return { ...row, ...patch };
  });
  return changed ? next : rows;
}

function statusLabel(row: QuickPoRow): string {
  if (row.status === 'pending') return 'Memproses…';
  if (row.message) return row.message;
  if (row.status === 'idle' && isRowFilled(row) && !isRowComplete(row)) {
    return 'Isi CPR ID, PO Number, atau PO Value';
  }
  return '—';
}

function statusClass(row: QuickPoRow): string {
  if (row.status === 'success') return 'text-emerald-700';
  if (row.status === 'error') return 'text-danger';
  if (row.status === 'pending') return 'text-siloam-blue';
  if (row.status === 'skipped') return 'text-siloam-text-secondary';
  return 'text-siloam-text-secondary';
}

export function QuickPoUpdateModal({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  lookupAssets,
  assetHasPOMap,
  initialAssetCode = '',
}: QuickPoUpdateModalProps) {
  const [rows, setRows] = useState<QuickPoRow[]>(() => [newRow()]);
  const [globalError, setGlobalError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resolvedAssets, setResolvedAssets] = useState<Map<string, EnrichedAsset | null>>(new Map());
  const prevRowsRef = useRef<QuickPoRow[]>([]);
  const lookupAssetsRef = useRef(lookupAssets);
  const resolvedAssetsRef = useRef(resolvedAssets);

  lookupAssetsRef.current = lookupAssets;
  resolvedAssetsRef.current = resolvedAssets;

  const assetCodesKey = useMemo(
    () =>
      [...new Set(rows.map((r) => r.assetCode.trim().toLowerCase()).filter(Boolean))]
        .sort()
        .join('\u0001'),
    [rows],
  );

  const commitResolvedAssets = useCallback((incoming: Map<string, EnrichedAsset | null>) => {
    const merged = mergeResolvedAssets(resolvedAssetsRef.current, incoming);
    if (merged === resolvedAssetsRef.current) return;

    resolvedAssetsRef.current = merged;
    setResolvedAssets(merged);

    setRows((prev) => {
      const next = applyAssetDefaultsToRows(prev, merged);
      if (next === prev) return prev;
      prevRowsRef.current = next;
      return next;
    });
  }, []);

  const resetForm = useCallback(() => {
    const empty = new Map<string, EnrichedAsset | null>();
    resolvedAssetsRef.current = empty;
    setRows([newRow()]);
    setGlobalError('');
    setResolvedAssets(empty);
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
    prevRowsRef.current = [];
  }, [isOpen, initialAssetCode]);

  useEffect(() => {
    if (!isOpen || !assetCodesKey) return;

    const codes = assetCodesKey.split('\u0001');
    const nextResolved = new Map<string, EnrichedAsset | null>();

    for (const code of codes) {
      const sync = findEnrichedAssetByCode(lookupAssetsRef.current, code);
      nextResolved.set(code, sync);
    }

    if (nextResolved.size > 0) {
      commitResolvedAssets(nextResolved);
    }
  }, [isOpen, assetCodesKey, commitResolvedAssets]);

  const handleDataChange = useCallback((newData: QuickPoRow[]) => {
    const normalized = ensureTrailingEmptyRows(
      newData.map((row) => {
        const prev = prevRowsRef.current.find((r) => r.id === row.id);
        const assetCodeChanged = Boolean(prev && prev.assetCode !== row.assetCode);

        return {
          ...row,
          cprId: assetCodeChanged ? '' : row.cprId,
          poNumber: assetCodeChanged ? '' : row.poNumber,
          poDate: assetCodeChanged ? '' : row.poDate,
          consumedBudget: assetCodeChanged ? 0 : row.consumedBudget,
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

  const assetHintForRow = useCallback(
    (row: QuickPoRow): string => {
      const code = row.assetCode.trim();
      if (!code) return '';
      const key = code.toLowerCase();
      const asset = resolvedAssets.get(key);
      if (asset) return asset.assetName;
      if (resolvedAssets.has(key)) return 'Asset tidak ditemukan';
      return '';
    },
    [resolvedAssets],
  );

  const columns = useMemo((): SpreadsheetColumn<QuickPoRow>[] => {
    return [
      {
        id: 'assetCode',
        header: 'Kode Asset',
        accessor: 'assetCode',
        isEditable: !isSubmitting,
        editorType: 'text',
      },
      {
        id: 'cprId',
        header: 'CPR ID',
        accessor: 'cprId',
        isEditable: !isSubmitting,
        editorType: 'text',
      },
      {
        id: 'poNumber',
        header: 'PO Number',
        accessor: 'poNumber',
        isEditable: !isSubmitting,
        editorType: 'text',
      },
      {
        id: 'poDate',
        header: 'Tgl PO',
        accessor: 'poDate',
        isEditable: !isSubmitting,
        editorType: 'date',
      },
      {
        id: 'consumedBudget',
        header: 'PO Value',
        accessor: 'consumedBudget',
        isEditable: !isSubmitting,
        isNumeric: true,
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
          return (
            <span className={isFound ? 'text-emerald-700' : 'text-amber-700'} title={hint}>
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
  }, [isSubmitting, assetHintForRow, resolvedAssets, rows.length, removeRow]);

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    setGlobalError('');

    if (partialRows.length > 0) {
      setGlobalError(
        'Beberapa baris belum lengkap. Isi kode asset dan minimal satu dari CPR ID, PO Number, atau PO Value — atau kosongkan baris yang tidak dipakai.',
      );
      return;
    }

    if (completableRows.length === 0) {
      setGlobalError('Isi minimal satu baris lengkap (kode asset + data PO).');
      return;
    }

    setIsSubmitting(true);
    const succeededAssetIds: string[] = [];
    let successCount = 0;
    let failCount = 0;

    const patchRow = (id: string, patch: Partial<QuickPoRow>) => {
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

      const asset = findEnrichedAssetByCode(lookupAssetsRef.current, row.assetCode);
      if (!asset) {
        failCount += 1;
        patchRow(row.id, { status: 'error', message: 'Asset tidak ditemukan' });
        continue;
      }

      const poDate =
        row.poDate.trim() ||
        (row.poNumber.trim() || row.cprId.trim() || row.consumedBudget > 0
          ? new Date().toISOString().slice(0, 10)
          : undefined);

      const updatedAsset: EnrichedAsset = {
        ...asset,
        cprId: row.cprId.trim() || undefined,
        poNumber: row.poNumber.trim() || undefined,
        poDate,
        consumedBudget: row.consumedBudget || 0,
      };

      try {
        const saved = await savePoChangedAssetsViaBackend(currentUser.id, [updatedAsset]);
        if (!saved) {
          failCount += 1;
          patchRow(row.id, { status: 'error', message: 'Gagal simpan (backend)' });
          continue;
        }

        const hasPoData =
          Boolean(updatedAsset.poNumber?.trim()) || (updatedAsset.consumedBudget ?? 0) > 0;
        if (hasPoData && !assetHasPOMap.get(asset.id)) {
          await taskService.triggerSystemTask(asset.id, 'PO_CREATED', currentUser, {
            completedAt: poDateToTaskCompletedAt(updatedAsset.poDate),
          });
        }

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
      setGlobalError('Tidak ada PO yang berhasil disimpan. Periksa pesan error per baris.');
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
      aria-labelledby="quick-po-update-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-5xl flex-col rounded-xl border border-siloam-border bg-siloam-surface shadow-soft">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-siloam-border p-5">
          <div>
            <h3 id="quick-po-update-title" className="text-lg font-bold text-siloam-text-primary">
              Quick Edit PO
            </h3>
            <p className="mt-1 text-sm text-siloam-text-secondary">
              Mode spreadsheet — paste dari Excel (Kode Asset, CPR ID, PO Number, Tgl PO, PO Value). Nama asset
              terisi otomatis setelah kode dikenali.
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
