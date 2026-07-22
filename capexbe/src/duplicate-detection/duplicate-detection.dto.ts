export type DuplicateEntityType = 'project' | 'asset';

export type DuplicateSearchBody = {
  userId?: number;
  periodName?: string;
  query?: string;
  huId?: string;
  projectId?: string;
  excludeId?: string;
  cursor?: string;
  limit?: number;
};

export type DuplicateFetchBody = {
  userId?: number;
  periodName?: string;
  id?: string;
};

export function parseDuplicateSearchBody(body: unknown): {
  userId: number;
  periodName: string;
  query: string;
  huId?: string;
  projectId?: string;
  excludeId?: string;
  cursor: number;
  limit: number;
} {
  const b = (body && typeof body === 'object' ? body : {}) as DuplicateSearchBody;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) {
    throw new Error('Invalid userId');
  }
  const periodName = String(b.periodName ?? '').trim();
  if (!periodName) {
    throw new Error('periodName is required');
  }
  const query = String(b.query ?? '').trim();
  const cursor = Math.max(0, parseInt(String(b.cursor ?? '0'), 10) || 0);
  const limit = Math.min(25, Math.max(1, parseInt(String(b.limit ?? 10), 10) || 10));
  return {
    userId,
    periodName,
    query,
    huId: b.huId ? String(b.huId).trim() : undefined,
    projectId: b.projectId ? String(b.projectId).trim() : undefined,
    excludeId: b.excludeId ? String(b.excludeId).trim() : undefined,
    cursor,
    limit,
  };
}

export function parseDuplicateFetchBody(body: unknown): {
  userId: number;
  periodName: string;
  id: string;
} {
  const b = (body && typeof body === 'object' ? body : {}) as DuplicateFetchBody;
  const userId = Number(b.userId);
  if (!Number.isFinite(userId)) {
    throw new Error('Invalid userId');
  }
  const periodName = String(b.periodName ?? '').trim();
  const id = String(b.id ?? '').trim();
  if (!periodName || !id) {
    throw new Error('periodName and id are required');
  }
  return { userId, periodName, id };
}
