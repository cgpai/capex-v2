/**
 * Pelacak migrasi data per layar ke TanStack Query (bertahap).
 * Update array `done` setiap layar selesai.
 */
export const SCREEN_QUERY_MIGRATION = {
  done: [
    'Notifications (shell + hook)',
    'Dashboard',
    'ExecutiveSummary',
    'MyTask',
    'UserMonitoring',
    'AIAnalytics (generate = mutation)',
    'MomDailySummary',
    'BudgetMultiYear',
    'BudgetPeriod (Siloam)',
    'BudgetArchetype',
    'BudgetHU',
    'POUpdate',
    'GRUpdate',
    'FSUpdate',
    'BDDConstruction',
    'CapexProjectList',
    'Configuration (paket utama)',
    'App shell bootstrap (TanStack Query + prefetch Capex selaras queryKeys)',
    'Profile (tanpa fetch server; data dari App)',
  ] as const,
  pending: ['DataMigration (SmartMigrationWizard / OfflineDataManager per sub-alur)'] as const,
} as const;
