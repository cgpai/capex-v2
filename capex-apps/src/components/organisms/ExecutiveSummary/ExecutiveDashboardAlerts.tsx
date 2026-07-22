import React, { memo } from 'react';
import type { ExecutiveDashboardAlert } from '../../../lib/executiveSummary/dashboardTypes';

interface ExecutiveDashboardAlertsProps {
  alerts: ExecutiveDashboardAlert[];
}

export const ExecutiveDashboardAlerts = memo(function ExecutiveDashboardAlerts({
  alerts,
}: ExecutiveDashboardAlertsProps) {
  if (alerts.length === 0) {
    return (
      <div className="bg-siloam-surface p-5 rounded-xl shadow-soft border border-siloam-border/60">
        <h3 className="text-base font-bold text-siloam-text-primary mb-2">Alert &amp; Risiko</h3>
        <p className="text-sm text-green-700 font-medium">Tidak ada alert kritis saat ini.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-base font-bold text-siloam-text-primary">Alert &amp; Risiko</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {alerts.map((alert, idx) => (
          <AlertCard key={`${alert.title}-${idx}`} alert={alert} />
        ))}
      </div>
    </div>
  );
});

function AlertCard({ alert }: { alert: ExecutiveDashboardAlert }) {
  const isRed = alert.severity === 'red';
  return (
    <div
      className={`p-4 rounded-xl border-l-4 shadow-soft ${
        isRed ? 'bg-red-50 border-red-500' : 'bg-amber-50 border-amber-500'
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg leading-none">{isRed ? '🔴' : '🟡'}</span>
        <div className="min-w-0">
          <p className={`text-sm font-bold ${isRed ? 'text-red-800' : 'text-amber-800'}`}>{alert.title}</p>
          <p className={`text-xs mt-1 ${isRed ? 'text-red-700' : 'text-amber-700'}`}>{alert.detail}</p>
        </div>
      </div>
    </div>
  );
}
