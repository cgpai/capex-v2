import type { HierarchyLevel, Page, PermissionLevel } from '../types';
import { Page as PageEnum } from '../types';
import { getPageDataOperationLevel } from './pagePermissions';

export type ScreenButtonOperation = {
  id: string;
  screenLabel: string;
  operationLevel: HierarchyLevel;
  buttonsDescription: string;
};

/**
 * Konfigurasi aksi button (CRUD) per screen di Role Management.
 * `operationLevel` = hierarchy yang disimpan di `role_permissions`.
 */
export const SCREEN_BUTTON_OPERATIONS: ScreenButtonOperation[] = [
  {
    id: 'budget-period-plan',
    screenLabel: 'Budget Period',
    operationLevel: 'Budget',
    buttonsDescription: 'Edit & simpan Budget Plan per Network (Siloam)',
  },
  {
    id: 'budget-archetype-plan',
    screenLabel: 'Budget Network',
    operationLevel: 'Budget Archetype',
    buttonsDescription: 'Edit & simpan Budget Plan per Hospital Unit',
  },
  {
    id: 'budget-hu-data',
    screenLabel: 'Budget HU',
    operationLevel: 'HU',
    buttonsDescription: 'Simpan perubahan, edit budget & project',
  },
  {
    id: 'budget-hu-fs',
    screenLabel: 'Budget HU → FS',
    operationLevel: 'FS Update',
    buttonsDescription: 'Tombol Create FS & submit proposal FS',
  },
  {
    id: 'fs-update',
    screenLabel: 'FS Update',
    operationLevel: 'FS Update',
    buttonsDescription: 'Create FS, input field, simpan approved budget',
  },
  {
    id: 'fs-approval',
    screenLabel: 'FS Approval',
    operationLevel: 'FS Approval',
    buttonsDescription: 'Edit status/kesimpulan, simpan approval',
  },
  {
    id: 'fs-realization',
    screenLabel: 'FS Realization',
    operationLevel: 'FS Realization',
    buttonsDescription: 'Update Realization, simpan data bulanan',
  },
  {
    id: 'po-update',
    screenLabel: 'PO Update',
    operationLevel: 'PO Update',
    buttonsDescription: 'Buat/edit PO, simpan perubahan',
  },
  {
    id: 'gr-update',
    screenLabel: 'GR Update',
    operationLevel: 'GR Update',
    buttonsDescription: 'Input goods received, simpan',
  },
  {
    id: 'capex-list',
    screenLabel: 'Capex Project List',
    operationLevel: 'Capex Project List',
    buttonsDescription: 'Edit asset, aksi task & timeline',
  },
  {
    id: 'bdd-construction',
    screenLabel: 'BDD Construction',
    operationLevel: 'BDD Construction',
    buttonsDescription: 'Update kanban, simpan progress',
  },
  {
    id: 'my-task',
    screenLabel: 'My Task',
    operationLevel: 'My Task',
    buttonsDescription: 'Complete/reschedule task',
  },
  {
    id: 'configuration',
    screenLabel: 'Configuration',
    operationLevel: 'Configuration',
    buttonsDescription: 'Simpan perubahan konfigurasi & role',
  },
];

/** Hierarchy untuk operasi Create/Input FS (tombol Create FS di Budget HU & FS Update). */
export const FS_CREATE_INPUT_HIERARCHY: HierarchyLevel = 'FS Update';

export function describePermissionCrud(permission: PermissionLevel): string {
  switch (permission) {
    case 'Hide':
      return 'Semua button disembunyikan';
    case 'View Only':
      return 'View saja';
    case 'View & Update':
      return 'View + Edit/Update';
    case 'View, Update & Create':
      return 'View + Edit + Create';
    case 'View, Update, Create & Delete':
      return 'View + Edit + Create + Delete';
    default:
      return permission;
  }
}

export function getScreenButtonOperationLevel(page: Page): HierarchyLevel {
  return getPageDataOperationLevel(page);
}

export function getFsCreateInputOperationLevel(): HierarchyLevel {
  return FS_CREATE_INPUT_HIERARCHY;
}

/** Screens yang punya entri eksplisit di SCREEN_BUTTON_OPERATIONS (untuk dokumentasi admin). */
export const SCREEN_BUTTON_OPERATION_PAGES: Page[] = [
  PageEnum.BudgetPeriod,
  PageEnum.BudgetArchetype,
  PageEnum.BudgetHU,
  PageEnum.FSUpdate,
  PageEnum.FSApproval,
  PageEnum.FSRealization,
  PageEnum.POUpdate,
  PageEnum.GRUpdate,
  PageEnum.CapexProjectList,
  PageEnum.BDDConstruction,
  PageEnum.MyTask,
  PageEnum.Configuration,
];
