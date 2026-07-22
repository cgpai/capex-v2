
import React, { useMemo } from 'react';
import { BudgetSummaryRow } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { MultiSegmentProgressBar } from '../../molecules/MultiSegmentProgressBar/MultiSegmentProgressBar';

const getCategoryIcon = (categoryName: string) => {
    const iconClass = "w-5 h-5 text-siloam-blue";
    switch(categoryName) {
        case 'Revenue Maintenance':
            return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>;
        case 'New Revenue Generating':
            return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182.553-.44 1.278-.659 2.003-.659 1.172 0 2.296.879 2.296.879m-12 3.822h1.5a1.5 1.5 0 001.5-1.5V6.75a1.5 1.5 0 00-1.5-1.5H3.75a1.5 1.5 0 00-1.5 1.5v1.5a1.5 1.5 0 001.5 1.5h1.5m-1.5 0h1.5a1.5 1.5 0 011.5 1.5v1.5a1.5 1.5 0 01-1.5 1.5H3.75a1.5 1.5 0 01-1.5-1.5v-1.5a1.5 1.5 0 011.5-1.5m9 0h1.5a1.5 1.5 0 001.5-1.5v-1.5a1.5 1.5 0 00-1.5-1.5h-1.5a1.5 1.5 0 00-1.5 1.5v1.5a1.5 1.5 0 001.5 1.5m0 0h1.5a1.5 1.5 0 011.5 1.5v1.5a1.5 1.5 0 01-1.5 1.5h-1.5a1.5 1.5 0 01-1.5-1.5v-1.5a1.5 1.5 0 011.5-1.5z" /></svg>;
        case 'IT Maintenance':
            return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass}><path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25z" /></svg>;
        case 'Strategic/Pipeline':
            return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.25a.75.75 0 01-.75-.75V10.5a.75.75 0 01.75-.75h1.5a.75.75 0 01.75.75v3.75m0 0h3.75m-3.75 0V7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75v7.5m0 0H21.75a.75.75 0 00.75-.75V7.5a.75.75 0 00-.75-.75h-3.75a.75.75 0 00-.75.75v1.5m0 0V3.75a.75.75 0 00-.75-.75H10.5a.75.75 0 00-.75.75v1.5m0 0V21" /></svg>;
        case 'Transformation & IT Strategic':
            return <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={iconClass}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.898 20.572L16.25 21.75l-.648-1.178a3.375 3.375 0 00-2.456-2.456L12 17.25l1.178-.648a3.375 3.375 0 002.456-2.456L16.25 13.5l.648 1.178a3.375 3.375 0 002.456 2.456L20.25 18l-1.178.648a3.375 3.375 0 00-2.456 2.456z" /></svg>;
        default:
            return <div className="w-5 h-5 bg-gray-400 rounded-full" />;
    }
};

const CompactLegend: React.FC = () => (
    <div className="flex items-center justify-end flex-wrap gap-x-3 gap-y-1 text-xs text-siloam-text-secondary mt-2">
        <div className="flex items-center"><span className="w-2.5 h-2.5 bg-warning mr-1.5 rounded-sm"></span>Allocated</div>
        <div className="flex items-center"><span className="w-2.5 h-2.5 bg-siloam-green mr-1.5 rounded-sm"></span>Approved</div>
        <div className="flex items-center"><span className="w-2.5 h-2.5 bg-siloam-blue mr-1.5 rounded-sm"></span>Consumed</div>
        <div className="flex items-center">
            <div className="w-2.5 h-2.5 flex items-center justify-center mr-1.5">
                <div className="w-0.5 h-full bg-purple-500"></div>
            </div>
            Budget Plan
        </div>
    </div>
);

const ChevronUpIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
);

interface BudgetSummaryProps {
    data: BudgetSummaryRow[];
    isCompact: boolean;
    onToggleCompact: () => void;
}

