
import { invalidateRequestCache, withRequestCache } from '../lib/requestCache';
import { Page, User, UserRole, HospitalUnitConfig, ArchetypeConfig, RegionalConfig, Task, WorkflowSet, AppConfig, BudgetCategoryConfig, ProjectPriorityConfig, MasterCatalogueItem, RoomConfig, Vendor, AssetTypeConfig, AssetTypeGroupConfig, AssetTagConfig } from '../types';
import { SIDEBAR_MENU_VISIBILITY_KEY, normalizeSidebarMenuVisibility } from '../lib/sidebarMenuVisibility';
import {
  deleteConfigViaBeOrFallback,
  saveConfigViaBeOrFallback,
} from './configurationCrudApi';
import {
  readAppConfigFromBackend,
  readAppConfigFromDb,
  readConfigurationSlice,
} from './configServiceBackend';

// --- Budget Category Configs ---
export const getAllBudgetCategories = async (): Promise<BudgetCategoryConfig[]> =>
  readConfigurationSlice('budgetCategories');

export const getActiveBudgetCategories = async (): Promise<BudgetCategoryConfig[]> => {
  const all = await getAllBudgetCategories();
  return all.filter((c) => c.isActive);
};

export const saveBudgetCategory = async (category: BudgetCategoryConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('budgetCategory', category);
};

export const deleteBudgetCategory = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('budgetCategory', id);
};

// --- Project Priority Configs ---
export const getAllProjectPriorities = async (): Promise<ProjectPriorityConfig[]> =>
  readConfigurationSlice('projectPriorities');

export const getActiveProjectPriorities = async (): Promise<ProjectPriorityConfig[]> => {
  const all = await getAllProjectPriorities();
  return all.filter((p) => p.isActive);
};

export const saveProjectPriority = async (priority: ProjectPriorityConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('projectPriority', priority);
};

export const deleteProjectPriority = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('projectPriority', id);
};

// --- Asset Tags (Construction Kanban) ---
export const getAllAssetTags = async (): Promise<AssetTagConfig[]> =>
  readConfigurationSlice('assetTags');

export const saveAssetTag = async (tag: AssetTagConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('assetTag', tag);
};

export const deleteAssetTag = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('assetTag', id);
};

// --- Master Catalogue, Rooms, & Vendors ---
export const getAllMasterCatalogue = async (): Promise<MasterCatalogueItem[]> =>
  readConfigurationSlice('masterCatalogue');

export const saveMasterCatalogueItem = async (item: MasterCatalogueItem): Promise<void> => {
  await saveConfigViaBeOrFallback('masterCatalogue', item);
};

export const deleteMasterCatalogueItem = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('masterCatalogue', id);
};

export const getAllRoomsConfig = async (): Promise<RoomConfig[]> =>
  readConfigurationSlice('rooms');

export const saveRoomConfig = async (room: RoomConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('room', room);
};

export const deleteRoomConfig = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('room', id);
};

export const getAllVendors = async (): Promise<Vendor[]> =>
  readConfigurationSlice('vendors');

export const saveVendor = async (vendor: Vendor): Promise<void> => {
  await saveConfigViaBeOrFallback('vendor', vendor);
};

export const deleteVendor = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('vendor', id);
};

// --- Users ---
export const getAllUsers = async (): Promise<User[]> =>
  readConfigurationSlice('users');

export const saveUser = async (user: User): Promise<void> => {
  await saveConfigViaBeOrFallback('user', user);
};

export const deleteUser = async (id: number): Promise<void> => {
  await deleteConfigViaBeOrFallback('user', id);
};

/** Sync all users from public.users to Supabase Auth via capexbe. */
export const syncUsersToAuth = async (
  appUserId: number,
): Promise<{
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
}> => {
  const { postSyncUsersToAuth } = await import('./userAdminApi');
  return postSyncUsersToAuth(appUserId);
};

// --- Roles ---
export const getAllRoles = async (): Promise<UserRole[]> =>
  readConfigurationSlice('roles');

export const saveRole = async (role: UserRole): Promise<void> => {
  await saveConfigViaBeOrFallback('role', role);
};

export const deleteRole = async (id: number): Promise<void> => {
  await deleteConfigViaBeOrFallback('role', id);
};

// --- Master Data ---
export const getAllHospitalUnitsConfig = async (): Promise<HospitalUnitConfig[]> =>
  withRequestCache('cfg:hospital_units', () =>
    readConfigurationSlice('hospitalUnits'),
    45_000,
  );

export const saveHospitalUnitConfig = async (hu: HospitalUnitConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('hospitalUnit', hu);
  invalidateRequestCache('cfg:hospital_units');
};

