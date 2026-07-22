'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  getLastActivityAt,
  startUserActivityTracker,
  subscribeUserActivity,
} from '../lib/auth/userActivityTracker';
import {
  broadcastForceLogout,
  subscribeForceLogout,
} from '../lib/auth/tabSessionBroadcast';
import { IDLE_TIMEOUT_MS } from '../lib/auth/authConstants';

export type UseUserIdleTimeoutOptions = {
  enabled?: boolean;
  timeoutMs?: number;
  onTimeout: () => void;
};

/**
 * Logout when user has no mouse/keyboard activity for `timeoutMs` while tab is visible.
 * Complements tab-hidden idle timeout (useTabSessionTimeout).
 */
export function useUserIdleTimeout(options: UseUserIdleTimeoutOptions): void {
  const { enabled = true, timeoutMs = IDLE_TIMEOUT_MS, onTimeout } = options;
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fireTimeout = useCallback((syncOtherTabs: boolean) => {
    if (firedRef.current) return;
    firedRef.current = true;
    if (syncOtherTabs) {
      broadcastForceLogout();
    }
    onTimeoutRef.current();
  }, []);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      firedRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    firedRef.current = false;
    const stopTracker = startUserActivityTracker();

    const checkIdle = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - getLastActivityAt() >= timeoutMs) {
        fireTimeout(true);
      }
    };

    timerRef.current = setInterval(checkIdle, 60_000);

    const unsubActivity = subscribeUserActivity(() => {
      firedRef.current = false;
    });

    const unsubLogout = subscribeForceLogout(() => {
      fireTimeout(false);
    });

    return () => {
      stopTracker();
      unsubActivity();
      unsubLogout();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [enabled, timeoutMs, fireTimeout]);
}
