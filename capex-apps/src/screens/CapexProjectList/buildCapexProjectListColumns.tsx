'use client';

import React from 'react';
import type { Column } from '@/components/organisms/GenericTable/GenericTable';
import { ProgressBar } from '@/components/molecules/ProgressBar/ProgressBar';
import type { EnrichedAsset, Project, ProjectPriorityConfig } from '@/types';
import type { ProjectListSortOption } from '@/services/projectListQueryTypes';
import { normAssetKey } from '@/lib/assetKeys';
import {
  abbrevBudgetCategoryName,
  formatListDate,
  getProjectTimingInfo,
} from './listUtils';

export type BuildCapexProjectListColumnsParams = {
  isMultiPeriodView: boolean;
  sortBy: ProjectListSortOption;
  onAssetCodeSort: () => void;
  projectById: Map<string, Project>;
  categoryIdToName: Map<string, string>;
  projectPriorityNameMap: Map<string | number, string>;
  assetLastTaskMap: Map<string, string>;
  canEditPriority: boolean;
  priorities: ProjectPriorityConfig[];
  savingPriorityProjectId: string | null;
  onInlinePriorityChange: (projectId: string, newPriorityId: string) => void;
};

export function buildCapexProjectListColumns({
  isMultiPeriodView,
  sortBy,
  onAssetCodeSort,
  projectById,
  categoryIdToName,
  projectPriorityNameMap,
  assetLastTaskMap,
  canEditPriority,
  priorities,
  savingPriorityProjectId,
  onInlinePriorityChange,
}: BuildCapexProjectListColumnsParams): Column<EnrichedAsset>[] {
  return [
    ...(isMultiPeriodView
      ? [
          {
            header: 'Budget Period',
            accessor: (asset: EnrichedAsset) => {
              const projectPeriod = projectById.get(String(asset.projectId))?.periodName;
              return (
                <span className="text-xs font-medium text-siloam-text-secondary">
                  {projectPeriod || '–'}
                </span>
              );
            },
          } as Column<EnrichedAsset>,
        ]
      : []),
    {
      header: 'Code Asset',
      accessor: 'assetCode',
      sortable: true,
      sortDirection: sortBy === 'assetCode_desc' ? 'desc' : 'asc',
      onSort: onAssetCodeSort,
    },
    {
      header: 'Budget Category',
      accessor: (asset) => {
        const pid = String(asset.projectId);
        const project = projectById.get(pid);
        const catId =
          project?.budgetCategoryId ||
          (asset as EnrichedAsset & { budgetCategoryId?: string }).budgetCategoryId ||
          '';
        const full =
          (catId && categoryIdToName.get(String(catId))) || (catId ? String(catId) : '') || '–';
        const short = full === '–' ? '–' : abbrevBudgetCategoryName(full);
        return (
          <span
            className="text-xs font-medium text-siloam-text-secondary"
            title={full !== '–' ? full : undefined}
          >
            {short}
          </span>
        );
      },
    },
    { header: 'Project Name', accessor: 'projectName' },
    {
      header: 'Asset Name',
      accessor: (asset) => (
        <div className="flex items-center gap-2">
          <span>{asset.assetName}</span>
          {asset.actionableTaskCount && asset.actionableTaskCount > 0 ? (
            <span
              className="bg-siloam-blue text-white text-xs font-bold w-5 h-5 flex items-center justify-center rounded-full"
              title={`${asset.actionableTaskCount} open tasks for you`}
            >
              {asset.actionableTaskCount}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      header: 'Priority',
      accessor: (asset) => {
        const pid = String(asset.projectId);
        const project = projectById.get(pid);
        const isSaving = savingPriorityProjectId === pid;

        if (canEditPriority && project && priorities.length > 0) {
          const priorityValue = String(project.priorityId ?? '');
          return (
            <div className="leading-tight">
              <select
                className="text-xs font-medium bg-transparent border border-siloam-border rounded px-1 py-0.5 max-w-[110px] cursor-pointer hover:bg-siloam-bg focus:outline-none focus:ring-1 focus:ring-siloam-blue disabled:opacity-50 disabled:cursor-wait"
                value={priorityValue}
                disabled={isSaving}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => {
                  e.stopPropagation();
                  void onInlinePriorityChange(pid, e.target.value);
                }}
              >
                {!priorityValue ? (
                  <option value="">–</option>
                ) : null}
                {priorities
                  .filter((p) => p.isActive || String(p.id) === priorityValue)
                  .map((p) => (
                    <option key={String(p.id)} value={String(p.id)}>
                      {p.name || '–'}
                    </option>
                  ))}
              </select>
              {asset.bddPriority ? (
                <div className="text-[11px] text-siloam-text-secondary">BDD: {asset.bddPriority}</div>
              ) : null}
            </div>
          );
        }

        return (
          <div className="leading-tight">
            <div className="text-xs font-medium">
              {projectPriorityNameMap.get(String(asset.projectId)) ||
                (asset.projectPriorityId
                  ? priorities.find((p) => String(p.id) === String(asset.projectPriorityId))?.name
                  : undefined) ||
                '–'}
            </div>
            {asset.bddPriority ? (
              <div className="text-[11px] text-siloam-text-secondary">BDD: {asset.bddPriority}</div>
            ) : null}
          </div>
        );
      },
    },
    {
      header: 'Last Task',
      accessor: (asset) => (
        <span className="text-xs font-medium text-siloam-text-secondary">
          {assetLastTaskMap.get(normAssetKey(asset.id)) || '–'}
        </span>
      ),
    },
    {
      header: 'End Date',
      accessor: (asset) => (
        <span className="font-mono">{formatListDate(asset.endTargetDate)}</span>
      ),
    },
    {
      header: 'Projection Date',
      accessor: (asset) => (
        <span className="font-mono">{formatListDate(asset.projectionEndDate)}</span>
      ),
    },
    {
      header: 'Project Timing',
      accessor: (asset) => {
        const t = getProjectTimingInfo(asset);
        if (t.tone === 'missing') {
          return (
            <span className="text-xs text-siloam-text-secondary" title={t.title}>
              –
            </span>
          );
        }
        const colorClass =
          t.tone === 'ahead'
            ? 'text-emerald-700'
            : t.tone === 'behind'
              ? 'text-red-600'
              : 'text-siloam-text-secondary';
        return (
          <span className={`text-xs font-semibold ${colorClass}`} title={t.title}>
            {t.label}
          </span>
        );
      },
    },
    {
      header: 'Completion',
      accessor: (asset) => (
        <div className="flex items-center gap-2 min-w-[100px]">
          <div
            className="flex-1"
            title={`${Math.round(asset.completionRate || 0)}% (task selesai / total task)`}
          >
            <ProgressBar value={asset.completionRate || 0} />
          </div>
          <span className="text-xs font-medium text-siloam-text-secondary whitespace-nowrap">
            {Math.round(asset.completionRate || 0)}%
          </span>
        </div>
      ),
    },
  ];
}
