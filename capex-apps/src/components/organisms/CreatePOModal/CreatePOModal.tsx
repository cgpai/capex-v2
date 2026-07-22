import React, { useState, useEffect, useMemo } from 'react';
import { Project, POItem, Vendor, BudgetPeriod, User } from '../../../types';
import * as poService from '../../../services/poService';
import { formatCurrency } from '../../../lib/formatter';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import * as configService from '../../../services/configService';
import { useToast } from '../../../contexts/ToastContext';

interface CreatePOModalProps {
    isOpen: boolean;
    onClose: () => void;
    onPOCreated: () => void;
    project: Project;
    allVendors: Vendor[];
    budgetPeriod: BudgetPeriod;
    currentUser: User;
}

export const CreatePOModal: React.FC<CreatePOModalProps> = ({ isOpen, onClose, onPOCreated, project, allVendors, budgetPeriod, currentUser }) => {
    const { showToast } = useToast();
    const [availableItems, setAvailableItems] = useState<POItem[]>([]);
    const [selectedItems, setSelectedItems] = useState<Map<string, number>>(new Map());
    const [selectedVendorId, setSelectedVendorId] = useState<string>('');
    const [shippingAddress, setShippingAddress] = useState('');
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (!isOpen) return;

        const fetchAvailableItems = async () => {
            setLoading(true);
            setSelectedItems(new Map());
            setSelectedVendorId(allVendors[0]?.id || '');
            setShippingAddress(''); // Or fetch a default address
            setRemarks('');

            const allPOs = await poService.getPurchaseOrdersForProject(project.id);
            const masterCatalogue = await configService.getAllMasterCatalogue();
            const items = poService.getAvailableItemsForPO(project, allPOs, masterCatalogue);
            
            setAvailableItems(items);
            setLoading(false);
        };
        fetchAvailableItems();
    }, [isOpen, project, allVendors]);

    const handleItemSelectionChange = (catalogueId: string, isChecked: boolean) => {
        const newSelected = new Map(selectedItems);
        const item = availableItems.find(i => i.catalogueId === catalogueId);
        if (isChecked && item) {
            newSelected.set(catalogueId, item.qty);
        } else {
            newSelected.delete(catalogueId);
        }
        setSelectedItems(newSelected);
    };

    const handleQtyChange = (catalogueId: string, newQty: number) => {
        const item = availableItems.find(i => i.catalogueId === catalogueId);
        if (!item) return;
        
        const validatedQty = Math.max(0, Math.min(item.qty, newQty));
        const newSelected = new Map(selectedItems);
        newSelected.set(catalogueId, validatedQty);
        setSelectedItems(newSelected);
    };
    
    const poItems = useMemo(() => {
        return Array.from(selectedItems.entries()).map(([catalogueId, qty]) => {
            const item = availableItems.find(i => i.catalogueId === catalogueId);
            if (!item) return null;
            return {
                ...item,
                qty,
                subtotal: qty * item.price,
            };
        }).filter((item): item is POItem => !!item);
    }, [selectedItems, availableItems]);

    const totalValue = useMemo(() => poItems.reduce((sum, item) => sum + item.subtotal, 0), [poItems]);
    
    const handleSubmit = async () => {
        if (!selectedVendorId || poItems.length === 0) {
            showToast('Pilih vendor dan minimal satu item.', 'error');
            return;
        }
        
        setIsSubmitting(true);
        try {
            if (!budgetPeriod) throw new Error("Could not find active budget period.");

            await poService.createPurchaseOrder(budgetPeriod, project.id, project.stage || 1, selectedVendorId, poItems, shippingAddress, remarks, currentUser);
            showToast('PO berhasil dibuat.', 'success');
            onPOCreated();
            onClose();
        } catch (error) {
            console.error("Failed to create PO:", error);
            showToast(`Gagal membuat PO: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-4xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Create Purchase Order for Stage {project.stage}</h3>
                </div>
                {loading ? <div className="p-8 text-center">Loading available items...</div> : (
                    <>
                        <div className="flex-1 overflow-y-auto p-4">
                            <table className="w-full text-sm">
                                <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                                    <tr>
                                        <th className="px-2 py-2 w-10"></th>
                                        <th className="px-2 py-2 text-left">Item</th>
                                        <th className="px-2 py-2 text-right">Available Qty</th>
                                        <th className="px-2 py-2 text-center w-28">Order Qty</th>
                                        <th className="px-2 py-2 text-right">Unit Price</th>
                                        <th className="px-2 py-2 text-right">Subtotal</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {availableItems.map(item => (
                                        <tr key={item.catalogueId} className="border-b border-siloam-border">
                                            <td className="px-2 py-2 text-center">
                                                <input type="checkbox" checked={selectedItems.has(item.catalogueId)} onChange={e => handleItemSelectionChange(item.catalogueId, e.target.checked)} />
                                            </td>
                                            <td className="px-2 py-2">{item.name} <span className="text-xs text-siloam-text-secondary">({item.rdsCode})</span></td>
                                            <td className="px-2 py-2 text-right">{item.qty}</td>
                                            <td className="px-2 py-2 text-center">
                                                <NumericInput value={selectedItems.get(item.catalogueId) || 0} onValueChange={(val) => handleQtyChange(item.catalogueId, val)} allowDecimal={false} align="center" className="w-full p-1 border border-siloam-border rounded-md" disabled={!selectedItems.has(item.catalogueId)} />
                                            </td>
                                            <td className="px-2 py-2 text-right">{formatCurrency(item.price)}</td>
                                            <td className="px-2 py-2 text-right font-semibold">{formatCurrency((selectedItems.get(item.catalogueId) || 0) * item.price)}</td>
                                        </tr>
                                    ))}
                                    {availableItems.length === 0 && (
                                        <tr><td colSpan={6} className="text-center p-8 text-siloam-text-secondary">No items available to order for this stage.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <div className="p-4 border-t border-siloam-border bg-siloam-bg space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium">Vendor</label>
                                    <select value={selectedVendorId} onChange={e => setSelectedVendorId(e.target.value)} className="w-full mt-1 p-2 border border-siloam-border rounded-md">
                                        {allVendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                </div>
                                 <div>
                                    <label className="text-sm font-medium">Shipping Address</label>
                                    <input type="text" value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} className="w-full mt-1 p-2 border border-siloam-border rounded-md" />
                                </div>
                                <div className="md:col-span-2">
                                     <label className="text-sm font-medium">Remarks</label>
                                     <textarea value={remarks} onChange={e => setRemarks(e.target.value)} className="w-full mt-1 p-2 border border-siloam-border rounded-md" rows={2}></textarea>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-sm font-medium">Total PO Value: </span>
                                <span className="text-lg font-bold">{formatCurrency(totalValue)}</span>
                            </div>
                        </div>
                    </>
                )}
                <div className="p-4 border-t border-siloam-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md border border-siloam-border">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || loading || poItems.length === 0} className="px-4 py-2 rounded-md bg-siloam-blue text-white disabled:bg-gray-400">
                        {isSubmitting ? 'Creating...' : 'Create PO'}
                    </button>
                </div>
            </div>
        </div>
    );
};
CreatePOModal.displayName = 'CreatePOModal';
