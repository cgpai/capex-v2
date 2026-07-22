import { Page, PAGE_TO_HIERARCHY_MAP, type HierarchyLevel } from '../types';
import { canAccessPageWithPermissionMap, permissionValues } from './rolePermissionMatrix';

/** Halaman yang dikonfigurasi di Role Management → Akses Screen (urutan navigasi). */
export const SCREEN_PERMISSION_PAGES: Page[] = [
  Page.Dashboard,
  Page.ExecutiveSummary,
  Page.BudgetMultiYear,
  Page.BudgetPeriod,
  Page.BudgetArchetype,
  Page.BudgetHU,
  Page.CapexProjectList,
  Page.DailyMOMSummary,
  Page.MyTask,
  Page.POUpdate,
  Page.GRUpdate,
  Page.FSUpdate,
  Page.FSApproval,
  Page.FSRealization,
  Page.BDDConstruction,
  Page.AIAnalytics,
  Page.UserMonitoring,
  Page.DataMigration,
  Page.Configuration,
  Page.Profile,
];

/** Modul data di Role Management → Hak Operasi Data (CRUD). */
export const DATA_OPERATION_LEVELS: HierarchyLevel[] = [
  'Budget',
  'Archetype',
  'HU',
  'Project',
  'Asset',
  'Purchase Order',
  'My Task',
  'Master Data',
  'Workflow',
  'User Management',
  'Role Management',
  'Data Migration',
  'User Monitoring',
  'Configuration',
];

/**
 * Hierarki operasi data per halaman.
 * Jika tidak ada entri, operasi edit/create/delete memakai level screen (`PAGE_TO_HIERARCHY_MAP`).
 */
export const PAGE_DATA_OPERATION_MAP: Partial<Record<Page, HierarchyLevel>> = {
  [Page.BudgetMultiYear]: 'Budget',
  [Page.BudgetPeriod]: 'Budget',
  [Page.BudgetArchetype]: 'Budget Archetype',
  [Page.BudgetHU]: 'HU',
  [Page.CapexProjectList]: 'Capex Project List',
  [Page.DailyMOMSummary]: 'Project',
  [Page.BDDConstruction]: 'BDD Construction',
  [Page.MyTask]: 'My Task',
  [Page.POUpdate]: 'PO Update',
  [Page.GRUpdate]: 'GR Update',
  [Page.FSUpdate]: 'FS Update',
  [Page.FSApproval]: 'FS Approval',
  [Page.FSRealization]: 'FS Realization',
  [Page.DataMigration]: 'Data Migration',
  [Page.UserMonitoring]: 'User Monitoring',
  [Page.Configuration]: 'Configuration',
};

export function getPageScreenHierarchy(page: Page): HierarchyLevel {
  return PAGE_TO_HIERARCHY_MAP[page];
}

/** Level izin untuk aksi data (bukan akses navigasi). */
export function getPageDataOperationLevel(page: Page): HierarchyLevel {
  return PAGE_DATA_OPERATION_MAP[page] ?? getPageScreenHierarchy(page);
}

export type PageDataAction = 'view' | 'edit' | 'create' | 'delete';

function permissionValueMeetsAction(value: number, action: PageDataAction): boolean {
  switch (action) {
    case 'view':
      return value >= permissionValues['View Only'];
    case 'edit':
      return value >= permissionValues['View & Update'];
    case 'create':
      return value >= permissionValues['View, Update & Create'];
    case 'delete':
      return value >= permissionValues['View, Update, Create & Delete'];
    default:
      return false;
  }
}

/**
 * Izin aksi data per halaman — memeriksa level operasi data DAN level akses screen.
 * Admin bisa mengatur salah satu di Configuration (Akses Screen / Hak Operasi Data / Aksi Button).
 */
export function canPerformPageDataAction(
  userPermissions: Map<HierarchyLevel, number>,
  page: Page,
  action: PageDataAction,
): boolean {
  if (action === 'view') {
    return canAccessPageWithPermissionMap(userPermissions, page);
  }

  const levels = new Set<HierarchyLevel>([
    getPageDataOperationLevel(page),
    getPageScreenHierarchy(page),
  ]);

  // Legacy: Budget Archetype pernah memakai modul "Archetype" terpisah dari akses screen.
  if (page === Page.BudgetArchetype) {
    levels.add('Archetype');
  }
  if (page === Page.BudgetPeriod) {
    levels.add('Budget');
  }

  for (const level of levels) {
    if (permissionValueMeetsAction(userPermissions.get(level) || 0, action)) {
      return true;
    }
  }
  return false;
}
