'use client';

import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { FileSpreadsheet, X } from 'lucide-react';
import type { User } from '@/types';
import * as dataManagementService from '@/services/dataManagementService';
import type { MigrationField } from '@/services/dataManagementService';
import { GenericTable, type Column } from '@/components/organisms/GenericTable/GenericTable';

const MIGRATION_TARGET = 'FsUpdates' as const;
const PREVIEW_ROW_LIMIT = 5;

const STEPS = [
  { id: 1, label: 'Upload' },
  { id: 2, label: 'Map Columns' },
  { id: 3, label: 'Preview' },
  { id: 4, label: 'Result' },
] as const;

type MappingRowProps = {
  header: string;
  isMapped: boolean;
  value: string;
  schema: MigrationField[];
  onChange: (header: string, sysKey: string) => void;
};

const MappingRow = memo(function MappingRow({
  header,
  isMapped,
  value,
  schema,
  onChange,
}: MappingRowProps) {
  return (
    <div
      className={`grid grid-cols-[1fr_auto_1fr] gap-4 items-center p-3 rounded-lg border ${
        isMapped ? 'border-siloam-green/30 bg-siloam-green/5' : 'border-orange-200 bg-orange-50'
      }`}
    >
      <div className="text-siloam-text-primary font-medium truncate" title={header}>
        {header}
      </div>
      <div className="text-siloam-text-secondary">→</div>
      <select
        value={value}
        onChange={(e) => onChange(header, e.target.value)}
        className="w-full p-2 border border-siloam-border rounded-lg bg-white focus:ring-1 focus:ring-siloam-blue text-sm"
      >
        <option value="">-- Ignore --</option>
        {schema.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label} {field.required ? '*' : ''}
          </option>
        ))}
      </select>
    </div>
  );
});

export type FsSmartMigrationModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  currentUser: User;
  periodName: string;
  showToast: (message: string, type?: 'success' | 'error') => void;
};

