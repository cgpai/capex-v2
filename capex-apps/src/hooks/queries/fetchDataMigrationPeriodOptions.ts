import * as budgetService from '@/services/budgetService';

/** Ringkasan periode saja — tanpa pohon project/asset (dropdown migrasi). */
export async function fetchDataMigrationPeriodOptions() {
  return budgetService.getBudgetPeriodSummaries();
}
