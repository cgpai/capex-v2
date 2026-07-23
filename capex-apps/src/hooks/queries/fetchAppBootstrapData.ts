import type { BudgetMultiYear, BudgetPeriod, User, UserRole } from '@/types';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { fetchAppInitPackFromBackend } from '@/services/appBootstrapApi';
import { useBackendSession } from '@/lib/auth/authConstants';
import { readCachedAuthUser } from '@/lib/authSessionCache';
import { fetchAuthMe } from '@/lib/auth/authApi';

/** User id for backend bootstrap — never trust local cache without a live /me in BFF mode. */
async function resolveBootstrapUserId(): Promise<number | null> {
  if (typeof window === 'undefined') return null;

  if (useBackendSession()) {
    const me = await fetchAuthMe();
    if (me?.authenticated && me.user?.id) return me.user.id;
    return null;
  }

  const fromSession = sessionStorage.getItem('currentUserId');
  if (fromSession) {
    const uid = parseInt(fromSession, 10);
    if (Number.isFinite(uid)) return uid;
  }

  const cached = readCachedAuthUser();
  if (cached?.id) return cached.id;

  return null;
}

export type AppBootstrapPayload = {
  users: User[];
  roles: UserRole[];
  multiYears: BudgetMultiYear[];
  allPeriods: BudgetPeriod[];
};

export async function fetchAppBootstrapData(
  knownUserId?: number | null,
): Promise<AppBootstrapPayload> {
  let users: User[] = [];
  let roles: UserRole[] = [];
  let multiYears: BudgetMultiYear[] = [];
  let periodSummaries: BudgetPeriod[] = [];

  const bootstrapUserId =
    knownUserId != null && Number.isFinite(knownUserId)
      ? knownUserId
      : await resolveBootstrapUserId();

  const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
  if (base && typeof window !== 'undefined') {
    const uid = bootstrapUserId;
    if (uid != null) {
      let accessToken: string | null = null;
      if (!useBackendSession()) {
        accessToken = (await getAccessTokenForBackend()) ?? null;
      }

      if (useBackendSession() || accessToken) {
        const pack = await fetchAppInitPackFromBackend(accessToken, uid);
        if (pack?.users?.length) {
          users = pack.users;
          roles = pack.roles;
          multiYears = pack.multiYears;
          periodSummaries = pack.periodSummaries;
        }
      }
    }
  }

  if (!users.length) {
    console.warn(
      '[bootstrap] Backend pack unavailable — sign in and ensure capexbe is running.',
    );
  }

  return { users, roles, multiYears, allPeriods: periodSummaries };
}
