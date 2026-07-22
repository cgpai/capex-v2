import React, { memo } from 'react';

export const ExecutiveSummarySelectPeriod = memo(function ExecutiveSummarySelectPeriod() {
  return (
    <div className="text-center p-8 text-siloam-text-secondary bg-siloam-surface rounded-xl shadow-soft">
      Please select a Budget Period from the top menu to view the executive summary.
    </div>
  );
});

export const ExecutiveSummaryLoading = memo(function ExecutiveSummaryLoading() {
  return (
    <div className="flex items-center justify-center min-h-[40vh] p-8">
      <div className="w-10 h-10 border-4 border-siloam-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );
});

interface ExecutiveSummaryErrorProps {
  message: string;
}

export const ExecutiveSummaryError = memo(function ExecutiveSummaryError({ message }: ExecutiveSummaryErrorProps) {
  return <div className="text-center p-8 text-danger">{message}</div>;
});

export const ExecutiveSummaryEmptyPeriod = memo(function ExecutiveSummaryEmptyPeriod() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-semibold">Belum ada data budget atau proyek untuk periode ini.</p>
      <p className="mt-1 text-amber-800">
        Atur anggaran di Budget Period / Budget HU, atau pilih periode lain di header.
      </p>
    </div>
  );
});
