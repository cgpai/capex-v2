import { fetchProjectListMaster, type ProjectListMasterBundle } from '@/services/capexProjectListApi';
import { withRequestCache } from '@/lib/requestCache';

export type { ProjectListMasterBundle };

const MASTER_REQUEST_TTL_MS = 5 * 60 * 1000;

/** Master config with in-flight dedupe — shared across CPL table pages. */
export async function fetchCapexProjectListMaster(
  userId: number,
  accessToken?: string | null,
  options?: { skipCache?: boolean },
): Promise<ProjectListMasterBundle> {
  if (options?.skipCache) {
    return fetchProjectListMaster(userId, accessToken);
  }
  return withRequestCache(
    `capex-project-list:master:${userId}`,
    () => fetchProjectListMaster(userId, accessToken),
    MASTER_REQUEST_TTL_MS,
  );
}
