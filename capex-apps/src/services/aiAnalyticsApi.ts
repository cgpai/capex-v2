import type { GlobalAnalyticsResponse } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { resolveMyTasksAccessToken } from './myTasksApi';

export async function fetchGlobalAnalyticsFromBackend(
  userId: number,
): Promise<GlobalAnalyticsResponse | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('aiAnalytics.global', 'fallback', { reason: 'missing_base_url' });
    return null;
  }

  try {
    const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
    const data = await postToCapexBe<GlobalAnalyticsResponse>(
      '/ai-analytics/global',
      { userId },
      token,
    );
    trackBackendFetch('aiAnalytics.global', 'success');
    return data;
  } catch {
    trackBackendFetch('aiAnalytics.global', 'fallback', { reason: 'network_error' });
    return null;
  }
}
