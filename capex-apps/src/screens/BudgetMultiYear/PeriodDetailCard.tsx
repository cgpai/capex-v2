import React, { useMemo, useCallback } from 'react';
import type { BudgetCategoryConfig, BudgetItem, BudgetPeriod } from '@/types';
import { formatCurrency, formatAbbreviatedCurrency } from '@/lib/formatter';
import { CurrencyInput } from '@/components/atoms/CurrencyInput/CurrencyInput';
import { MultiSegmentProgressBar } from '@/components/molecules/MultiSegmentProgressBar/MultiSegmentProgressBar';
import { budgetItemHasVisibleValues, computePeriodTotals, resolveDisplayCategories } from './utils';

export type PeriodDetailCardProps = {
  period: BudgetPeriod;
  categories: BudgetCategoryConfig[];
  isEditable: boolean;
  onPeriodBudgetChange: (periodName: string, categoryId: string, newVal: number) => void;
};

export const PeriodDetailCard = React.memo<PeriodDetailCardProps>(function PeriodDetailCard({
  period,
  categories,
  isEditable,
  onPeriodBudgetChange,
}) {
  const handleBudgetChange = useCallback(
    (categoryId: string, newVal: number) => {
      onPeriodBudgetChange(period.periodName, categoryId, newVal);
    },
    [onPeriodBudgetChange, period.periodName],
  );
  const displayCategories = useMemo(() => resolveDisplayCategories(categories), [categories]);
  const activeCategoryIds = useMemo(() => displayCategories.map((c) => c.id), [displayCategories]);
  const totals = useMemo(
    () => computePeriodTotals(period.budget, activeCategoryIds),
    [period.budget, activeCategoryIds],
  );
  const totalBudget = totals.plan + totals.carryForward;
  const utilizationPct = totalBudget > 0 ? ((totals.consumed / totalBudget) * 100).toFixed(1) : '0';

  return (
    <div className="bg-white rounded-xl border border-siloam-border shadow-sm overflow-hidden">
      <div className="bg-siloam-bg/50 p-4 border-b border-siloam-border flex justify-between items-center">
        <div>
          <h5 className="font-bold text-siloam-text-primary text-sm">{period.periodName}</h5>
          <p className="text-xs text-siloam-text-secondary">{period.startDate} — {period.endDate}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-siloam-text-secondary uppercase">Total Period Budget</p>
          <p className="font-bold text-siloam-blue">{formatCurrency(totalBudget)}</p>
          <p className="text-[10px] text-siloam-text-secondary mt-0.5">
            Plan {formatCurrency(totals.plan)} + CF {formatCurrency(totals.carryForward)}
          </p>
        </div>
      </div>

      <div className="p-4">
        <div className="mb-6">
          <div className="flex justify-between text-xs text-siloam-text-secondary mb-1">
            <span>Overall Utilization</span>
            <span>{utilizationPct}% Realization</span>
          </div>
          <MultiSegmentProgressBar
            total={totalBudget}
            allocated={totals.allocated}
            approved={totals.approved}
            consumed={totals.consumed}
            className="h-2.5"
          />
          <div className="flex gap-4 mt-2 text-[10px] text-siloam-text-secondary">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-warning rounded-full" />
              Alloc: <span className="font-semibold text-siloam-text-primary ml-1">{formatAbbreviatedCurrency(totals.allocated)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-siloam-green rounded-full" />
              Appr: <span className="font-semibold text-siloam-text-primary ml-1">{formatAbbreviatedCurrency(totals.approved)}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 bg-siloam-blue rounded-full" />
              Cons: <span className="font-semibold text-siloam-text-primary ml-1">{formatAbbreviatedCurrency(totals.consumed)}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-siloam-sidebar text-siloam-text-secondary font-semibold uppercase">
              <tr>
                <th className="px-3 py-2 rounded-tl-lg">Category</th>
                <th className="px-3 py-2 text-right w-32">Plan</th>
                <th className="px-3 py-2 text-right w-32">Carry Forward</th>
                <th className="px-3 py-2 text-right">Allocated</th>
                <th className="px-3 py-2 text-right">FS Budget</th>
                <th className="px-3 py-2 text-right rounded-tr-lg">Realization Budget</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-siloam-border">
              {displayCategories.map((cat) => {
                const budget: BudgetItem = period.budget[cat.id] ?? {
                  budgetPlan: 0,
                  budgetCarryForward: 0,
                  budgetAllocated: 0,
                  approvedBudget: 0,
                  consumedBudget: 0,
                };
                if (!isEditable && !budgetItemHasVisibleValues(budget)) {
                  return null;
                }

                return (
                  <tr key={cat.id} className="hover:bg-siloam-bg/30">
                    <td className="px-3 py-2 font-medium text-siloam-text-primary">{cat.name}</td>
                    <td className="px-3 py-2 text-right text-siloam-text-secondary">
                      {isEditable ? (
                        <CurrencyInput
                          value={budget.budgetPlan}
                          onValueChange={(val) => handleBudgetChange(cat.id, val)}
                          className="w-full text-right px-2 py-1 border border-siloam-border rounded focus:outline-none focus:ring-1 focus:ring-siloam-blue bg-white"
                        />
                      ) : (
                        formatCurrency(budget.budgetPlan)
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-siloam-text-primary font-medium">
                      {formatCurrency(budget.budgetCarryForward)}
                    </td>
                    <td className="px-3 py-2 text-right text-warning font-medium">{formatCurrency(budget.budgetAllocated)}</td>
                    <td className="px-3 py-2 text-right text-siloam-green font-medium">{formatCurrency(budget.approvedBudget)}</td>
                    <td className="px-3 py-2 text-right text-siloam-blue font-bold">{formatCurrency(budget.consumedBudget)}</td>
                  </tr>
                );
              })}
              {displayCategories.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-siloam-text-secondary italic">
                    No category budget rows for this period.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
});
