import React, { useState, useEffect } from 'react';
import { MasterCatalogueItem, RoomConfig, Project } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface ItemRoomEditorModalProps {
    isOpen: boolean;
    item: MasterCatalogueItem;
    rooms: RoomConfig[];
    project: Project;
    onQtyChange: (catalogueId: string, roomId: string, newQty: number) => void;
    onClose: () => void;
}

export const ItemRoomEditorModal: React.FC<ItemRoomEditorModalProps> = ({ isOpen, item, rooms, project, onQtyChange, onClose }) => {
    // Create local state to manage inputs for better performance
    const [quantities, setQuantities] = useState<Map<string, number>>(new Map());

    useEffect(() => {
        if (isOpen) {
            const initialQuantities = new Map<string, number>();
            project.pipelineData?.forEach(d => {
                if (d.catalogueId === item.id) {
                    initialQuantities.set(d.roomId, d.qty);
                }
            });
            setQuantities(initialQuantities);
        }
    }, [isOpen, item, project]);

    if (!isOpen) return null;

    const handleLocalQtyChange = (roomId: string, newQty: number) => {
        const safeQty = newQty < 0 ? 0 : newQty;
        const newQuantities = new Map(quantities);
        newQuantities.set(roomId, safeQty);
        setQuantities(newQuantities);
        onQtyChange(item.id, roomId, safeQty);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-lg max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">{item.name}</h3>
                    <p className="text-sm text-siloam-text-secondary">{item.rdsCode} - {formatCurrency(item.price)}</p>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-3">
                    <p className="text-sm text-siloam-text-primary font-medium">Enter quantities for each room:</p>
                    {rooms.map(room => (
                        <div key={room.id} className="flex justify-between items-center bg-siloam-bg p-3 rounded-lg">
                            <label htmlFor={`room-qty-${room.id}`} className="text-siloam-text-primary">{room.name}</label>
                            <NumericInput
                                id={`room-qty-${room.id}`}
                                min={0}
                                value={quantities.get(room.id) || 0}
                                onValueChange={(val) => handleLocalQtyChange(room.id, val)}
                                allowDecimal={false}
                                align="center"
                                className="w-24 border border-siloam-border rounded-lg p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-siloam-border flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-siloam-blue text-white font-semibold px-4 py-2 rounded-lg hover:bg-siloam-blue/90 transition"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

ItemRoomEditorModal.displayName = 'ItemRoomEditorModal';
