import React from 'react';
import { BudgetMultiYear, BudgetPeriod, Archetype, HospitalUnit } from '../../../types';
import { Dropdown } from '../../molecules/Dropdown/Dropdown';

const formatHuLabel = (hu: HospitalUnit): string => {
    const code = (hu.code || '').trim();
    return code ? `${code} - ${hu.name}` : hu.name;
};

interface PageFilterBarProps {
    // Multi-Year
    allMultiYears?: BudgetMultiYear[];
    selectedMultiYearName?: string;
    onMultiYearChange?: (name: string) => void;
    // Period
    filteredPeriods?: BudgetPeriod[];
    selectedPeriodName?: string;
    onPeriodChange?: (name: string) => void;
    // Archetype
    visibleArchetypes?: Archetype[];
    selectedArchetypeName?: string;
    onArchetypeChange?: (name: string) => void;
    // Hospital Unit
    visibleHUs?: HospitalUnit[];
    selectedHUName?: string;
    onHUChange?: (name: string) => void;
}

export const PageFilterBar: React.FC<PageFilterBarProps> = ({
    allMultiYears,
    selectedMultiYearName,
    onMultiYearChange,
    filteredPeriods,
    selectedPeriodName,
    onPeriodChange,
    visibleArchetypes,
    selectedArchetypeName,
    onArchetypeChange,
    visibleHUs,
    selectedHUName,
    onHUChange,
}) => {
    const showBar = allMultiYears || filteredPeriods || visibleArchetypes || visibleHUs;

    if (!showBar) {
        return null;
    }

    return (
        <div className="bg-siloam-surface p-4 rounded-xl shadow-soft mb-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {allMultiYears && onMultiYearChange && (
                     <Dropdown
                        label="Multi-Year Plan"
                        options={allMultiYears.map(my => my.name)}
                        selectedValue={selectedMultiYearName || ''}
                        onSelect={onMultiYearChange}
                    />
                )}
                 {filteredPeriods && onPeriodChange && (
                     <Dropdown
                        label="Budget Period"
                        options={filteredPeriods.map(p => p.periodName)}
                        selectedValue={selectedPeriodName || ''}
                        onSelect={onPeriodChange}
                    />
                )}
                 {visibleArchetypes && onArchetypeChange && (
                     <Dropdown
                        label="Network"
                        options={visibleArchetypes.map(a => a.name)}
                        selectedValue={selectedArchetypeName || ''}
                        onSelect={onArchetypeChange}
                    />
                )}
                 {visibleHUs && onHUChange && (
                     <Dropdown
                        label="Hospital Unit"
                        options={visibleHUs.map(formatHuLabel)}
                        selectedValue={selectedHUName || ''}
                        onSelect={onHUChange}
                    />
                )}
            </div>
        </div>
    );
};
PageFilterBar.displayName = 'PageFilterBar';