import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Project, BudgetCategoryConfig } from '../../../types';
import { parseCurrency, formatCurrency } from '../../../lib/formatter';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';
import { useToast } from '../../../contexts/ToastContext';

type ProjectRow = Partial<Project> & {
    _internalId: string;
    _status: 'existing' | 'new';
};

type RowErrors = {
    projectName?: string;
    budgetPlan?: string;
    budgetCarryForward?: string;
    approvedBudget?: string;
    budgetCategoryId?: string;
};

interface MassAddOrEditProjectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (changes: {
        toCreate: Omit<Project, 'id' | 'projectCode' | 'assets'>[],
        toUpdate: Project[],
        toDeleteIds: string[]
    }) => void;
    existingProjects: Project[];
    allCategories: BudgetCategoryConfig[];
}

export const MassAddOrEditProjectsModal: React.FC<MassAddOrEditProjectsModalProps> = ({ isOpen, onClose, onSave, existingProjects, allCategories }) => {
    const { showToast } = useToast();
    const [rows, setRows] = useState<ProjectRow[]>([]);
    const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
    const [errors, setErrors] = useState<Map<string, RowErrors>>(new Map());
    const activeCategories = allCategories.filter(c => c.isActive);

    const resetState = useCallback(() => {
        const initialRows: ProjectRow[] = existingProjects.map(p => ({
            ...p,
            _internalId: p.id,
            _status: 'existing',
        }));
        setRows(initialRows);
        setDeletedIds(new Set());
        setErrors(new Map());
    }, [existingProjects]);

    useEffect(() => {
        if (isOpen) {
            resetState();
        }
    }, [isOpen, resetState]);

    const validateRow = useCallback((row: ProjectRow): RowErrors => {
        const rowErrors: RowErrors = {};
        if (!row.projectName?.trim()) rowErrors.projectName = 'Required';
        if (!row.budgetCategoryId) rowErrors.budgetCategoryId = 'Required';
        if (isNaN(row.budgetPlan || NaN)) rowErrors.budgetPlan = 'Invalid number';
        if (isNaN(row.budgetCarryForward || NaN)) rowErrors.budgetCarryForward = 'Invalid number';
        if (isNaN(row.approvedBudget || NaN)) rowErrors.approvedBudget = 'Invalid number';
        return rowErrors;
    }, []);

    const runValidation = useCallback(() => {
        const newErrors = new Map<string, RowErrors>();
        let hasErrors = false;
        rows.forEach(row => {
            const rowErrors = validateRow(row);
            if (Object.keys(rowErrors).length > 0) {
                newErrors.set(row._internalId, rowErrors);
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
        const pastedRowsData = pasteData.split('\n').filter(r => r.trim() !== '').map(row => row.split('\t'));

        const newRows: ProjectRow[] = pastedRowsData.map((cells, index) => {
            // Format: Project Name | AX Code | Budget Plan | Category Name | Carry Forward | Approved Budget | Target Budget Start | Budget Revenue Permonth
            const categoryName = cells[3] || '';
            const category = activeCategories.find(c => c.name.toLowerCase() === categoryName.trim().toLowerCase());
            
            return {
                _internalId: `new-${Date.now()}-${index}`,
                _status: 'new',
                projectName: cells[0] || '',
                axCode: cells[1] || '',
                budgetPlan: parseCurrency(cells[2] || '0'),
                budgetCategoryId: category?.id || '',
                budgetCarryForward: parseCurrency(cells[4] || '0'),
                approvedBudget: parseCurrency(cells[5] || '0'),
                targetBudgetStart: cells[6]?.trim() || undefined,
                budgetRevenuePermonth: parseCurrency(cells[7] || '0'),
            };
        });
        
        setRows(prevRows => [...prevRows, ...newRows]);
    };

    const handleRowChange = (internalId: string, field: keyof ProjectRow, value: string | number) => {
        setRows(prevRows => prevRows.map(row => row._internalId === internalId ? { ...row, [field]: value } : row));
    };

    const addRow = () => {
        const newRow: ProjectRow = {
            _internalId: `new-${Date.now()}`,
            _status: 'new',
            projectName: '',
            axCode: '',
            budgetPlan: 0,
            budgetCarryForward: 0,
            approvedBudget: 0,
            budgetCategoryId: activeCategories[0]?.id || '',
            targetBudgetStart: undefined,
            budgetRevenuePermonth: 0,
        };
        setRows(prevRows => [...prevRows, newRow]);
    };

    const deleteRow = (internalId: string) => {
        const rowToDelete = rows.find(r => r._internalId === internalId);
        if (rowToDelete?._status === 'existing' && rowToDelete.id) {
            setDeletedIds(prev => new Set(prev).add(rowToDelete.id!));
        }
        setRows(prevRows => prevRows.filter(row => row._internalId !== internalId));
    };

    const handleSave = () => {
        if (!runValidation()) {
            showToast('Perbaiki error sebelum menyimpan.', 'error');
            return;
        }

        const toCreate = rows.filter(r => r._status === 'new').map(r => {
            const { _internalId, _status, id, projectCode, assets, ...rest } = r;
            return rest as Omit<Project, 'id' | 'projectCode' | 'assets'>;
        });

        const toUpdate = rows
            .filter(r => r._status === 'existing')
            .filter(r => {
                const original = existingProjects.find(p => p.id === r.id);
                if (!original) return false;
                return JSON.stringify(original) !== JSON.stringify(r); // Simple deep compare
            }) as Project[];

        onSave({
            toCreate,
            toUpdate,
            toDeleteIds: Array.from(deletedIds),
        });
        showToast('Perubahan proyek berhasil disimpan.', 'success');
    };

    const handleCopyToClipboard = () => {
        const categoryMap = new Map(allCategories.map(c => [c.id, c.name]));
        const header = "Project Name\tAX Code\tBudget Plan\tBudget Category\tCarry Forward\tApproved Budget\tTarget Budget Start\tBudget Revenue Permonth\n";
        const tsvData = rows.map(row => {
            return [
                row.projectName || '',
                row.axCode || '',
                row.budgetPlan || 0,
                categoryMap.get(row.budgetCategoryId || '') || '',
                row.budgetCarryForward || 0,
                row.approvedBudget || 0,
                row.targetBudgetStart || '',
                row.budgetRevenuePermonth ?? 0,
            ].join('\t');
        }).join('\n');
    
        navigator.clipboard.writeText(header + tsvData).then(() => {
            showToast('Data tabel disalin ke clipboard.', 'success');
        }).catch(err => {
            console.error('Failed to copy text: ', err);
            showToast('Gagal menyalin. Periksa izin browser.', 'error');
        });
    };

    const isSaveDisabled = errors.size > 0;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-7xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border flex justify-between items-center">
                    <div>
                        <h3 className="text-lg font-bold text-siloam-text-primary">Bulk Manage Projects</h3>
                        <p className="text-sm text-siloam-text-secondary">Paste from Excel (Project Name | AX Code | Budget Plan | Category Name | Carry Forward | Approved Budget | Target Budget Start | Budget Revenue Permonth).</p>
                    </div>
                    <button onClick={handleCopyToClipboard} className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 rounded-xl text-sm hover:bg-siloam-border transition shadow-soft whitespace-nowrap">
                        Copy Table
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm table-fixed">
                        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0">
                            <tr>
                                <th className="px-2 py-2 text-left">Project Name</th>
                                <th className="px-2 py-2 text-left w-32">AX Code</th>
                                <th className="px-2 py-2 text-left w-40">Budget Plan</th>
                                <th className="px-2 py-2 text-left w-56">Budget Category</th>
                                <th className="px-2 py-2 text-left w-40">Carry Forward</th>
                                <th className="px-2 py-2 text-left w-40">Approved Budget</th>
                                <th className="px-2 py-2 text-left w-36">Target Budget Start</th>
                                <th className="px-2 py-2 text-left w-40">Budget Revenue Permonth</th>
                                <th className="px-2 py-2 w-10"></th>
                            </tr>
                        </thead>
                        <tbody onPaste={handlePaste}>
                            {rows.map((row) => {
                                const rowErrors = errors.get(row._internalId) || {};
                                return (
                                    <tr key={row._internalId}>
                                        <td className="p-1"><input type="text" value={row.projectName || ''} onChange={e => handleRowChange(row._internalId, 'projectName', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.projectName ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} /></td>
                                        <td className="p-1"><input type="text" value={row.axCode || ''} onChange={e => handleRowChange(row._internalId, 'axCode', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md border-siloam-border`} placeholder="AX Code" /></td>
                                        <td className="p-1"><CurrencyInput value={row.budgetPlan || 0} onValueChange={(val) => handleRowChange(row._internalId, 'budgetPlan', val)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.budgetPlan ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} /></td>
                                        <td className="p-1">
                                            <select value={row.budgetCategoryId || ''} onChange={e => handleRowChange(row._internalId, 'budgetCategoryId', e.target.value)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.budgetCategoryId ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`}>
                                                <option value="" disabled>Select...</option>
                                                {activeCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                                            </select>
                                        </td>
                                        <td className="p-1"><CurrencyInput value={row.budgetCarryForward || 0} onValueChange={(val) => handleRowChange(row._internalId, 'budgetCarryForward', val)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.budgetCarryForward ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} /></td>
                                        <td className="p-1"><CurrencyInput value={row.approvedBudget || 0} onValueChange={(val) => handleRowChange(row._internalId, 'approvedBudget', val)} className={`w-full p-2 bg-transparent border rounded-md ${rowErrors.approvedBudget ? 'border-red-500 bg-red-50' : 'border-siloam-border'}`} /></td>
                                        <td className="p-1"><input type="date" value={row.targetBudgetStart || ''} onChange={e => handleRowChange(row._internalId, 'targetBudgetStart', e.target.value)} className="w-full p-2 bg-transparent border rounded-md border-siloam-border" /></td>
                                        <td className="p-1"><CurrencyInput value={row.budgetRevenuePermonth ?? 0} onValueChange={(val) => handleRowChange(row._internalId, 'budgetRevenuePermonth', val)} className="w-full p-2 bg-transparent border rounded-md border-siloam-border" /></td>
                                        <td className="text-center"><button onClick={() => deleteRow(row._internalId)} className="text-red-500 text-xl font-bold p-1 rounded-full hover:bg-red-100">&times;</button></td>
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
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
MassAddOrEditProjectsModal.displayName = 'MassAddOrEditProjectsModal';
