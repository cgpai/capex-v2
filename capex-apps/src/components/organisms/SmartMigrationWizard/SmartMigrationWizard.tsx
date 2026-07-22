import React, { memo, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { User } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import * as dataManagementService from '../../../services/dataManagementService';
import { MigrationTarget, MigrationField } from '../../../services/dataManagementService';
import { GenericTable, Column } from '../GenericTable/GenericTable';
import { useDataMigrationSetupOptions } from '../../../hooks/useDataMigrationSetupOptions';

interface SmartMigrationWizardProps {
  currentUser: User;
  onComplete: () => void;
}

const STEPS = [
  { id: 1, label: 'Setup' },
  { id: 2, label: 'Map Columns' },
  { id: 3, label: 'Preview' },
  { id: 4, label: 'Result' },
] as const;

const PERIOD_TARGETS: MigrationTarget[] = [
  'Projects',
  'Assets',
  'BudgetPeriod',
  'BudgetArchetype',
  'BudgetHospitalUnit',
];

const PREVIEW_ROW_LIMIT = 5;

const getTargetSuccessMessage = (target: MigrationTarget): string => {
  const messages: Record<MigrationTarget, string> = {
    Projects:
      'Data has been saved successfully. You can now view the projects in the Budget HU page or other project listing pages.',
    Assets:
      'Data has been saved successfully. You can now view the assets in the Capex Project List page or Asset Management pages.',
    Vendors: 'Data has been saved successfully. You can now use these vendors when creating Purchase Orders.',
    MasterCatalogue:
      'Data has been saved successfully. You can now use these catalogue items in projects and assets.',
    Rooms: 'Data has been saved successfully. You can now use these rooms in project pipeline planning.',
    BudgetCategories:
      'Data has been saved successfully. You can now use these categories in budget planning.',
    ProjectPriorities:
      'Data has been saved successfully. You can now use these priorities when creating projects.',
    HospitalUnits:
      'Data has been saved successfully. You can now use these hospital units in budget planning and project configuration.',
    Archetypes:
      'Data has been saved successfully. You can now use these networks in budget planning and project configuration.',
    Regionals:
      'Data has been saved successfully. You can now use these regionals in hospital unit configuration.',
    AssetTypes: 'Data has been saved successfully. You can now use these asset types when creating assets.',
    BudgetPeriod:
      'Data has been saved successfully. Budget period category budgets have been updated.',
    BudgetArchetype:
      'Data has been saved successfully. Budget network budgets have been updated.',
    BudgetHospitalUnit:
      'Data has been saved successfully. Budget hospital unit budgets have been updated.',
    TaskUpdates: 'Data has been saved successfully. Task statuses have been updated to Done.',
    MOMNotes: 'Data has been saved successfully. MOM notes have been linked to their respective assets. You can view them in the Daily MOM Summary page or asset timeline.',
    FeasibilityStudies: 'Data has been saved successfully. Feasibility studies have been linked to their projects. You can view and manage them in the FS Update, FS Approval, and FS Realization pages.',
    PoUpdates: 'Data has been saved successfully. PO fields have been updated on matching assets. You can view them in the PO Update page.',
    FsUpdates: 'Data has been saved successfully. FS and approved budget fields have been updated on matching projects. You can view them in the FS Update page.',
    Users: 'Data has been saved successfully. New users have been imported with their roles and scopes. Existing users were left unchanged.',
  };
  return messages[target] || 'Data has been saved successfully and is ready to use in the application.';
};

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

function SmartMigrationWizardInner({ currentUser, onComplete }: SmartMigrationWizardProps) {
  const { showToast } = useToast();
  const executeLockRef = useRef(false);

  const [currentStep, setCurrentStep] = useState(1);
  const [target, setTarget] = useState<MigrationTarget>('Projects');
  const [selectedPeriod, setSelectedPeriod] = useState('');
  const [selectedAssetType, setSelectedAssetType] = useState('');

  const [file, setFile] = useState<File | null>(null);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [previewRawData, setPreviewRawData] = useState<Record<string, unknown>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});

  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<dataManagementService.MigrationResult | null>(null);
  const [migrationProgress, setMigrationProgress] =
    useState<dataManagementService.MigrationProgress | null>(null);

  const needsPeriod = PERIOD_TARGETS.includes(target);
  const needsWorkflowSets = target === 'Assets';

  const { periods, workflows, periodsLoading, workflowsLoading } = useDataMigrationSetupOptions({
    needsWorkflowSets,
  });

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
    if (!file || fileHeaders.length === 0) return;
    const autoMap = dataManagementService.generateAutoMapping(
      fileHeaders,
      dataManagementService.getMigrationSchema(target),
      target,
    );
    setMapping(autoMap);
  }, [target, file, fileHeaders]);

  const currentSchema = useMemo(
    () => dataManagementService.getMigrationSchema(target),
    [target],
  );

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
        const autoMap = dataManagementService.generateAutoMapping(
          headers,
          dataManagementService.getMigrationSchema(target),
          target,
        );
        setMapping(autoMap);
      } catch {
        showToast('Gagal membaca header file. Periksa format file.', 'error');
        setFile(null);
        setFileHeaders([]);
        setPreviewRawData([]);
        setMapping({});
      }
    },
    [showToast, target],
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

  const handleTargetChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    setTarget(e.target.value as MigrationTarget);
  }, []);

  const handleDownloadTemplate = useCallback(() => {
    dataManagementService.downloadMigrationTemplate(target);
  }, [target]);

  const isMappingValid = useCallback(() => {
    const requiredFields = currentSchema.filter((f) => f.required);
    const mappedKeys = new Set(Object.values(mapping));
    return requiredFields.every((f) => mappedKeys.has(f.key));
  }, [currentSchema, mapping]);

  const previewTransformedData = useMemo(
    () => dataManagementService.transformMigrationPreviewRows(previewRawData, mapping, currentSchema),
    [previewRawData, mapping, currentSchema],
  );

  const previewColumns: Column<Record<string, unknown>>[] = useMemo(() => {
    return currentSchema.map((field) => ({
      header: field.label + (field.required ? ' *' : ''),
      accessor: (item: Record<string, unknown>) => {
        const val = item[field.key];
        let isValid = true;
        if (field.required && (val === undefined || val === '')) isValid = false;
        if (field.type === 'number' && val !== undefined && val !== '' && isNaN(Number(val))) {
          isValid = false;
        }

        return (
          <span
            className={
              isValid
                ? 'text-siloam-text-primary'
                : 'text-danger font-bold bg-red-100 px-1 rounded'
            }
          >
            {val !== undefined && val !== null && val !== '' ? String(val) : '-'}
          </span>
        );
      },
    }));
  }, [currentSchema]);

  const handleExecute = useCallback(async () => {
    if (!file || executeLockRef.current) return;
    if (needsPeriod && !selectedPeriod) {
      showToast('Pilih Target Period sebelum melanjutkan.', 'error');
      return;
    }
    if (target === 'Assets' && !selectedAssetType) {
      showToast('Pilih Asset Type sebelum melanjutkan.', 'error');
      return;
    }
    if (!isMappingValid()) {
      showToast('Mapping belum lengkap. Pastikan semua kolom wajib (*) sudah dipetakan.', 'error');
      return;
    }

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
      setCurrentStep(4);
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
    file,
    target,
    selectedAssetType,
    selectedPeriod,
    mapping,
    currentUser,
    showToast,
    needsPeriod,
    selectedPeriod,
    isMappingValid,
  ]);

  const handleReset = useCallback(() => {
    setCurrentStep(1);
    setFile(null);
    setFileHeaders([]);
    setPreviewRawData([]);
    setMapping({});
    setResult(null);
    setMigrationProgress(null);
    if (workflows.length > 0) setSelectedAssetType(workflows[0].id);
    onComplete();
  }, [onComplete, workflows]);

  const progressPct = useMemo(() => {
    if (!migrationProgress || migrationProgress.totalRows <= 0) return 0;
    return Math.min(
      100,
      Math.round((migrationProgress.processedRows / migrationProgress.totalRows) * 100),
    );
  }, [migrationProgress]);

  const renderStep1 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
            Migration Target
          </label>
          <select
            value={target}
            onChange={handleTargetChange}
            className="w-full p-3 border border-siloam-border rounded-xl bg-white focus:ring-2 focus:ring-siloam-blue outline-none"
          >
            <optgroup label="Project & Asset Data">
              <option value="Projects">Projects (Budget Plan)</option>
              <option value="Assets">Assets (Requires Project Code)</option>
            </optgroup>
            <optgroup label="Master Data">
              <option value="Vendors">Vendors</option>
              <option value="MasterCatalogue">Master Catalogue</option>
              <option value="Rooms">Rooms</option>
              <option value="BudgetCategories">Budget Categories</option>
              <option value="ProjectPriorities">Project Priorities</option>
              <option value="HospitalUnits">Hospital Units</option>
              <option value="Archetypes">Networks</option>
              <option value="Regionals">Regionals</option>
              <option value="AssetTypes">Asset Types</option>
            </optgroup>
            <optgroup label="Budget Planning">
              <option value="BudgetPeriod">Budget Period (Category Budget)</option>
              <option value="BudgetArchetype">Budget Network (Per Category)</option>
              <option value="BudgetHospitalUnit">Budget Hospital Unit (Per Category)</option>
            </optgroup>
            <optgroup label="Feasibility Study">
              <option value="FeasibilityStudies">Feasibility Studies (by Project Code)</option>
            </optgroup>
            <optgroup label="System Data">
              <option value="TaskUpdates">Task Updates (Set Status to Done)</option>
              <option value="MOMNotes">MOM Notes (by Asset Code)</option>
              <option value="Users">Users (Name, Email, Role, Scope)</option>
            </optgroup>
          </select>
          <p className="text-xs text-siloam-text-secondary mt-2">
            Select what type of data you are importing.
          </p>
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
            required
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
          <p className="text-xs text-siloam-text-secondary mt-2">
            Pilih Asset Type yang akan digunakan untuk semua assets yang di-import.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 p-4 rounded-xl">
        <div className="flex items-center gap-3">
          <div className="bg-blue-100 text-blue-600 w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-blue-900">Belum punya template?</p>
            <p className="text-xs text-blue-700">
              Download template Excel yang sudah sesuai format, lengkap dengan contoh data dan instruksi.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="flex items-center gap-2 px-4 py-2 bg-white text-blue-700 border border-blue-300 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors shadow-sm flex-shrink-0"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download Template
        </button>
      </div>

      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? 'border-siloam-blue bg-siloam-blue/5' : 'border-siloam-border hover:bg-siloam-bg'
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <div>
            <div className="bg-siloam-green/10 text-siloam-green w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-bold text-siloam-text-primary">{file.name}</p>
            <p className="text-sm text-siloam-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
            <button type="button" className="text-siloam-blue text-sm mt-2 hover:underline">
              Click to change file
            </button>
          </div>
        ) : (
          <div>
            <p className="text-siloam-text-primary font-medium mb-1">
              Drag & drop your Excel/CSV file here
            </p>
            <p className="text-sm text-siloam-text-secondary">or click to browse</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-6 animate-fade-in">
      <div className="bg-blue-50 border border-blue-200 p-4 rounded-lg flex items-start gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-6 w-6 text-blue-600 flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <p className="text-sm text-blue-800 font-bold">Intelligent Mapping</p>
          <p className="text-sm text-blue-700">
            We&apos;ve auto-matched columns based on similarity. Please review and correct if necessary.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center font-bold text-sm text-siloam-text-secondary uppercase border-b border-siloam-border pb-2">
        <div>Excel Header</div>
        <div />
        <div>System Field</div>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2">
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

      <div className="text-right text-sm">
        {!isMappingValid() && (
          <p className="text-danger">Missing required fields. Please map all fields marked with *.</p>
        )}
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4 animate-fade-in">
      <p className="text-sm text-siloam-text-secondary">
        Reviewing first {PREVIEW_ROW_LIMIT} records as they will be imported.
      </p>
      <div className="border border-siloam-border rounded-xl overflow-hidden">
        <GenericTable columns={previewColumns} data={previewTransformedData} />
      </div>
    </div>
  );

  const renderStep4 = () => {
    if (!result) return <div>No result data.</div>;
    return (
      <div className="space-y-6 text-center animate-fade-in">
        {!result.success ? (
          <div className="bg-red-100 text-red-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
        ) : result.failedCount > 0 ? (
          <div className="bg-amber-100 text-amber-800 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        ) : (
          <div className="bg-green-100 text-green-700 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-8 w-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        )}

        <h3 className="text-2xl font-bold text-siloam-text-primary">
          {!result.success
            ? 'Migrasi gagal (error kritis)'
            : result.failedCount > 0
              ? 'Migrasi selesai — ada baris yang gagal'
              : 'Migrasi selesai'}
        </h3>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-4xl mx-auto text-left">
          <div className="bg-siloam-bg p-4 rounded-xl">
            <p className="text-xs text-siloam-text-secondary uppercase font-bold">Baris file</p>
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

        {(result.insertedCount ?? 0) + (result.updatedCount ?? 0) > 0 && (
          <p className="text-sm text-siloam-text-secondary max-w-xl mx-auto">
            {getTargetSuccessMessage(target)}
          </p>
        )}

        {(result.warnings?.length ?? 0) > 0 && (
          <div className="text-left bg-amber-50 border border-amber-200 p-4 rounded-xl max-h-40 overflow-y-auto">
            <p className="font-bold text-amber-900 mb-2">Koreksi / informasi (bukan error):</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-amber-950">
              {result.warnings!.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {result.errors.length > 0 && (
          <div className="text-left bg-red-50 border border-red-200 p-4 rounded-xl max-h-48 overflow-y-auto">
            <p className="font-bold text-red-800 mb-2">
              Gagal (perbaiki data / mapping lalu impor ulang):
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-red-700">
              {result.errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderActiveStep = () => {
    switch (currentStep) {
      case 1:
        return renderStep1();
      case 2:
        return renderStep2();
      case 3:
        return renderStep3();
      case 4:
        return renderStep4();
      default:
        return null;
    }
  };

  return (
    <div className="bg-siloam-surface rounded-xl shadow-soft border border-siloam-border overflow-hidden flex flex-col h-full max-h-[800px]">
      <div className="bg-siloam-bg p-6 border-b border-siloam-border">
        <h2 className="text-xl font-bold text-siloam-text-primary">Smart Migration Engine</h2>
        <div className="flex items-center mt-6">
          {STEPS.map((step, idx) => (
            <React.Fragment key={step.id}>
              <div className="flex items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                    currentStep === step.id
                      ? 'bg-siloam-blue text-white'
                      : currentStep > step.id
                        ? 'bg-siloam-green text-white'
                        : 'bg-gray-200 text-gray-500'
                  }`}
                >
                  {currentStep > step.id ? '✓' : step.id}
                </div>
                <span
                  className={`ml-2 text-sm font-medium ${
                    currentStep === step.id ? 'text-siloam-blue' : 'text-siloam-text-secondary'
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-4 ${currentStep > step.id ? 'bg-siloam-green' : 'bg-gray-200'}`}
                />
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        {isProcessing && migrationProgress && (
          <div className="mb-6 p-4 rounded-xl border border-siloam-blue/30 bg-blue-50/90">
            <p className="text-xs font-semibold text-siloam-blue">{progressPct}%</p>
            <p className="text-sm font-semibold text-siloam-text-primary">{migrationProgress.message}</p>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-siloam-blue transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <p className="text-xs text-siloam-text-secondary mt-2">
              {migrationProgress.stage === 'saving' && migrationProgress.partialSaveIndex != null
                ? `Penyimpanan bertahap ke Supabase — batch #${migrationProgress.partialSaveIndex}. Anda dapat memuat ulang Table Editor untuk melihat baris yang sudah masuk.`
                : `Tahap: ${migrationProgress.stage} — baris ${migrationProgress.processedRows} / ${migrationProgress.totalRows}`}
            </p>
          </div>
        )}
        {renderActiveStep()}
      </div>

      <div className="p-6 border-t border-siloam-border bg-gray-50 flex justify-between items-center">
        {currentStep < 4 ? (
          <>
            <button
              type="button"
              onClick={() => setCurrentStep(Math.max(1, currentStep - 1))}
              disabled={currentStep === 1 || isProcessing}
              className="px-6 py-2 rounded-xl border border-siloam-border bg-white text-siloam-text-primary hover:bg-siloam-bg disabled:opacity-50"
            >
              Back
            </button>
            <div className="flex gap-2">
              {currentStep === 1 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  disabled={!file}
                  className="px-6 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-300 transition"
                >
                  Next: Map Columns
                </button>
              )}
              {currentStep === 2 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  disabled={!isMappingValid()}
                  className="px-6 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-300 transition"
                >
                  Next: Preview
                </button>
              )}
              {currentStep === 3 && (
                <button
                  type="button"
                  onClick={() => void handleExecute()}
                  disabled={isProcessing}
                  className="px-6 py-2 rounded-xl bg-siloam-green text-white hover:bg-siloam-green/90 disabled:bg-gray-300 transition flex items-center gap-2"
                >
                  {isProcessing && (
                    <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  )}
                  {isProcessing ? 'Migrating...' : 'Start Migration'}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="w-full flex justify-end">
            <button
              type="button"
              onClick={handleReset}
              className="px-6 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90"
            >
              Finish & New Migration
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export const SmartMigrationWizard = memo(SmartMigrationWizardInner);
