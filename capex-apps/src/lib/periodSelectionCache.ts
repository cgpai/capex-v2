import type { BudgetPeriod } from '@/types';

const STORAGE_KEY = 'capex.periodShell.v1';

export type PeriodShellCache = {
  selectedPeriodName: string;
  periodNames: string[];
};

export function periodStub(periodName: string): BudgetPeriod {
  return {
    periodName,
    multiYearName: '',
    startDate: '',
    endDate: '',
    budget: {},
    archetypes: [],
  };
}

export function readPeriodShellCache(): PeriodShellCache | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return null;
    const o = parsed as Record<string, unknown>;
    const selectedPeriodName =
      typeof o.selectedPeriodName === 'string' ? o.selectedPeriodName.trim() : '';
    const periodNames = Array.isArray(o.periodNames)
      ? o.periodNames.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
      : [];
    if (!selectedPeriodName && periodNames.length === 0) return null;
    return { selectedPeriodName, periodNames };
  } catch {
    return null;
  }
}

export function writePeriodShellCache(payload: PeriodShellCache): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        selectedPeriodName: payload.selectedPeriodName.trim(),
        periodNames: payload.periodNames,
      }),
    );
  } catch {
    /* quota / private mode */
  }
}

export function readInitialPeriodShellState(): {
  selectedPeriodName: string;
  allPeriods: BudgetPeriod[];
} {
  const cached = readPeriodShellCache();
  if (!cached) {
    return { selectedPeriodName: '', allPeriods: [] };
  }
  const names =
    cached.periodNames.length > 0
      ? cached.periodNames
      : cached.selectedPeriodName
        ? [cached.selectedPeriodName]
        : [];
  return {
    selectedPeriodName: cached.selectedPeriodName,
    allPeriods: names.map(periodStub),
  };
}
