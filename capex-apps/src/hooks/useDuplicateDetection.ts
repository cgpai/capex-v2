'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  DUPLICATE_SEARCH_DEBOUNCE_MS,
  DUPLICATE_SEARCH_MIN_LENGTH,
  normalizeSearchText,
} from '../lib/duplicateDetection/normalizeSearchText';
import {
  searchDuplicateAssets,
  searchDuplicateProjects,
  type DuplicateAssetHit,
  type DuplicateProjectHit,
} from '../services/duplicateDetectionApi';

export type DuplicateEntityKind = 'project' | 'asset';

type UseDuplicateDetectionParams = {
  enabled: boolean;
  entityType: DuplicateEntityKind;
  name: string;
  periodName: string;
  userId: number;
  huId?: string | null;
  projectId?: string | null;
  excludeId?: string | null;
};

export function useDuplicateDetection({
  enabled,
  entityType,
  name,
  periodName,
  userId,
  huId,
  projectId,
  excludeId,
}: UseDuplicateDetectionParams) {
  const [projectHits, setProjectHits] = useState<DuplicateProjectHit[]>([]);
  const [assetHits, setAssetHits] = useState<DuplicateAssetHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [createConfirmed, setCreateConfirmed] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  const normalized = normalizeSearchText(name);
  const hasSuggestions =
    entityType === 'project' ? projectHits.length > 0 : assetHits.length > 0;

  const runSearch = useCallback(
    async (cursor?: string) => {
      if (!enabled || !periodName.trim() || normalized.length < DUPLICATE_SEARCH_MIN_LENGTH) {
        setProjectHits([]);
        setAssetHits([]);
        setNextCursor(null);
        setIsSearching(false);
        return;
      }

      const reqId = ++requestIdRef.current;
      setIsSearching(true);
      try {
        if (entityType === 'project') {
          const result = await searchDuplicateProjects({
            userId,
            periodName,
            query: name,
            huId: huId ?? undefined,
            excludeId: excludeId ?? undefined,
            cursor,
            limit: 10,
          });
          if (reqId !== requestIdRef.current) return;
          setProjectHits(cursor ? (prev) => [...prev, ...result.items] : result.items);
          setAssetHits([]);
          setNextCursor(result.nextCursor);
        } else {
          const result = await searchDuplicateAssets({
            userId,
            periodName,
            query: name,
            huId: huId ?? undefined,
            excludeId: excludeId ?? undefined,
            cursor,
            limit: 10,
          });
          if (reqId !== requestIdRef.current) return;
          setAssetHits(cursor ? (prev) => [...prev, ...result.items] : result.items);
          setProjectHits([]);
          setNextCursor(result.nextCursor);
        }
      } finally {
        if (reqId === requestIdRef.current) setIsSearching(false);
      }
    },
    [enabled, entityType, excludeId, huId, name, normalized.length, periodName, projectId, userId],
  );

  useEffect(() => {
    setCreateConfirmed(false);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!enabled || normalized.length < DUPLICATE_SEARCH_MIN_LENGTH) {
      setProjectHits([]);
      setAssetHits([]);
      setNextCursor(null);
      return;
    }
    debounceRef.current = setTimeout(() => {
      void runSearch();
    }, DUPLICATE_SEARCH_DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [enabled, name, normalized, runSearch]);

  const loadMore = useCallback(() => {
    if (nextCursor) void runSearch(nextCursor);
  }, [nextCursor, runSearch]);

  const resetCreateConfirmation = useCallback(() => {
    setCreateConfirmed(false);
  }, []);

  const confirmCreateNew = useCallback(() => {
    setCreateConfirmed(true);
  }, []);

  const needsCreateConfirmation = hasSuggestions && !createConfirmed;

  return {
    projectHits,
    assetHits,
    isSearching,
    hasSuggestions,
    nextCursor,
    loadMore,
    needsCreateConfirmation,
    createConfirmed,
    confirmCreateNew,
    resetCreateConfirmation,
  };
}
