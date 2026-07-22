import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ClipboardPaste, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { User } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import * as dataManagementService from '../../../services/dataManagementService';
import {
  MigrationTarget,
  MigrationField,
  MigrationRowValidation,
} from '../../../services/dataManagementService';
import { SpreadsheetTable, SpreadsheetColumn } from '../SpreadsheetTable/SpreadsheetTable';
import { useDataMigrationSetupOptions } from '../../../hooks/useDataMigrationSetupOptions';

interface SpreadsheetMigrationPanelProps {
  currentUser: User;
  onComplete: () => void;
}

type MigrationSpreadsheetRow = Record<string, string | number> & { id: string };

const PERIOD_TARGETS: MigrationTarget[] = [
  'Projects',
  'Assets',
  'BudgetPeriod',
  'BudgetArchetype',
  'BudgetHospitalUnit',
];

const DEFAULT_EMPTY_ROWS = 5;

const TARGET_OPTIONS: { group: string; items: { value: MigrationTarget; label: string }[] }[] = [
  {
    group: 'Project & Asset Data',
    items: [
      { value: 'Projects', label: 'Projects (Budget Plan)' },
      { value: 'Assets', label: 'Assets (Requires Project Code)' },
    ],
  },
  {
    group: 'Master Data',
    items: [
      { value: 'Vendors', label: 'Vendors' },
      { value: 'MasterCatalogue', label: 'Master Catalogue' },
      { value: 'Rooms', label: 'Rooms' },
      { value: 'BudgetCategories', label: 'Budget Categories' },
      { value: 'ProjectPriorities', label: 'Project Priorities' },
      { value: 'HospitalUnits', label: 'Hospital Units' },
      { value: 'Archetypes', label: 'Networks' },
      { value: 'Regionals', label: 'Regionals' },
      { value: 'AssetTypes', label: 'Asset Types' },
    ],
  },
  {
    group: 'Budget Planning',
    items: [
      { value: 'BudgetPeriod', label: 'Budget Period (Category Budget)' },
      { value: 'BudgetArchetype', label: 'Budget Network (Per Category)' },
      { value: 'BudgetHospitalUnit', label: 'Budget Hospital Unit (Per Category)' },
    ],
  },
  {
    group: 'Feasibility Study',
    items: [{ value: 'FeasibilityStudies', label: 'Feasibility Studies (by Project Code)' }],
  },
  {
    group: 'System Data',
    items: [
      { value: 'TaskUpdates', label: 'Task Updates (Set Status to Done)' },
      { value: 'MOMNotes', label: 'MOM Notes (by Asset Code)' },
      { value: 'Users', label: 'Users (Name, Email, Role, Scope)' },
    ],
  },
];

function buildInitialRows(schema: MigrationField[], count = DEFAULT_EMPTY_ROWS): MigrationSpreadsheetRow[] {
  return Array.from({ length: count }, (_, index) =>
    dataManagementService.createEmptyMigrationSpreadsheetRow(schema, `row-init-${index}`),
  ) as MigrationSpreadsheetRow[];
}

