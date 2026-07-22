'use client';

import { useEffect, useState } from 'react';
import type { AssetTypeConfig } from '@/types';
import * as budgetService from '@/services/budgetService';

export function AssetTypeUsageCount({
  assetType,
  userId,
}: {
  assetType: AssetTypeConfig;
  userId: number;
}) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void budgetService.isAssetTypeInUse(assetType, userId).then(({ count: n }) => {
      if (!cancelled) setCount(n);
    });
    return () => {
      cancelled = true;
    };
  }, [assetType.id, userId]);

  if (count === null) return <span className="text-siloam-text-secondary">…</span>;
  if (count === 0) return <span className="text-siloam-text-secondary">0</span>;
  return <span className="font-medium text-siloam-text-primary">{count}</span>;
}
