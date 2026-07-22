'use client';

import React from 'react';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import { ProgressBar } from '@/components/molecules/ProgressBar/ProgressBar';
import type { AssetTagConfig, BDDPriority, EnrichedAsset } from '@/types';
import { normAssetKey } from '@/lib/assetKeys';

export type BuildBddConstructionColumnsParams = {
  assetLastUpdateTaskMap: Map<string, { taskName: string; completedAt?: string }>;
  assetTags: AssetTagConfig[];
  isSuperAdmin: boolean;
  hasBDDRole: boolean;
  onPriorityChange: (assetId: string, newPriority: BDDPriority) => void;
};

export function buildBddConstructionColumns({
  assetLastUpdateTaskMap,
  assetTags,
  isSuperAdmin,
  hasBDDRole,
  onPriorityChange,
}: BuildBddConstructionColumnsParams): Column<EnrichedAsset>[] {
  return [
    {
      header: 'Project',
      accessor: (asset) => (
        <div className="leading-tight space-y-0.5">
          <div className="text-xs font-mono font-bold tracking-wide text-siloam-text-primary">
            {asset.projectCode || '-'}
          </div>
          <div className="text-sm font-medium text-siloam-text-primary">{asset.projectName}</div>
        </div>
      ),
    },
    {
      header: 'Asset',
      accessor: (asset) => (
        <div className="leading-tight space-y-0.5">
          <div className="text-xs font-mono font-bold tracking-wide text-siloam-text-primary">
            {asset.assetCode || '-'}
          </div>
          <div className="text-sm font-medium text-siloam-text-primary">{asset.assetName}</div>
        </div>
      ),
    },
    {
      header: 'Last Update Task',
      accessor: (asset) => {
        const latest = assetLastUpdateTaskMap.get(normAssetKey(asset.id));
        if (!latest) return <span className="text-xs text-siloam-text-secondary">-</span>;
        const dateText = latest.completedAt ? new Date(latest.completedAt).toLocaleString() : '';
        return (
          <div className="leading-tight">
            <div className="text-sm font-semibold text-siloam-text-primary">{latest.taskName}</div>
            {dateText ? <div className="text-xs text-siloam-text-secondary">{dateText}</div> : null}
          </div>
        );
      },
    },
    {
      header: 'Target Date',
      accessor: (asset) => {
        if (!asset.endTargetDate) return '-';
        const d = new Date(asset.endTargetDate);
        if (Number.isNaN(d.getTime())) return String(asset.endTargetDate);
        return (
          <span className="text-sm font-medium text-siloam-text-primary">
            {d.toLocaleDateString()}
          </span>
        );
      },
    },
    {
      header: 'Progress',
      accessor: (asset) => (
        <div className="w-24">
          <ProgressBar value={asset.completionRate || 0} />
          <span className="text-xs font-semibold text-siloam-text-primary">
            {Math.round(asset.completionRate || 0)}%
          </span>
        </div>
      ),
    },
    {
      header: 'BDD Priority',
      accessor: (asset) => {
        const isUnassigned =
          !asset.bddPriority || asset.bddPriority === 'unassigned' || asset.bddPriority === '';
        const canEdit = isSuperAdmin || hasBDDRole || !isUnassigned;

        return (
          <div onClick={(e) => e.stopPropagation()}>
            <select
              value={asset.bddPriority || ''}
              onChange={(e) => onPriorityChange(asset.id, (e.target.value as BDDPriority) || null)}
              disabled={!canEdit}
              className={`text-xs font-semibold px-2 py-1 rounded border border-siloam-border focus:ring-siloam-blue bg-white ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <option value="">Unassigned</option>
              {assetTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </div>
        );
      },
    },
  ];
}
