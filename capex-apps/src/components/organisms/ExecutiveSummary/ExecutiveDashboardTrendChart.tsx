import React, { memo, useMemo } from 'react';
import type { ExecutiveDashboardMonthlyPoint } from '../../../lib/executiveSummary/dashboardTypes';
import { formatBudgetView } from '../../../lib/formatter';

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
      <ChartShell title="Tren Penggunaan Budget (YTD)">
        <p className="text-sm text-siloam-text-secondary text-center py-12">Belum ada data realisasi.</p>
      </ChartShell>
    );
  }

  return (
    <ChartShell title="Tren Penggunaan Budget (YTD)">
      <div className="flex items-center justify-end gap-4 text-xs mb-4 flex-wrap">
        <Legend color="#00529B" label="Realisasi periode ini" />
        {showPriorYear ? <Legend color="#94A3B8" label="Periode sebelumnya" /> : null}
        <Legend color="#00A3E0" label="Target budget bulanan" dashed />
      </div>
      <div className="flex items-end gap-1.5 h-48 px-1">
        {data.map((point) => (
          <div key={point.month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            <div className="w-full flex items-end justify-center gap-0.5 h-40 relative">
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
            <span className="text-[10px] text-siloam-text-secondary font-medium truncate w-full text-center">
              {point.label}
            </span>
          </div>
        ))}
      </div>
    </ChartShell>
  );
});

function ChartShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full flex flex-col border border-siloam-border/60">
      <h3 className="text-base font-bold text-siloam-text-primary mb-2">{title}</h3>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`w-3 h-3 rounded-sm ${dashed ? 'border-2 border-dashed bg-transparent' : ''}`}
        style={dashed ? { borderColor: color } : { backgroundColor: color }}
      />
      <span className="text-siloam-text-secondary">{label}</span>
    </div>
  );
}

function Bar({ heightPct, color, title }: { heightPct: number; color: string; title: string }) {
  return (
    <div
      className="w-2 rounded-t-sm transition-all"
      style={{ height: `${Math.max(heightPct, 2)}%`, backgroundColor: color }}
      title={title}
    />
  );
}
