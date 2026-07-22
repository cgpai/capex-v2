'use client';

import { useCallback } from 'react';
import type { ConfigSliceKey } from '@/services/configurationApi';

export function useConfigSliceRefresh(
  refreshOnly: (slices: ConfigSliceKey[]) => void,
  slices: ConfigSliceKey[],
) {
  return useCallback(() => refreshOnly(slices), [refreshOnly, slices]);
}
