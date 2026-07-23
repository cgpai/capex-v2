import type { DailyMOMSummaryRow } from '@/types';
import type { UserScopesForCapex } from '@/lib/capexProjectListScope';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { useBackendSession } from '@/lib/auth/authConstants';
import { authenticatedFetch } from '@/lib/auth/authenticatedFetch';
import { capexBeRequestUrl, isCapexBeConfigured, useBeBffProxy } from '@/lib/capexBeClient';
import { resolveMyTasksAccessToken } from '@/services/myTasksApi';
import { withRequestCache } from '@/lib/requestCache';

export async function fetchMomDailySummaryFromBackend(
  userId: number,
  periodName: string,
  summaryDate: string,
  userScopes: UserScopesForCapex,
): Promise<DailyMOMSummaryRow[] | null> {
  if (!isCapexBeConfigured()) return null;

  const cacheKey = `app:table:mom-daily-summary:${userId}:${periodName.trim().toLowerCase()}:${summaryDate.trim()}`;
  return withRequestCache(
    cacheKey,
    async () => {
      const bff = useBeBffProxy();
      const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
      if (!bff && !useBackendSession() && !token) return null;

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/mom-daily-summary/rows'), {
        method: 'POST',
        headers,
        credentials: bff || useBackendSession() ? 'include' : 'same-origin',
        body: JSON.stringify({
          userId,
          periodName,
          summaryDate,
          scopeAll: userScopes.all,
          scopeHuNames: Array.from(userScopes.hus),
          scopeArchetypeNames: Array.from(userScopes.archetypes),
        }),
        ...(bff ? { retryOn401: true } : {}),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { rows?: DailyMOMSummaryRow[] };
      return Array.isArray(data.rows) ? data.rows : [];
    },
    2 * 60 * 1000,
  );
}
