import React, { useMemo, useCallback } from 'react';
import { Page } from '../../../types';
import type { Notification, BudgetPeriod, Archetype, HospitalUnit } from '../../../types';
import { NotificationBell } from '../../molecules/NotificationBell/NotificationBell';
import { Dropdown } from '../../molecules/Dropdown/Dropdown';

const formatHuLabel = (hu: HospitalUnit): string => {
    const code = (hu.code || '').trim();
    return code ? `${code} - ${hu.name}` : hu.name;
};

const BurgerIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
);

interface HeaderProps {
    activePage: Page;
    onMenuClick: () => void;
    notifications?: Notification[];
    onMarkAsRead?: (id: string) => void;
    onMarkAllAsRead?: () => void;
    onNavigate?: (page: Page) => void;
    
    showFilters: boolean;
    allPeriods: BudgetPeriod[];
    selectedPeriodName: string;
    onPeriodChange: (name: string) => void;

    visibleArchetypes: Archetype[];
    selectedArchetypeId: string | null;
    onArchetypeChange: (name: string) => void;

    visibleHUs: HospitalUnit[];
    selectedHuId: string | null;
    onHUChange: (name: string) => void;
    onHUHover?: (huId: string) => void;
    isLoadingBudgetPeriod?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
    activePage,
    onMenuClick,
    notifications = [],
    onMarkAsRead = () => {},
    onMarkAllAsRead = () => {},
    onNavigate = () => {},
    showFilters,
    allPeriods,
    selectedPeriodName,
    onPeriodChange,
    visibleArchetypes,
    selectedArchetypeId,
    onArchetypeChange,
    visibleHUs,
    selectedHuId,
    onHUChange,
    onHUHover,
    isLoadingBudgetPeriod = false
}) => {
    // Memoize selected items and options to prevent unnecessary re-renders
    const selectedArchetype = useMemo(() => 
        visibleArchetypes.find(a => a.id === selectedArchetypeId),
        [visibleArchetypes, selectedArchetypeId]
    );
    const selectedHU = useMemo(() => 
        visibleHUs.find(u => u.id === selectedHuId),
        [visibleHUs, selectedHuId]
    );
    
    // Memoize options arrays
    const archetypeOptions = useMemo(() => 
        visibleArchetypes.map(a => a.name),
        [visibleArchetypes]
    );
    const huOptions = useMemo(() => 
        visibleHUs.map(formatHuLabel),
        [visibleHUs]
    );
    const periodOptions = useMemo(() => 
        allPeriods.map(p => p.periodName),
        [allPeriods]
    );
    
    // Memoize callbacks
    const handleArchetypeChange = useCallback((name: string) => {
        onArchetypeChange(name);
    }, [onArchetypeChange]);
    
    const handleHUChange = useCallback((name: string) => {
        onHUChange(name);
    }, [onHUChange]);

    const handleHUOptionHover = useCallback(
        (label: string) => {
            if (!onHUHover) return;
            const hu = visibleHUs.find(
                (u) => formatHuLabel(u) === label || u.name === label,
            );
            if (hu) onHUHover(hu.id);
        },
        [onHUHover, visibleHUs],
    );

    // FIX: Removed non-existent 'Page.BudgetProject' from filter arrays to resolve compilation error.
    const pagesWithArchetypeFilter = [Page.BudgetArchetype, Page.BudgetHU];
    const pagesWithHUFilter = [Page.BudgetHU];

    return (
        <header className="flex-shrink-0 bg-siloam-surface border-b border-siloam-border px-4 py-3 md:px-6 flex justify-between items-center sticky top-0 z-30">
            <div className="flex items-center">
                 <button 
                    className="p-2 mr-2 md:hidden" 
                    onClick={onMenuClick}
                    aria-label="Open navigation menu"
                >
                    <BurgerIcon />
                </button>
                <h1 className="text-xl md:text-2xl font-bold text-siloam-text-primary">{activePage}</h1>
            </div>
            <div className="flex items-center gap-4">
                 {showFilters && (
                    <div
                        data-tour="header-budget-filters"
                        className="hidden md:flex items-center gap-2 bg-siloam-bg p-1.5 rounded-xl border border-siloam-border"
                    >
                        <Dropdown
                            options={periodOptions}
                            selectedValue={selectedPeriodName}
                            onSelect={onPeriodChange}
                            className="w-40"
                        />
                        {pagesWithArchetypeFilter.includes(activePage) && (
                            <Dropdown
                                options={
                                  archetypeOptions.length > 0
                                    ? archetypeOptions
                                    : isLoadingBudgetPeriod
                                      ? ['Loading...']
                                      : []
                                }
                                selectedValue={
                                  selectedArchetype?.name ||
                                  (isLoadingBudgetPeriod && archetypeOptions.length === 0
                                    ? 'Loading...'
                                    : '')
                                }
                                onSelect={(name) => {
                                  if (name === 'Loading...') return;
                                  handleArchetypeChange(name);
                                }}
                                className="w-48"
                                placeholder={isLoadingBudgetPeriod ? 'Loading...' : undefined}
                            />
                        )}
                        {pagesWithHUFilter.includes(activePage) && (
                            <Dropdown
                                options={
                                  huOptions.length > 0
                                    ? huOptions
                                    : isLoadingBudgetPeriod
                                      ? ['Loading...']
                                      : []
                                }
                                selectedValue={
                                  selectedHU
                                    ? formatHuLabel(selectedHU)
                                    : isLoadingBudgetPeriod && huOptions.length === 0
                                      ? 'Loading...'
                                      : ''
                                }
                                onSelect={(name) => {
                                  if (name === 'Loading...') return;
                                  handleHUChange(name);
                                }}
                                onOptionHover={(name) => {
                                  if (name === 'Loading...') return;
                                  handleHUOptionHover(name);
                                }}
                                className="w-56"
                                placeholder={isLoadingBudgetPeriod ? 'Loading...' : undefined}
                            />
                        )}
                    </div>
                 )}
                 <NotificationBell 
                    notifications={notifications}
                    onMarkAsRead={onMarkAsRead}
                    onMarkAllAsRead={onMarkAllAsRead}
                    onNavigate={onNavigate}
                 />
            </div>
        </header>
    );
};

Header.displayName = 'Header';