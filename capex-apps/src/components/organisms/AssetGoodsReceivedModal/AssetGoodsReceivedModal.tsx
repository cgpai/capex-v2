import React, { useState, useEffect } from 'react';
import { Asset } from '../../../types';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface AssetGoodsReceivedModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (receivedQty: number) => void;
    asset: Asset | null;
}

export const AssetGoodsReceivedModal: React.FC<AssetGoodsReceivedModalProps> = ({ isOpen, onClose, onSave, asset }) => {
    const [receivedQty, setReceivedQty] = useState(0);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (isOpen && asset) {
            setReceivedQty(asset.receivedQty || 0);
            setError('');
        }
    }, [isOpen, asset]);

    if (!isOpen || !asset) return null;

    const orderedQty = asset.qty || 1;
    const maxQty = orderedQty;

    const handleQtyChange = (newQty: number) => {
        setError('');
        const validatedQty = Math.max(0, Math.min(maxQty, newQty));
        setReceivedQty(validatedQty);
    };

    const handleSubmit = async () => {
        setIsSubmitting(true);
        setError('');
        try {
            if (receivedQty < 0 || receivedQty > orderedQty) {
                setError(`Received quantity must be between 0 and ${orderedQty}`);
                setIsSubmitting(false);
                return;
            }
            onSave(receivedQty);
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'An unknown error occurred.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const getStatus = () => {
        if (receivedQty === 0) return { text: 'Not Received', color: 'text-orange-600', bg: 'bg-orange-100' };
        if (receivedQty === orderedQty) return { text: 'Fully Received', color: 'text-green-600', bg: 'bg-green-100' };
        return { text: 'Partially Received', color: 'text-yellow-600', bg: 'bg-yellow-100' };
    };

    const status = getStatus();
    const remainingQty = orderedQty - receivedQty;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Mark Received: {asset.assetName}</h3>
                    <p className="text-sm text-siloam-text-secondary">Asset Code: {asset.assetCode}</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                    <div className="space-y-4">
                        {/* Status Card */}
                        <div className={`p-4 rounded-lg border ${status.bg} border-current`}>
                            <div className="flex items-center justify-between">
                                <span className="font-semibold text-siloam-text-primary">Status:</span>
                                <span className={`font-bold ${status.color}`}>{status.text}</span>
                            </div>
                        </div>

                        {/* Quantity Information */}
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 border border-siloam-border rounded-lg bg-siloam-bg">
                                <div className="text-xs text-siloam-text-secondary uppercase mb-1">Ordered Quantity</div>
                                <div className="text-2xl font-bold text-siloam-text-primary">{orderedQty}</div>
                            </div>
                            <div className="p-4 border border-siloam-border rounded-lg bg-siloam-bg">
                                <div className="text-xs text-siloam-text-secondary uppercase mb-1">Received Quantity</div>
                                <div className="text-2xl font-bold text-siloam-text-primary">{receivedQty}</div>
                            </div>
                        </div>

                        {/* Remaining Quantity */}
                        {remainingQty > 0 && (
                            <div className="p-3 border border-orange-300 rounded-lg bg-orange-50">
                                <div className="text-sm text-orange-800">
                                    <span className="font-semibold">Remaining:</span> {remainingQty} item(s) belum diterima
                                </div>
                            </div>
                        )}

                        {/* Input Field */}
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                                Received Quantity
                            </label>
                            <NumericInput
                                min={0}
                                max={orderedQty}
                                value={receivedQty}
                                onValueChange={handleQtyChange}
                                allowDecimal={false}
                                align="center"
                                className="w-full p-3 border border-siloam-border rounded-lg text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                            <p className="text-xs text-siloam-text-secondary mt-1">
                                Enter quantity between 0 and {orderedQty}
                            </p>
                        </div>

                        {/* Progress Bar */}
                        <div>
                            <div className="flex justify-between text-xs text-siloam-text-secondary mb-1">
                                <span>Progress</span>
                                <span>{Math.round((receivedQty / orderedQty) * 100)}%</span>
                            </div>
                            <div className="w-full bg-siloam-sidebar rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full transition-all ${
                                        receivedQty === orderedQty ? 'bg-green-500' : receivedQty > 0 ? 'bg-yellow-500' : 'bg-orange-500'
                                    }`}
                                    style={{ width: `${Math.min(100, (receivedQty / orderedQty) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
                {error && <p className="p-4 text-sm text-center text-danger">{error}</p>}
                <div className="p-4 border-t border-siloam-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md border border-siloam-border hover:bg-siloam-bg">
                        Cancel
                    </button>
                    <button 
                        onClick={handleSubmit} 
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-md bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? 'Saving...' : 'Save Received Quantity'}
                    </button>
                </div>
            </div>
        </div>
    );
};

AssetGoodsReceivedModal.displayName = 'AssetGoodsReceivedModal';
