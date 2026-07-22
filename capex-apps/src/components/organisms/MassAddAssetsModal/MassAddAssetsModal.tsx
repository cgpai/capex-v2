import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Asset, AssetTypeConfig } from '../../../types';
import { parseCurrency, formatCurrency } from '../../../lib/formatter';
import { useToast } from '../../../contexts/ToastContext';

type NewAssetRow = {
    id: number; // for react key
    assetName: string;
    budgetPlan: string;
    endDateTarget: string;
    assetTypeId: string;
};

type RowErrors = {
    assetName?: string;
    budgetPlan?: string;
    endDateTarget?: string;
    assetTypeId?: string;
};

interface MassAddAssetsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newAssets: Omit<Asset, 'id' | 'assetCode' | 'budgetCategoryId' | 'budgetAllocated' | 'consumedBudget'>[]) => void;
    allAssetTypes: AssetTypeConfig[];
}

export const MassAddAssetsModal: React.FC<MassAddAssetsModalProps> = ({ isOpen, onClose, onSave, allAssetTypes }) => {
    const { showToast } = useToast();
    const [rows, setRows] = useState<NewAssetRow[]>([]);
    const [errors, setErrors] = useState<Map<number, RowErrors>>(new Map());

    const activeAssetTypes = useMemo(() => allAssetTypes.filter(at => at.isActive), [allAssetTypes]);

    const resetState = useCallback(() => {
        setRows([{ id: Date.now(), assetName: '', budgetPlan: '', endDateTarget: '', assetTypeId: '' }]);
        setErrors(new Map());
    }, []);

    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen, resetState]);

    const validateRow = useCallback((row: NewAssetRow): RowErrors => {
        const rowErrors: RowErrors = {};
        if (!row.assetName.trim()) rowErrors.assetName = 'Required';
        
        const budget = parseCurrency(row.budgetPlan);
        if (isNaN(budget) || !row.budgetPlan) rowErrors.budgetPlan = 'Invalid number';

        if (!/^\d{4}-\d{2}-\d{2}$/.test(row.endDateTarget)) {
            rowErrors.endDateTarget = 'Use YYYY-MM-DD format';
        } else {
            const date = new Date(row.endDateTarget);
            if (isNaN(date.getTime())) {
                rowErrors.endDateTarget = 'Invalid date';
            }
        }
        
        if (!row.assetTypeId) rowErrors.assetTypeId = 'Required';
        else if (!allAssetTypes.some((at) => at.id === row.assetTypeId)) rowErrors.assetTypeId = 'Invalid type';

        return rowErrors;
    }, [allAssetTypes]);

    const runValidation = useCallback(() => {
        const newErrors = new Map<number, RowErrors>();
        let hasErrors = false;
        rows.forEach(row => {
            const rowErrors = validateRow(row);
            if (Object.keys(rowErrors).length > 0) {
                newErrors.set(row.id, rowErrors);
                hasErrors = true;
            }
        });
        setErrors(newErrors);
        return !hasErrors;
    }, [rows, validateRow]);
    
    useEffect(() => {
        runValidation();
    }, [rows, runValidation]);
    
    const handlePaste = (e: React.ClipboardEvent<HTMLTableSectionElement>) => {
        e.preventDefault();
        const pasteData = e.clipboardData.getData('text');
        const pastedRows = pasteData.split('\n').filter(r => r.trim() !== '').map(row => row.split('\t'));
        
        const newRows: NewAssetRow[] = pastedRows.map((cells, index) => {
            const budgetPlan = cells[1] || '';
            const assetTypeName = cells[3] || '';
            const assetType = activeAssetTypes.find(at => at.name.toLowerCase() === assetTypeName.trim().toLowerCase());
            
            return {
                id: Date.now() + index,
                assetName: cells[0] || '',
                budgetPlan: budgetPlan,
                endDateTarget: cells[2] || '',
                assetTypeId: assetType?.id || '',
            };
        });

        setRows(prevRows => [...prevRows.filter(r => r.assetName || r.budgetPlan || r.endDateTarget || r.assetTypeId), ...newRows]);
    };

    const handleRowChange = (id: number, field: keyof NewAssetRow, value: string) => {
        setRows(prevRows => prevRows.map(row => row.id === id ? { ...row, [field]: value } : row));
    };

    const addRow = () => {
        setRows(prevRows => [...prevRows, { id: Date.now(), assetName: '', budgetPlan: '', endDateTarget: '', assetTypeId: '' }]);
    };

    const deleteRow = (id: number) => {
        setRows(prevRows => prevRows.filter(row => row.id !== id));
    };

    const handleSave = () => {
        if (!runValidation()) {
            showToast('Perbaiki error sebelum menyimpan.', 'error');
            return;
        }

        const newAssets = rows.map((row) => {
            const assetType = allAssetTypes.find((at) => at.id === row.assetTypeId);
            return {
                assetName: row.assetName,
                budgetPlan: parseCurrency(row.budgetPlan),
                endTargetDate: row.endDateTarget,
                workflowSetId: assetType?.workflowSetId || '',
                assetTypeId: row.assetTypeId,
            };
        });
        onSave(newAssets);
        showToast('Aset berhasil ditambah.', 'success');
    };

    const isSaveDisabled = errors.size > 0 || rows.some((r) => !r.assetName || !r.budgetPlan || !r.endDateTarget || !r.assetTypeId);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Mass Add Assets</h3>
                    <p className="text-sm text-siloam-text-secondary">Paste from Excel (Asset Name | Budget Plan | End Date Target | Asset Type Name).</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm table-fixed">
                        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0">
                            <tr>
                                <th className="px-2 py-2 text-left">Asset Name</th>
                                <th className="px-2 py-2 text-left w-48">Budget Plan</th>
                                <th className="px-2 py-2 text-left w-48">End Date Target</th>
                                <th className="px-2 py-2 text-left w-56">Asset Type</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody onPaste={handlePaste}>
                            {rows.map((row) => {
                                const rowErrors = errors.get(row.id) || {};
                                return (
                                    <tr key={row.id}>
                                        <td className="p-1">
                                            <input type="text" value={row.assetName ?? ''} onChange={e => handleRowChange(row.id, 'assetName', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.assetName ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} />
                                        </td>
                                        <td className="p-1">
                                            <input type="text" value={row.budgetPlan ?? ''} onChange={e => handleRowChange(row.id, 'budgetPlan', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.budgetPlan ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} />
                                        </td>
                                        <td className="p-1">
                                            <input type="date" value={row.endDateTarget ?? ''} onChange={e => handleRowChange(row.id, 'endDateTarget', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.endDateTarget ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} />
                                        </td>
                                        <td className="p-1">
                                            <select value={row.assetTypeId ?? ''} onChange={e => handleRowChange(row.id, 'assetTypeId', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.assetTypeId ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`}>
                                                <option value="">Select...</option>
                                                {activeAssetTypes.map(at => <option key={at.id} value={at.id}>{at.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="text-center">
                                            <button onClick={() => deleteRow(row.id)} className="text-red-500 text-xl font-bold p-1 rounded-full hover:bg-red-100">&times;</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                     <button onClick={addRow} className="mt-4 text-sm text-siloam-blue hover:underline">+ Add Row</button>
                </div>
                
                <div className="p-4 border-t border-siloam-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md border border-siloam-border">Cancel</button>
                    <button onClick={handleSave} disabled={isSaveDisabled} className="px-4 py-2 rounded-md bg-siloam-blue text-white disabled:bg-gray-400">
                        Save {rows.length} Assets
                    </button>
                </div>
            </div>
        </div>
    );
};
MassAddAssetsModal.displayName = 'MassAddAssetsModal';