export const deleteHospitalUnitConfig = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('hospitalUnit', id);
  invalidateRequestCache('cfg:hospital_units');
};

export const getAllArchetypesConfig = async (): Promise<ArchetypeConfig[]> =>
  withRequestCache('cfg:archetypes', () =>
    readConfigurationSlice('archetypes'),
    45_000,
  );

export const saveArchetypeConfig = async (archetype: ArchetypeConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('archetype', archetype);
  invalidateRequestCache('cfg:archetypes');
};

export const deleteArchetypeConfig = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('archetype', id);
  invalidateRequestCache('cfg:archetypes');
};

export const getAllRegionalsConfig = async (): Promise<RegionalConfig[]> =>
  readConfigurationSlice('regionals');

export const saveRegionalConfig = async (regional: RegionalConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('regional', regional);
};

export const deleteRegionalConfig = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('regional', id);
};

// --- Tasks ---
export const getAllTasks = async (): Promise<Task[]> =>
  withRequestCache('cfg:tasks', () => readConfigurationSlice('tasks'), 30_000);

export const saveTask = async (task: Task): Promise<void> => {
  await saveConfigViaBeOrFallback('task', task);
  invalidateRequestCache('cfg:tasks');
};

export const deleteTask = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('task', id);
  invalidateRequestCache('cfg:tasks');
};

// --- Workflow Sets ---
export const getAllWorkflowSets = async (): Promise<WorkflowSet[]> =>
  withRequestCache('cfg:workflow_sets', () =>
    readConfigurationSlice('workflows'),
    30_000,
  );

export const saveWorkflowSet = async (workflowSet: WorkflowSet): Promise<void> => {
  await saveConfigViaBeOrFallback('workflowSet', workflowSet);
  invalidateRequestCache('cfg:workflow_sets');
};

export const deleteWorkflowSet = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('workflowSet', id);
  invalidateRequestCache('cfg:workflow_sets');
};

// --- Asset Type Groups ---
export const getAllAssetTypeGroups = async (): Promise<AssetTypeGroupConfig[]> =>
  withRequestCache('cfg:asset_type_groups', () =>
    readConfigurationSlice('assetTypeGroups'),
    60_000,
  );

export const saveAssetTypeGroup = async (group: AssetTypeGroupConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('assetTypeGroup', group);
  invalidateRequestCache('cfg:asset_type_groups');
};

export const deleteAssetTypeGroup = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('assetTypeGroup', id);
  invalidateRequestCache('cfg:asset_type_groups');
};

// --- Asset Type Configs ---
export const getAllAssetTypeConfigs = async (): Promise<AssetTypeConfig[]> =>
  withRequestCache('cfg:asset_type_configs', () =>
    readConfigurationSlice('assetTypeConfigs'),
    60_000,
  );

export const getActiveAssetTypeConfigs = async (): Promise<AssetTypeConfig[]> => {
  const all = await getAllAssetTypeConfigs();
  return all.filter((at) => at.isActive);
};

export const saveAssetTypeConfig = async (assetType: AssetTypeConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('assetTypeConfig', assetType);
  invalidateRequestCache('cfg:asset_type_configs');
};

export const deleteAssetTypeConfig = async (id: string): Promise<void> => {
  await deleteConfigViaBeOrFallback('assetTypeConfig', id);
  invalidateRequestCache('cfg:asset_type_configs');
};

// --- App Config ---
export const getAppConfig = async (key: string): Promise<AppConfig | undefined> => {
  const fromBe = await readAppConfigFromBackend(key);
  if (fromBe !== undefined) return fromBe ?? undefined;
  return readAppConfigFromDb(key);
};

export const saveAppConfig = async (config: AppConfig): Promise<void> => {
  await saveConfigViaBeOrFallback('appConfig', config);
};

export const getSidebarMenuVisibility = async (): Promise<Partial<Record<Page, boolean>>> => {
  try {
    const row = await getAppConfig(SIDEBAR_MENU_VISIBILITY_KEY);
    return normalizeSidebarMenuVisibility(row?.value);
  } catch {
    return {};
  }
};

export const saveSidebarMenuVisibility = async (
  visibility: Partial<Record<Page, boolean>>,
): Promise<void> => {
  const existing = await getAppConfig(SIDEBAR_MENU_VISIBILITY_KEY);
  if (!existing) {
    await saveAppConfig({
      key: SIDEBAR_MENU_VISIBILITY_KEY,
      value: {},
    });
  }

  await saveAppConfig({
    key: SIDEBAR_MENU_VISIBILITY_KEY,
    value: visibility,
  });
};
