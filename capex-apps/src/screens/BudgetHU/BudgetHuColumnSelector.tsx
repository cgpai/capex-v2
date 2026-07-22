'use client';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Columns3 } from 'lucide-react';
import {
  BUDGET_HU_TOGGLEABLE_COLUMNS,
  type BudgetHuTableColumnId,
} from './budgetHuTableColumnIds';

export type BudgetHuColumnSelectorProps = {
  visibleIds: Set<BudgetHuTableColumnId>;
  onToggle: (id: BudgetHuTableColumnId) => void;
  onReset: () => void;
  onShowAll: () => void;
};

export const BudgetHuColumnSelector = memo(function BudgetHuColumnSelector({
  visibleIds,
  onToggle,
  onReset,
  onShowAll,
}: BudgetHuColumnSelectorProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const handleToggle = useCallback(
    (id: BudgetHuTableColumnId) => () => onToggle(id),
    [onToggle],
  );

  const visibleCount = BUDGET_HU_TOGGLEABLE_COLUMNS.filter((c) => visibleIds.has(c.id)).length;

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-siloam-border rounded-lg bg-siloam-bg hover:bg-siloam-surface text-siloam-text-primary transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Columns3 className="w-4 h-4 text-siloam-text-secondary" aria-hidden />
        Columns
        <span className="text-xs text-siloam-text-secondary tabular-nums">
          ({visibleCount}/{BUDGET_HU_TOGGLEABLE_COLUMNS.length})
        </span>
      </button>

      {open ? (
        <div
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-siloam-border bg-siloam-surface shadow-lg py-2"
          role="menu"
        >
          <div className="px-3 pb-2 flex items-center justify-between border-b border-siloam-border mb-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-siloam-text-secondary">
              Show columns
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onReset}
                className="text-xs text-siloam-blue hover:underline"
              >
                Default
              </button>
              <button
                type="button"
                onClick={onShowAll}
                className="text-xs text-siloam-blue hover:underline"
              >
                All
              </button>
            </div>
          </div>
          <ul className="max-h-72 overflow-y-auto px-1">
            {BUDGET_HU_TOGGLEABLE_COLUMNS.map((col) => (
              <li key={col.id}>
                <label className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-siloam-bg cursor-pointer text-sm text-siloam-text-primary">
                  <input
                    type="checkbox"
                    checked={visibleIds.has(col.id)}
                    onChange={handleToggle(col.id)}
                    className="rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
                  />
                  <span className="truncate">{col.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
});
