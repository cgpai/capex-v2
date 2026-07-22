'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BUDGET_HU_COLUMN_STORAGE_KEY,
  BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS,
  BUDGET_HU_PINNED_COLUMN_IDS,
  BUDGET_HU_TOGGLEABLE_COLUMNS,
  type BudgetHuTableColumnId,
} from './budgetHuTableColumnIds';

function isValidColumnId(id: string): id is BudgetHuTableColumnId {
  return BUDGET_HU_TOGGLEABLE_COLUMNS.some((c) => c.id === id) || BUDGET_HU_PINNED_COLUMN_IDS.includes(id as BudgetHuTableColumnId);
}

function loadStoredVisibleIds(): Set<BudgetHuTableColumnId> {
  if (typeof window === 'undefined') {
    return new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS);
  }
  try {
    const raw = window.localStorage.getItem(BUDGET_HU_COLUMN_STORAGE_KEY);
    if (!raw) return new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS);
    const parsed = JSON.parse(raw) as { visibleIds?: string[] };
    if (!Array.isArray(parsed.visibleIds) || parsed.visibleIds.length === 0) {
      return new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS);
    }
    const ids = parsed.visibleIds.filter(isValidColumnId);
    const withPinned = new Set<BudgetHuTableColumnId>([...ids, ...BUDGET_HU_PINNED_COLUMN_IDS]);
    return withPinned.size > BUDGET_HU_PINNED_COLUMN_IDS.length ? withPinned : new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS);
  } catch {
    return new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS);
  }
}

function persistVisibleIds(ids: Set<BudgetHuTableColumnId>) {
  const toggleable = [...ids].filter((id) => !BUDGET_HU_PINNED_COLUMN_IDS.includes(id));
  window.localStorage.setItem(
    BUDGET_HU_COLUMN_STORAGE_KEY,
    JSON.stringify({ visibleIds: toggleable }),
  );
}

export function useBudgetHuColumnVisibility() {
  const [visibleIds, setVisibleIds] = useState<Set<BudgetHuTableColumnId>>(() =>
    loadStoredVisibleIds(),
  );

  useEffect(() => {
    persistVisibleIds(visibleIds);
  }, [visibleIds]);

  const isVisible = useCallback((id: BudgetHuTableColumnId) => visibleIds.has(id), [visibleIds]);

  const toggleColumn = useCallback((id: BudgetHuTableColumnId) => {
    if (BUDGET_HU_PINNED_COLUMN_IDS.includes(id)) return;
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= BUDGET_HU_PINNED_COLUMN_IDS.length + 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      BUDGET_HU_PINNED_COLUMN_IDS.forEach((pinned) => next.add(pinned));
      return next;
    });
  }, []);

  const resetToDefault = useCallback(() => {
    setVisibleIds(new Set(BUDGET_HU_DEFAULT_VISIBLE_COLUMN_IDS));
  }, []);

  const showAllToggleable = useCallback(() => {
    setVisibleIds(
      new Set([
        ...BUDGET_HU_TOGGLEABLE_COLUMNS.map((c) => c.id),
        ...BUDGET_HU_PINNED_COLUMN_IDS,
      ]),
    );
  }, []);

  return {
    visibleIds,
    isVisible,
    toggleColumn,
    resetToDefault,
    showAllToggleable,
  };
}
