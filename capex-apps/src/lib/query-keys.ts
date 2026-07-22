/** Kunci TanStack Query — satu sumber untuk invalidasi & realtime nanti. */
export const queryKeys = {
  app: {
    /** Users, roles, multi-year, daftar periode (bootstrap shell). */
    bootstrap: ['app', 'bootstrap'] as const,
  },
  configuration: {
    page: (userId: number) => ['screen', 'configuration', userId] as const,
  },
  notifications: {
    list: (userId: number) => ['notifications', userId] as const,
  },
  dashboard: {
    bundle: (periodName: string, userId: number) => ['screen', 'dashboard', periodName, userId] as const,
  },
  executiveSummary: {
    meta: (periodName: string, userId: number) => ['screen', 'executive-summary', 'meta', periodName, userId] as const,
    stats: (
      periodName: string,
      userId: number,
      filtersKey: string,
      search: string,
    ) => ['screen', 'executive-summary', 'stats', periodName, userId, filtersKey, search] as const,
    projects: (
      periodName: string,
      userId: number,
      filtersKey: string,
      search: string,
      sortKey: string,
    ) => ['screen', 'executive-summary', 'projects', periodName, userId, filtersKey, search, sortKey] as const,
    dashboard: (periodName: string, userId: number, filtersKey: string) =>
      ['screen', 'executive-summary', 'dashboard', periodName, userId, filtersKey] as const,
    /** @deprecated use meta */
    bundle: (periodName: string, userId: number) => ['screen', 'executive-summary', periodName, userId] as const,
  },
  myTasks: {
    page: (userId: number, periodName: string | undefined) =>
      ['screen', 'my-tasks', userId, periodName ?? ''] as const,
    filterMaster: () => ['screen', 'my-tasks', 'filter-master'] as const,
  },
  userMonitoring: {
    bundle: (userId: number) => ['screen', 'user-monitoring', userId] as const,
    table: (userId: number, filtersKey: string, page: number, pageSize: number) =>
      ['screen', 'user-monitoring', 'table', userId, filtersKey, page, pageSize] as const,
  },
  aiAnalytics: {
    global: (userId: number) => ['screen', 'ai-analytics', userId] as const,
  },
  momDailySummary: {
    rows: (userId: number, periodName: string, summaryDate: string, scopesKey: string) =>
      ['screen', 'mom-daily-summary', userId, periodName, summaryDate, scopesKey] as const,
  },
  budgetMultiYear: {
    page: (userId: number) => ['screen', 'budget-multi-year', userId] as const,
    periodBudgets: (multiYearName: string) =>
      ['screen', 'budget-multi-year', 'period-budgets', multiYearName] as const,
  },
  budgetSiloamPeriod: {
    /** Pohon BudgetPeriod per periode — dipakai Siloam + Archetype (cache bersama). */
    detail: (periodName: string) => ['screen', 'budget-siloam-period', periodName] as const,
  },
  budgetHu: {
    page: (periodName: string, userId: number, hospitalUnitId?: string | null) =>
      ['screen', 'budget-hu', periodName, userId, hospitalUnitId ?? ''] as const,
    config: () => ['screen', 'budget-hu', 'config'] as const,
    fs: (periodName: string, userId: number) => ['screen', 'budget-hu-fs', periodName, userId] as const,
    assetCounts: (periodName: string, userId: number) =>
      ['screen', 'budget-hu-asset-counts', periodName, userId] as const,
  },
  poUpdate: {
    page: (periodName: string, userId: number) =>
      ['screen', 'po-update', periodName || 'all', userId] as const,
  },
  grUpdate: {
    page: (userId: number) => ['screen', 'gr-update', userId] as const,
  },
  fsUpdate: {
    page: (periodName: string, userId: number) => ['screen', 'fs-update', periodName, userId] as const,
  },
  fsApproval: {
    page: (periodName: string, userId: number) => ['screen', 'fs-approval', periodName, userId] as const,
  },
  fsRealization: {
    page: (periodName: string, userId: number) => ['screen', 'fs-realization', periodName, userId] as const,
  },
  bddConstruction: {
    page: (userId: number, periodName: string | undefined) =>
      ['screen', 'bdd-construction', userId, periodName ?? ''] as const,
    table: (periodName: string, userId: number, filtersKey: string, page: number, pageSize: number) =>
      ['screen', 'bdd-construction', 'table', periodName, userId, filtersKey, page, pageSize] as const,
  },
  capexProjectList: {
    bundle: (periodName: string, userId: number) => ['screen', 'capex-project-list', periodName, userId] as const,
    table: (periodName: string, userId: number, filtersKey: string, page: number, pageSize: number) =>
      ['screen', 'capex-project-list', 'table', periodName, userId, filtersKey, page, pageSize] as const,
  },
  dataMigration: {
    periodOptions: () => ['screen', 'data-migration', 'period-options'] as const,
    workflowSets: () => ['screen', 'data-migration', 'workflow-sets'] as const,
  },
} as const;
