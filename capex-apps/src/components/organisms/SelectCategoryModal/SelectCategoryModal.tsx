import React, { useState, useEffect } from 'react';
import { BudgetCategoryConfig } from '../../../types';

interface SelectCategoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (categoryId: string) => void;
    categories: BudgetCategoryConfig[];
    title?: string;
}

export const SelectCategoryModal: React.FC<SelectCategoryModalProps> = ({ isOpen, onClose, onSelect, categories, title = 'Select Budget Category' }) => {
    const [selectedId, setSelectedId] = useState<string>('');
    const activeCategories = categories.filter(c => c.isActive);

    useEffect(() => {
        if (isOpen && activeCategories.length > 0) {
            setSelectedId(activeCategories[0].id);
        } else {
            setSelectedId('');
        }
    }, [isOpen, categories]);

    if (!isOpen) return null;

    const handleNext = () => {
        if (selectedId) {
            onSelect(selectedId);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-lg">
                <div className="p-6 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
                    <p className="text-sm text-siloam-text-secondary mt-1">Please select a category to continue creating the new project.</p>
                </div>
                <div className="p-6">
                    <label className="block text-sm font-medium text-siloam-text-secondary mb-2">Budget Category</label>
                    <select 
                        value={selectedId} 
                        onChange={e => setSelectedId(e.target.value)}
                        className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    >
                        {activeCategories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>
                </div>
                <div className="p-6 border-t border-siloam-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleNext} disabled={!selectedId} className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400">Next</button>
                </div>
            </div>
        </div>
    );
};
SelectCategoryModal.displayName = 'SelectCategoryModal';
