import React, { useState } from 'react';
import { BudgetPeriod, BudgetMultiYear } from '../../../types';

interface CreatePeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (periodName: string, startDate: string, endDate: string) => Promise<{ success: boolean, message: string }>;
  existingPeriods: BudgetPeriod[];
  parentMultiYear: BudgetMultiYear | null;
}

export const CreatePeriodModal: React.FC<CreatePeriodModalProps> = ({ isOpen, onClose, onCreate, existingPeriods, parentMultiYear }) => {
  const [periodName, setPeriodName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const minDate = parentMultiYear ? `${parentMultiYear.startYear}-01-01` : '';
  const maxDate = parentMultiYear ? `${parentMultiYear.endYear}-12-31` : '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!periodName || !startDate || !endDate) {
      setError('All fields are required.');
      return;
    }

    if (parentMultiYear) {
        const parentStart = new Date(minDate);
        const parentEnd = new Date(maxDate);
        const selectedStart = new Date(startDate);
        const selectedEnd = new Date(endDate);

        if (selectedStart < parentStart || selectedEnd > parentEnd || selectedStart > selectedEnd) {
            setError(`Dates must be within the parent plan's range (${parentMultiYear.startYear}-${parentMultiYear.endYear}).`);
            return;
        }
    }

    setIsCreating(true);
    const result = await onCreate(periodName, startDate, endDate);
    if (!result.success) {
      setError(result.message);
    }
    setIsCreating(false);
  };
  
  const handleClose = () => {
    // Reset state on close
    setPeriodName('');
    setStartDate('');
    setEndDate('');
    setError('');
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
        <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">Create New Budget Period</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {parentMultiYear && (
                <div className="bg-siloam-blue/10 p-3 rounded-lg text-sm text-siloam-blue">
                    Creating period for <strong>{parentMultiYear.name}</strong>. Dates must be within <strong>{parentMultiYear.startYear} - {parentMultiYear.endYear}</strong>.
                </div>
              )}
              <div>
                <label htmlFor="periodName" className="block text-sm font-medium text-siloam-text-secondary">Period Name</label>
                <input 
                    type="text" 
                    id="periodName" 
                    value={periodName}
                    onChange={(e) => setPeriodName(e.target.value)}
                    placeholder="e.g., Budget 2025"
                    className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" 
                />
              </div>
              <div>
                <label htmlFor="startDate" className="block text-sm font-medium text-siloam-text-secondary">Start Date</label>
                <input 
                    type="date" 
                    id="startDate"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)} 
                    className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    min={minDate}
                    max={maxDate}
                />
              </div>
              <div>
                <label htmlFor="endDate" className="block text-sm font-medium text-siloam-text-secondary">End Date</label>
                <input 
                    type="date" 
                    id="endDate"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)} 
                    className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    min={minDate}
                    max={maxDate}
                />
              </div>
              {error && <p className="text-sm text-danger">{error}</p>}
               <div className="mt-6 flex justify-end space-x-2">
                  <button type="button" onClick={handleClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary">Cancel</button>
                  <button type="submit" disabled={isCreating} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400">
                    {isCreating ? 'Creating...' : 'Create'}
                  </button>
                </div>
            </form>

            <div className="bg-siloam-bg p-4 rounded-xl">
                <h4 className="font-semibold text-siloam-text-primary mb-2">Existing Periods for this Plan</h4>
                <div className="max-h-60 overflow-y-auto">
                    {existingPeriods.length > 0 ? (
                        <ul className="text-sm space-y-2">
                            {existingPeriods.map(p => (
                                <li key={p.periodName} className="p-2 bg-siloam-surface rounded-lg">
                                    <p className="font-medium text-siloam-text-primary">{p.periodName}</p>
                                    <p className="text-xs text-siloam-text-secondary">{p.startDate} to {p.endDate}</p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-siloam-text-secondary">No existing periods.</p>
                    )}
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

CreatePeriodModal.displayName = 'CreatePeriodModal';
