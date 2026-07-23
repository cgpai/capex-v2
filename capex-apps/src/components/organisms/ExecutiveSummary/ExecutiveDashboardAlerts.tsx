import React, { memo } from 'react';
import type { ExecutiveDashboardAlert } from '../../../lib/executiveSummary/dashboardTypes';
import { ExecutiveDashboardPanel } from './ExecutiveDashboardPanel';

interface ExecutiveDashboardAlertsProps {
  alerts: ExecutiveDashboardAlert[];
}

export const ExecutiveDashboardAlerts = memo(function ExecutiveDashboardAlerts({
  alerts,
}: ExecutiveDashboardAlertsProps) {
  if (alerts.length === 0) {
    return (
      <ExecutiveDashboardPanel title="Alert & Risiko" minHeightClass="min-h-0">
        <p className="text-sm text-green-700 font-medium">Tidak ada alert kritis saat ini.</p>
      </ExecutiveDashboardPanel>
    );
  }

  return (
    <section className="space-y-4">
      <h2 className="text-xs font-bold uppercase tracking-widest text-siloam-text-secondary">Alert &amp; Risiko</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {alerts.map((alert, idx) => (
          <AlertCard key={`${alert.title}-${idx}`} alert={alert} />
        ))}
      </div>
    </section>
  );
});

function AlertCard({ alert }: { alert: ExecutiveDashboardAlert }) {
  const isRed = alert.severity === 'red';
  return (
    <div
      className={`p-4 rounded-xl border shadow-soft h-full ${
        isRed
          ? 'bg-red-50/80 border-red-200 border-l-4 border-l-red-500'
          : 'bg-amber-50/80 border-amber-200 border-l-4 border-l-amber-500'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${isRed ? 'bg-red-500' : 'bg-amber-500'}`}
          aria-hidden
        />
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isRed ? 'text-red-800' : 'text-amber-800'}`}>{alert.title}</p>
          <p className={`text-xs mt-1 leading-relaxed ${isRed ? 'text-red-700' : 'text-amber-700'}`}>{alert.detail}</p>
        </div>
      </div>
    </div>
  );
}
