import React, { useState, useEffect } from 'react';
import { AssetTypeConfig } from '../../../types';

export type AssetTypeSelection = {
    assetTypeId: string;
    workflowSetId: string;
};

interface SelectAssetTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (selection: AssetTypeSelection) => void;
    assetTypes: AssetTypeConfig[];
    title?: string;
}

export const SelectAssetTypeModal: React.FC<SelectAssetTypeModalProps> = ({ isOpen, onClose, onSelect, assetTypes, title = 'Select Asset Type' }) => {
    const [selectedId, setSelectedId] = useState<string>('');
    const activeAssetTypes = assetTypes.filter(at => at.isActive);

    useEffect(() => {
        if (isOpen && activeAssetTypes.length > 0) {
            setSelectedId(activeAssetTypes[0].id);
        } else {
            setSelectedId('');
        }
    }, [isOpen, assetTypes]);

    if (!isOpen) return null;

    const handleNext = () => {
        const selectedAssetType = activeAssetTypes.find(at => at.id === selectedId);
        if (selectedAssetType) {
            onSelect({
                assetTypeId: selectedAssetType.id,
                workflowSetId: selectedAssetType.workflowSetId,
            });
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-lg">
                <div className="p-6 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
                    <p className="text-sm text-siloam-text-secondary mt-1">Please select a type for the new asset to determine its approval process.</p>
                </div>
                <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
                    {activeAssetTypes.map(at => (
                        <label key={at.id} className={`flex items-center p-4 rounded-lg border cursor-pointer transition-all ${selectedId === at.id ? 'bg-siloam-blue/10 border-siloam-blue' : 'hover:bg-siloam-bg'}`}>
                            <input
                                type="radio"
                                name="asset-type-selection"
                                value={at.id}
                                checked={selectedId === at.id}
                                onChange={() => setSelectedId(at.id)}
                                className="h-4 w-4 text-siloam-blue focus:ring-siloam-blue border-gray-300"
                            />
                            <span className="ml-3 font-medium text-siloam-text-primary">{at.name}</span>
                        </label>
                    ))}
                    {activeAssetTypes.length === 0 && <p className="text-center text-siloam-text-secondary">No asset types available. Please configure them in the admin settings.</p>}
                </div>
                <div className="p-6 border-t border-siloam-border flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleNext} disabled={!selectedId} className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400">Next</button>
                </div>
            </div>
        </div>
    );
};
SelectAssetTypeModal.displayName = 'SelectAssetTypeModal';
