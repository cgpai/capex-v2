'use client';

import { lazy } from 'react';
import { Page } from '@/types';

export const LazyDashboardPage = lazy(() =>
  import('@/screens/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
export const LazyExecutiveSummaryPage = lazy(() =>
  import('@/screens/ExecutiveSummaryPage').then((m) => ({ default: m.ExecutiveSummaryPage })),
);
export const LazyAIAnalyticsPage = lazy(() =>
  import('@/screens/AIAnalyticsPage').then((m) => ({ default: m.AIAnalyticsPage })),
);
export const LazyUserMonitoringPage = lazy(() =>
  import('@/screens/UserMonitoringPage').then((m) => ({ default: m.UserMonitoringPage })),
);
export const LazyDataMigrationPage = lazy(() =>
  import('@/screens/DataMigrationPage').then((m) => ({ default: m.DataMigrationPage })),
);
export const LazyCapexProjectListPage = lazy(() =>
  import('@/screens/CapexProjectListPage').then((m) => ({ default: m.CapexProjectListPage })),
);
export const LazyBDDConstructionPage = lazy(() =>
  import('@/screens/BDDConstructionPage').then((m) => ({ default: m.BDDConstructionPage })),
);
export const LazyMomDailySummaryPage = lazy(() =>
  import('@/screens/MomDailySummaryPage').then((m) => ({ default: m.MomDailySummaryPage })),
);
export const LazyMyTaskPage = lazy(() =>
  import('@/screens/MyTaskPage').then((m) => ({ default: m.MyTaskPage })),
);
export const LazyBudgetMultiYearPage = lazy(() =>
  import('@/screens/BudgetMultiYearPage').then((m) => ({ default: m.BudgetMultiYearPage })),
);
export const LazyBudgetPeriodPage = lazy(() =>
  import('@/screens/BudgetSiloamPage').then((m) => ({ default: m.BudgetPeriodPage })),
);
export const LazyBudgetArchetypePage = lazy(() =>
  import('@/screens/BudgetArchetypePage').then((m) => ({ default: m.BudgetArchetypePage })),
);
export const LazyBudgetHUPage = lazy(() =>
  import('@/screens/BudgetHUPage').then((m) => ({ default: m.BudgetHUPage })),
);
export const LazyPOUpdatePage = lazy(() =>
  import('@/screens/POUpdatePage/POUpdatePage').then((m) => ({ default: m.POUpdatePage })),
);
export const LazyGRUpdatePage = lazy(() =>
  import('@/screens/GRUpdatePage/GRUpdatePage').then((m) => ({ default: m.GRUpdatePage })),
);
export const LazyFSUpdatePage = lazy(() =>
  import('@/screens/FSUpdatePage/FSUpdatePage').then((m) => ({ default: m.FSUpdatePage })),
);
export const LazyFSApprovalPage = lazy(() =>
  import('@/screens/FSApprovalPage/FSApprovalPage').then((m) => ({ default: m.FSApprovalPage })),
);
export const LazyFSRealizationPage = lazy(() =>
  import('@/screens/FSRealizationPage/FSRealizationPage').then((m) => ({ default: m.FSRealizationPage })),
);
export const LazyConfigurationPage = lazy(() =>
  import('@/screens/ConfigurationPage').then((m) => ({ default: m.ConfigurationPage })),
);
export const LazyProfilePage = lazy(() =>
  import('@/screens/ProfilePage').then((m) => ({ default: m.ProfilePage })),
);
export const LazyLoginPage = lazy(() =>
  import('@/screens/LoginPage').then((m) => ({ default: m.LoginPage })),
);

/** Pages loaded on demand — reduces initial App bundle parse cost. */
export const LAZY_SCREEN_PAGES: ReadonlySet<Page> = new Set(Object.values(Page));
