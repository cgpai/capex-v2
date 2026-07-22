import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppBootstrapPayload } from '@/hooks/queries/fetchAppBootstrapData';
import { queryKeys } from '@/lib/query-keys';
import { fetchDataMigrationPeriodOptions } from '@/hooks/queries/fetchDataMigrationPeriodOptions';
import { fetchDataMigrationWorkflowSets } from '@/hooks/queries/fetchDataMigrationWorkflowSets';

const STALE_TIME_MS = 120_000;

export type UseDataMigrationSetupOptionsParams = {
  /** Muat workflow sets hanya ketika target migrasi = Assets. */
  needsWorkflowSets: boolean;
};

export function useDataMigrationSetupOptions({ needsWorkflowSets }: UseDataMigrationSetupOptionsParams) {
  const queryClient = useQueryClient();

  const periodsQuery = useQuery({
    queryKey: queryKeys.dataMigration.periodOptions(),
    queryFn: fetchDataMigrationPeriodOptions,
    staleTime: STALE_TIME_MS,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    initialData: () => {
      const boot = queryClient.getQueryData<AppBootstrapPayload>(queryKeys.app.bootstrap);
      const periods = boot?.allPeriods;
      return periods?.length ? periods : undefined;
    },
    initialDataUpdatedAt: () =>
      queryClient.getQueryState(queryKeys.app.bootstrap)?.dataUpdatedAt,
  });

  const workflowsQuery = useQuery({
    queryKey: queryKeys.dataMigration.workflowSets(),
    queryFn: fetchDataMigrationWorkflowSets,
    enabled: needsWorkflowSets,
    staleTime: STALE_TIME_MS,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const periods = periodsQuery.data ?? [];
  const workflows = workflowsQuery.data ?? [];

  return {
    periods,
    workflows,
    periodsLoading: periodsQuery.isLoading && periods.length === 0,
    workflowsLoading: needsWorkflowSets && workflowsQuery.isLoading && workflows.length === 0,
  };
}
