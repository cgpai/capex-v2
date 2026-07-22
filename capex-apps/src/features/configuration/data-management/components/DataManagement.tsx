'use client';

import React from 'react';
import type { BudgetPeriod, User } from '@/types';
import * as dataManagementService from '@/services/dataManagementService';
import { useDataManagementActions } from '@/features/configuration/data-management/hooks/useDataManagementActions';
import { BackupSection, BudgetImportSection } from './BudgetImportSection';

export const DataManagement: React.FC<{
  allPeriods: BudgetPeriod[];
  onDataChange: () => void;
  currentUser: User;
}> = ({ allPeriods, onDataChange, currentUser }) => {
  const actions = useDataManagementActions(allPeriods, onDataChange, currentUser);

  return (
    <div className="space-y-8">
      <div className="p-6 bg-siloam-surface rounded-xl shadow-soft">
        <h2 className="text-xl font-bold mb-4">Master & Config Data</h2>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={dataManagementService.generateMasterAndConfigTemplate}
            className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-xl hover:bg-siloam-border transition"
          >
            Download Template
          </button>
        </div>
      </div>
      <BudgetImportSection
        allPeriods={allPeriods}
        selectedPeriod={actions.selectedPeriod}
        onPeriodChange={actions.setSelectedPeriod}
        budgetPlanFileInputRef={actions.budgetPlanFileInputRef}
        transactionsFileInputRef={actions.transactionsFileInputRef}
        onBudgetPlanImport={actions.handleBudgetPlanImport}
        onTransactionsImport={actions.handleTransactionsImport}
      />
      <BackupSection
        fileInputRef={actions.fileInputRef}
        onExport={actions.handleExport}
        onImport={actions.handleImport}
      />
    </div>
  );
};
