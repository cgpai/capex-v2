
import React, { useState, useEffect } from 'react';
import { BudgetCategoryConfig } from '../../../types';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';

interface EditPlanModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedBudgets: Record<string, number>) => void;
    initialBudgets: Record<string, number>;
    activeCategories: BudgetCategoryConfig[];
    title: string;
}

export const EditPlanModal: React.FC<EditPlanModalProps> = ({ isOpen, onClose, onSave, initialBudgets, activeCategories, title }) => {
    const [budgets, setBudgets] = useState(initialBudgets);

    useEffect(() => {
        if(isOpen) {
            setBudgets(initialBudgets);
        }
    }, [isOpen, initialBudgets]);
    
    if (!isOpen) return null;

    const handleBudgetChange = (categoryId: string, value: number) => {
        setBudgets({
            ...budgets,
            [categoryId]: value
        });
    };

    const handleSave = () => {
        onSave(budgets);
        onClose();
    };
    
    return (
         <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <h3 className="text-lg font-bold mb-4">{title}</h3>
                <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
                    {activeCategories.map(cat => (
                        <div key={cat.id}>
                            <label className="block text-sm font-medium text-siloam-text-secondary">{cat.name}</label>
                            <CurrencyInput
                                value={budgets[cat.id] || 0}
                                onValueChange={(val) => handleBudgetChange(cat.id, val)}
                                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90">Save Budgets</button>
                </div>
            </div>
        </div>
    );
};

EditPlanModal.displayName = 'EditPlanModal';