function SpreadsheetMigrationPanelInner({ currentUser, onComplete }: SpreadsheetMigrationPanelProps) {
  const { showToast } = useToast();
  const executeLockRef = useRef(false);
  const pasteAreaRef = useRef<HTMLDivElement>(null);

  const [target, setTarget] = useState<MigrationTarget>('Projects');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState('');
  const [rows, setRows] = useState<MigrationSpreadsheetRow[]>([]);
  const [validationErrors, setValidationErrors] = useState<MigrationRowValidation[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<dataManagementService.MigrationResult | null>(null);
  const [migrationProgress, setMigrationProgress] =
    useState<dataManagementService.MigrationProgress | null>(null);

  const needsPeriod = PERIOD_TARGETS.includes(target);
  const needsWorkflowSets = target === 'Assets';

  const { periods, workflows, periodsLoading, workflowsLoading } = useDataMigrationSetupOptions({
    needsWorkflowSets,
  });

  const currentSchema = useMemo(
    () => dataManagementService.getMigrationSchema(target),
    [target],
  );

  useEffect(() => {
    if (!selectedPeriod && periods.length > 0) {
      setSelectedPeriod(periods[0].periodName);
    }
  }, [periods, selectedPeriod]);

  useEffect(() => {
    if (target !== 'Assets') {
      setSelectedAssetType('');
    } else if (workflows.length > 0 && !selectedAssetType) {
      setSelectedAssetType(workflows[0].id);
    }
  }, [target, workflows, selectedAssetType]);

  useEffect(() => {
    setRows(buildInitialRows(currentSchema));
    setValidationErrors([]);
    setResult(null);
  }, [target, currentSchema]);

  const columns: SpreadsheetColumn<MigrationSpreadsheetRow>[] = useMemo(
    () => [
      ...currentSchema.map((field) => ({
        id: field.key,
        header: `${field.label}${field.required ? ' *' : ''}`,
        accessor: field.key as keyof MigrationSpreadsheetRow,
        isEditable: true,
        isNumeric: field.type === 'number',
        editorType: field.type === 'date' ? ('date' as const) : field.type === 'number' ? ('number' as const) : ('text' as const),
        numericDisplay: 'plain' as const,
        align: field.type === 'number' ? ('right' as const) : ('left' as const),
      })),
      {
        id: '_actions',
        header: '',
        accessor: (item: MigrationSpreadsheetRow) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setRows((prev) => prev.filter((row) => row.id !== item.id));
            }}
            className="p-1.5 text-siloam-text-secondary hover:text-danger rounded-md hover:bg-red-50"
            title="Hapus baris"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        ),
        align: 'center' as const,
      },
    ],
    [currentSchema],
  );

  const nonEmptyRowCount = useMemo(
    () => dataManagementService.filterNonEmptyMigrationRows(rows, currentSchema).length,
    [rows, currentSchema],
  );

  const runValidation = useCallback(() => {
    const errors = dataManagementService.validateMigrationSpreadsheetRows(rows, currentSchema);
    setValidationErrors(errors);
    return errors.length === 0 && nonEmptyRowCount > 0;
  }, [rows, currentSchema, nonEmptyRowCount]);

  useEffect(() => {
    if (nonEmptyRowCount > 0) {
      setValidationErrors(dataManagementService.validateMigrationSpreadsheetRows(rows, currentSchema));
    } else {
      setValidationErrors([]);
    }
  }, [rows, currentSchema, nonEmptyRowCount]);

  const handleAddRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      dataManagementService.createEmptyMigrationSpreadsheetRow(currentSchema) as MigrationSpreadsheetRow,
    ]);
  }, [currentSchema]);

  const handleClearRows = useCallback(() => {
    setRows(buildInitialRows(currentSchema));
    setResult(null);
    setValidationErrors([]);
  }, [currentSchema]);

  const handlePasteFromClipboard = useCallback(
    async (text?: string) => {
      let clipboardText = text;
      if (!clipboardText) {
        try {
          clipboardText = await navigator.clipboard.readText();
        } catch {
          showToast('Tidak dapat membaca clipboard. Gunakan Ctrl+V di area tabel.', 'error');
          return;
        }
      }
      if (!clipboardText.trim()) {
        showToast('Clipboard kosong.', 'error');
        return;
      }

      const pastedRows = dataManagementService.parseClipboardToMigrationRows(
        clipboardText,
        currentSchema,
        target,
      );
      if (pastedRows.length === 0) {
        showToast('Tidak ada data valid di clipboard. Pastikan format tab-separated (dari Excel/Sheets).', 'error');
        return;
      }

      setRows((prev) => {
        const hasContent = dataManagementService.filterNonEmptyMigrationRows(prev, currentSchema).length > 0;
        const base = hasContent ? prev : [];
        return [
          ...base,
          ...(pastedRows as MigrationSpreadsheetRow[]),
        ];
      });
      showToast(`${pastedRows.length} baris ditempel dari clipboard.`, 'success');
    },
    [currentSchema, target, showToast],
  );

  const handleContainerPaste = useCallback(
    (e: React.ClipboardEvent) => {
      const text = e.clipboardData.getData('text');
      if (!text.trim()) return;
      e.preventDefault();
      void handlePasteFromClipboard(text);
    },
    [handlePasteFromClipboard],
  );

  const handleExecute = useCallback(async () => {
    if (executeLockRef.current) return;
    if (needsPeriod && !selectedPeriod) {
      showToast('Pilih Target Period sebelum melanjutkan.', 'error');
      return;
    }
    if (target === 'Assets' && !selectedAssetType) {
      showToast('Pilih Asset Type sebelum melanjutkan.', 'error');
      return;
    }
    if (!runValidation()) {
      showToast('Perbaiki error validasi sebelum migrasi.', 'error');
      return;
    }

    const dataRows = dataManagementService.filterNonEmptyMigrationRows(rows, currentSchema);
    const file = dataManagementService.buildMigrationFileFromRows(dataRows, currentSchema);
    const mapping = dataManagementService.buildMigrationMappingFromSchema(currentSchema);

    executeLockRef.current = true;
    setIsProcessing(true);
    setMigrationProgress(null);

    try {
      const res = await dataManagementService.executeSmartMigration(
        target,
        selectedPeriod,
        file,
        mapping,
        currentUser,
        target === 'Assets' ? selectedAssetType : undefined,
        (p) => setMigrationProgress(p),
      );
      setResult(res);
      if (res.success) {
        showToast('Migrasi spreadsheet selesai.', 'success');
        onComplete();
      }
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Proses migrasi gagal secara tak terduga.';
      showToast(msg, 'error');
    } finally {
      executeLockRef.current = false;
      setIsProcessing(false);
      setMigrationProgress(null);
    }
  }, [
    currentSchema,
    currentUser,
    needsPeriod,
    onComplete,
    rows,
    runValidation,
    selectedAssetType,
    selectedPeriod,
    showToast,
    target,
  ]);

  const progressPct = useMemo(() => {
    if (!migrationProgress || migrationProgress.totalRows <= 0) return 0;
    return Math.min(
      100,
      Math.round((migrationProgress.processedRows / migrationProgress.totalRows) * 100),
    );
  }, [migrationProgress]);

  if (result) {
    return (
      <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden">
        <div className="p-8 space-y-6 text-center animate-fade-in">
          <h3 className="text-2xl font-bold text-siloam-text-primary">
            {!result.success
              ? 'Migrasi gagal (error kritis)'
              : result.failedCount > 0
                ? 'Migrasi selesai — ada baris yang gagal'
                : 'Migrasi selesai'}
          </h3>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto text-left">
            <div className="bg-siloam-bg p-4 rounded-xl">
              <p className="text-xs text-siloam-text-secondary uppercase font-bold">Baris data</p>
              <p className="text-xl font-bold">{result.totalRows}</p>
            </div>
            <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
              <p className="text-xs text-emerald-800 uppercase font-bold">Baru (insert)</p>
              <p className="text-xl font-bold text-emerald-800">{result.insertedCount ?? 0}</p>
            </div>
            <div className="bg-amber-50 p-4 rounded-xl border border-amber-100">
              <p className="text-xs text-amber-900 uppercase font-bold">Diperbarui</p>
              <p className="text-xl font-bold text-amber-900">{result.updatedCount ?? 0}</p>
            </div>
            <div className="bg-slate-100 p-4 rounded-xl border border-slate-200">
              <p className="text-xs text-slate-700 uppercase font-bold">Dilewati</p>
              <p className="text-xl font-bold text-slate-800">{result.skippedCount ?? 0}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-xl border border-green-100">
              <p className="text-xs text-green-800 uppercase font-bold">Total berhasil</p>
              <p className="text-xl font-bold text-green-800">{result.successCount ?? 0}</p>
            </div>
            <div className="bg-red-50 p-4 rounded-xl border border-red-100">
              <p className="text-xs text-red-800 uppercase font-bold">Gagal</p>
              <p className="text-xl font-bold text-red-800">{result.failedCount}</p>
            </div>
          </div>

          {(result.warnings?.length ?? 0) > 0 && (
            <div className="text-left bg-amber-50 border border-amber-200 p-4 rounded-xl max-h-40 overflow-y-auto max-w-3xl mx-auto">
              <p className="font-bold text-amber-900 mb-2">Koreksi / informasi:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-amber-950">
                {result.warnings!.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length > 0 && (
            <div className="text-left bg-red-50 border border-red-200 p-4 rounded-xl max-h-48 overflow-y-auto max-w-3xl mx-auto">
              <p className="font-bold text-red-800 mb-2">Error:</p>
              <ul className="list-disc pl-5 space-y-1 text-sm text-red-700">
                {result.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setResult(null);
              handleClearRows();
            }}
            className="px-6 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
          >
            Migrasi Baru
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden flex flex-col">
      <div className="bg-siloam-bg p-6 border-b border-siloam-border">
        <h2 className="text-xl font-bold text-siloam-text-primary">Spreadsheet Migration</h2>
        <p className="text-sm text-siloam-text-secondary mt-1">
          Tempel langsung data dari Excel atau Google Sheets — tanpa perlu upload file.
        </p>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
              Migration Target
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as MigrationTarget)}
              className="w-full p-3 border border-siloam-border rounded-xl bg-white focus:ring-2 focus:ring-siloam-blue outline-none"
            >
              {TARGET_OPTIONS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.items.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {needsPeriod && (
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                Target Period
              </label>
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                disabled={periodsLoading && periods.length === 0}
                className="w-full p-3 border border-siloam-border rounded-xl bg-white focus:ring-2 focus:ring-siloam-blue outline-none disabled:opacity-60"
              >
                {periodsLoading && periods.length === 0 ? (
                  <option value="">Memuat periode…</option>
                ) : (
                  periods.map((p) => (
                    <option key={p.periodName} value={p.periodName}>
                      {p.periodName}
                    </option>
                  ))
                )}
              </select>
            </div>
          )}
        </div>

        {needsWorkflowSets && (
          <div>
            <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
              Asset Type (Workflow) <span className="text-red-500">*</span>
            </label>
            <select
              value={selectedAssetType}
              onChange={(e) => setSelectedAssetType(e.target.value)}
              disabled={workflowsLoading && workflows.length === 0}
              className="w-full p-3 border border-siloam-border rounded-xl bg-white focus:ring-2 focus:ring-siloam-blue outline-none disabled:opacity-60"
            >
              {workflowsLoading && workflows.length === 0 ? (
                <option value="">Memuat workflow…</option>
              ) : (
                <>
                  <option value="">-- Pilih Asset Type --</option>
                  {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                      {wf.name} ({wf.id})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>
        )}

        <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 p-4 rounded-xl flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-emerald-100 text-emerald-700 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
              <ClipboardPaste className="w-5 h-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-emerald-900">Cara paste dari Excel / Sheets</p>
              <p className="text-xs text-emerald-800 mt-0.5">
                Copy baris data (termasuk header opsional), lalu klik tombol Paste atau tekan{' '}
                <kbd className="px-1 py-0.5 bg-white rounded border text-[10px]">Ctrl+V</kbd> di area
                tabel. Kolom akan otomatis dipetakan.
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => void handlePasteFromClipboard()}
              className="flex items-center gap-2 px-4 py-2 bg-white text-emerald-700 border border-emerald-300 rounded-lg text-sm font-medium hover:bg-emerald-50 transition-colors shadow-sm"
            >
              <ClipboardPaste className="w-4 h-4" />
              Paste dari Clipboard
            </button>
            <button
              type="button"
              onClick={handleAddRow}
              className="flex items-center gap-2 px-4 py-2 bg-white text-siloam-text-primary border border-siloam-border rounded-lg text-sm font-medium hover:bg-siloam-bg transition-colors shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Tambah Baris
            </button>
            <button
              type="button"
              onClick={handleClearRows}
              className="flex items-center gap-2 px-4 py-2 bg-white text-siloam-text-secondary border border-siloam-border rounded-lg text-sm font-medium hover:bg-siloam-bg transition-colors shadow-sm"
            >
              <RotateCcw className="w-4 h-4" />
              Reset
            </button>
          </div>
        </div>

        {currentSchema.some((f) => f.description) && (
          <details className="text-sm text-siloam-text-secondary">
            <summary className="cursor-pointer font-medium text-siloam-text-primary">
              Panduan kolom ({currentSchema.length} kolom)
            </summary>
            <ul className="mt-2 space-y-1 pl-4 list-disc">
              {currentSchema.map((field) => (
                <li key={field.key}>
                  <span className="font-medium">{field.label}</span>
                  {field.required ? ' (wajib)' : ' (opsional)'}
                  {field.description ? ` — ${field.description}` : ''}
                </li>
              ))}
            </ul>
          </details>
        )}

        {isProcessing && migrationProgress && (
          <div className="p-4 rounded-xl border border-siloam-blue/30 bg-blue-50/90">
            <p className="text-xs font-semibold text-siloam-blue">{progressPct}%</p>
            <p className="text-sm font-semibold text-siloam-text-primary">{migrationProgress.message}</p>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-siloam-blue transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        <div
          ref={pasteAreaRef}
          onPaste={handleContainerPaste}
          tabIndex={0}
          className="outline-none focus:ring-2 focus:ring-siloam-blue/30 rounded-xl"
        >
          <SpreadsheetTable
            columns={columns}
            data={rows}
            onDataChange={setRows}
            rowHeaderAccessor="id"
            maxHeight="min(60vh, 520px)"
            createRowOnPaste={() =>
              dataManagementService.createEmptyMigrationSpreadsheetRow(currentSchema) as MigrationSpreadsheetRow
            }
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-siloam-text-secondary">
            {nonEmptyRowCount} baris siap diimpor
            {validationErrors.length > 0 && (
              <span className="text-danger ml-2">• {validationErrors.length} error validasi</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleExecute()}
            disabled={isProcessing || nonEmptyRowCount === 0 || validationErrors.length > 0}
            className="px-6 py-2.5 rounded-xl bg-siloam-green text-white hover:bg-siloam-green/90 disabled:bg-gray-300 transition flex items-center gap-2 font-medium"
          >
            {isProcessing && (
              <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
            )}
            {isProcessing ? 'Memproses migrasi…' : 'Jalankan Migrasi'}
          </button>
        </div>

        {validationErrors.length > 0 && (
          <div className="text-left bg-red-50 border border-red-200 p-4 rounded-xl max-h-36 overflow-y-auto">
            <p className="font-bold text-red-800 mb-2 text-sm">Validasi gagal:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-sm text-red-700">
              {validationErrors.slice(0, 20).map((err, i) => (
                <li key={i}>
                  Baris {err.rowIndex}: {err.message}
                </li>
              ))}
              {validationErrors.length > 20 && (
                <li>…dan {validationErrors.length - 20} error lainnya</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

export const SpreadsheetMigrationPanel = memo(SpreadsheetMigrationPanelInner);
