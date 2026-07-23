import React, { memo, useMemo } from 'react';
import { DonutChart } from '../../molecules/DonutChart/DonutChart';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';
import type { ExecutiveDashboardCapexStatus } from '../../../lib/executiveSummary/dashboardTypes';
import { CAPEX_PIPELINE_COLORS } from '../../../lib/executiveSummary/dashboardTypes';

interface ExecutiveDashboardCapexStatusChartProps {
  status: ExecutiveDashboardCapexStatus;
}

export const ExecutiveDashboardCapexStatusChart = memo(function ExecutiveDashboardCapexStatusChart({
  status,
}: ExecutiveDashboardCapexStatusChartProps) {
  const chartData = useMemo(() => {
    if (status.donutSlices.length > 0) {
      return status.donutSlices.map((slice) => ({
        name: slice.name,
        value: slice.value,
        color: slice.color || CAPEX_PIPELINE_COLORS[slice.name] || '#94A3B8',
      }));
    }

    return [
      { name: 'Belum FS Approval', value: Math.max(0, status.assetCount - status.fsApprovalCount), color: CAPEX_PIPELINE_COLORS['Belum FS Approval'] },
      { name: 'Sudah FS Approval', value: Math.max(0, status.fsApprovalCount - status.poSentCount), color: CAPEX_PIPELINE_COLORS['Sudah FS Approval'] },
      { name: 'Sudah PO', value: Math.max(0, status.poSentCount - status.readyToUseCount), color: CAPEX_PIPELINE_COLORS['Sudah PO'] },
      { name: 'Ready to Use', value: status.readyToUseCount, color: CAPEX_PIPELINE_COLORS['Ready to Use'] },
      { name: 'Cancel', value: status.cancelledCount, color: CAPEX_PIPELINE_COLORS.Cancel },
    ].filter((d) => d.value > 0);
  }, [status]);

  const totalAssets = status.assetCount + status.cancelledCount;

  return (
    <ExecutiveDashboardPanel title="Status Pengajuan CAPEX">
      <DonutChart title="Status Pengajuan CAPEX" data={chartData} valueFormatter={(value) => String(value)} embedded />

      <div className="mt-4 pt-4 border-t border-siloam-border/60 space-y-3 shrink-0">
        {status.assetCount === 0 && status.donutSlices.length > 0 ? (
          <p className="text-[11px] text-center text-amber-700 font-medium">
            Distribusi status proyek (belum ada asset terdaftar di periode ini)
          </p>
        ) : null}

        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-siloam-text-secondary">
          <span>
            <span className="font-bold text-siloam-text-primary">{status.projectCount}</span> project
          </span>
          <span>
            <span className="font-bold text-siloam-text-primary">{totalAssets}</span> asset
          </span>
          <span>
            FS: <span className="font-bold text-siloam-blue">{status.fsApprovalCount}</span>
          </span>
          <span>
            PO: <span className="font-bold text-amber-600">{status.poSentCount}</span>
          </span>
          <span>
            Ready: <span className="font-bold text-green-700">{status.readyToUseCount}</span>
          </span>
        </div>

        {status.cancelledCount > 0 ? (
          <div className="rounded-lg border border-red-100 bg-red-50/60 max-h-28 overflow-y-auto">
            <p className="text-[10px] font-bold text-red-800 uppercase tracking-wider px-2 py-1.5 border-b border-red-100 sticky top-0 bg-red-50/95">
              Asset Cancel ({status.cancelledCount})
            </p>
            <ul className="text-[11px] text-red-900 divide-y divide-red-100/80">
              {status.cancelledAssets.map((asset) => (
                <li key={asset.id} className="px-2 py-1 flex gap-2 min-w-0">
                  <span className="font-mono shrink-0">{asset.assetCode}</span>
                  <span className="truncate" title={asset.assetName}>
                    {asset.assetName}
                  </span>
                  <span className="text-red-700 shrink-0 ml-auto">{asset.unitCode}</span>
                </li>
              ))}
            </ul>
            {status.cancelledCount > status.cancelledAssets.length ? (
              <p className="text-[10px] text-red-700 px-2 py-1 border-t border-red-100">
                +{status.cancelledCount - status.cancelledAssets.length} asset cancel lainnya
              </p>
            ) : null}
          </div>
        ) : null}

        {status.avgApprovalDays != null ? (
          <p className="text-center text-[11px] text-siloam-text-secondary">
            Rata-rata waktu FS approval:{' '}
            <span className="font-bold text-siloam-blue">{status.avgApprovalDays} hari</span>
          </p>
        ) : null}
        {status.overdueSlaCount > 0 ? (
          <p className="text-center text-[11px] text-red-600 font-medium">
            {status.overdueSlaCount} pengajuan FS melebihi SLA
          </p>
        ) : null}
      </div>
    </ExecutiveDashboardPanel>
  );
});
