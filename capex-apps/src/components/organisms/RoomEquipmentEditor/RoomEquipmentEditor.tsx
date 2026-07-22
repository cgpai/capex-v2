import React, { useState, useMemo } from 'react';
import { MasterCatalogueItem, Project, RoomConfig } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface RoomEquipmentEditorProps {
    room: RoomConfig;
    project: Project;
    masterCatalogue: MasterCatalogueItem[];
    onQtyChange: (catalogueId: string, roomId: string, newQty: number) => void;
    itemsOnActivePO: Set<string>;
}

export const RoomEquipmentEditor: React.FC<RoomEquipmentEditorProps> = ({ room, project, masterCatalogue, onQtyChange, itemsOnActivePO }) => {
    const [searchTerm, setSearchTerm] = useState('');

    const quantitiesMap = useMemo(() => {
        const map = new Map<string, number>();
        project.pipelineData?.forEach(d => {
            if (d.roomId === room.id) {
                map.set(d.catalogueId, d.qty);
            }
        });
        return map;
    }, [project.pipelineData, room.id]);

    const groupedAndFilteredCatalogue = useMemo(() => {
        const lowercasedFilter = searchTerm.toLowerCase();
        
        const filtered = masterCatalogue.filter(item =>
            item.name.toLowerCase().includes(lowercasedFilter) ||
            item.rdsCode.toLowerCase().includes(lowercasedFilter) ||
            item.category.toLowerCase().includes(lowercasedFilter)
        );

        return filtered.reduce((acc, item) => {
            const category = item.category || 'Uncategorized';
            if (!acc[category]) {
                acc[category] = [];
            }
            acc[category].push(item);
            return acc;
        }, {} as Record<string, MasterCatalogueItem[]>);
    }, [masterCatalogue, searchTerm]);

    const handleLocalQtyChange = (catalogueId: string, value: string) => {
        const newQty = parseInt(value, 10);
        if (isNaN(newQty) || newQty < 0) {
            onQtyChange(catalogueId, room.id, 0);
        } else {
            onQtyChange(catalogueId, room.id, newQty);
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-siloam-border flex-shrink-0">
                <h3 className="font-bold">{room.name}</h3>
                <input
                    type="text"
                    placeholder="Search equipment by name, RDS code, or category..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full mt-2 p-2 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                />
            </div>
            <div className="flex-1 overflow-y-auto">
                <table className="w-full text-sm">
                    <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0 z-10">
                        <tr>
                            <th className="px-4 py-2">RDS Code</th>
                            <th className="px-4 py-2">Item</th>
                            <th className="px-4 py-2 text-right hidden md:table-cell">Price</th>
                            <th className="px-4 py-2 w-24 text-center">Qty</th>
                        </tr>
                    </thead>
                    <tbody>
                        {Object.keys(groupedAndFilteredCatalogue).sort().map(category => (
                            <React.Fragment key={category}>
                                <tr>
                                    <td colSpan={4} className="px-2 py-1 bg-siloam-sidebar font-semibold text-siloam-text-primary sticky top-[33px] z-[5]">
                                        {category}
                                    </td>
                                </tr>
                                {groupedAndFilteredCatalogue[category].map(item => {
                                    const isOnPO = itemsOnActivePO.has(item.id);
                                    return (
                                        <tr key={item.id} className={`border-b border-siloam-border last:border-b-0 ${isOnPO ? 'bg-gray-100' : 'hover:bg-siloam-bg/50'}`}>
                                            <td className="px-4 py-2 font-mono text-xs">{item.rdsCode}</td>
                                            <td className="px-4 py-2 font-medium">
                                                {item.name}
                                                {isOnPO && <span className="ml-2 text-xs font-bold text-white bg-gray-400 px-1.5 py-0.5 rounded-full">PO CREATED</span>}
                                            </td>
                                            <td className="px-4 py-2 text-right hidden md:table-cell">{formatCurrency(item.price)}</td>
                                            <td className="p-1">
                                                <input 
                                                    type="number" 
                                                    min="0" 
                                                    value={quantitiesMap.get(item.id) || 0}
                                                    onFocus={(e) => e.target.select()}
                                                    onChange={(e) => handleLocalQtyChange(item.id, e.target.value)}
                                                    className={`w-full text-center p-1 border rounded-md focus:outline-none focus:ring-2 ${isOnPO ? 'bg-gray-200 text-gray-500 cursor-not-allowed border-gray-300' : 'bg-siloam-surface border-siloam-border focus:ring-siloam-blue'}`}
                                                    disabled={isOnPO}
                                                />
                                            </td>
                                        </tr>
                                    );
                                })}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
RoomEquipmentEditor.displayName = 'RoomEquipmentEditor';