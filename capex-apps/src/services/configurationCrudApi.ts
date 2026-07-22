import { CapexBeHttpError, isCapexBeConfigured, isCapexBeNetworkError, postToCapexBe } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../lib/authSession';
import {
  dispatchConfigurationMasterChanged,
  slicesForCrudEntity,
} from '../lib/configurationCacheSync';
import { invalidateRequestCache } from '../lib/requestCache';

export type ConfigurationCrudEntity =
  | 'user'
  | 'role'
  | 'budgetCategory'
  | 'projectPriority'
  | 'assetTag'
  | 'regional'
  | 'archetype'
  | 'hospitalUnit'
  | 'task'
  | 'masterCatalogue'
  | 'room'
  | 'vendor'
  | 'appConfig'
  | 'assetTypeConfig'
  | 'assetTypeGroup'
  | 'workflowSet';

const STRICT_BACKEND_ENTITIES: ConfigurationCrudEntity[] = ['user', 'role'];

/** CRUD yang memperbarui UI lewat patch lokal + event (tanpa double-fetch tab lain). */
const LOCAL_ONLY_CRUD_ENTITIES = new Set<ConfigurationCrudEntity>([
  'projectPriority',
]);

function getCurrentAppUserIdFromSession(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('currentUserId');
  const uid = Number(raw);
  return Number.isFinite(uid) ? uid : null;
}

type CrudOptions = {
  strictBackend?: boolean;
};

async function resolveConfigurationAccessToken(): Promise<string | null> {
  if (useBackendSession() && typeof window !== 'undefined') {
    return null;
  }
  return getAccessTokenForBackend();
}

async function postConfigurationCrud<T>(
  path: 'save' | 'delete' | 'migrate-asset-type-workflow' | 'asset-type-usage-count' | 'migrate-asset-type-usage',
  body: Record<string, unknown>,
  options?: CrudOptions,
): Promise<T | null> {
  if (!isCapexBeConfigured()) {
    if (options?.strictBackend) {
      throw new Error(`Backend is required for configuration ${path}`);
    }
    return null;
  }
  try {
    const token = await resolveConfigurationAccessToken();
    return await postToCapexBe<T>(`/configuration/${path}`, body, token);
  } catch (err) {
    if (options?.strictBackend) {
      throw err instanceof Error ? err : new Error(`Configuration ${path} failed`);
    }
    // Network / BE-down only → local fallback. Real HTTP errors (validation, FK, RBAC) must surface.
    if (isCapexBeNetworkError(err)) {
      return null;
    }
    if (err instanceof CapexBeHttpError) {
      throw err;
    }
    throw err instanceof Error ? err : new Error(`Configuration ${path} failed`);
  }
}

export async function saveConfigurationEntityViaBackend<T extends object>(
  userId: number,
  entity: ConfigurationCrudEntity,
  payload: T,
  options?: CrudOptions,
): Promise<T | null> {
  return postConfigurationCrud<T>(
    'save',
    { userId, entity, payload: payload as Record<string, unknown> },
    options,
  );
}

export async function migrateAssetTypeWorkflowViaBackend(
  userId: number,
  fromWorkflowSetId: string,
  toWorkflowSetId: string,
): Promise<{ updatedCount: number } | null> {
  return postConfigurationCrud<{ updatedCount: number }>('migrate-asset-type-workflow', {
    userId,
    fromWorkflowSetId,
    toWorkflowSetId,
  });
}

export async function getAssetTypeUsageCountViaBackend(
  userId: number,
  assetTypeId: string,
): Promise<{ count: number } | null> {
  return postConfigurationCrud<{ count: number }>('asset-type-usage-count', {
    userId,
    assetTypeId,
  });
}

export async function migrateAssetTypeUsageViaBackend(
  userId: number,
  fromAssetTypeId: string,
  toAssetTypeId: string,
): Promise<{ updatedCount: number } | null> {
  return postConfigurationCrud<{ updatedCount: number }>('migrate-asset-type-usage', {
    userId,
    fromAssetTypeId,
    toAssetTypeId,
  });
}

/** Asset types are user-managed slices — still refresh Budget HU master bundle after CRUD. */
export function notifyAssetTypeMasterChanged(): void {
  invalidateRequestCache('cfg:asset_type');
  invalidateRequestCache('app:master:budget-hu:');
  dispatchConfigurationMasterChanged(['assetTypeConfigs', 'assetTypeGroups', 'workflows']);
}

export function notifyAppConfigChanged(): void {
  invalidateRequestCache('cfg:');
  invalidateRequestCache('app:master:budget-hu:');
  invalidateRequestCache('app:table:budget-hu:');
}

export async function deleteConfigurationEntityViaBackend(
  userId: number,
  entity: ConfigurationCrudEntity,
  id: string | number,
  options?: CrudOptions,
): Promise<boolean> {
  const result = await postConfigurationCrud<{ success?: boolean }>(
    'delete',
    { userId, entity, id },
    options,
  );
  return !!result?.success;
}

function notifyConfigurationMasterChanged(entity: ConfigurationCrudEntity): void {
  if (LOCAL_ONLY_CRUD_ENTITIES.has(entity)) return;
  const slices = slicesForCrudEntity(entity);
  if (slices.length) dispatchConfigurationMasterChanged(slices);
}

export async function saveConfigViaBeOrFallback<T extends object>(
  entity: ConfigurationCrudEntity,
  payload: T,
): Promise<T | null> {
  const strictBackend = STRICT_BACKEND_ENTITIES.includes(entity);
  const userId = getCurrentAppUserIdFromSession();
  if (userId != null) {
    const saved = await saveConfigurationEntityViaBackend<T>(userId, entity, payload, { strictBackend });
    if (saved) {
      if (entity === 'assetTypeConfig' || entity === 'assetTypeGroup') {
        notifyAssetTypeMasterChanged();
      } else if (entity === 'appConfig') {
        notifyAppConfigChanged();
      } else {
        notifyConfigurationMasterChanged(entity);
      }
      return saved;
    }
  }
  if (strictBackend) {
    throw new Error(`Backend save is required for ${entity}`);
  }
  throw new Error(`Backend save failed for ${entity}.`);
}

export async function deleteConfigViaBeOrFallback(
  entity: ConfigurationCrudEntity,
  id: string | number,
): Promise<void> {
  const strictBackend = STRICT_BACKEND_ENTITIES.includes(entity);
  const userId = getCurrentAppUserIdFromSession();
  if (userId != null) {
    const ok = await deleteConfigurationEntityViaBackend(userId, entity, id, { strictBackend });
    if (ok) {
      if (entity === 'assetTypeConfig' || entity === 'assetTypeGroup') {
        notifyAssetTypeMasterChanged();
      } else {
        notifyConfigurationMasterChanged(entity);
      }
      return;
    }
  }
  if (strictBackend) {
    throw new Error(`Backend delete is required for ${entity}`);
  }
  throw new Error(`Backend delete failed for ${entity}.`);
}
