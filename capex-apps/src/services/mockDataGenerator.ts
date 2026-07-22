import {
    BudgetPeriod, User, UserRole, Permission, HierarchyLevel, HIERARCHY_LEVELS, PermissionLevel, PERMISSION_LEVELS,
    HospitalUnitConfig, ArchetypeConfig, RegionalConfig, Task, WorkflowSet, WorkflowStep, BudgetCategoryConfig,
    BudgetItem, Project, Asset, ProjectStatus, ProjectType, UserAssignment, BudgetMultiYear, ProjectPriorityConfig,
    PIPELINE_ARCHETYPE_ID,
    Notification,
    Page,
    MasterCatalogueItem,
    RoomConfig,
    Vendor,
    AssetTypeConfig,
    AssetTypeGroupConfig,
    BDDPriority,
    AssetTagConfig
} from '../types';
import { MOCK_DATA_SEED_ENABLED } from '../lib/dataProtection';

export { MOCK_DATA_SEED_ENABLED };

/** Legacy mock seed removed — data is managed via capexbe BFF. */
export async function seedMockDataIfEmpty(): Promise<void> {
  if (!MOCK_DATA_SEED_ENABLED) return;
  throw new Error('Mock data seed removed. Use backend configuration and data migration tools.');
}

export async function generateMockData(): Promise<void> {
  throw new Error('Mock data generation removed. Use backend configuration.');
}

// Re-export mock config constants for any UI that still references them.
export const MOCK_BUDGET_CATEGORIES: BudgetCategoryConfig[] = [];
export const MOCK_PROJECT_PRIORITIES: ProjectPriorityConfig[] = [];
export const MOCK_ASSET_TAGS: AssetTagConfig[] = [];