function FsSmartMigrationModalInner({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  periodName,
  showToast,
}: FsSmartMigrationModalProps) {
  const executeLockRef = useRef(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [previewRawData, setPreviewRawData] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<dataManagementService.MigrationResult | null>(null);
  const [migrationProgress, setMigrationProgress] =
    useState<dataManagementService.MigrationProgress | null>(null);

  const currentSchema = useMemo(
    () => dataManagementService.getMigrationSchema(MIGRATION_TARGET),
    [],
  );

  const resetState = useCallback(() => {
    setCurrentStep(1);
    setFile(null);
    setFileHeaders([]);
    setPreviewRawData([]);
    setMapping({});
    setResult(null);
    setMigrationProgress(null);
  }, []);

  const handleClose = useCallback(() => {
    if (isProcessing) return;
    resetState();
    onClose();
  }, [isProcessing, onClose, resetState]);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const uploadedFile = acceptedFiles[0];
      setFile(uploadedFile);

      try {
        const [headers, previewRows] = await Promise.all([
          dataManagementService.parseExcelHeaders(uploadedFile),
          dataManagementService.parseExcelPreviewData(uploadedFile, PREVIEW_ROW_LIMIT),
        ]);
        setFileHeaders(headers);
        setPreviewRawData(previewRows);
        setMapping(
          dataManagementService.generateAutoMapping(headers, currentSchema, MIGRATION_TARGET),
        );
      } catch {
        showToast('Gagal membaca file Excel. Periksa format file.', 'error');
        setFile(null);
        setFileHeaders([]);
        setPreviewRawData([]);
        setMapping({});
      }
    },
    [currentSchema, showToast],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
    disabled: isProcessing,
  });

  const handleMappingChange = useCallback((header: string, sysKey: string) => {
    setMapping((prev) => ({ ...prev, [header]: sysKey }));
  }, []);

  const isMappingValid = useCallback(() => {
    const requiredFields = currentSchema.filter((f) => f.required);
    const mappedKeys = new Set(Object.values(mapping));
    return requiredFields.every((f) => mappedKeys.has(f.key));
  }, [currentSchema, mapping]);

  const previewTransformedData = useMemo(
    () => dataManagementService.transformMigrationPreviewRows(previewRawData, mapping, currentSchema),
    [previewRawData, mapping, currentSchema],
  );

  const previewColumns: Column<Record<string, unknown>>[] = useMemo(
    () =>
      currentSchema.map((field) => ({
        header: field.label + (field.required ? ' *' : ''),
        accessor: (item: Record<string, unknown>) => {
          const val = item[field.key];
          let isValid = true;
          if (field.required && (val === undefined || val === '')) isValid = false;
          if (
            field.type === 'number' &&
            val !== undefined &&
            val !== '' &&
            typeof val === 'string' &&
            isNaN(Number(val))
          ) {
            isValid = false;
          }
          const display =
            field.type === 'number' && typeof val === 'number' && Number.isFinite(val)
              ? val.toLocaleString('id-ID')
              : val !== undefined && val !== null && val !== ''
                ? String(val)
                : '-';
          return (
            <span
              className={
                isValid
                  ? 'text-siloam-text-primary'
                  : 'text-danger font-bold bg-red-100 px-1 rounded'
              }
            >
              {display}
            </span>
          );
        },
      })),
    [currentSchema],
  );

  const handleExecute = useCallback(async () => {
    if (!file || executeLockRef.current) return;
    if (!periodName.trim()) {
      showToast('Pilih budget period terlebih dahulu.', 'error');
      return;
    }
    if (!isMappingValid()) {
      showToast('Mapping belum lengkap. Pastikan kolom Project Code (*) sudah dipetakan.', 'error');
      return;
    }

    executeLockRef.current = true;
    setIsProcessing(true);
    setMigrationProgress(null);

    try {
      const res = await dataManagementService.executeSmartMigration(
        MIGRATION_TARGET,
        periodName,
        file,
        mapping,
        currentUser,
        undefined,
        (p) => setMigrationProgress(p),
      );
      setResult(res);
      setCurrentStep(4);
      if (res.successCount > 0) {
        showToast(
          res.successCount === 1
            ? '1 project FS berhasil diperbarui dari Excel.'
            : `${res.successCount} project FS berhasil diperbarui dari Excel.`,
          'success',
        );
        onSuccess();
      }
    } catch (e) {
      console.error(e);
      showToast(e instanceof Error ? e.message : 'Proses migrasi gagal.', 'error');
    } finally {
      executeLockRef.current = false;
      setIsProcessing(false);
    }
  }, [file, isMappingValid, mapping, currentUser, periodName, showToast, onSuccess]);

  const progressPct = useMemo(() => {
    if (!migrationProgress || migrationProgress.totalRows <= 0) return 0;
    if (migrationProgress.stage === 'done') return 100;
    const base = migrationProgress.processedRows / migrationProgress.totalRows;
    return Math.min(100, Math.max(0, Math.round(base * 100)));
  }, [migrationProgress]);

  const progressDetail = useMemo(() => {
    if (!migrationProgress) return '';
    const stage = dataManagementService.migrationProgressStageLabel(migrationProgress.stage);
    const parts = [
      `Tahap: ${stage}`,
      `Baris ${migrationProgress.processedRows.toLocaleString('id-ID')} / ${migrationProgress.totalRows.toLocaleString('id-ID')}`,
    ];
    if (migrationProgress.savedCount != null) {
      parts.push(`Tersimpan: ${migrationProgress.savedCount.toLocaleString('id-ID')}`);
    }
    if (migrationProgress.failedCount != null && migrationProgress.failedCount > 0) {
      parts.push(`Gagal: ${migrationProgress.failedCount.toLocaleString('id-ID')}`);
    }
    if (migrationProgress.partialSaveIndex != null && migrationProgress.stage === 'saving') {
      parts.push(`Batch #${migrationProgress.partialSaveIndex}`);
    }
    return parts.join(' · ');
  }, [migrationProgress]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fs-smart-migration-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col rounded-xl border border-siloam-border bg-siloam-surface shadow-soft">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-siloam-border p-5">
          <div>
            <h3 id="fs-smart-migration-title" className="text-lg font-bold text-siloam-text-primary flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-siloam-blue" />
              Smart Migration — FS Data
            </h3>
            <p className="mt-1 text-sm text-siloam-text-secondary">
              Import AX Code, Approved Budget, Target Budget Start, dan Budget Revenue / Month dari Excel.
              Project dicocokkan berdasarkan Kode Project di periode <strong>{periodName}</strong>.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="shrink-0 rounded-lg p-1 text-siloam-text-secondary hover:bg-siloam-bg disabled:opacity-50"
            aria-label="Tutup"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex shrink-0 gap-2 border-b border-siloam-border px-5 py-3">
          {STEPS.map((step) => (
            <div
              key={step.id}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                currentStep === step.id
                  ? 'bg-siloam-blue text-white'
                  : currentStep > step.id
                    ? 'bg-siloam-green/10 text-emerald-700'
                    : 'bg-siloam-bg text-siloam-text-secondary'
              }`}
            >
              <span>{step.id}</span>
              <span>{step.label}</span>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5">
          {currentStep === 1 ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Belum punya template?</p>
                  <p className="text-xs text-blue-700">
                    Download template Excel dengan kolom Project Code, AX Code, Approved Budget, Target
                    Budget Start, Budget Revenue / Month.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => dataManagementService.downloadMigrationTemplate(MIGRATION_TARGET)}
                  className="shrink-0 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50"
                >
                  Download Template
                </button>
              </div>

              <div
                {...getRootProps()}
                className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
                  isDragActive
                    ? 'border-siloam-blue bg-siloam-blue/5'
                    : 'border-siloam-border hover:bg-siloam-bg'
                }`}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div>
                    <p className="font-bold text-siloam-text-primary">{file.name}</p>
                    <p className="text-sm text-siloam-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
                    <p className="mt-2 text-sm text-siloam-blue">Klik untuk ganti file</p>
                  </div>
                ) : (
                  <div>
                    <p className="font-medium text-siloam-text-primary">Drag & drop file Excel/CSV di sini</p>
                    <p className="text-sm text-siloam-text-secondary">atau klik untuk browse</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {currentStep === 2 ? (
            <div className="space-y-4">
              <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
                Kolom dipetakan otomatis. Pastikan <strong>Project Code *</strong> sudah benar, lalu sesuaikan
                AX Code / Approved Budget / Target Budget Start / Budget Revenue jika perlu.
              </p>
              <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                {fileHeaders.map((header) => (
                  <MappingRow
                    key={header}
                    header={header}
                    isMapped={!!mapping[header]}
                    value={mapping[header] || ''}
                    schema={currentSchema}
                    onChange={handleMappingChange}
                  />
                ))}
              </div>
              {!isMappingValid() ? (
                <p className="text-sm text-danger">Kolom wajib Project Code (*) belum dipetakan.</p>
              ) : null}
            </div>
          ) : null}

          {currentStep === 3 ? (
            <div className="space-y-4">
              <p className="text-sm text-siloam-text-secondary">
                Preview {PREVIEW_ROW_LIMIT} baris pertama setelah mapping.
              </p>
              <div className="overflow-hidden rounded-xl border border-siloam-border">
                <GenericTable columns={previewColumns} data={previewTransformedData} />
              </div>
              {isProcessing && migrationProgress ? (
                <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-siloam-text-primary">
                        {migrationProgress.message || 'Memproses migrasi FS…'}
                      </p>
                      <p className="mt-1 text-xs text-siloam-text-secondary">{progressDetail}</p>
                    </div>
                    <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-sm font-bold text-siloam-blue shadow-sm">
                      {progressPct}%
                    </span>
                  </div>
                  <div className="h-3 overflow-hidden rounded-full bg-white/80 shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-siloam-blue to-indigo-500 transition-all duration-300 ease-out"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {migrationProgress.stage === 'saving' ? (
                    <p className="text-xs text-blue-800">
                      Data FS disimpan bertahap ke database — baris yang sudah masuk tetap tersimpan meski
                      proses belum selesai.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {currentStep === 4 && result ? (
            <div className="space-y-4 text-center">
              <h4 className="text-xl font-bold text-siloam-text-primary">
                {result.failedCount > 0 && result.successCount > 0
                  ? 'Migrasi selesai — sebagian baris gagal'
                  : result.successCount > 0
                    ? 'Migrasi FS berhasil'
                    : 'Migrasi gagal'}
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-2xl mx-auto">
                <div className="rounded-xl bg-siloam-bg p-3">
                  <p className="text-xs uppercase text-siloam-text-secondary">Baris file</p>
                  <p className="text-xl font-bold">{result.totalRows}</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-3">
                  <p className="text-xs uppercase text-amber-900">Diperbarui</p>
                  <p className="text-xl font-bold text-amber-900">{result.updatedCount}</p>
                </div>
                <div className="rounded-xl bg-green-50 border border-green-100 p-3">
                  <p className="text-xs uppercase text-green-800">Berhasil</p>
                  <p className="text-xl font-bold text-green-800">{result.successCount}</p>
                </div>
                <div className="rounded-xl bg-red-50 border border-red-100 p-3">
                  <p className="text-xs uppercase text-red-800">Gagal</p>
                  <p className="text-xl font-bold text-red-800">{result.failedCount}</p>
                </div>
              </div>
              {result.errors.length > 0 ? (
                <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-left text-xs text-red-800">
                  {result.errors.slice(0, 20).map((err) => (
                    <p key={err}>{err}</p>
                  ))}
                  {result.errors.length > 20 ? (
                    <p className="mt-1 font-semibold">…dan {result.errors.length - 20} error lainnya</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex shrink-0 justify-between gap-2 border-t border-siloam-border p-5">
          <button
            type="button"
            onClick={handleClose}
            disabled={isProcessing}
            className="rounded-xl border border-siloam-border px-4 py-2 text-sm hover:bg-siloam-bg disabled:opacity-50"
          >
            {currentStep === 4 ? 'Tutup' : 'Batal'}
          </button>
          <div className="flex gap-2">
            {currentStep > 1 && currentStep < 4 ? (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => setCurrentStep((s) => Math.max(1, s - 1))}
                className="rounded-xl border border-siloam-border px-4 py-2 text-sm hover:bg-siloam-bg disabled:opacity-50"
              >
                Back
              </button>
            ) : null}
            {currentStep === 1 ? (
              <button
                type="button"
                disabled={!file}
                onClick={() => setCurrentStep(2)}
                className="rounded-xl bg-siloam-blue px-4 py-2 text-sm text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
              >
                Next: Map Columns
              </button>
            ) : null}
            {currentStep === 2 ? (
              <button
                type="button"
                disabled={!isMappingValid()}
                onClick={() => setCurrentStep(3)}
                className="rounded-xl bg-siloam-blue px-4 py-2 text-sm text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
              >
                Next: Preview
              </button>
            ) : null}
            {currentStep === 3 ? (
              <button
                type="button"
                disabled={isProcessing}
                onClick={() => void handleExecute()}
                className="rounded-xl bg-siloam-blue px-4 py-2 text-sm text-white hover:bg-siloam-blue/90 disabled:bg-gray-400"
              >
                {isProcessing ? 'Memproses…' : 'Jalankan Migrasi'}
              </button>
            ) : null}
            {currentStep === 4 ? (
              <button
                type="button"
                onClick={() => {
                  resetState();
                }}
                className="rounded-xl bg-siloam-blue px-4 py-2 text-sm text-white hover:bg-siloam-blue/90"
              >
                Import Lagi
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

export const FsSmartMigrationModal = memo(FsSmartMigrationModalInner);
