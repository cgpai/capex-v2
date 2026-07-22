import React, { memo, useState } from 'react';
import type { ExecutiveSummaryStatusLists } from '../../../lib/executiveSummary/types';
import { EXECUTIVE_SUMMARY_COLORS } from '../../../lib/executiveSummary/constants';

type StatusVariant = 'risk' | 'neutral' | 'active';

const VARIANT_CLASS: Record<StatusVariant, string> = {
  active: 'bg-siloam-green text-white',
  risk: 'bg-gray-200 text-gray-700',
  neutral: 'bg-siloam-bg text-siloam-text-primary',
};

interface StatusListCardProps {
  title: string;
  items: string[];
  variant: StatusVariant;
}

const StatusListCard = memo(function StatusListCard({ title, items, variant }: StatusListCardProps) {
  const displayItems = items.length > 0 ? items : [`No projects in "${title}"`];
  return (
    <div className="bg-siloam-surface rounded border border-siloam-border shadow-sm overflow-hidden">
      <div
        className="text-white px-3 py-2 text-xs font-bold uppercase"
        style={{ backgroundColor: EXECUTIVE_SUMMARY_COLORS.header }}
      >
        {title}
      </div>
      <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
        {displayItems.map((item, index) => (
          <div key={`${title}-${index}`} className={`p-2 text-[10px] font-bold rounded border border-siloam-border ${VARIANT_CLASS[variant]}`}>
            {item}
          </div>
        ))}
      </div>
    </div>
  );
});

export interface ExecutiveSummaryStatusOverviewProps {
  statusLists: ExecutiveSummaryStatusLists;
}

export const ExecutiveSummaryStatusOverview = memo(function ExecutiveSummaryStatusOverview({
  statusLists,
}: ExecutiveSummaryStatusOverviewProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="border border-siloam-border rounded-xl overflow-hidden bg-siloam-surface">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-siloam-bg transition-colors"
        aria-expanded={open}
      >
        <span className="text-sm font-bold text-siloam-text-primary uppercase">Status Breakdown</span>
        <span className="text-xs font-bold text-siloam-blue">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-siloam-border">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-4">
            <StatusListCard title="Off Track" items={statusLists.offTrack} variant="risk" />
            <StatusListCard title="Not Started" items={statusLists.notStarted} variant="neutral" />
            <StatusListCard title="In Progress" items={statusLists.inProgress} variant="active" />
            <StatusListCard title="Completed" items={statusLists.completed} variant="active" />
          </div>
        </div>
      )}
    </section>
  );
});
