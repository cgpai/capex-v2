import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import {
  CONFIGURATION_SLICE_KEYS,
  type ConfigSliceKey,
  type ConfigurationDataPack,
} from '@/services/configurationApi';

export const CONFIGURATION_ACTIVE_TAB_KEY = 'capex.configuration.activeTab.v1';

export const CONFIGURATION_TABS = [
  'Users & Roles',
  'Master Data',
  'Budget & Project',
  'Workflow',
  'Pipeline & Vendors',
  'Data Management',
  'Database Inspector',
] as const;

export type ConfigurationTab = (typeof CONFIGURATION_TABS)[number];

/**
 * Slice yang tidak di-auto-revalidate saat ganti tab (hindari fetch berulang).
 * Tetap disinkronkan lewat Realtime Supabase + event CRUD admin.
 */
export const USER_MANAGED_CONFIGURATION_SLICES = [
  'assetTypeConfigs',
  'assetTypeGroups',
  'projectPriorities',
] as const satisfies readonly ConfigSliceKey[];

const USER_MANAGED_SLICE_SET = new Set<ConfigSliceKey>(USER_MANAGED_CONFIGURATION_SLICES);

export function isUserManagedConfigurationSlice(slice: ConfigSliceKey): boolean {
  return USER_MANAGED_SLICE_SET.has(slice);
}

/** Buang slice user-managed dari daftar auto-refresh tab (bukan dari Realtime). */
export function excludeUserManagedConfigurationSlices(
  slices: readonly ConfigSliceKey[],
): ConfigSliceKey[] {
  return slices.filter((s) => !isUserManagedConfigurationSlice(s));
}

/** Slice untuk tab default — users/roles/allPeriods biasanya sudah di bootstrap. */
export const INITIAL_CRITICAL_SLICES: ConfigSliceKey[] = [
  'archetypes',
  'hospitalUnits',
];

export const TAB_REQUIRED_SLICES: Record<ConfigurationTab, ConfigSliceKey[]> = {
  'Users & Roles': ['users', 'roles', 'archetypes', 'hospitalUnits'],
  'Master Data': ['archetypes', 'hospitalUnits', 'regionals'],
  'Budget & Project': ['budgetCategories', 'projectPriorities', 'assetTags'],
  Workflow: ['tasks', 'workflows', 'assetTypeConfigs', 'assetTypeGroups', 'roles'],
  'Pipeline & Vendors': ['masterCatalogue', 'rooms', 'vendors'],
  'Data Management': ['allPeriods'],
  'Database Inspector': [],
};

/** Tidak ada auto-revalidate saat ganti tab — master hanya berubah lewat Save eksplisit. */
export const TAB_REVALIDATE_ON_ACTIVE_SLICES: Partial<Record<ConfigurationTab, ConfigSliceKey[]>> = {};

const BACKGROUND_SLICES: ConfigSliceKey[] = CONFIGURATION_SLICE_KEYS.filter(
  (k) => !INITIAL_CRITICAL_SLICES.includes(k),
);

export function getBackgroundSliceKeys(): ConfigSliceKey[] {
  return [...BACKGROUND_SLICES];
}

export function hasConfigurationSlice(
  pack: Partial<ConfigurationDataPack> | null | undefined,
  key: ConfigSliceKey,
): boolean {
  return pack != null && Object.prototype.hasOwnProperty.call(pack, key) && Array.isArray(pack[key]);
}

export function getMissingSlices(
  pack: Partial<ConfigurationDataPack> | null | undefined,
  slices: readonly ConfigSliceKey[],
): ConfigSliceKey[] {
  return slices.filter((key) => !hasConfigurationSlice(pack, key));
}

export function createEmptyConfigurationPack(): ConfigurationDataPack {
  return {
    users: [],
    roles: [],
    archetypes: [],
    hospitalUnits: [],
    regionals: [],
    tasks: [],
    workflows: [],
    assetTypeConfigs: [],
    assetTypeGroups: [],
    budgetCategories: [],
    projectPriorities: [],
    masterCatalogue: [],
    rooms: [],
    vendors: [],
    allPeriods: [],
    assetTags: [],
  };
}

export function buildSeedFromBootstrap(
  bootstrap: AppBootstrapPayload | undefined,
): Partial<ConfigurationDataPack> {
  if (!bootstrap) return {};
  return {
    users: bootstrap.users,
    roles: bootstrap.roles,
    allPeriods: bootstrap.allPeriods,
  };
}

/** Gabungkan slice yang sudah dimuat — jangan isi slice lain dengan array kosong (agar lazy-load tetap akurat). */
export function mergeConfigurationPack(
  base: Partial<ConfigurationDataPack> | null | undefined,
  partial: Partial<ConfigurationDataPack> | null | undefined,
): Partial<ConfigurationDataPack> {
  return { ...(base ?? {}), ...(partial ?? {}) };
}

/** Nilai aman untuk render UI (slice belum dimuat → array kosong). */
export function toRenderableConfigurationPack(
  pack: Partial<ConfigurationDataPack> | null | undefined,
): ConfigurationDataPack {
  const empty = createEmptyConfigurationPack();
  return { ...empty, ...pack };
}

export function isConfigurationTabReady(
  pack: Partial<ConfigurationDataPack> | null | undefined,
  tab: ConfigurationTab,
): boolean {
  const required = TAB_REQUIRED_SLICES[tab];
  if (!required.length) return true;
  return required.every((key) => hasConfigurationSlice(pack, key));
}

export function isMinimalConfigurationReady(
  pack: Partial<ConfigurationDataPack> | null | undefined,
): boolean {
  return (
    hasConfigurationSlice(pack, 'users') &&
    hasConfigurationSlice(pack, 'roles') &&
    hasConfigurationSlice(pack, 'archetypes') &&
    hasConfigurationSlice(pack, 'hospitalUnits')
  );
}
