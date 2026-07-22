'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import {
  fetchAuthMe,
  heartbeatBackend,
  logoutBackend,
  refreshBackendSessionCoordinated,
} from '../../lib/auth/authApi';
import { authDebug } from '../../lib/auth/authDebug';
import { clearTabSessionState } from '../../lib/auth/clearTabSessionState';
import { useTabSessionTimeout } from '../../hooks/useTabSessionTimeout';
import { useUserIdleTimeout } from '../../hooks/useUserIdleTimeout';
import {
  useBackendSession,
  TAB_HIDDEN_TIMEOUT_MS,
  SESSION_REFRESH_INTERVAL_MS,
} from '../../lib/auth/authConstants';
import { clearCachedAuthUser } from '../../lib/authSessionCache';
import { subscribeSessionRefreshed } from '../../lib/auth/tabSessionBroadcast';
import { updateSessionMeta, getSessionMeta } from '../../lib/auth/sessionMetaStore';
import { resetActivityTimestamp } from '../../lib/auth/userActivityTracker';
import { isBackendSessionValid } from '../../lib/auth/sessionValidity';
import { mergeAuthIdentityUser } from '../../lib/auth/mergeAuthIdentityUser';

export type ForceLogoutOptions = {
  /** Backend revoke already performed (e.g. tab-timeout idle logout). */
  skipBackend?: boolean;
};

type Props = {
  onForceLogout: (options?: ForceLogoutOptions) => void | Promise<void>;
};

const HEARTBEAT_INTERVAL_MS = 4 * 60 * 1000;
const REFRESH_INTERVAL_MS = SESSION_REFRESH_INTERVAL_MS;
/** After login, do not treat refresh failures as logout (ms). */
const POST_LOGIN_GRACE_MS = 15_000;

/**
 * Syncs backend session, refresh, heartbeat, idle timeouts, and cross-tab coordination.
 */
export function AuthSessionSync({ onForceLogout }: Props) {
  const enabled = useBackendSession();
  const idleTimeoutMs = useAuthStore((s) => s.idleTimeoutMs);
  const status = useAuthStore((s) => s.status);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const loginGraceUntilRef = useRef(0);

  const handleIdleTimeout = useCallback(() => {
    clearCachedAuthUser();
    clearTabSessionState();
    queueMicrotask(() => useAuthStore.getState().clearSession());
    void logoutBackend();
    void onForceLogout({ skipBackend: true });
  }, [onForceLogout]);

  const confirmSessionOrLogout = useCallback(async () => {
    const stillValid = await isBackendSessionValid();
    if (!stillValid) {
      authDebug('session invalid after refresh failure — logout');
      handleIdleTimeout();
      return;
    }
    const me = await fetchAuthMe();
    if (me?.user?.session) {
      updateSessionMeta(me.user.session);
    }
  }, [handleIdleTimeout]);

  const tryRefreshSession = useCallback(async () => {
    if (Date.now() < loginGraceUntilRef.current) {
      authDebug('refresh skipped — post-login grace period');
      return;
    }
    const ok = await refreshBackendSessionCoordinated();
    if (ok) {
      resetActivityTimestamp();
      const me = await fetchAuthMe();
      if (me?.user?.session) updateSessionMeta(me.user.session);
      void heartbeatBackend();
      return;
    }
    authDebug('refresh failed — verifying /me before logout');
    await confirmSessionOrLogout();
  }, [confirmSessionOrLogout]);

  useEffect(() => {
    if (status === 'authenticated') {
      loginGraceUntilRef.current = Date.now() + POST_LOGIN_GRACE_MS;
      clearTabSessionState();
      resetActivityTimestamp();
    }
  }, [status]);

  useTabSessionTimeout({
    enabled: enabled && status === 'authenticated',
    timeoutMs: TAB_HIDDEN_TIMEOUT_MS,
    onTimeout: handleIdleTimeout,
  });

  useUserIdleTimeout({
    enabled: enabled && status === 'authenticated',
    timeoutMs: idleTimeoutMs,
    onTimeout: handleIdleTimeout,
  });

  useEffect(() => {
    if (!enabled || status !== 'authenticated') return;
    return subscribeSessionRefreshed(() => {
      authDebug('peer tab refreshed session — sync metadata');
      void fetchAuthMe().then((me) => {
        if (me?.user?.session) updateSessionMeta(me.user.session);
      });
    });
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled || status !== 'authenticated') return;

    const tick = async () => {
      const me = await fetchAuthMe();
      if (me?.authenticated && me.user) {
        if (me.user.session) updateSessionMeta(me.user.session);
        queueMicrotask(() => {
          const prev = useAuthStore.getState().user;
          const merged = mergeAuthIdentityUser(
            {
              id: me.user!.id,
              username: me.user!.username,
              email: me.user!.email,
            },
            {
              meAssignments: me.user!.assignments,
              roleSlugs: me.user!.roles,
              previous: prev,
            },
          );
          useAuthStore.getState().setSession(
            merged,
            me.user!.roles,
            me.user!.idleTimeoutMs,
          );
        });
      }
    };
    void tick();

    const startTimers = () => {
      if (!heartbeatTimer.current) {
        heartbeatTimer.current = setInterval(() => {
          void heartbeatBackend();
        }, HEARTBEAT_INTERVAL_MS);
      }
      if (!refreshTimer.current) {
        refreshTimer.current = setInterval(() => {
          void tryRefreshSession();
        }, REFRESH_INTERVAL_MS);
      }
    };

    const stopTimers = () => {
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        resetActivityTimestamp();
        const meta = getSessionMeta();
        const accessStillValid =
          !meta?.accessExpiresAt || meta.accessExpiresAt > Date.now() + 60_000;
        if (!accessStillValid) {
          void tryRefreshSession();
        }
        startTimers();
      } else {
        stopTimers();
      }
    };

    if (document.visibilityState === 'visible') {
      startTimers();
    }

    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      stopTimers();
    };
  }, [enabled, tryRefreshSession, status]);

  return null;
}