export const BudgetSummary: React.FC<BudgetSummaryProps> = ({ data, isCompact, onToggleCompact }) => {
    const grandTotal = useMemo(() => {
        if (!data || data.length === 0) {
            return { plan: 0, carryForward: 0, total: 0, allocated: 0, approved: 0, consumed: 0 };
        }
        return data.reduce((acc, item) => {
            acc.plan += item.budgetPlan;
            acc.carryForward += item.budgetCarryForward;
            acc.allocated += item.budgetAllocated;
            acc.approved += item.approvedBudget;
            acc.consumed += item.consumedBudget;
            acc.total += item.budgetPlan + item.budgetCarryForward;
            return acc;
        }, { plan: 0, carryForward: 0, total: 0, allocated: 0, approved: 0, consumed: 0 });
    }, [data]);

    const remainingBudget = grandTotal.total - grandTotal.consumed;
    const isOverBudget = remainingBudget < 0;

    const handleButtonClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        onToggleCompact();
    };

    if (isCompact) {
        return (
            <div 
                className="relative bg-siloam-surface rounded-xl shadow-soft p-4 animate-fade-in cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-siloam-blue/50"
                onClick={onToggleCompact}
            >
                <div className="flex flex-col md:flex-row md:items-center md:gap-6 gap-4">
                    <div className="flex-shrink-0">
                        <p className="text-sm text-siloam-text-secondary">Total Overall Budget</p>
                        <p className="text-2xl font-bold text-siloam-blue">{formatCurrency(grandTotal.total)}</p>
                    </div>

                    <div className="w-full md:flex-1">
                        <MultiSegmentProgressBar 
                            total={grandTotal.total}
                            allocated={grandTotal.allocated}
                            approved={grandTotal.approved}
                            consumed={grandTotal.consumed}
                        />
                        <CompactLegend />
                    </div>
                    
                    <div className="w-full md:w-auto flex justify-between md:justify-start md:gap-6 border-t md:border-t-0 md:border-l border-siloam-border/50 pt-4 md:pt-0 md:pl-6">
                        <div>
                            <p className="text-sm text-siloam-text-secondary">Consumed</p>
                            <p className="text-lg font-semibold text-siloam-text-primary">{formatCurrency(grandTotal.consumed)}</p>
                        </div>
                         <div className="text-right md:text-left">
                            <p className={`text-sm ${isOverBudget ? 'text-danger' : 'text-siloam-text-secondary'}`}>
                                {isOverBudget ? 'Over Budget' : 'Remaining (vs Consumed)'}
                            </p>
                            <p className={`text-lg font-bold ${isOverBudget ? 'text-danger' : 'text-siloam-green'}`}>
                                {formatCurrency(Math.abs(remainingBudget))}
                            </p>
                        </div>
                    </div>
                </div>
                 <button 
                    onClick={handleButtonClick}
                    className="absolute top-3 right-3 text-siloam-blue bg-siloam-sidebar hover:bg-siloam-border p-2 rounded-full shadow-soft transition-all" 
                    title="Expand Summary"
                >
                    <ChevronDownIcon />
                </button>
            </div>
        )
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in relative">
            <button 
                onClick={handleButtonClick}
                className="absolute top-4 right-4 text-siloam-blue bg-siloam-sidebar hover:bg-siloam-border p-2 rounded-full shadow-soft transition-all z-10" 
                title="Minimize Summary"
            >
                <ChevronUpIcon />
            </button>
            {/* Grand Total Card */}
            <div 
                className="lg:col-span-1 bg-siloam-surface rounded-xl shadow-soft p-6 flex flex-col space-y-4 cursor-pointer transition-all hover:shadow-lg hover:ring-2 hover:ring-siloam-blue/50"
                onClick={onToggleCompact}
            >
                <h3 className="text-xl font-bold text-siloam-text-primary">Summary</h3>
                
                <div className="border-b border-siloam-border pb-4">
                     <p className="text-sm text-siloam-text-secondary">Total Overall Budget (Plan + Carry Forward)</p>
                     <p className="text-3xl font-bold text-siloam-blue">{formatCurrency(grandTotal.total)}</p>
                </div>

                <div className="space-y-3 pt-2 flex-grow flex flex-col justify-end">
                    <MultiSegmentProgressBar 
                        total={grandTotal.total}
                        allocated={grandTotal.allocated}
                        approved={grandTotal.approved}
                        consumed={grandTotal.consumed}
                    />
                    <div className="space-y-1 text-xs">
                         <div className="flex justify-between items-center">
                            <div className="flex items-center"><span className="w-2.5 h-2.5 bg-warning mr-1.5 rounded-sm"></span>Allocated</div>
                            <span className="font-semibold">{formatCurrency(grandTotal.allocated)}</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <div className="flex items-center"><span className="w-2.5 h-2.5 bg-siloam-green mr-1.5 rounded-sm"></span>Approved</div>
                            <span className="font-semibold">{formatCurrency(grandTotal.approved)}</span>
                        </div>
                         <div className="flex justify-between items-center">
                            <div className="flex items-center"><span className="w-2.5 h-2.5 bg-siloam-blue mr-1.5 rounded-sm"></span>Consumed</div>
                            <span className="font-semibold">{formatCurrency(grandTotal.consumed)}</span>
                        </div>
                        <div className="flex justify-between items-center pt-2 mt-2 border-t border-dashed border-siloam-border">
                            <div className="flex items-center">
                                <div className="w-2.5 h-2.5 flex items-center justify-center mr-1.5">
                                    <div className="w-0.5 h-full bg-purple-500"></div>
                                </div>
                                Budget Plan
                            </div>
                            <span className="font-semibold">{formatCurrency(grandTotal.plan)}</span>
                        </div>
                    </div>
                </div>

                 <div className="border-t border-siloam-border pt-3 mt-auto">
                    <p className="text-sm font-semibold text-siloam-text-secondary">
                        {isOverBudget ? 'Over Budget By' : 'Remaining (vs Consumed)'}
                    </p>
                    <p className={`text-xl font-bold ${isOverBudget ? 'text-danger' : 'text-siloam-green'}`}>
                        {formatCurrency(Math.abs(remainingBudget))}
                    </p>
                </div>

            </div>

            {/* Category Breakdown List */}
            <div className="lg:col-span-2 bg-siloam-surface rounded-xl shadow-soft p-6">
                 <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-siloam-text-primary">Breakdown by Category</h3>
                 </div>
                 <div className="space-y-4">
                    {data.map(item => {
                        const totalBudget = item.budgetPlan + item.budgetCarryForward;
                        return (
                            <div key={item.categoryId} className="bg-siloam-bg/70 p-3 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                        {getCategoryIcon(item.type)}
                                        <span className="font-semibold text-siloam-text-primary">{item.type}</span>
                                    </div>
                                    <span className="font-bold text-siloam-text-primary">{formatCurrency(totalBudget)}</span>
                                </div>
                                <div className="mt-2 pl-7">
                                     <MultiSegmentProgressBar 
                                        total={totalBudget}
                                        allocated={item.budgetAllocated}
                                        approved={item.approvedBudget}
                                        consumed={item.consumedBudget}
                                    />
                                    <div className="flex justify-between items-center text-xs text-siloam-text-secondary mt-1">
                                        <span>Consumed: {formatCurrency(item.consumedBudget)}</span>
                                        <span>Allocated: {formatCurrency(item.budgetAllocated)}</span>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                 </div>
            </div>
        </div>
    );
};

BudgetSummary.displayName = 'BudgetSummary';
