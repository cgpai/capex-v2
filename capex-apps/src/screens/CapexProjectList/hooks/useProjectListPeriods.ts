import { useMemo } from 'react';
import type { BudgetPeriod } from '../../../types';
import {
  budgetPeriodFilterOptions,
  pickLatestBudgetPeriodName,
  resolveInitialProjectListSelectedPeriods,
} from '../listUtils';
import type { ProjectListFilterSelection } from '../../../lib/capexProjectListDiskCache';

/** Static period config from props + saved filters (no live selection). */
export function useProjectListPeriodConfig(
  periodName: string,
  budgetPeriods: BudgetPeriod[] | undefined,
  allPeriodNames: string[] | undefined,
  savedFilters: ProjectListFilterSelection | null,
) {
  const resolvedBudgetPeriods = useMemo((): BudgetPeriod[] => {
    if (budgetPeriods?.length) {
      return budgetPeriods.filter((p) => p.periodName?.trim());
    }
    return (allPeriodNames ?? [])
      .map((name) => name.trim())
      .filter(Boolean)
      .map((periodNameOnly) => ({
        periodName: periodNameOnly,
        multiYearName: '',
        startDate: '',
        endDate: '',
        budget: {},
        archetypes: [],
      }));
  }, [budgetPeriods, allPeriodNames]);

  const availablePeriodOptions = useMemo(
    () => budgetPeriodFilterOptions(resolvedBudgetPeriods),
    [resolvedBudgetPeriods],
  );

  const initialSelectedPeriods = useMemo(
    () => resolveInitialProjectListSelectedPeriods(savedFilters, resolvedBudgetPeriods),
    [savedFilters, resolvedBudgetPeriods],
  );

  return { resolvedBudgetPeriods, availablePeriodOptions, initialSelectedPeriods };
}

/** Live effective periods from current checkbox selection. */
export function useProjectListEffectivePeriods(
  periodName: string,
  resolvedBudgetPeriods: BudgetPeriod[],
  availablePeriodOptions: string[],
  selectedPeriods: string[],
) {
  const effectivePeriods = useMemo(() => {
    if (selectedPeriods.length > 0) {
      const picked = selectedPeriods.filter((p) => availablePeriodOptions.includes(p));
      if (picked.length > 0) return picked;
    }
    if (availablePeriodOptions.length > 0) return availablePeriodOptions;
    const latest = pickLatestBudgetPeriodName(resolvedBudgetPeriods);
    if (latest) return [latest];
    return periodName.trim() ? [periodName.trim()] : [];
  }, [selectedPeriods, availablePeriodOptions, resolvedBudgetPeriods, periodName]);

  const queryPeriodKey = useMemo(
    () => effectivePeriods.slice().sort().join('\u0001') || periodName || 'all',
    [effectivePeriods, periodName],
  );

  const isMultiPeriodView = effectivePeriods.length > 1;
  const primaryPeriodName = effectivePeriods[0] ?? periodName;

  const hasPeriodSubsetFilter =
    availablePeriodOptions.length > 0 &&
    selectedPeriods.length > 0 &&
    selectedPeriods.length < availablePeriodOptions.length;

  return {
    effectivePeriods,
    queryPeriodKey,
    isMultiPeriodView,
    primaryPeriodName,
    hasPeriodSubsetFilter,
  };
}
