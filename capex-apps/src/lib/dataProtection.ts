/**
 * Master/configuration store names — must not be auto-seeded, bulk-cleared, or restored
 * from backup unless the operator explicitly opts in.
 */
export const PROTECTED_MASTER_CONFIG_STORES = [
  'appConfig',
  'budgetCategoryConfigs',
  'projectPriorityConfigs',
  'masterCatalogue',
  'roomsConfig',
  'hospitalUnitsConfig',
  'archetypesConfig',
  'regionalsConfig',
  'tasks',
  'workflowSets',
  'assetTypeGroups',
  'assetTypeConfigs',
  'assetTags',
  'vendors',
  'users',
  'roles',
] as const;

export type ProtectedMasterConfigStore = (typeof PROTECTED_MASTER_CONFIG_STORES)[number];

const PROTECTED_SET = new Set<string>(PROTECTED_MASTER_CONFIG_STORES);

/** Automatic mock/seed writes are disabled in all environments. */
export const MOCK_DATA_SEED_ENABLED = false;

export function isProtectedMasterConfigStore(storeName: string): boolean {
  return PROTECTED_SET.has(storeName);
}

export const MASTER_CONFIG_IMPORT_CONFIRM_PHRASE = 'OVERWRITE MASTER CONFIG';
