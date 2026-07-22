import type { Asset, Project } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { useBackendSession } from '../lib/auth/authConstants';
import { capexBeRequestUrl } from '../lib/capexBeClient';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';
import { withRequestCache } from '../lib/requestCache';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type DuplicateProjectHit = {
  id: string;
  projectCode: string;
  projectName: string;
  hospitalUnitId: string;
  huName?: string;
  matchScore: number;
};

export type DuplicateAssetHit = {
  id: string;
  assetCode: string;
  assetName: string;
  projectId: string;
  projectCode?: string;
  projectName?: string;
  categoryId?: string;
  categoryName?: string;
  hospitalUnitId?: string;
  matchScore: number;
};

export type DuplicateSearchResult<T> = {
  items: T[];
  nextCursor: string | null;
  total: number;
};

type SearchParams = {
  userId: number;
  periodName: string;
  query: string;
  huId?: string;
  projectId?: string;
  excludeId?: string;
  cursor?: string;
  limit?: number;
};

async function postDuplicate<T>(path: string, body: Record<string, unknown>): Promise<T | null> {
  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (!base) return null;

  const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
  if (!useBackendSession() && !token) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await authenticatedFetch(capexBeRequestUrl(path), {
      method: 'POST',
      headers,
      credentials: useBackendSession() ? 'include' : 'same-origin',
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchDuplicateProjects(
  params: SearchParams,
): Promise<DuplicateSearchResult<DuplicateProjectHit>> {
  const cacheKey = `dup:proj:${params.userId}:${params.periodName}:${params.query}:${params.cursor ?? 0}`;
  const fallback = { items: [], nextCursor: null, total: 0 };
  return (
    (await withRequestCache(
      cacheKey,
      () =>
        postDuplicate<DuplicateSearchResult<DuplicateProjectHit>>(
          '/duplicate-detection/projects/search',
          { ...params },
        ),
      30_000,
    )) ?? fallback
  );
}

export async function searchDuplicateAssets(
  params: SearchParams,
): Promise<DuplicateSearchResult<DuplicateAssetHit>> {
  const cacheKey = `dup:asset:${params.userId}:${params.periodName}:${params.query}:${params.projectId ?? ''}:${params.cursor ?? 0}`;
  const fallback = { items: [], nextCursor: null, total: 0 };
  return (
    (await withRequestCache(
      cacheKey,
      () =>
        postDuplicate<DuplicateSearchResult<DuplicateAssetHit>>(
          '/duplicate-detection/assets/search',
          { ...params },
        ),
      30_000,
    )) ?? fallback
  );
}

export async function fetchDuplicateProject(
  userId: number,
  periodName: string,
  id: string,
): Promise<Project | null> {
  const result = await postDuplicate<{ project?: Project }>('/duplicate-detection/project', {
    userId,
    periodName,
    id,
  });
  return result?.project ?? null;
}

export async function fetchDuplicateAsset(
  userId: number,
  periodName: string,
  id: string,
): Promise<Asset | null> {
  const result = await postDuplicate<{ asset?: Asset }>('/duplicate-detection/asset', {
    userId,
    periodName,
    id,
  });
  return result?.asset ?? null;
}
