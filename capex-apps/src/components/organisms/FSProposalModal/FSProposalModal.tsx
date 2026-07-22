import React, { useState, useEffect } from 'react';
import type { Project, FeasibilityStudy } from '../../../types';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface FSProposalModalProps {
    project: Project;
    existingFS?: FeasibilityStudy | null;
    onClose: () => void;
    onSave: (fsData: Omit<FeasibilityStudy, 'createdAt' | 'updatedAt'>) => Promise<void>;
    readOnly?: boolean;
}

const FS_TYPE_OPTIONS = ['New FS', 'Revision'];

export const FSProposalModal: React.FC<FSProposalModalProps> = ({
    project,
    existingFS,
    onClose,
    onSave,
    readOnly = false,
}) => {
    const [fsType, setFsType] = useState('New FS');
    const [amount, setAmount] = useState(0);
    const [irr, setIrr] = useState(0);
    const [paybackPeriod, setPaybackPeriod] = useState(0);
    const [npv, setNpv] = useState(0);
    const [roi, setRoi] = useState(0);
    const [plannedRevenueStartDate, setPlannedRevenueStartDate] = useState('');
    const [monthlyRevenuePlan, setMonthlyRevenuePlan] = useState(0);
    const [throughput, setThroughput] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (existingFS) {
            setFsType(existingFS.fsType);
            setAmount(existingFS.amount);
            setIrr(existingFS.irr);
            setPaybackPeriod(existingFS.paybackPeriod);
            setNpv(existingFS.npv);
            setRoi(existingFS.roi);
            setPlannedRevenueStartDate(existingFS.plannedRevenueStartDate?.slice(0, 10) || '');
            setMonthlyRevenuePlan(existingFS.monthlyRevenuePlan);
            setThroughput(existingFS.throughput ?? 0);
        } else {
            setAmount(project.approvedBudget || project.budgetPlan || 0);
        }
    }, [existingFS, project]);

    const handleSubmit = async () => {
        if (readOnly) return;
        if (!plannedRevenueStartDate) return;
        setIsSaving(true);
        try {
            await onSave({
                id: existingFS?.id || '',
                projectId: project.id,
                fsType,
                amount,
                irr,
                paybackPeriod,
                npv,
                roi,
                plannedRevenueStartDate,
                monthlyRevenuePlan,
                throughput,
                conclusion: existingFS?.conclusion || 'Pending',
                followUpAction: existingFS?.followUpAction,
                actualRevenueStartDate: existingFS?.actualRevenueStartDate,
            });
        } finally {
            setIsSaving(false);
        }
    };

    const inputClass =
        'w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:opacity-60';

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                <div className="p-6 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">
                        {readOnly ? 'View FS Proposal' : existingFS ? 'Edit FS Proposal' : 'Create FS Proposal'}
                    </h3>
                    <p className="text-sm text-siloam-text-secondary mt-1">
                        {project.projectName} ({project.projectCode})
                    </p>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">FS Type</label>
                        <select
                            value={fsType}
                            onChange={(e) => setFsType(e.target.value)}
                            disabled={readOnly}
                            className={inputClass}
                        >
                            {FS_TYPE_OPTIONS.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Amount (Rp mn)</label>
                        <CurrencyInput value={amount} onValueChange={setAmount} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">IRR (%)</label>
                        <NumericInput value={irr} onValueChange={setIrr} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Payback Period (months)</label>
                        <NumericInput value={paybackPeriod} onValueChange={setPaybackPeriod} disabled={readOnly} className={inputClass} allowDecimal={false} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">NPV (Rp mn)</label>
                        <CurrencyInput value={npv} onValueChange={setNpv} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">ROI (%)</label>
                        <NumericInput value={roi} onValueChange={setRoi} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Planned Revenue Start</label>
                        <input type="date" value={plannedRevenueStartDate} onChange={(e) => setPlannedRevenueStartDate(e.target.value)} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Monthly Revenue Plan</label>
                        <CurrencyInput value={monthlyRevenuePlan} onValueChange={setMonthlyRevenuePlan} disabled={readOnly} className={inputClass} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Throughput a month (Qty Object)</label>
                        <NumericInput
                            value={throughput}
                            onValueChange={setThroughput}
                            disabled={readOnly}
                            allowDecimal={false}
                            className={inputClass}
                        />
                    </div>
                    {existingFS && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Conclusion</label>
                                <input type="text" value={existingFS.conclusion} disabled className={inputClass} />
                            </div>
                            {existingFS.followUpAction && (
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-medium text-siloam-text-secondary mb-1">Follow Up Action</label>
                                    <textarea value={existingFS.followUpAction} disabled className={inputClass} rows={2} />
                                </div>
                            )}
                        </>
                    )}
                </div>
                <div className="p-6 border-t border-siloam-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg">
                        {readOnly ? 'Close' : 'Cancel'}
                    </button>
                    {!readOnly && (
                        <button
                            onClick={() => void handleSubmit()}
                            disabled={isSaving || !plannedRevenueStartDate}
                            className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400"
                        >
                            {isSaving ? 'Saving...' : existingFS ? 'Update' : 'Create FS'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

FSProposalModal.displayName = 'FSProposalModal';
