'use client';

import { useCallback } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import type { QueryClient } from '@tanstack/react-query';
import { Page, User } from '@/types';
import { pageToHref } from '@/lib/pageRoutes';
import { prefetchBudgetSiloamPeriod } from '@/lib/prefetchBudgetSiloamPeriod';
import {
  hydrateFsUpdatePageFromDisk,
  prefetchFsUpdatePage,
} from '@/hooks/queries/fetchFsUpdatePageData';
import {
  hydrateFsApprovalPageFromDisk,
  prefetchFsApprovalPage,
} from '@/hooks/queries/fetchFsApprovalPageData';
import {
  hydrateFsRealizationPageFromDisk,
  prefetchFsRealizationPage,
} from '@/hooks/queries/fetchFsRealizationPageData';
import { prefetchMyTasksPage } from '@/lib/prefetchMyTasksPage';
import {
  hydrateCapexProjectListTableFromDisk,
  warmCapexProjectListTableCache,
} from '@/lib/prefetchCapexProjectList';
import { prefetchBudgetHuPage } from '@/hooks/queries/warmBudgetHuCache';
import {
  hydrateConfigurationFromDisk,
  prefetchConfigurationPageCritical,
} from '@/lib/prefetchConfigurationPage';
import { prefetchBudgetMultiYearPage } from '@/lib/prefetchBudgetMultiYearPage';

type PermissionsLike = {
  canAccessPage: (page: Page) => boolean;
};

export function useNavPrefetch(options: {
  router: AppRouterInstance;
  queryClient: QueryClient;
  selectedPeriodName: string;
  currentUser: User | null;
  permissions: PermissionsLike;
}) {
  const { router, queryClient, selectedPeriodName, currentUser, permissions } = options;

  return useCallback(
    (page: Page) => {
      try {
        void router.prefetch(pageToHref(page));
      } catch {
        /* noop */
      }
      if (page === Page.BudgetPeriod && selectedPeriodName.trim() && currentUser?.id) {
        prefetchBudgetSiloamPeriod(queryClient, selectedPeriodName, currentUser.id);
      }
      if (currentUser?.id && selectedPeriodName.trim()) {
        if (page === Page.FSUpdate) {
          hydrateFsUpdatePageFromDisk(queryClient, selectedPeriodName, currentUser.id);
          void prefetchFsUpdatePage(queryClient, selectedPeriodName, currentUser.id);
        } else if (page === Page.FSApproval) {
          hydrateFsApprovalPageFromDisk(queryClient, selectedPeriodName, currentUser.id);
          void prefetchFsApprovalPage(queryClient, selectedPeriodName, currentUser.id);
        } else if (page === Page.FSRealization) {
          hydrateFsRealizationPageFromDisk(queryClient, selectedPeriodName, currentUser.id);
          void prefetchFsRealizationPage(queryClient, selectedPeriodName, currentUser.id);
        }
      }
      if (page === Page.MyTask && currentUser) {
        prefetchMyTasksPage(queryClient, currentUser, selectedPeriodName || undefined);
      }
      if (page === Page.CapexProjectList && currentUser?.id && selectedPeriodName.trim()) {
        hydrateCapexProjectListTableFromDisk(queryClient, selectedPeriodName, currentUser.id);
        void warmCapexProjectListTableCache(queryClient, selectedPeriodName, currentUser.id);
      }
      if (page === Page.BudgetHU && currentUser?.id && selectedPeriodName.trim()) {
        prefetchBudgetHuPage(queryClient, selectedPeriodName, currentUser.id);
      }
      if (page === Page.BudgetMultiYear && currentUser?.id) {
        prefetchBudgetMultiYearPage(queryClient, currentUser.id);
      }
      if (page === Page.Configuration && currentUser?.id && permissions.canAccessPage(Page.Configuration)) {
        hydrateConfigurationFromDisk(queryClient, currentUser.id);
        prefetchConfigurationPageCritical(queryClient, currentUser.id);
      }
    },
    [router, queryClient, selectedPeriodName, currentUser, permissions],
  );
}
