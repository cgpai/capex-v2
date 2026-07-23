'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  ensureOperationalMasterConfigPack,
  readOperationalMasterFromPack,
  subscribeOperationalMasterConfig,
} from '@/features/configuration/core/operationalMasterConfigSync';

export function useCapexProjectListMasterConfig(userId: number | undefined) {
  const queryClient = useQueryClient();
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const reloadMasterConfig = useCallback(
    async (options?: { fresh?: boolean }) => {
      if (!userId) return;
      await ensureOperationalMasterConfigPack(queryClient, userId, { force: !!options?.fresh });
      bump();
    },
    [userId, queryClient, bump],
  );

  useEffect(() => {
    if (!userId) return;
    void ensureOperationalMasterConfigPack(queryClient, userId).then(() => bump());
    return subscribeOperationalMasterConfig(queryClient, userId, bump);
  }, [userId, queryClient, bump]);

  void tick;
  const data = userId != null ? readOperationalMasterFromPack(queryClient, userId) : {
    categories: [],
    assetTypes: [],
    assetTypeGroups: [],
  };

  return useMemo(
    () => ({
      categories: data.categories,
      assetTypes: data.assetTypes,
      assetTypeGroups: data.assetTypeGroups,
      reloadMasterConfig,
    }),
    [data.categories, data.assetTypes, data.assetTypeGroups, reloadMasterConfig],
  );
}
