import type { TimelineItem } from '../types';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { getAccessTokenForBackend } from '../lib/authSession';
import { getCurrentAppUserIdFromSession } from '../features/configuration/shared/configSession';
import { resolveMyTasksAccessToken } from './myTasksApi';

export type AssetTimelineRequestBody = {
  assetId: string;
  workflowSetId: string;
  projectId?: string;
};

/** Build timeline di server (1 round-trip) — same merge logic dengan getTimelineForAsset di FE. */
export async function fetchAssetTimelineFromBe(
  body: AssetTimelineRequestBody,
  accessToken?: string | null,
  userId?: number | null,
): Promise<{ items: TimelineItem[] } | null> {
  if (!isCapexBeConfigured()) return null;
  const uid = userId ?? getCurrentAppUserIdFromSession();
  if (uid == null) return null;
  try {
    const token =
      accessToken !== undefined ? accessToken : await resolveMyTasksAccessToken(getAccessTokenForBackend);
    return await postToCapexBe<{ items: TimelineItem[] }>(
      '/asset-timeline',
      { ...body, userId: uid },
      token,
    );
  } catch {
    return null;
  }
}
