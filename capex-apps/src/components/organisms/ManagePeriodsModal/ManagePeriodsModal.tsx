
import React, { useState } from 'react';
import { BudgetMultiYear, BudgetPeriod } from '../../../types';
import { GenericTable, Column } from '../GenericTable/GenericTable';

interface ManagePeriodsModalProps {
  isOpen: boolean;
  onClose: () => void;
  multiYearPlan: BudgetMultiYear | null;
  periods: BudgetPeriod[];
  onCreatePeriod: (name: string, startDate: string, endDate: string) => Promise<{ success: boolean; message: string }>;
}

export const ManagePeriodsModal: React.FC<ManagePeriodsModalProps> = ({
  isOpen,
  onClose,
  multiYearPlan,
  periods,
  onCreatePeriod,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [newPeriodName, setNewPeriodName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen || !multiYearPlan) return null;

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPeriodName || !startDate || !endDate) {
        setError('All fields are required.');
        return;
    }
    setIsSubmitting(true);
    setError('');
    const result = await onCreatePeriod(newPeriodName, startDate, endDate);
    setIsSubmitting(false);
    if (result.success) {
        setIsAdding(false);
        setNewPeriodName('');
        setStartDate('');
        setEndDate('');
    } else {
        setError(result.message);
    }
  };

  const columns: Column<BudgetPeriod>[] = [
      { header: 'Period Name', accessor: 'periodName' },
      { header: 'Start Date', accessor: 'startDate' },
      { header: 'End Date', accessor: 'endDate' },
  ];

  const resetForm = () => {
    setIsAdding(false);
    setNewPeriodName('');
    setStartDate('');
    setEndDate('');
    setError('');
  };

  const handleClose = () => {
      resetForm();
      onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
      <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-siloam-border flex justify-between items-center">
            <div>
                <h3 className="text-xl font-bold text-siloam-text-primary">Budget Periods</h3>
                <p className="text-sm text-siloam-text-secondary">for {multiYearPlan.name}</p>
            </div>
            <button onClick={handleClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {isAdding ? (
                <div className="bg-siloam-bg p-4 rounded-xl border border-siloam-border animate-fade-in">
                    <h4 className="font-bold mb-4 text-siloam-text-primary">New Budget Period</h4>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary">Period Name</label>
                            <input 
                                type="text" 
                                value={newPeriodName} 
                                onChange={e => setNewPeriodName(e.target.value)} 
                                className="w-full p-2 border border-siloam-border rounded-lg focus:ring-2 focus:ring-siloam-blue focus:outline-none" 
                                placeholder="e.g. Budget 2025 - v1" 
                            />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                             <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary">Start Date</label>
                                <input 
                                    type="date" 
                                    value={startDate} 
                                    onChange={e => setStartDate(e.target.value)} 
                                    className="w-full p-2 border border-siloam-border rounded-lg focus:ring-2 focus:ring-siloam-blue focus:outline-none" 
                                    min={`${multiYearPlan.startYear}-01-01`}
                                    max={`${multiYearPlan.endYear}-12-31`}
                                />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary">End Date</label>
                                <input 
                                    type="date" 
                                    value={endDate} 
                                    onChange={e => setEndDate(e.target.value)} 
                                    className="w-full p-2 border border-siloam-border rounded-lg focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                                    min={`${multiYearPlan.startYear}-01-01`}
                                    max={`${multiYearPlan.endYear}-12-31`}
                                />
                            </div>
                        </div>
                        {error && <p className="text-danger text-sm">{error}</p>}
                        <div className="flex justify-end gap-2 pt-2">
                            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border border-siloam-border bg-white hover:bg-gray-50 transition">Cancel</button>
                            <button type="submit" disabled={isSubmitting} className="px-4 py-2 rounded-lg bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:opacity-50 transition">
                                {isSubmitting ? 'Creating...' : 'Create Period'}
                            </button>
                        </div>
                    </form>
                </div>
            ) : (
                <div className="flex justify-end">
                    <button onClick={() => setIsAdding(true)} className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft text-sm flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        Add Period
                    </button>
                </div>
            )}

            <div className="border border-siloam-border rounded-xl overflow-hidden">
                <GenericTable columns={columns} data={periods} />
                {periods.length === 0 && <div className="p-8 text-center text-siloam-text-secondary">No budget periods found for this plan.</div>}
            </div>
        </div>
      </div>
    </div>
  );
};

ManagePeriodsModal.displayName = 'ManagePeriodsModal';
