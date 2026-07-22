import React, { useState, useEffect } from 'react';
import { PurchaseOrder, POItem, BudgetPeriod, User } from '../../../types';
import * as poService from '../../../services/poService';
import { formatCurrency } from '../../../lib/formatter';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface GoodsReceivedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
    po: PurchaseOrder | null;
    budgetPeriod?: BudgetPeriod;
    currentUser?: User;
}

export const GoodsReceivedModal: React.FC<GoodsReceivedModalProps> = ({
    isOpen,
    onClose,
    onSave,
    po,
    budgetPeriod,
    currentUser,
}) => {
    const [receivedQuantities, setReceivedQuantities] = useState<Map<string, number>>(new Map());
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && po) {
            const initialQtys = new Map<string, number>();
            po.items.forEach(item => {
                initialQtys.set(item.catalogueId, item.receivedQty || 0);
            });
            setReceivedQuantities(initialQtys);
        }
    }, [isOpen, po]);

    if (!isOpen || !po) return null;

    const handleQtyChange = (catalogueId: string, newQty: number, maxQty: number) => {
        setError('');
        const validatedQty = Math.max(0, Math.min(maxQty, newQty));
        const newQuantities = new Map(receivedQuantities);
        newQuantities.set(catalogueId, validatedQty);
        setReceivedQuantities(newQuantities);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError('');
        try {
            await poService.receivePOItems(po.id, receivedQuantities, budgetPeriod, currentUser);
            onSave();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Receive Goods for PO: {po.poNumber}</h3>
                    <p className="text-sm text-siloam-text-secondary">Vendor: {po.vendorName}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <table className="w-full text-sm">
                        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                            <tr>
                                <th className="px-2 py-2 text-left">Item</th>
                                <th className="px-2 py-2 text-center">Ordered Qty</th>
                                <th className="px-2 py-2 text-center w-36">Received Qty</th>
                            </tr>
                        </thead>
                        <tbody>
                            {po.items.map(item => (
                                <tr key={item.catalogueId} className="border-b border-siloam-border">
                                    <td className="px-2 py-2">{item.name} <span className="text-xs text-siloam-text-secondary">({item.rdsCode})</span></td>
                                    <td className="px-2 py-2 text-center">{item.qty}</td>
                                    <td className="px-2 py-2 text-center">
                                        <NumericInput
                                            value={receivedQuantities.get(item.catalogueId) || 0}
                                            onValueChange={(val) => handleQtyChange(item.catalogueId, val, item.qty)}
                                            allowDecimal={false}
                                            align="center"
                                            className="w-full p-1 border border-siloam-border rounded-md"
                                        />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {error && <p className="p-4 text-sm text-center text-danger">{error}</p>}
                <div className="p-4 border-t border-siloam-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md border border-siloam-border">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting} className="px-4 py-2 rounded-md bg-siloam-blue text-white disabled:bg-gray-400">
                        {isSubmitting ? 'Saving...' : 'Save Received Quantities'}
                    </button>
                </div>
            </div>
        </div>
    );
};

GoodsReceivedModal.displayName = 'GoodsReceivedModal';
