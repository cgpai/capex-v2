import React, { memo, useMemo } from 'react';
import type { ExecutiveDashboardMonthlyPoint } from '../../../lib/executiveSummary/dashboardTypes';
import { formatBudgetView } from '../../../lib/formatter';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';

interface ExecutiveDashboardTrendChartProps {
  data: ExecutiveDashboardMonthlyPoint[];
}

export const ExecutiveDashboardTrendChart = memo(function ExecutiveDashboardTrendChart({
  data,
}: ExecutiveDashboardTrendChartProps) {
  const showPriorYear = useMemo(() => data.some((d) => d.priorYear > 0), [data]);

  const maxValue = useMemo(() => {
    if (data.length === 0) return 0;
    const values = data.flatMap((d) => [d.realization, d.budgetTarget]);
    if (showPriorYear) values.push(...data.map((d) => d.priorYear));
    return Math.max(...values, 1);
  }, [data, showPriorYear]);

  if (data.length === 0 || maxValue === 0) {
    return (
      <ExecutiveDashboardPanel title="Tren Penggunaan Budget (YTD)">
        <p className="text-sm text-siloam-text-secondary text-center py-12 m-auto">Belum ada data realisasi.</p>
      </ExecutiveDashboardPanel>
    );
  }

  return (
    <ExecutiveDashboardPanel title="Tren Penggunaan Budget (YTD)">
      <div className="flex items-center justify-end gap-3 text-[11px] mb-3 flex-wrap shrink-0">
        <Legend color="#00529B" label="Realisasi periode ini" />
        {showPriorYear ? <Legend color="#94A3B8" label="Periode sebelumnya" /> : null}
        <Legend color="#00A3E0" label="Target budget bulanan" dashed />
      </div>
      <div className="flex items-end gap-1 h-44 px-1 flex-1 min-h-0">
        {data.map((point) => (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-1 min-w-0 h-full">
            <div className="w-full flex items-end justify-center gap-0.5 flex-1 relative min-h-0">
              {showPriorYear ? (
                <Bar heightPct={(point.priorYear / maxValue) * 100} color="#CBD5E1" title={`${point.label} LY: ${formatBudgetView(point.priorYear)}`} />
              ) : null}
              <Bar heightPct={(point.realization / maxValue) * 100} color="#00529B" title={`${point.label}: ${formatBudgetView(point.realization)}`} />
              <div
                className="absolute left-0 right-0 border-t-2 border-dashed border-sky-400 pointer-events-none"
                style={{ bottom: `${(point.budgetTarget / maxValue) * 100}%` }}
                title={`Target: ${formatBudgetView(point.budgetTarget)}`}
              />
            </div>
            <span className="text-[10px] text-siloam-text-secondary font-medium truncate w-full text-center shrink-0">
              {point.label}
            </span>
          </div>
        ))}
      </div>
    </ExecutiveDashboardPanel>
  );
});

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-2.5 h-2.5 rounded-sm ${dashed ? 'border-2 border-dashed bg-transparent' : ''}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      <span className="text-siloam-text-secondary">{label}</span>
    </div>
  );
}

function Bar({ heightPct, color, title }: { heightPct: number; color: string; title: string }) {
  return (
    <div
      className="w-2 sm:w-2.5 rounded-t-sm transition-all"
      style={{ height: `${Math.max(heightPct, 2)}%`, backgroundColor: color }}
      title={title}
    />
  );
}
