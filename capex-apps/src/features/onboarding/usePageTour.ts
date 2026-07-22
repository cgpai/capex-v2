'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { isTourCompleted, markTourCompleted } from './onboardingStorage';
import type { PageTourStep } from './types';

export type UsePageTourOptions = {
  userId: number;
  tourId: string;
  tourVersion: number;
  /** Page content is ready to highlight tour targets. */
  ready: boolean;
  steps: PageTourStep[];
};

export function usePageTour({
  userId,
  tourId,
  tourVersion,
  ready,
  steps,
}: UsePageTourOptions) {
  const [isTourOpen, setIsTourOpen] = useState(false);
  const autoStartedRef = useRef(false);

  const startTour = useCallback(() => {
    setIsTourOpen(true);
  }, []);

  const handleTourClose = useCallback(
    (completed: boolean) => {
      setIsTourOpen(false);
      if (completed) {
        markTourCompleted(userId, tourId, tourVersion);
      }
    },
    [userId, tourId, tourVersion],
  );

  useEffect(() => {
    if (!ready || autoStartedRef.current) return;
    if (isTourCompleted(userId, tourId, tourVersion)) return;

    autoStartedRef.current = true;
    const timer = window.setTimeout(() => setIsTourOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [ready, userId, tourId, tourVersion]);

  return {
    isTourOpen,
    steps,
    startTour,
    handleTourClose,
  };
}
