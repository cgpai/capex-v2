import React, { memo } from 'react';
import type { ExecutiveDashboardUnitRow } from '../../../lib/executiveSummary/dashboardTypes';

interface ExecutiveDashboardUnitBarChartProps {
  units: ExecutiveDashboardUnitRow[];
  maxItems?: number;
}

function utilizationColor(pct: number): string {
  if (pct >= 95) return '#DC3545';
  if (pct >= 80) return '#F59E0B';
  if (pct >= 60) return '#00529B';
  return '#28A745';
}

export const ExecutiveDashboardUnitBarChart = memo(function ExecutiveDashboardUnitBarChart({
  units,
  maxItems = 10,
}: ExecutiveDashboardUnitBarChartProps) {
  const rows = units.slice(0, maxItems);

  if (rows.length === 0) {
    return (
      <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full border border-siloam-border/60">
        <h3 className="text-base font-bold text-siloam-text-primary mb-4">Budget Utilization per Unit</h3>
        <p className="text-sm text-siloam-text-secondary text-center py-12">Belum ada data unit.</p>
      </div>
    );
  }

  return (
    <div className="bg-siloam-surface p-5 rounded-xl shadow-soft h-full border border-siloam-border/60">
      <h3 className="text-base font-bold text-siloam-text-primary mb-4">Budget Utilization per Unit</h3>
      <div className="space-y-3">
        {rows.map((unit) => (
          <div key={unit.unitCode} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-siloam-text-primary truncate pr-2" title={unit.unitName}>
                {unit.unitCode}
              </span>
              <span className="font-bold shrink-0" style={{ color: utilizationColor(unit.utilizationPct) }}>
                {unit.utilizationPct}%
              </span>
            </div>
            <div className="h-2.5 bg-siloam-bg rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(unit.utilizationPct, 100)}%`,
                  backgroundColor: utilizationColor(unit.utilizationPct),
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
