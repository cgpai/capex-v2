import React, { useState } from 'react';
import { BudgetMultiYear } from '../../../types';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface CreateMultiYearModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string, startYear: number, endYear: number) => Promise<{ success: boolean, message: string }>;
  existingMultiYears: BudgetMultiYear[];
}

export const CreateMultiYearModal: React.FC<CreateMultiYearModalProps> = ({ isOpen, onClose, onCreate, existingMultiYears }) => {
  const [name, setName] = useState('');
  const [startYear, setStartYear] = useState(new Date().getFullYear());
  const [endYear, setEndYear] = useState(new Date().getFullYear() + 2);
  const [error, setError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !startYear || !endYear) {
      setError('All fields are required.');
      return;
    }
    setError('');
    setIsCreating(true);
    const result = await onCreate(name, startYear, endYear);
    if (!result.success) {
      setError(result.message);
    }
    setIsCreating(false);
  };
  
  const handleClose = () => {
    setName('');
    setStartYear(new Date().getFullYear());
    setEndYear(new Date().getFullYear() + 2);
    setError('');
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
        <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">Create New Multi-Year Budget Plan</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">Plan Name</label>
              <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Strategic Plan 2024-2026"
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">Start Year</label>
              <NumericInput
                  value={startYear}
                  onValueChange={setStartYear}
                  allowDecimal={false}
                  align="left"
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-siloam-text-secondary">End Year</label>
              <NumericInput
                  value={endYear}
                  onValueChange={setEndYear}
                  allowDecimal={false}
                  align="left"
                  className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
              />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
             <div className="mt-6 flex justify-end space-x-2">
                <button type="button" onClick={handleClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary">Cancel</button>
                <button type="submit" disabled={isCreating} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400">
                  {isCreating ? 'Creating...' : 'Create Plan'}
                </button>
              </div>
          </form>
          <div className="bg-siloam-bg p-4 rounded-xl">
              <h4 className="font-semibold text-siloam-text-primary mb-2">Existing Plans</h4>
              <div className="max-h-60 overflow-y-auto">
                  {existingMultiYears.length > 0 ? (
                      <ul className="text-sm space-y-2">
                          {existingMultiYears.map(v => (
                              <li key={v.name} className="p-2 bg-siloam-surface rounded-lg">
                                  <p className="font-medium text-siloam-text-primary">{v.name}</p>
                                  <p className="text-xs text-siloam-text-secondary">{v.startYear} to {v.endYear}</p>
                              </li>
                          ))}
                      </ul>
                  ) : (
                      <p className="text-sm text-siloam-text-secondary">No existing plans.</p>
                  )}
              </div>
          </div>
        </div>
      </div>
    </div>
  );
};

CreateMultiYearModal.displayName = 'CreateMultiYearModal';
