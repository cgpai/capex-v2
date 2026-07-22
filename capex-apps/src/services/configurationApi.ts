import type {
  User,
  UserRole,
  HospitalUnitConfig,
  ArchetypeConfig,
  RegionalConfig,
  Task,
  WorkflowSet,
  BudgetCategoryConfig,
  ProjectPriorityConfig,
  MasterCatalogueItem,
  RoomConfig,
  Vendor,
  BudgetPeriod,
  AssetTypeConfig,
  AssetTypeGroupConfig,
  AssetTagConfig,
} from '../types';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { useBackendSession } from '../lib/auth/authConstants';
import { capexBeRequestUrl, useBeBffProxy } from '../lib/capexBeClient';

const DEFAULT_TIMEOUT_MS = 120000;
const MAX_ATTEMPTS = 2;
const FORBIDDEN_COOLDOWN_MS = 60_000;
let forbiddenUntilTs = 0;

export const CONFIGURATION_SLICE_KEYS = [
  'users',
  'roles',
  'archetypes',
  'hospitalUnits',
  'regionals',
  'tasks',
  'workflows',
  'assetTypeConfigs',
  'assetTypeGroups',
  'budgetCategories',
  'projectPriorities',
  'masterCatalogue',
  'rooms',
  'vendors',
  'allPeriods',
  'assetTags',
] as const;

export type ConfigSliceKey = (typeof CONFIGURATION_SLICE_KEYS)[number];

export type ConfigurationDataPack = {
  users: User[];
  roles: UserRole[];
  archetypes: ArchetypeConfig[];
  hospitalUnits: HospitalUnitConfig[];
  regionals: RegionalConfig[];
  tasks: Task[];
  workflows: WorkflowSet[];
  assetTypeConfigs: AssetTypeConfig[];
  assetTypeGroups: AssetTypeGroupConfig[];
  budgetCategories: BudgetCategoryConfig[];
  projectPriorities: ProjectPriorityConfig[];
  masterCatalogue: MasterCatalogueItem[];
  rooms: RoomConfig[];
  vendors: Vendor[];
  allPeriods: BudgetPeriod[];
  assetTags: AssetTagConfig[];
};

async function postPack(
  accessToken: string | null,
  userId: number,
  slices?: ConfigSliceKey[],
  skipCache = false,
): Promise<Partial<ConfigurationDataPack> | null> {
  const bff = useBeBffProxy();
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!bff && !base) {
    trackBackendFetch('configuration.pack', 'fallback', { reason: 'missing_base_url' });
    return null;
  }
  const uid = Number(userId);
  if (!Number.isFinite(uid)) {
    trackBackendFetch('configuration.pack', 'fallback', { reason: 'invalid_user_id' });
    return null;
  }

  const invoke = async (): Promise<Partial<ConfigurationDataPack> | null> => {
    if (Date.now() < forbiddenUntilTs) {
      trackBackendFetch('configuration.pack', 'fallback', {
        reason: 'forbidden_cooldown',
        httpStatus: 403,
      });
      return null;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/configuration/pack'), {
        method: 'POST',
        headers: {
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: bff || useBackendSession() ? 'include' : 'same-origin',
        body: JSON.stringify({
          userId: uid,
          ...(slices?.length ? { slices } : {}),
          ...(skipCache ? { skipCache: true } : {}),
        }),
        signal: controller.signal,
        ...(bff ? { retryOn401: true } : {}),
      });
      if (!res.ok) {
        if (res.status === 403) {
          forbiddenUntilTs = Date.now() + FORBIDDEN_COOLDOWN_MS;
        }
        trackBackendFetch('configuration.pack', 'fallback', { reason: 'http_error', httpStatus: res.status });
        return null;
      }
      const json = (await res.json()) as Partial<ConfigurationDataPack> | null;
      trackBackendFetch('configuration.pack', 'success');
      return json && typeof json === 'object' ? json : null;
    } catch {
      trackBackendFetch('configuration.pack', 'fallback', { reason: 'network_error' });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await invoke();
    if (result) return result;
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
  return null;
}

export async function fetchConfigurationPackFromBackend(
  accessToken: string | null,
  userId: number,
): Promise<Partial<ConfigurationDataPack> | null> {
  return postPack(accessToken, userId);
}

export async function fetchConfigurationSlicesFromBackend(
  accessToken: string | null,
  userId: number,
  slices: ConfigSliceKey[],
  options?: { skipCache?: boolean },
): Promise<Partial<ConfigurationDataPack> | null> {
  if (!slices.length) return {};
  return postPack(accessToken, userId, slices, !!options?.skipCache);
}

/**
 * Fresh configuration slices — backend-only when Supabase fallback is disabled.
 */
export async function fetchFreshConfigurationSlices(
  accessToken: string | null,
  userId: number,
  slices: ConfigSliceKey[],
): Promise<Partial<ConfigurationDataPack>> {
  const keys = [...new Set(slices)];
  if (!keys.length) return {};

  const fromBe = await fetchConfigurationSlicesFromBackend(accessToken, userId, keys, {
    skipCache: true,
  });
  const beComplete = fromBe && keys.every((k) => Array.isArray(fromBe[k]));
  if (beComplete) return fromBe;

  return fromBe ?? {};
}

export function isCompleteConfigurationPack(p: Partial<ConfigurationDataPack>): p is ConfigurationDataPack {
  return (
    Array.isArray(p.users) &&
    Array.isArray(p.roles) &&
    Array.isArray(p.archetypes) &&
    Array.isArray(p.hospitalUnits) &&
    Array.isArray(p.regionals) &&
    Array.isArray(p.tasks) &&
    Array.isArray(p.workflows) &&
    Array.isArray(p.assetTypeConfigs) &&
    Array.isArray(p.assetTypeGroups) &&
    Array.isArray(p.budgetCategories) &&
    Array.isArray(p.projectPriorities) &&
    Array.isArray(p.masterCatalogue) &&
    Array.isArray(p.rooms) &&
    Array.isArray(p.vendors) &&
    Array.isArray(p.allPeriods) &&
    Array.isArray(p.assetTags)
  );
}
