import type { Project, PurchaseOrder } from '../types';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { getCurrentAppUserIdFromSession } from '../features/configuration/shared/configSession';
import { resolveMyTasksAccessToken } from './myTasksApi';
import { getAccessTokenForBackend } from '../lib/authSession';

async function resolveToken(): Promise<string | null> {
  return resolveMyTasksAccessToken(getAccessTokenForBackend);
}

function resolveUserId(userId?: number | null): number | null {
  if (userId != null && Number.isFinite(userId)) return userId;
  return getCurrentAppUserIdFromSession();
}

export async function fetchPurchaseOrderFromBackend(
  poId: string,
  userId?: number | null,
): Promise<PurchaseOrder | null | undefined> {
  const uid = resolveUserId(userId);
  if (uid == null || !poId.trim() || !isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<{ purchaseOrder?: PurchaseOrder | null }>(
      '/budget-hu/purchase-order/get',
      { userId: uid, poId: poId.trim() },
      token,
    );
    return body.purchaseOrder ?? null;
  } catch {
    return undefined;
  }
}

export async function fetchPurchaseOrdersForProjectFromBackend(
  projectId: string,
  userId?: number | null,
): Promise<PurchaseOrder[] | undefined> {
  const uid = resolveUserId(userId);
  if (uid == null || !projectId.trim() || !isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<{ purchaseOrders?: PurchaseOrder[] }>(
      '/budget-hu/purchase-orders/for-project',
      { userId: uid, projectId: projectId.trim() },
      token,
    );
    return Array.isArray(body.purchaseOrders) ? body.purchaseOrders : [];
  } catch {
    return undefined;
  }
}

export async function fetchProjectsForPeriodFromBackend(
  periodName: string,
  userId?: number | null,
): Promise<Project[] | undefined> {
  const uid = resolveUserId(userId);
  const pn = periodName.trim();
  if (uid == null || !pn || !isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<{ projects?: Project[] }>(
      '/budget-hu/projects-for-period',
      { userId: uid, periodName: pn },
      token,
    );
    return Array.isArray(body.projects) ? body.projects : [];
  } catch {
    return undefined;
  }
}

export async function fetchProjectAssetCountsFromBackend(
  periodName: string,
  userId?: number | null,
): Promise<Record<string, number> | undefined> {
  const uid = resolveUserId(userId);
  const pn = periodName.trim();
  if (uid == null || !pn || !isCapexBeConfigured()) return undefined;
  try {
    const token = await resolveToken();
    const body = await postToCapexBe<Record<string, number>>(
      '/budget-hu/project-asset-counts',
      { userId: uid, periodName: pn },
      token,
    );
    return body && typeof body === 'object' ? body : {};
  } catch {
    return undefined;
  }
}
