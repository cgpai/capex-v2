'use client';

import { useCallback, useEffect, useRef } from 'react';
import {
  LS_TAB_HIDDEN_SINCE,
  TAB_HIDDEN_TIMEOUT_MS,
} from '../lib/auth/tabSessionKeys';
import { readSessionAuthSince } from '../lib/auth/clearTabSessionState';
import {
  broadcastForceLogout,
  subscribeForceLogout,
} from '../lib/auth/tabSessionBroadcast';

export type UseTabSessionTimeoutOptions = {
  /** When false, listeners are not attached. Default true. */
  enabled?: boolean;
  /** Hidden duration before logout (ms). Default 15 minutes. */
  timeoutMs?: number;
  /** Called once when timeout fires or another tab forces logout. */
  onTimeout: () => void;
};

function readHiddenSince(): number | null {
  try {
    const raw = localStorage.getItem(LS_TAB_HIDDEN_SINCE);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeHiddenSince(epochMs: number): void {
  try {
    localStorage.setItem(LS_TAB_HIDDEN_SINCE, String(epochMs));
  } catch {
    /* noop */
  }
}

function clearHiddenSince(): void {
  try {
    localStorage.removeItem(LS_TAB_HIDDEN_SINCE);
  } catch {
    /* noop */
  }
}

/**
 * Auto-logout when the user leaves all tabs hidden longer than `timeoutMs`.
 *
 * Uses Page Visibility API only (no mouse/keyboard tracking):
 * - `document.visibilityState` + `visibilitychange`
 * - Persists hidden timestamp in localStorage (sleep-safe)
 * - Clears timestamp when any tab is visible (multi-tab aware via storage events)
 * - Broadcasts forced logout so other tabs sign out in sync
 */
export function useTabSessionTimeout(
  enabledOrOptions: boolean | UseTabSessionTimeoutOptions,
  timeoutMsArg?: number,
  onTimeoutArg?: () => void,
): void {
  const options: UseTabSessionTimeoutOptions =
    typeof enabledOrOptions === 'boolean'
      ? {
          enabled: enabledOrOptions,
          timeoutMs: timeoutMsArg ?? TAB_HIDDEN_TIMEOUT_MS,
          onTimeout: onTimeoutArg ?? (() => {}),
        }
      : enabledOrOptions;

  const enabled = options.enabled ?? true;
  const timeoutMs = options.timeoutMs ?? TAB_HIDDEN_TIMEOUT_MS;
  const onTimeout = options.onTimeout;

  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  const firedRef = useRef(false);

  const fireTimeout = useCallback((syncOtherTabs: boolean) => {
    if (firedRef.current) return;
    firedRef.current = true;
    clearHiddenSince();
    if (syncOtherTabs) {
      broadcastForceLogout();
    }
    onTimeoutRef.current();
  }, []);

  const evaluateHiddenDuration = useCallback(() => {
    const since = readHiddenSince();
    const sessionSince = readSessionAuthSince();
    if (since == null || since < sessionSince) return;
    if (Date.now() - since >= timeoutMs) {
      fireTimeout(true);
    }
  }, [timeoutMs, fireTimeout]);

  useEffect(() => {
    if (!enabled || timeoutMs <= 0) {
      firedRef.current = false;
      clearHiddenSince();
      return;
    }

    firedRef.current = false;
    // Ignore stale hidden timestamps from a previous browser session.
    clearHiddenSince();

    const markHidden = () => {
      if (!readHiddenSince()) {
        writeHiddenSince(Date.now());
      }
    };

    const markVisible = () => {
      const since = readHiddenSince();
      clearHiddenSince();
      const sessionSince = readSessionAuthSince();
      if (since != null && since >= sessionSince && Date.now() - since >= timeoutMs) {
        fireTimeout(true);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        markHidden();
      } else {
        markVisible();
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === LS_TAB_HIDDEN_SINCE) {
        if (event.newValue == null) {
          return;
        }
        if (document.visibilityState === 'visible') {
          clearHiddenSince();
          return;
        }
        evaluateHiddenDuration();
        return;
      }
    };

    if (document.visibilityState === 'hidden') {
      markHidden();
    }

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('storage', handleStorage);

    const unsubscribeLogout = subscribeForceLogout(() => {
      fireTimeout(false);
    });

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('storage', handleStorage);
      unsubscribeLogout();
    };
  }, [enabled, timeoutMs, evaluateHiddenDuration, fireTimeout]);
}
