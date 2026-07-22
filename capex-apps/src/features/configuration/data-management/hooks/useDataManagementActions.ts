'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BudgetPeriod, User } from '@/types';
import * as dataManagementService from '@/services/dataManagementService';
import { resolveBackupImportUserChoice } from '@/services/backupImportGuards';
import { useToast } from '@/contexts/ToastContext';

export function useDataManagementActions(
  allPeriods: BudgetPeriod[],
  onDataChange: () => void,
  currentUser: User,
) {
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const budgetPlanFileInputRef = useRef<HTMLInputElement>(null);
  const transactionsFileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPeriod, setSelectedPeriod] = useState(allPeriods[0]?.periodName || '');

  useEffect(() => {
    if (!selectedPeriod && allPeriods.length > 0) {
      setSelectedPeriod(allPeriods[0].periodName);
    }
  }, [allPeriods, selectedPeriod]);

  const handleExport = useCallback(async () => {
    const data = await dataManagementService.exportFullBackup();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `siloam_backup_${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, []);

  const handleImport = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target?.result as string);
          const choice = resolveBackupImportUserChoice();
          if (!choice.proceed) return;

          const importedFromBe = await dataManagementService.importFullBackupViaBackend(data);
          if (!importedFromBe) {
            await dataManagementService.importFullBackup(data, {
              restoreMasterConfig: choice.restoreMasterConfig,
            });
          }
          showToast('Data imported successfully. The application will now reload.', 'success');
          onDataChange();
          window.location.reload();
        } catch (error) {
          showToast(`Import failed: ${error}`, 'error');
        }
      };
      reader.readAsText(file);
    },
    [onDataChange, showToast],
  );

  const handleBudgetPlanImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && selectedPeriod) {
        const result = await dataManagementService.importBudgetPlanExcel(file, selectedPeriod, currentUser);
        showToast(result.message, result.success ? 'success' : 'error');
        if (result.success) onDataChange();
      }
    },
    [currentUser, onDataChange, selectedPeriod, showToast],
  );

  const handleTransactionsImport = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file && selectedPeriod) {
        const result = await dataManagementService.importTransactionsExcel(file, selectedPeriod, currentUser);
        showToast(result.message, result.success ? 'success' : 'error');
        if (result.success) onDataChange();
      }
    },
    [currentUser, onDataChange, selectedPeriod, showToast],
  );

  return {
    selectedPeriod,
    setSelectedPeriod,
    fileInputRef,
    budgetPlanFileInputRef,
    transactionsFileInputRef,
    handleExport,
    handleImport,
    handleBudgetPlanImport,
    handleTransactionsImport,
  };
}
