import React, { useState, useMemo } from 'react';
import { MasterCatalogueItem } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';

interface AddEquipmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    onAdd: (item: MasterCatalogueItem, qty: number) => void;
    masterCatalogue: MasterCatalogueItem[];
    existingCatalogueIds: Set<string>;
}

export const AddEquipmentModal: React.FC<AddEquipmentModalProps> = ({ isOpen, onClose, onAdd, masterCatalogue, existingCatalogueIds }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedItem, setSelectedItem] = useState<MasterCatalogueItem | null>(null);
    const [quantity, setQuantity] = useState(1);

    const filteredCatalogue = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        return masterCatalogue.filter(item => 
            !existingCatalogueIds.has(item.id) &&
            (item.name.toLowerCase().includes(lowercasedFilter) ||
             item.rdsCode.toLowerCase().includes(lowercasedFilter) ||
             item.category.toLowerCase().includes(lowercasedFilter))
        );
    }, [masterCatalogue, searchTerm, existingCatalogueIds]);

    if (!isOpen) return null;

    const handleAddClick = () => {
        if (selectedItem && quantity > 0) {
            onAdd(selectedItem, quantity);
            onClose();
        }
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Add Equipment</h3>
                    <input
                        type="text"
                        placeholder="Search catalogue by name, code, or category..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full mt-2 p-2 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    />
                </div>
                <div className="flex-1 overflow-y-auto">
                    {filteredCatalogue.map(item => (
                        <button
                            key={item.id}
                            onClick={() => setSelectedItem(item)}
                            className={`w-full text-left p-3 border-b border-siloam-border last:border-b-0 transition-colors ${selectedItem?.id === item.id ? 'bg-siloam-blue/10' : 'hover:bg-siloam-bg'}`}
                        >
                            <p className="font-semibold">{item.name}</p>
                            <p className="text-xs text-siloam-text-secondary">{item.rdsCode} - {item.category} - {formatCurrency(item.price)}</p>
                        </button>
                    ))}
                </div>
                {selectedItem && (
                    <div className="p-4 border-t border-siloam-border bg-siloam-bg flex items-center justify-between">
                        <div>
                            <p className="font-semibold">{selectedItem.name}</p>
                            <div className="flex items-center gap-2 mt-1">
                                <label htmlFor="quantity" className="text-sm">Quantity:</label>
                                <NumericInput
                                    id="quantity"
                                    min={1}
                                    value={quantity}
                                    onValueChange={setQuantity}
                                    allowDecimal={false}
                                    align="center"
                                    className="w-20 p-1 border border-siloam-border rounded-lg"
                                />
                            </div>
                        </div>
                        <button onClick={handleAddClick} className="bg-siloam-blue text-white font-semibold px-4 py-2 rounded-lg hover:bg-siloam-blue/90">
                            Add to Room
                        </button>
                    </div>
                )}
                 <div className="p-4 border-t border-siloam-border flex justify-end">
                    <button onClick={onClose} className="text-sm font-semibold px-4 py-2 rounded-lg border border-siloam-border hover:bg-siloam-border">Close</button>
                </div>
            </div>
        </div>
    );
};
