import React, { memo, useMemo } from 'react';
import { DonutChart } from '../../molecules/DonutChart/DonutChart';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';
import type {
  ExecutiveDashboardCategorySlice,
  ExecutiveDashboardTopInvestment,
  ExecutiveDashboardUnitRow,
} from '../../../lib/executiveSummary/dashboardTypes';
import { CATEGORY_CHART_COLORS } from '../../../lib/executiveSummary/dashboardTypes';
import { formatBudgetView } from '../../../lib/formatter';

interface ExecutiveDashboardAnalysisSectionProps {
  categories: ExecutiveDashboardCategorySlice[];
  topInvestments: ExecutiveDashboardTopInvestment[];
  topUnits: ExecutiveDashboardUnitRow[];
}

export const ExecutiveDashboardAnalysisSection = memo(function ExecutiveDashboardAnalysisSection({
  categories,
  topInvestments,
  topUnits,
}: ExecutiveDashboardAnalysisSectionProps) {
  const categoryChartData = useMemo(
    () =>
      categories.slice(0, 8).map((c, i) => ({
        name: c.name,
        value: c.value,
        color: CATEGORY_CHART_COLORS[i % CATEGORY_CHART_COLORS.length],
      })),
    [categories],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-stretch">
      <div className="xl:col-span-1">
        <DonutChart
          title="Pengeluaran Berdasarkan Kategori"
          valueFormatter={formatBudgetView}
          data={
            categoryChartData.length > 0
              ? categoryChartData
              : [{ name: '—', value: 1, color: '#E2E8F0' }]
          }
        />
      </div>

      <ExecutiveDashboardPanel title="Top 5 Investasi Terbesar">
        {topInvestments.length === 0 ? (
          <p className="text-sm text-siloam-text-secondary text-center py-8 m-auto">Belum ada data investasi.</p>
        ) : (
          <div className="overflow-x-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-siloam-text-secondary border-b border-siloam-border">
                  <th className="pb-2 font-bold pr-2">Nama Investasi</th>
                  <th className="pb-2 font-bold">Unit</th>
                  <th className="pb-2 font-bold text-right">Nilai</th>
                  <th className="pb-2 font-bold">Status</th>
                </tr>
              </thead>
              <tbody>
                {topInvestments.map((row) => (
                  <tr key={row.id} className="border-b border-siloam-border/50 last:border-0">
                    <td className="py-2.5 font-medium text-siloam-text-primary pr-2 max-w-[120px] truncate" title={row.projectName}>
                      {row.projectName}
                    </td>
                    <td className="py-2.5 text-siloam-text-secondary whitespace-nowrap">{row.unitCode}</td>
                    <td className="py-2.5 text-right font-bold text-siloam-text-primary whitespace-nowrap tabular-nums">
                      {formatBudgetView(row.amount)}
                    </td>
                    <td className="py-2.5">
                      <StatusBadge label={row.statusLabel} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveDashboardPanel>

      <ExecutiveDashboardPanel title="Penggunaan Budget per Unit (Top 5)">
        {topUnits.length === 0 ? (
          <p className="text-sm text-siloam-text-secondary text-center py-8 m-auto">Belum ada data unit.</p>
        ) : (
          <div className="overflow-x-auto flex-1 min-h-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-siloam-text-secondary border-b border-siloam-border">
                  <th className="pb-2 font-bold">Unit</th>
                  <th className="pb-2 font-bold text-right">Budget</th>
                  <th className="pb-2 font-bold text-right">Realisasi</th>
                  <th className="pb-2 font-bold text-right">Utilization</th>
                </tr>
              </thead>
              <tbody>
                {topUnits.map((row) => (
                  <tr key={row.unitCode} className="border-b border-siloam-border/50 last:border-0">
                    <td className="py-2.5 font-medium text-siloam-text-primary">{row.unitCode}</td>
                    <td className="py-2.5 text-right text-siloam-text-secondary whitespace-nowrap tabular-nums">
                      {formatBudgetView(row.budget)}
                    </td>
                    <td className="py-2.5 text-right text-siloam-text-secondary whitespace-nowrap tabular-nums">
                      {formatBudgetView(row.consumed)}
                    </td>
                    <td className="py-2.5 text-right">
                      <UtilBadge pct={row.utilizationPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ExecutiveDashboardPanel>
    </div>
  );
});

function StatusBadge({ label }: { label: string }) {
  const styles: Record<string, string> = {
    Draft: 'bg-slate-100 text-slate-600',
    'Menunggu Approval': 'bg-amber-100 text-amber-700',
    Disetujui: 'bg-blue-100 text-blue-700',
    Ditolak: 'bg-red-100 text-red-700',
    'Selesai Dibeli': 'bg-green-100 text-green-700',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${styles[label] ?? 'bg-siloam-bg text-siloam-text-secondary'}`}>
      {label}
    </span>
  );
}

function UtilBadge({ pct }: { pct: number }) {
  const color = pct >= 95 ? 'bg-red-100 text-red-700' : pct >= 80 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700';
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${color}`}>
      {pct}%
    </span>
  );
}
