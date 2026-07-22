import React, { memo, useCallback, useState } from 'react';
import type { PlanningBudgetScoringBucket } from '../../../lib/executiveSummary/types';
import { formatAbbreviatedCurrency } from '../../../lib/formatter';

export interface PlanningBudgetScoringColumnProps {
  bucket: PlanningBudgetScoringBucket | undefined;
}

export const PlanningBudgetScoringColumn = memo(function PlanningBudgetScoringColumn({
  bucket,
}: PlanningBudgetScoringColumnProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const items = bucket?.items ?? [];
  const total = bucket?.count ?? 0;

  const toggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (total === 0) {
    return <div className="text-xs text-siloam-text-secondary py-4 text-center">No projects in planning</div>;
  }

  return (
    <div className="space-y-0">
      <div className="hidden sm:grid sm:grid-cols-[88px_1fr_auto] gap-2 px-2 py-1.5 text-[10px] font-bold uppercase text-siloam-text-secondary tracking-wider border-b border-siloam-border/60 mb-1">
        <span>Asset Code</span>
        <span>Project</span>
        <span className="text-right">Budget Plan</span>
      </div>
      {items.map((item) => {
        const expanded = expandedId === item.id;
        const hasAssets = item.assets.length > 0;
        return (
          <div key={item.id} className="border-b border-siloam-border/40 last:border-0">
            <button
              type="button"
              onClick={() => toggle(item.id)}
              className={`w-full text-left grid grid-cols-1 sm:grid-cols-[88px_1fr_auto] gap-2 px-2 py-2.5 transition-colors hover:bg-siloam-bg cursor-pointer ${
                expanded ? 'bg-siloam-bg/80' : ''
              }`}
              aria-expanded={expanded}
            >
              <span className="text-[11px] font-bold text-siloam-text-primary truncate">{item.assetCode}</span>
              <span className="text-xs font-semibold text-siloam-text-primary line-clamp-2">{item.projectName}</span>
              <span className="text-[11px] font-bold text-siloam-blue sm:text-right">
                {formatAbbreviatedCurrency(item.budgetPlan)}
              </span>
            </button>
            {expanded && hasAssets && (
              <div className="mx-2 mb-2 rounded-lg border border-siloam-border bg-siloam-bg/50 overflow-hidden">
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase text-siloam-text-secondary tracking-wider border-b border-siloam-border/60">
                  Assets ({item.assets.length})
                </div>
                <ul className="divide-y divide-siloam-border/40 max-h-40 overflow-y-auto">
                  {item.assets.map((asset) => (
                    <li
                      key={asset.id}
                      className="grid grid-cols-[88px_1fr_auto] gap-2 px-3 py-2 text-[11px]"
                    >
                      <span className="font-bold text-siloam-text-primary truncate">{asset.assetCode || '—'}</span>
                      <span className="text-siloam-text-secondary truncate">{asset.assetName || '—'}</span>
                      <span className="font-semibold text-siloam-text-primary text-right">
                        {formatAbbreviatedCurrency(asset.budgetPlan)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {expanded && !hasAssets && (
              <div className="mx-2 mb-2 px-3 py-2 text-xs text-siloam-text-secondary italic">No assets linked</div>
            )}
          </div>
        );
      })}
      {total > items.length && (
        <div className="pt-2 text-[10px] text-siloam-text-secondary font-medium text-center">
          Top {items.length} of {total} planning projects by budget plan
        </div>
      )}
    </div>
  );
});
