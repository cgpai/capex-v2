import React, { useMemo } from 'react';
import { ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { Project } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface PipelineSummaryCardProps {
  projects: Project[];
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onOpenFullPlanner?: () => void;
  /** @deprecated use onOpenFullPlanner */
  onClick?: () => void;
}

export const PipelineSummaryCard: React.FC<PipelineSummaryCardProps> = ({
  projects,
  isExpanded = false,
  onToggleExpand,
  onOpenFullPlanner,
  onClick,
}) => {
  const openPlanner = onOpenFullPlanner ?? onClick;

  const summary = useMemo(() => {
    if (!projects || projects.length === 0) {
      return { totalBudget: 0, totalAssets: 0, stageCount: 0 };
    }

    const totalBudget = projects.reduce((sum, p) => sum + (p.budgetPlan || 0), 0);
    const uniqueAssetIds = new Set(
      projects.flatMap((p) => (p.assets ?? []).map((a) => a.catalogueId).filter(Boolean)),
    );

    return {
      totalBudget,
      totalAssets: uniqueAssetIds.size,
      stageCount: projects.length,
    };
  }, [projects]);

  const handleHeaderToggle = () => {
    onToggleExpand?.();
  };

  return (
    <div
      className={`bg-siloam-surface rounded-xl shadow-soft border border-siloam-border border-l-4 border-l-purple-500 overflow-hidden transition-shadow ${
        isExpanded ? 'ring-1 ring-purple-500/20' : ''
      }`}
    >
      {/* Compact header — always visible */}
      <div className="flex items-center gap-3 px-4 py-2.5 min-h-[44px]">
        <button
          type="button"
          onClick={handleHeaderToggle}
          disabled={!onToggleExpand}
          className="flex flex-1 items-center gap-3 min-w-0 text-left disabled:cursor-default"
          aria-expanded={isExpanded}
        >
          <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600">
            <Layers className="w-4 h-4" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-siloam-text-primary truncate">
              Pipeline Equipment Planning
            </span>
            {!isExpanded ? (
              <span className="block text-xs text-siloam-text-secondary truncate">
                {formatCurrency(summary.totalBudget)} · {summary.stageCount} stage
                {summary.stageCount === 1 ? '' : 's'} · {summary.totalAssets} asset
                {summary.totalAssets === 1 ? '' : 's'}
              </span>
            ) : (
              <span className="block text-xs text-siloam-text-secondary">
                Kelola perencanaan equipment dari master catalogue
              </span>
            )}
          </span>
          {onToggleExpand ? (
            <span className="flex-shrink-0 text-siloam-text-secondary">
              {isExpanded ? (
                <ChevronUp className="w-4 h-4" aria-hidden />
              ) : (
                <ChevronDown className="w-4 h-4" aria-hidden />
              )}
            </span>
          ) : null}
        </button>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onToggleExpand ? (
            <button
              type="button"
              onClick={onToggleExpand}
              className="hidden sm:inline-flex items-center gap-1 border border-siloam-border bg-siloam-bg px-3 py-1.5 rounded-lg text-xs font-medium text-siloam-text-primary hover:bg-siloam-sidebar transition"
            >
              {isExpanded ? 'Ciutkan' : 'Perluas'}
            </button>
          ) : null}
          {openPlanner ? (
            <button
              type="button"
              onClick={openPlanner}
              className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-purple-700 transition shadow-soft whitespace-nowrap"
            >
              Full Planner
            </button>
          ) : null}
        </div>
      </div>

      {/* Expanded detail — summary only; inline planner rendered by parent */}
      {isExpanded ? (
        <div className="px-4 pb-3 border-t border-siloam-border bg-siloam-bg/40">
          <div className="grid grid-cols-3 gap-3 pt-3 text-center">
            <div className="rounded-lg bg-siloam-surface border border-siloam-border px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-siloam-text-secondary">
                Budget Plan
              </p>
              <p className="text-sm font-semibold text-siloam-text-primary tabular-nums">
                {formatCurrency(summary.totalBudget)}
              </p>
            </div>
            <div className="rounded-lg bg-siloam-surface border border-siloam-border px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-siloam-text-secondary">Stages</p>
              <p className="text-sm font-semibold text-siloam-text-primary tabular-nums">
                {summary.stageCount}
              </p>
            </div>
            <div className="rounded-lg bg-siloam-surface border border-siloam-border px-2 py-2">
              <p className="text-[10px] uppercase tracking-wide text-siloam-text-secondary">Assets</p>
              <p className="text-sm font-semibold text-siloam-text-primary tabular-nums">
                {summary.totalAssets}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

PipelineSummaryCard.displayName = 'PipelineSummaryCard';
