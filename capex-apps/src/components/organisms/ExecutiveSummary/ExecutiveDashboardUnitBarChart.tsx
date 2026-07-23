import React, { memo } from 'react';
import type { ExecutiveDashboardUnitRow } from '../../../lib/executiveSummary/dashboardTypes';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';

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
      <ExecutiveDashboardPanel title="Budget Utilization per Unit">
        <p className="text-sm text-siloam-text-secondary text-center py-12 m-auto">Belum ada data unit.</p>
      </ExecutiveDashboardPanel>
    );
  }

  return (
    <ExecutiveDashboardPanel title="Budget Utilization per Unit">
      <div className="space-y-3 overflow-y-auto flex-1 min-h-0 pr-1">
        {rows.map((unit) => (
          <div key={unit.unitCode} className="space-y-1">
            <div className="flex items-center justify-between text-xs gap-2">
              <span className="font-bold text-siloam-text-primary truncate" title={unit.unitName}>
                {unit.unitCode}
              </span>
              <span className="font-bold shrink-0 tabular-nums" style={{ color: utilizationColor(unit.utilizationPct) }}>
                {unit.utilizationPct}%
              </span>
            </div>
            <div className="h-2 bg-siloam-bg rounded-full overflow-hidden">
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
    </ExecutiveDashboardPanel>
  );
});
