'use client';

import { useMemo } from 'react';
import {
  BUDGET_HU_TOUR_ID,
  BUDGET_HU_TOUR_VERSION,
  buildBudgetHuTourSteps,
  type BudgetHuTourContext,
} from './budgetHuTour';
import { usePageTour } from './usePageTour';

export type UseBudgetHuTourOptions = BudgetHuTourContext & {
  userId: number;
  ready: boolean;
};

export function useBudgetHuTour({
  userId,
  ready,
  canSave,
  canCreateProject,
  showRoutineAsset,
}: UseBudgetHuTourOptions) {
  const steps = useMemo(
    () =>
      buildBudgetHuTourSteps({
        canSave,
        canCreateProject,
        showRoutineAsset,
      }),
    [canSave, canCreateProject, showRoutineAsset],
  );

  return usePageTour({
    userId,
    tourId: BUDGET_HU_TOUR_ID,
    tourVersion: BUDGET_HU_TOUR_VERSION,
    ready,
    steps,
  });
}
