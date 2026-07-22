import React, { memo, useCallback, useRef } from 'react';
import * as dataManagementService from '@/services/dataManagementService';
import { resolveBackupImportUserChoice } from '@/services/backupImportGuards';
import { useToast } from '@/contexts/ToastContext';

const MAX_BACKUP_BYTES = 80 * 1024 * 1024;

function isPlainBackupObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export const DataMigrationLegacyPanel = memo(function DataMigrationLegacyPanel() {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = useCallback(() => {
    dataManagementService.generateTransactionDataTemplate();
  }, []);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      if (file.size > MAX_BACKUP_BYTES) {
        showToast('File backup terlalu besar (maks. 80 MB).', 'error');
        event.target.value = '';
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const raw = e.target?.result;
          if (typeof raw !== 'string') {
            throw new Error('Format file tidak valid.');
          }
          const data: unknown = JSON.parse(raw);
          if (!isPlainBackupObject(data)) {
            throw new Error('Backup harus berupa objek JSON.');
          }

          const choice = resolveBackupImportUserChoice();
          if (!choice.proceed) return;

          const importedFromBe = await dataManagementService.importFullBackupViaBackend(data);
          if (!importedFromBe) {
            await dataManagementService.importFullBackup(data, {
              restoreMasterConfig: choice.restoreMasterConfig,
            });
          }
          showToast('Data berhasil diimpor. Aplikasi akan memuat ulang.', 'success');
          window.location.reload();
        } catch (error) {
          showToast(`Import gagal: ${error instanceof Error ? error.message : String(error)}`, 'error');
        } finally {
          event.target.value = '';
        }
      };
      reader.readAsText(file);
    },
    [showToast],
  );

  const handleExport = useCallback(async () => {
    try {
      const data =
        (await dataManagementService.exportFullBackupViaBackend()) ??
        (await dataManagementService.exportFullBackup());
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `siloam_backup_${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      showToast(`Export gagal: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  }, [showToast]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
        <h3 className="text-lg font-bold text-siloam-text-primary mb-3">System Backup & Restore</h3>
        <p className="text-sm text-siloam-text-secondary mb-4">
          Export the entire database state to JSON for backup purposes or restore from a previous backup.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleExport()}
            className="flex-1 bg-siloam-sidebar text-siloam-text-primary py-2 rounded-lg text-sm font-medium hover:bg-siloam-border transition"
          >
            Export Full Backup
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
            accept=".json,application/json"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex-1 bg-siloam-blue text-white py-2 rounded-lg text-sm font-medium hover:bg-siloam-blue/90 transition"
          >
            Import Full Backup
          </button>
        </div>
      </div>

      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
        <h3 className="text-lg font-bold text-siloam-text-primary mb-3">Standard Templates</h3>
        <p className="text-sm text-siloam-text-secondary mb-4">
          Download standard Excel templates for manual data entry.
        </p>
        <button
          type="button"
          onClick={handleDownloadTemplate}
          className="w-full bg-siloam-sidebar text-siloam-text-primary py-2 rounded-lg text-sm font-medium hover:bg-siloam-border transition"
        >
          Download Excel Templates
        </button>
      </div>
    </div>
  );
});
