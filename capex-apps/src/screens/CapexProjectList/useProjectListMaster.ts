'use client';

import { useQuery } from '@tanstack/react-query';
import { useBeBffProxy } from '@/lib/capexBeClient';
import { useBackendSession } from '@/lib/auth/authConstants';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { queryKeys } from '@/lib/query-keys';
import { fetchCapexProjectListMaster } from '@/hooks/queries/fetchCapexProjectListMaster';
import type { ProjectListMasterBundle } from '@/services/capexProjectListApi';

const MASTER_STALE_MS = 5 * 60 * 1000;

export function useProjectListMaster(userId: number | undefined, enabled = true) {
  const bff = useBeBffProxy();
  const backendSession = useBackendSession();

  return useQuery({
    queryKey: queryKeys.capexProjectList.master(userId ?? 0),
    enabled: enabled && userId != null && (!!bff || backendSession || !!process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()),
    staleTime: MASTER_STALE_MS,
    gcTime: 10 * 60 * 1000,
    queryFn: async (): Promise<ProjectListMasterBundle> => {
      const token = bff && backendSession ? null : await getAccessTokenForBackend();
      return fetchCapexProjectListMaster(userId as number, token);
    },
  });
}
