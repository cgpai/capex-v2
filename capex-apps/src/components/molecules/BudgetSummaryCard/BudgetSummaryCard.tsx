import React from 'react';
import { formatCurrency } from '../../../lib/formatter';

interface BudgetSummaryCardProps {
    title: string;
    totalBudget: number;
    consumedBudget: number;
    className?: string;
    isEditable?: boolean;
    onEditClick?: () => void;
}

export const BudgetSummaryCard: React.FC<BudgetSummaryCardProps> = ({ title, totalBudget, consumedBudget, className, isEditable, onEditClick }) => {
    const percentage = totalBudget > 0 ? (consumedBudget / totalBudget) * 100 : 0;
    const remaining = totalBudget - consumedBudget;

    return (
        <div className={`bg-siloam-surface p-6 rounded-xl shadow-soft space-y-4 ${className}`}>
            <h3 className="text-lg font-bold text-siloam-text-primary">{title}</h3>
            
            <div>
                <p className="text-sm text-siloam-text-secondary">Total Budget</p>
                <p className="text-2xl font-bold text-siloam-blue">{formatCurrency(totalBudget)}</p>
            </div>

            <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                    className="bg-siloam-blue h-2.5 rounded-full"
                    style={{ width: `${Math.min(100, percentage)}%` }}
                ></div>
            </div>

            <div className="flex justify-between text-sm">
                <div>
                    <p className="text-siloam-text-secondary">Consumed</p>
                    <p className="font-semibold">{formatCurrency(consumedBudget)}</p>
                </div>
                 <div className="text-right">
                    <p className="text-siloam-text-secondary">Remaining</p>
                    <p className={`font-semibold ${remaining < 0 ? 'text-danger' : 'text-siloam-green'}`}>{formatCurrency(remaining)}</p>
                </div>
            </div>

            {isEditable && onEditClick && (
                <div className="pt-4 border-t border-siloam-border flex justify-end">
                    <button
                        onClick={(e) => { e.stopPropagation(); onEditClick(); }}
                        className="text-sm bg-siloam-sidebar text-siloam-text-primary px-3 py-1.5 rounded-lg hover:bg-siloam-border transition"
                    >
                        Edit Plan
                    </button>
                </div>
            )}
        </div>
    );
};

BudgetSummaryCard.displayName = 'BudgetSummaryCard';