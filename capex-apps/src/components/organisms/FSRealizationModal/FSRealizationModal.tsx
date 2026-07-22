import React, { useState, useEffect, useMemo } from 'react';
import type { FeasibilityStudy, FSRealization } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import {
  buildElapsedMonthRange,
  computeMonthlyGapBudgetIdr,
  computeMonthlyGapThroughput,
  computeTotalMonthlyPlanGapIdr,
  computeTotalMonthlyThroughputGap,
  formatThroughputQty,
  toFsApprovedBudgetIdr,
} from '../../../screens/FSRealizationPage/fsRealizationHelpers';

interface FSRealizationModalProps {
    fs: FeasibilityStudy;
    existingRealizations: FSRealization[];
    onClose: () => void;
    onSave: (
        realizations: Omit<FSRealization, 'createdAt' | 'updatedAt'>[],
        actualStartDate: string,
    ) => Promise<void>;
    readOnly?: boolean;
}

type RealizationRow = {
    id: string;
    month: string;
    actualRevenue: number;
    actualThroughput: number;
    notes: string;
};

export const FSRealizationModal: React.FC<FSRealizationModalProps> = ({
    fs,
    existingRealizations,
    onClose,
    onSave,
    readOnly = false,
}) => {
    const [actualStartDate, setActualStartDate] = useState(
        fs.actualRevenueStartDate?.slice(0, 10) || fs.plannedRevenueStartDate?.slice(0, 10) || '',
    );
    const [rows, setRows] = useState<RealizationRow[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const plannedThroughput = fs.throughput ?? 0;

    const months = useMemo(
        () => buildElapsedMonthRange(actualStartDate || fs.plannedRevenueStartDate),
        [actualStartDate, fs.plannedRevenueStartDate],
    );

    useEffect(() => {
        const existingMap = new Map(existingRealizations.map((r) => [r.month, r]));
        setRows(
            months.map((month) => {
                const existing = existingMap.get(month);
                return {
                    id: existing?.id || `FSR-${fs.id}-${month}`,
                    month,
                    actualRevenue: existing?.actualRevenue ?? 0,
                    actualThroughput: existing?.actualThroughput ?? 0,
                    notes: existing?.notes || '',
                };
            }),
        );
    }, [months, existingRealizations, fs.id]);

    const approvedBudgetIdr = useMemo(() => toFsApprovedBudgetIdr(fs.amount), [fs.amount]);

    const totalRealizationIdr = useMemo(
        () => rows.reduce((sum, row) => sum + (Number(row.actualRevenue) || 0), 0),
        [rows],
    );

    const totalActualThroughput = useMemo(
        () => rows.reduce((sum, row) => sum + (Number(row.actualThroughput) || 0), 0),
        [rows],
    );

    const monthlyRevenuePlan = fs.monthlyRevenuePlan ?? 0;

    const gapBudgetIdr = useMemo(
        () => computeTotalMonthlyPlanGapIdr(monthlyRevenuePlan, months.length, totalRealizationIdr),
        [monthlyRevenuePlan, months.length, totalRealizationIdr],
    );

    const gapThroughput = useMemo(
        () => computeTotalMonthlyThroughputGap(plannedThroughput, months.length, totalActualThroughput),
        [plannedThroughput, months.length, totalActualThroughput],
    );

    const rowGaps = useMemo(
        () =>
            rows.map((row) => ({
                gapBudget: computeMonthlyGapBudgetIdr(monthlyRevenuePlan, row.actualRevenue),
                gapThroughput: computeMonthlyGapThroughput(plannedThroughput, row.actualThroughput),
            })),
        [rows, monthlyRevenuePlan, plannedThroughput],
    );

    const handleSave = async () => {
        if (readOnly) return;
        setIsSaving(true);
        try {
            await onSave(
                rows.map((r) => ({
                    id: r.id,
                    fsId: fs.id,
                    month: r.month,
                    actualRevenue: r.actualRevenue,
                    actualThroughput: r.actualThroughput,
                    notes: r.notes || null,
                })),
                actualStartDate,
            );
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass =
        'w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:opacity-60';

    const gapBudgetColorClass =
        gapBudgetIdr < 0
            ? 'text-danger'
            : gapBudgetIdr > 0
              ? 'text-siloam-green'
              : 'text-siloam-text-primary';

    const gapThroughputColorClass =
        gapThroughput < 0
            ? 'text-danger'
            : gapThroughput > 0
              ? 'text-siloam-green'
              : 'text-siloam-text-primary';

    const gapValueColorClass = (value: number) =>
        value < 0 ? 'text-danger' : value > 0 ? 'text-siloam-green' : 'text-siloam-text-primary';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">FS Realization</h3>
                    <p className="text-sm text-siloam-text-secondary mt-1">
                        Monthly plan: {formatCurrency(fs.monthlyRevenuePlan)} | Approved budget:{' '}
                        {formatCurrency(approvedBudgetIdr)} | Planned throughput:{' '}
                        {formatThroughputQty(plannedThroughput)} Qty
                    </p>
                </div>
                <div className="p-6 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="rounded-lg border border-siloam-border bg-siloam-bg p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
                                Gap Budget
                            </p>
                            <p className={`mt-1 text-xl font-bold ${gapBudgetColorClass}`}>
                                {formatCurrency(gapBudgetIdr)}
                            </p>
                            <p className="mt-1 text-xs text-siloam-text-secondary">
                                Total realisasi ({formatCurrency(totalRealizationIdr)}) − Monthly plan (
                                {formatCurrency(monthlyRevenuePlan)} × {months.length} bln)
                            </p>
                        </div>
                        <div className="rounded-lg border border-siloam-border bg-siloam-bg p-4">
                            <p className="text-xs font-medium uppercase tracking-wide text-siloam-text-secondary">
                                Gap Throughput
                            </p>
                            <p className={`mt-1 text-xl font-bold ${gapThroughputColorClass}`}>
                                {formatThroughputQty(gapThroughput)} Qty
                            </p>
                            <p className="mt-1 text-xs text-siloam-text-secondary">
                                Throughput aktual ({formatThroughputQty(totalActualThroughput)}) − Planned throughput (
                                {formatThroughputQty(plannedThroughput)} × {months.length} bln)
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Actual Revenue Start Date</label>
                        <input
                            type="date"
                            value={actualStartDate}
                            onChange={(e) => setActualStartDate(e.target.value)}
                            disabled={readOnly}
                            className={inputClass}
                        />
                    </div>

                    {months.length === 0 ? (
                        <p className="text-sm text-siloam-text-secondary italic">
                            Set Actual Revenue Start Date untuk menampilkan bulan realisasi.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-siloam-border text-siloam-text-secondary">
                                        <th className="text-left py-2 pr-4">Month</th>
                                        <th className="text-left py-2 pr-4">Actual Revenue</th>
                                        <th className="text-right py-2 pr-4">Gap Budget</th>
                                        <th className="text-left py-2 pr-4">Actual Throughput (Qty)</th>
                                        <th className="text-right py-2 pr-4">Gap Throughput</th>
                                        <th className="text-left py-2">Notes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => (
                                        <tr key={row.month} className="border-b border-siloam-border/50">
                                            <td className="py-2 pr-4 font-medium">{row.month}</td>
                                            <td className="py-2 pr-4">
                                                <NumericInput
                                                    value={row.actualRevenue}
                                                    onValueChange={(val) => {
                                                        setRows((prev) =>
                                                            prev.map((r, i) =>
                                                                i === idx ? { ...r, actualRevenue: val } : r,
                                                            ),
                                                        );
                                                    }}
                                                    disabled={readOnly}
                                                    groupThousands
                                                    allowDecimal={false}
                                                    className={inputClass}
                                                />
                                            </td>
                                            <td
                                                className={`py-2 pr-4 text-right font-medium whitespace-nowrap ${gapValueColorClass(rowGaps[idx]?.gapBudget ?? 0)}`}
                                            >
                                                {formatCurrency(rowGaps[idx]?.gapBudget ?? 0)}
                                            </td>
                                            <td className="py-2 pr-4">
                                                <NumericInput
                                                    value={row.actualThroughput}
                                                    onValueChange={(val) => {
                                                        setRows((prev) =>
                                                            prev.map((r, i) =>
                                                                i === idx ? { ...r, actualThroughput: val } : r,
                                                            ),
                                                        );
                                                    }}
                                                    disabled={readOnly}
                                                    allowDecimal={false}
                                                    className={inputClass}
                                                />
                                            </td>
                                            <td
                                                className={`py-2 pr-4 text-right font-medium whitespace-nowrap ${gapValueColorClass(rowGaps[idx]?.gapThroughput ?? 0)}`}
                                            >
                                                {formatThroughputQty(rowGaps[idx]?.gapThroughput ?? 0)} Qty
                                            </td>
                                            <td className="py-2">
                                                <input
                                                    type="text"
                                                    value={row.notes}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setRows((prev) =>
                                                            prev.map((r, i) => (i === idx ? { ...r, notes: val } : r)),
                                                        );
                                                    }}
                                                    disabled={readOnly}
                                                    className={inputClass}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-siloam-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg">
                        {readOnly ? 'Close' : 'Cancel'}
                    </button>
                    {!readOnly && (
                        <button
                            onClick={() => void handleSave()}
                            disabled={isSaving || !actualStartDate || months.length === 0}
                            className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400"
                        >
                            {isSaving ? 'Saving...' : 'Save Realizations'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

FSRealizationModal.displayName = 'FSRealizationModal';
