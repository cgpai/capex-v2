import type { QueryClient } from '@tanstack/react-query';
import { prefetchBudgetSiloamPeriodBundle } from '@/hooks/queries/fetchBudgetSiloamPeriod';

/** Warm Budget Period (Siloam) cache when period + user context are known. */
export function prefetchBudgetSiloamPeriod(
  queryClient: QueryClient,
  periodName: string,
  userId?: number,
): void {
  prefetchBudgetSiloamPeriodBundle(queryClient, periodName, userId);
}
