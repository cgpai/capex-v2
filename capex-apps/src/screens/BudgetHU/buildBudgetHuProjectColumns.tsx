'use client';

import React from 'react';
import { Trash2 } from 'lucide-react';
import {
  Project,
  ProjectType,
  FeasibilityStudy,
} from '@/types';
import { SpreadsheetColumn } from '@/components/organisms/SpreadsheetTable/SpreadsheetTable';
import { abbreviateBudgetCategoryName } from './budgetHuCategoryAbbrev';
import { BUDGET_HU_TABLE_COLUMN_IDS } from './budgetHuTableColumnIds';

export type BuildBudgetHuProjectColumnsParams = {
  isProjectEditable: boolean;
  categorySelectOptions: { value: string; label: string }[];
  prioritySelectOptions: { value: string; label: string }[];
  /** All priorities (incl. inactive) for read-only cell labels */
  priorityDisplayOptions: { value: string; label: string }[];
  fsDataMap: Map<string, FeasibilityStudy>;
  onCreateFs: (project: Project) => void;
  onViewFs: (project: Project, fs: FeasibilityStudy) => void;
  onOpenProjectAssets: (project: Project) => void;
  onDeleteProject: (project: Project) => void;
  canEditPriority: boolean;
  canCreateFs: boolean;
  assetCountByProjectId: Map<string, number>;
};

function labelForId(
  id: string,
  options: { value: string; label: string }[],
): string {
  const opt = options.find((o) => o.value === id);
  return opt?.label ?? id;
}

function FsStatusBadge({ status }: { status: string }) {
  let colorClass = 'text-siloam-text-secondary';
  if (status === 'Approved' || status === 'Approved with Notes') {
    colorClass = 'text-siloam-green font-medium';
  } else if (status === 'Pending') {
    colorClass = 'text-warning font-medium';
  } else if (status === 'Rejected') {
    colorClass = 'text-danger font-medium';
  }
  return <span className={`text-xs ${colorClass}`}>{status}</span>;
}

export function buildBudgetHuProjectColumns({
  isProjectEditable,
  categorySelectOptions,
  prioritySelectOptions,
  priorityDisplayOptions,
  fsDataMap,
  onCreateFs,
  onViewFs,
  onOpenProjectAssets,
  onDeleteProject,
  canEditPriority,
  canCreateFs,
  assetCountByProjectId,
}: BuildBudgetHuProjectColumnsParams): SpreadsheetColumn<Project>[] {
  return [
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.projectCode,
      header: 'Project Code',
      accessor: 'projectCode',
      align: 'left',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.projectName,
      header: 'Project Name',
      accessor: 'projectName',
      isEditable: isProjectEditable,
      align: 'left',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.axCode,
      header: 'AX Code',
      accessor: 'axCode',
      isEditable: isProjectEditable,
      align: 'left',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.budgetCategory,
      header: 'Budget Category',
      accessor: 'budgetCategoryId',
      isEditable: isProjectEditable,
      editorType: 'select',
      selectOptions: categorySelectOptions,
      align: 'center',
      formatCellDisplay: (value) => {
        const fullName = labelForId(String(value ?? ''), categorySelectOptions);
        const short = abbreviateBudgetCategoryName(fullName);
        return (
          <span className="font-medium text-siloam-text-primary" title={fullName}>
            {short}
          </span>
        );
      },
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.priority,
      header: 'Priority',
      accessor: 'priorityId',
      isEditable: isProjectEditable && canEditPriority,
      editorType: 'select',
      selectOptions: prioritySelectOptions,
      align: 'center',
      formatCellDisplay: (value) => labelForId(String(value ?? ''), priorityDisplayOptions),
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.budgetPlan,
      header: 'Budget Plan',
      accessor: 'budgetPlan',
      isNumeric: true,
      isEditable: isProjectEditable,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.budgetCarryForward,
      header: 'Budget Carry Forward',
      accessor: 'budgetCarryForward',
      isNumeric: true,
      isEditable: isProjectEditable,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.budgetAllocated,
      header: 'Budget Allocated to Asset',
      accessor: 'budgetAllocated',
      isNumeric: true,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToAllocate,
      header: 'Remaining to Allocate',
      accessor: (p) => p.budgetPlan + p.budgetCarryForward - p.budgetAllocated,
      isNumeric: true,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.budgetApproved,
      header: 'FS Budget',
      accessor: 'approvedBudget',
      isNumeric: true,
      isEditable: isProjectEditable,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToApproved,
      header: 'Remaining To Approved',
      accessor: (p) => p.budgetPlan + p.budgetCarryForward - p.approvedBudget,
      isNumeric: true,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.consumedBudget,
      header: 'Realization Budget',
      accessor: 'consumedBudget',
      isNumeric: true,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.remainingToConsume,
      header: 'Remaining to Consume',
      accessor: (p) => p.budgetPlan + p.budgetCarryForward - p.consumedBudget,
      isNumeric: true,
      align: 'right',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.fs,
      header: 'FS',
      accessor: (item: Project) => {
        if (item.isRoutineAssetAggregator || item.type === ProjectType.GeneralAndRoutine) {
          return <span className="text-xs text-siloam-text-secondary">N/A</span>;
        }
        const fs = fsDataMap.get(item.id);
        const status = fs ? fs.conclusion : 'Not Submitted';
        return (
          <div className="flex flex-col items-start gap-1.5 min-w-[7rem]">
            <FsStatusBadge status={status} />
            {!fs ? (
              canCreateFs ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateFs(item);
                  }}
                  className="px-2.5 py-1 bg-siloam-blue text-white text-xs rounded-md hover:bg-siloam-blue/90 transition-colors"
                >
                  Create FS
                </button>
              ) : (
                <span className="text-xs text-siloam-text-secondary">View only</span>
              )
            ) : (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onViewFs(item, fs);
                }}
                className="px-2.5 py-1 border border-siloam-border text-siloam-text-primary text-xs rounded-md hover:bg-siloam-bg transition-colors"
              >
                View FS
              </button>
            )}
          </div>
        );
      },
      align: 'left',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.assetManagement,
      header: 'Asset Management',
      accessor: (item) => {
        const assetCount = assetCountByProjectId.get(item.id) ?? item.assets.length;
        return (
        <div className="flex justify-center">
          {assetCount > 0 ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProjectAssets(item);
              }}
              className="text-siloam-blue hover:underline text-xs font-semibold bg-siloam-blue/10 px-3 py-1.5 rounded-lg transition-colors"
            >
              [ {assetCount} ] Assets
            </button>
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenProjectAssets(item);
              }}
              className="text-white bg-siloam-blue hover:bg-siloam-blue/90 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
            >
              + Add Assets
            </button>
          )}
        </div>
        );
      },
      align: 'center',
    },
    {
      id: BUDGET_HU_TABLE_COLUMN_IDS.actions,
      header: '',
      accessor: (item) => (
        <div className="flex items-center justify-center">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteProject(item);
            }}
            className="p-2 rounded-lg text-siloam-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
            aria-label={`Delete project ${item.projectCode}`}
            title="Delete project"
          >
            <Trash2 className="w-4 h-4" strokeWidth={1.75} aria-hidden />
          </button>
        </div>
      ),
      align: 'center',
    },
  ];
}
