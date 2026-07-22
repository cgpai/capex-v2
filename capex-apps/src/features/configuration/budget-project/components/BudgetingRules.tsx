'use client';

import React from 'react';
import { formatCurrency } from '@/lib/formatter';
import { NumericInput } from '@/components/atoms/NumericInput/NumericInput';
import { useBudgetingRules } from '@/features/configuration/budget-project/hooks/useBudgetingRules';

export const BudgetingRules: React.FC<{
  onConfigChange: () => void;
}> = ({ onConfigChange }) => {
  const { maxBudget, setMaxBudget, isLoading, isSaving, save } = useBudgetingRules(onConfigChange);

  if (isLoading) {
    return <div>Loading rules...</div>;
  }

  return (
    <div className="p-4 bg-siloam-bg rounded-lg">
      <h3 className="text-lg font-bold mb-4">General Budgeting Rules</h3>
      <div className="space-y-4">
        <div>
          <label htmlFor="maxBudget" className="block text-sm font-medium text-siloam-text-secondary">
            Max Budget per Routine Asset
          </label>
          <NumericInput
            id="maxBudget"
            min={0}
            value={maxBudget}
            onValueChange={setMaxBudget}
            allowDecimal={false}
            groupThousands
            align="left"
            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
          <p className="text-xs text-siloam-text-secondary mt-1">
            Formatted value: {formatCurrency(maxBudget)}
          </p>
          <p className="text-xs text-siloam-text-secondary mt-1">
            This sets the maximum budget for a single asset added to the &quot;General &amp; Routine
            Assets&quot; project.
          </p>
        </div>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={save}
            disabled={isSaving}
            className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft disabled:opacity-60"
          >
            {isSaving ? 'Saving...' : 'Save Rule'}
          </button>
        </div>
      </div>
    </div>
  );
};
