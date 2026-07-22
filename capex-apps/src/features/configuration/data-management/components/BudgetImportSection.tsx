'use client';

import React from 'react';
import type { BudgetPeriod } from '@/types';
import { Dropdown } from '@/components/molecules/Dropdown/Dropdown';
import * as dataManagementService from '@/services/dataManagementService';

type BudgetImportSectionProps = {
  allPeriods: BudgetPeriod[];
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  budgetPlanFileInputRef: React.RefObject<HTMLInputElement | null>;
  transactionsFileInputRef: React.RefObject<HTMLInputElement | null>;
  onBudgetPlanImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onTransactionsImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function BudgetImportSection({
  allPeriods,
  selectedPeriod,
  onPeriodChange,
  budgetPlanFileInputRef,
  transactionsFileInputRef,
  onBudgetPlanImport,
  onTransactionsImport,
}: BudgetImportSectionProps) {
  return (
    <div className="p-6 bg-siloam-surface rounded-xl shadow-soft">
      <h2 className="text-xl font-bold mb-4">Budget & Transaction Data</h2>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-64">
          <Dropdown
            label="Select Period for Import/Export"
            options={allPeriods.map((p) => p.periodName)}
            selectedValue={selectedPeriod}
            onSelect={onPeriodChange}
          />
        </div>
        <button
          type="button"
          onClick={() => dataManagementService.generateBudgetPlanTemplate(selectedPeriod)}
          className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-xl hover:bg-siloam-border transition"
        >
          Download Budget Plan Template
        </button>
        <button
          type="button"
          onClick={dataManagementService.generateTransactionDataTemplate}
          className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-xl hover:bg-siloam-border transition"
        >
          Download Transactions Template
        </button>
        <input
          type="file"
          ref={budgetPlanFileInputRef}
          onChange={onBudgetPlanImport}
          className="hidden"
          accept=".xlsx, .xls"
        />
        <button
          type="button"
          onClick={() => budgetPlanFileInputRef.current?.click()}
          className="bg-siloam-green text-white px-4 py-2 rounded-xl hover:bg-siloam-green/90 transition"
        >
          Import Budget Plan
        </button>
        <input
          type="file"
          ref={transactionsFileInputRef}
          onChange={onTransactionsImport}
          className="hidden"
          accept=".xlsx, .xls"
        />
        <button
          type="button"
          onClick={() => transactionsFileInputRef.current?.click()}
          className="bg-siloam-green text-white px-4 py-2 rounded-xl hover:bg-siloam-green/90 transition"
        >
          Import Transactions
        </button>
      </div>
    </div>
  );
}

type BackupSectionProps = {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onExport: () => void;
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void;
};

export function BackupSection({ fileInputRef, onExport, onImport }: BackupSectionProps) {
  return (
    <div className="p-6 bg-danger/10 border border-danger/20 rounded-xl shadow-soft">
      <h2 className="text-xl font-bold mb-4 text-danger">Danger Zone</h2>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onExport}
          className="bg-yellow-500 text-white px-4 py-2 rounded-xl hover:bg-yellow-600 transition"
        >
          Export Full Backup
        </button>
        <input type="file" ref={fileInputRef} onChange={onImport} className="hidden" accept=".json" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="bg-danger text-white px-4 py-2 rounded-xl hover:bg-danger/90 transition"
        >
          Import Full Backup
        </button>
      </div>
    </div>
  );
}
