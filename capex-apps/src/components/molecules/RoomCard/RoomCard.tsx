import React from 'react';
import { RoomConfig } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface RoomCardProps {
    room: RoomConfig;
    itemCount: number;
    totalValue: number;
    isSelected: boolean;
    onClick: () => void;
}

export const RoomCard: React.FC<RoomCardProps> = ({ room, itemCount, totalValue, isSelected, onClick }) => {
    return (
        <button
            onClick={onClick}
            className={`w-full text-left p-4 rounded-xl border transition-all duration-200 ${
                isSelected
                    ? 'bg-siloam-blue/10 border-siloam-blue shadow-lg ring-2 ring-siloam-blue'
                    : 'bg-siloam-surface border-siloam-border hover:border-siloam-blue/50 hover:shadow-md'
            }`}
        >
            <div className="flex justify-between items-start">
                <h4 className="font-bold text-siloam-text-primary pr-2">{room.name}</h4>
                <div className="text-right flex-shrink-0">
                    <p className="text-sm font-semibold text-siloam-text-primary">{itemCount} items</p>
                    <p className="text-xs text-siloam-text-secondary">Total: {formatCurrency(totalValue)}</p>
                </div>
            </div>
        </button>
    );
};
RoomCard.displayName = 'RoomCard';
