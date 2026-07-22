import React, { memo } from 'react';
import { PIPELINE_ARCHETYPE_ID } from '../../types';
import type { FsEnrichedProject } from '../../hooks/queries/fetchFsUpdatePageData';
import { formatCurrency } from '../../lib/formatter';
import { CurrencyInput } from '../../components/atoms/CurrencyInput/CurrencyInput';

export type FSUpdateTableRowProps = {
  project: FsEnrichedProject;
  displayAxCode: string;
  displayApprovedBudget: number;
  displayTargetBudgetStart: string;
  displayBudgetRevenuePermonth: number;
  displayFSApproval: boolean;
  canEdit: boolean;
  canCreateFS: boolean;
  isSpecial: boolean;
  onAxCodeChange: (projectId: string, value: string) => void;
  onApprovedBudgetChange: (projectId: string, value: number) => void;
  onTargetBudgetStartChange: (projectId: string, value: string) => void;
  onBudgetRevenuePermonthChange: (projectId: string, value: number) => void;
  onFSApprovalChange: (projectId: string, checked: boolean) => void;
  onCreateFS: (project: FsEnrichedProject) => void;
  onViewFS: (project: FsEnrichedProject) => void;
};

export const FSUpdateTableRow = memo(function FSUpdateTableRow({
  project,
  displayAxCode,
  displayApprovedBudget,
  displayTargetBudgetStart,
  displayBudgetRevenuePermonth,
  displayFSApproval,
  canEdit,
  canCreateFS,
  isSpecial,
  onAxCodeChange,
  onApprovedBudgetChange,
  onTargetBudgetStartChange,
  onBudgetRevenuePermonthChange,
  onFSApprovalChange,
  onCreateFS,
  onViewFS,
}: FSUpdateTableRowProps) {
  const assetsNotFSApprovedCount = project.assetsNotFSApprovedCount || 0;
  const status = project.fsStatus || 'Not Submitted';
  let statusColorClass = 'text-siloam-text-secondary';
  if (status === 'Approved' || status === 'Approved with Notes') {
    statusColorClass = 'text-siloam-green font-medium';
  } else if (status === 'Pending') {
    statusColorClass = 'text-warning font-medium';
  } else if (status === 'Rejected') {
    statusColorClass = 'text-danger font-medium';
  }

  return (
    <tr className="bg-siloam-surface border-b border-siloam-border last:border-b-0 hover:bg-siloam-bg/50">
      <td className="px-4 py-3 text-siloam-text-primary bg-siloam-sidebar/30 border-r border-siloam-border">
        {project.projectCode}
      </td>
      <td className="px-4 py-3 text-siloam-text-primary bg-siloam-sidebar/30 border-r border-siloam-border">
        {project.projectName}
      </td>
      <td className="px-4 py-3 border-r border-siloam-border">
        {canEdit ? (
          <input
            type="text"
            value={displayAxCode}
            onChange={(e) => onAxCodeChange(project.id, e.target.value)}
            className="w-full px-2 py-1 border border-siloam-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
        ) : (
          <span>{displayAxCode}</span>
        )}
      </td>
      <td className="px-4 py-3 text-siloam-text-primary bg-siloam-sidebar/30 border-r border-siloam-border text-right">
        {formatCurrency(project.budgetPlan)}
      </td>
      <td className="px-4 py-3 border-r border-siloam-border">
        {canEdit && !isSpecial ? (
          <CurrencyInput
            value={displayApprovedBudget}
            onValueChange={(val) => onApprovedBudgetChange(project.id, val)}
            className="w-full px-2 py-1 border border-siloam-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
        ) : (
          <span className="block text-right">{formatCurrency(displayApprovedBudget)}</span>
        )}
      </td>
      <td className="px-4 py-3 border-r border-siloam-border">
        {canEdit ? (
          <input
            type="date"
            value={displayTargetBudgetStart}
            onChange={(e) => onTargetBudgetStartChange(project.id, e.target.value)}
            className="w-full px-2 py-1 border border-siloam-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
        ) : (
          <span>{displayTargetBudgetStart || '—'}</span>
        )}
      </td>
      <td className="px-4 py-3 border-r border-siloam-border">
        {canEdit ? (
          <CurrencyInput
            value={displayBudgetRevenuePermonth}
            onValueChange={(val) => onBudgetRevenuePermonthChange(project.id, val)}
            className="w-full px-2 py-1 border border-siloam-border rounded bg-white focus:outline-none focus:ring-2 focus:ring-siloam-blue"
          />
        ) : (
          <span className="block text-right">{formatCurrency(displayBudgetRevenuePermonth)}</span>
        )}
      </td>
      <td className="px-4 py-3 text-siloam-text-primary bg-siloam-sidebar/30 border-r border-siloam-border text-center">
        <div className="font-semibold">{assetsNotFSApprovedCount}</div>
      </td>
      <td className="px-4 py-3 border-r border-siloam-border">
        <span className={statusColorClass}>{status}</span>
      </td>
      <td className="px-4 py-3 text-center border-r border-siloam-border">
        {isSpecial ? (
          <span className="text-xs text-siloam-text-secondary">N/A</span>
        ) : status === 'Not Submitted' ? (
          canCreateFS ? (
            <button
              type="button"
              onClick={() => onCreateFS(project)}
              className="px-3 py-1 bg-siloam-blue text-white text-xs rounded-lg hover:bg-siloam-blue/90"
            >
              Create FS
            </button>
          ) : (
            <span className="text-xs text-siloam-text-secondary">View only</span>
          )
        ) : (
          <button
            type="button"
            onClick={() => onViewFS(project)}
            className="px-3 py-1 border border-siloam-border text-siloam-text-primary text-xs rounded-lg hover:bg-siloam-bg"
          >
            View FS
          </button>
        )}
      </td>
      <td className="px-4 py-3 text-siloam-text-primary bg-siloam-sidebar/30 border-r border-siloam-border sticky right-0 bg-siloam-sidebar/30 border-l border-siloam-border">
        <div className="flex justify-center items-center">
          <input
            type="checkbox"
            checked={displayFSApproval}
            onChange={(e) => onFSApprovalChange(project.id, e.target.checked)}
            disabled={!canEdit || isSpecial}
            className="h-5 w-5 text-siloam-blue rounded border-gray-300 focus:ring-siloam-blue disabled:opacity-50"
            title="FS Approval - Check when FS is approved"
          />
        </div>
      </td>
    </tr>
  );
});

export function isFsUpdateSpecialProject(project: FsEnrichedProject): boolean {
  return project.isRoutineAssetAggregator || project.archetypeId === PIPELINE_ARCHETYPE_ID;
}
