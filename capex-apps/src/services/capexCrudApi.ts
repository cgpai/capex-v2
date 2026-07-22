import type { Asset, BudgetPeriod, Project, PurchaseOrder } from '../types';
import { postToCapexBe, isCapexBeConfigured } from '../lib/capexBeClient';
import { useBackendSession } from '../lib/auth/authConstants';
import { getAccessTokenForBackend } from '../lib/authSession';

async function resolveCapexBeAccessToken(): Promise<string | null> {
  if (useBackendSession() && typeof window !== 'undefined') {
    return null;
  }
  return getAccessTokenForBackend();
}

async function postCrudToBackend<T>(
  paths: string[],
  body: Record<string, unknown>,
): Promise<T | null> {
  if (!isCapexBeConfigured()) return null;

  const token = await resolveCapexBeAccessToken();
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      return await postToCapexBe<T>(path, body, token);
    } catch (err) {
      lastError = err;
      const status =
        err && typeof err === 'object' && 'status' in err
          ? Number((err as { status?: number }).status)
          : NaN;
      // Only fall through to path aliases on 404; surface real auth/validation errors.
      if (status !== 404) {
        throw err;
      }
    }
  }
  if (lastError) throw lastError;
  return null;
}

export type SaveBudgetHuBackendOptions = {
  huId: string;
  changedProjectIds: string[];
  deletedProjectIds?: string[];
  touchedAssetIds?: string[];
  partial?: boolean;
  projectsOnly?: boolean;
};

export async function saveBudgetHuViaBackend(
  userId: number,
  periodName: string,
  budgetPeriod: BudgetPeriod,
  options?: SaveBudgetHuBackendOptions,
): Promise<BudgetPeriod | null> {
  const result = await postCrudToBackend<{ budgetPeriod?: BudgetPeriod }>(
    ['/budget-hu/save', '/budget-hu/save-period'],
    {
      userId,
      periodName,
      budgetPeriod,
      partial: options?.partial ?? false,
      huId: options?.huId,
      changedProjectIds: options?.changedProjectIds,
      deletedProjectIds: options?.deletedProjectIds,
      touchedAssetIds: options?.touchedAssetIds,
      projectsOnly: options?.projectsOnly,
    },
  );
  return result?.budgetPeriod ?? null;
}

export async function allocateProjectCodeViaBackend(input: {
  userId: number;
  periodName: string;
  huCode: string;
  preferredCode?: string;
  excludeProjectId?: string;
}): Promise<string | null> {
  const result = await postCrudToBackend<{ projectCode?: string }>(
    ['/budget-hu/allocate-project-code'],
    input,
  );
  return result?.projectCode?.trim() || null;
}

export async function allocateAssetCodeViaBackend(input: {
  userId: number;
  projectCode: string;
  preferredCode?: string;
  excludeAssetId?: string;
}): Promise<string | null> {
  const result = await postCrudToBackend<{ assetCode?: string }>(
    ['/budget-hu/allocate-asset-code'],
    input,
  );
  return result?.assetCode?.trim() || null;
}

export async function saveProjectViaBackend(
  userId: number,
  periodName: string,
  project: Project,
): Promise<Project | null> {
  const result = await postCrudToBackend<{ project?: Project }>(
    ['/budget-hu/save-project', '/project/save', '/projects/save'],
    { userId, periodName, project },
  );
  return result?.project ?? null;
}

export async function saveAssetViaBackend(
  userId: number,
  periodName: string,
  asset: Asset,
): Promise<Asset | null> {
  const result = await postCrudToBackend<{ asset?: Asset }>(
    ['/budget-hu/save-asset', '/asset/save', '/assets/save'],
    { userId, periodName, asset },
  );
  return result?.asset ?? null;
}

export async function savePurchaseOrderViaBackend(
  userId: number,
  periodName: string,
  purchaseOrder: PurchaseOrder,
  action: 'create' | 'update' = 'create',
): Promise<PurchaseOrder | null> {
  const result = await postCrudToBackend<{ purchaseOrder?: PurchaseOrder }>(
    ['/budget-hu/save-purchase-order'],
    { userId, periodName, purchaseOrder, action },
  );
  return result?.purchaseOrder ?? null;
}
