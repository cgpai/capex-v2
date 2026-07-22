'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  getSessionMeta,
  subscribeSessionMeta,
} from '../../lib/auth/sessionMetaStore';
import { refreshBackendSessionCoordinated } from '../../lib/auth/authApi';
import { isBackendSessionValid } from '../../lib/auth/sessionValidity';
import { resetActivityTimestamp } from '../../lib/auth/userActivityTracker';

const WARNING_BEFORE_MS = 2 * 60 * 1000;
const CHECK_INTERVAL_MS = 30_000;

type Props = {
  onSessionExtended?: () => void;
  onSessionExpired?: () => void;
};

/**
 * Warns user before access token expires; offers one-click session extension.
 */
export function SessionExpiryWarning({ onSessionExtended, onSessionExpired }: Props) {
  const [visible, setVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [extending, setExtending] = useState(false);

  const evaluate = useCallback(async () => {
    const meta = getSessionMeta();
    if (!meta?.accessExpiresAt) {
      setVisible(false);
      return;
    }
    const remaining = meta.accessExpiresAt - Date.now();
    if (remaining <= 0) {
      setVisible(false);
      const ok = await refreshBackendSessionCoordinated();
      if (!ok) {
        const stillValid = await isBackendSessionValid();
        if (!stillValid) onSessionExpired?.();
      }
      return;
    }
    if (remaining <= WARNING_BEFORE_MS) {
      setVisible(true);
      setSecondsLeft(Math.ceil(remaining / 1000));
    } else {
      setVisible(false);
    }
  }, [onSessionExpired]);

  useEffect(() => {
    evaluate();
    const unsub = subscribeSessionMeta(() => evaluate());
    const timer = setInterval(evaluate, CHECK_INTERVAL_MS);
    return () => {
      unsub();
      clearInterval(timer);
    };
  }, [evaluate]);

  const handleExtend = async () => {
    setExtending(true);
    resetActivityTimestamp();
    const ok = await refreshBackendSessionCoordinated();
    setExtending(false);
    if (ok) {
      setVisible(false);
      onSessionExtended?.();
    } else {
      const stillValid = await isBackendSessionValid();
      if (!stillValid) onSessionExpired?.();
    }
  };

  if (!visible) return null;

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;

  return (
    <div
      className="fixed bottom-4 right-4 z-[100] max-w-sm rounded-lg border border-amber-300 bg-amber-50 p-4 shadow-lg"
      role="alertdialog"
      aria-labelledby="session-expiry-title"
    >
      <p id="session-expiry-title" className="text-sm font-semibold text-amber-900">
        Session expiring soon
      </p>
      <p className="mt-1 text-sm text-amber-800">
        Your session will expire in{' '}
        {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}. Stay signed in to continue
        working without interruption.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleExtend()}
          disabled={extending}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {extending ? 'Extending…' : 'Stay signed in'}
        </button>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="rounded-md border border-amber-300 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
