
import React, { useMemo, useState, useRef, useEffect, type ReactNode } from 'react';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import { PeriodCheckboxFilter } from '../../molecules/PeriodCheckboxFilter/PeriodCheckboxFilter';
import { SlicerPanel } from '../SlicerPanel/SlicerPanel';

const SearchIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
    </svg>
);

const FilterIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
);

const ChevronDownIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
);

interface MultiSelectDropdownProps {
    title: string;
    options: string[];
    selected: string[];
    onSelectionChange: (selected: string[]) => void;
    /** Shown when nothing is selected (e.g. scoped users should not see misleading "All"). */
    emptySelectionLabel?: string;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
    title,
    options,
    selected,
    onSelectionChange,
    emptySelectionLabel = 'All',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    const normalizedOptions = useMemo(() => {
        // Ensure stable, clean option list (no blanks / no duplicates)
        const uniq = new Set(
            (options || [])
                .map(o => (o ?? '').trim())
                .filter(Boolean)
        );
        return Array.from(uniq).sort((a, b) => a.localeCompare(b));
    }, [options]);

    const handleToggle = (option: string) => {
        const newSelected = selected.includes(option)
            ? selected.filter(item => item !== option)
            : [...selected, option];
        onSelectionChange(newSelected);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className={`relative w-full ${isOpen ? 'z-30' : 'z-0'}`} ref={dropdownRef}>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)} 
                className={`
                    w-full flex items-center justify-between text-left px-3 py-2 
                    border rounded-lg bg-siloam-surface transition-all duration-200
                    ${isOpen ? 'border-siloam-blue ring-1 ring-siloam-blue' : 'border-siloam-border focus:ring-2 focus:ring-siloam-blue'}
                `}
            >
                <div className="flex-1 min-w-0 mr-2">
                    <span className="text-xs font-bold text-siloam-text-secondary block truncate uppercase">{title}</span>
                    <span className="text-sm font-medium text-siloam-text-primary block truncate" title={selected.length === 0 ? emptySelectionLabel : undefined}>
                        {selected.length > 0 ? `${selected.length} selected` : emptySelectionLabel}
                    </span>
                </div>
                <span className={`text-siloam-text-secondary transition-transform duration-200 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}>
                    <ChevronDownIcon />
                </span>
            </button>
            {isOpen && (
                <div className="absolute z-[100] mt-1 w-full min-w-[220px] bg-white border border-siloam-border rounded-lg shadow-xl animate-fade-in">
                    <div className="max-h-72 overflow-y-auto overscroll-contain py-1 custom-scrollbar">
                        {normalizedOptions.map((option, idx) => (
                            <label key={`${title}-${option}-${idx}`} className="flex items-center px-4 py-2.5 text-sm hover:bg-siloam-bg cursor-pointer transition-colors border-l-4 border-transparent hover:border-siloam-blue/30">
                                <input
                                    type="checkbox"
                                    checked={selected.includes(option)}
                                    onChange={() => handleToggle(option)}
                                    className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue transition duration-150 ease-in-out"
                                />
                                <span className={`ml-3 truncate ${selected.includes(option) ? 'text-siloam-blue font-medium' : 'text-siloam-text-primary'}`}>
                                    {option}
                                </span>
                            </label>
                        ))}
                        {normalizedOptions.length === 0 && (
                            <div className="px-4 py-3 text-sm text-siloam-text-secondary text-center italic">No options available</div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


interface AssetFilterPanelProps {
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    /** Apply search to table — call on Enter. */
    onSearchSubmit?: () => void;
    /** Clear applied + draft search — call on "Clear All Filters". */
    onSearchReset?: () => void;
    periodOptions?: string[];
    selectedPeriods?: string[];
    setSelectedPeriods?: (periods: string[]) => void;
    periodEmptySelectionLabel?: string;
    huOptions: string[];
    /** Label when no HU is checked (should reflect user scope on Capex list). */
    huEmptySelectionLabel?: string;
    selectedHUs: string[];
    setSelectedHUs: (hus: string[]) => void;
    completionRange: { min: number; max: number };
    setCompletionRange: (range: { min: number; max: number }) => void;
    // Priority Filters
    priorityOptions?: string[];
    selectedPriorities?: string[];
    setSelectedPriorities?: (priorities: string[]) => void;
    // Finished Task Filters
    finishedTaskOptions?: string[];
    selectedFinishedTasks?: string[];
    setSelectedFinishedTasks?: (tasks: string[]) => void;
    // Budget Filter
    selectedBudgetFilter?: string | null;
    setSelectedBudgetFilter?: (filter: string | null) => void;
    /** Budget category (project classification) multi-select — option labels + values are category ids. */
    budgetCategoryOptions?: { id: string; name: string }[];
    selectedBudgetCategoryIds?: string[];
    setSelectedBudgetCategoryIds?: (ids: string[]) => void;
    /** Lazy-load secondary config when user opens the filter drawer. */
    onFilterPanelOpen?: () => void;
    archetypeOptions?: string[];
    assetTypeGroupOptions?: string[];
    selectedArchetype?: string | null;
    selectedAssetTypeGroup?: string | null;
    onMeetingFilterChange?: (filters: { archetype: string | null; assetTypeGroup: string | null }) => void;
    showAssetGroupFilter?: boolean;
    /** Optional control rendered to the left of the search input (e.g. Quick Task). */
    toolbarLeading?: ReactNode;
    /** Highlights the filter button when non-default panel filters are applied. */
    hasActiveFilters?: boolean;
    /** Period selection restored on "Clear All Filters" (e.g. current running budget period). */
    defaultSelectedPeriods?: string[];
    /** Extra page-specific filter reset (e.g. PO status tabs). */
    onExtraReset?: () => void;
}

export const AssetFilterPanel: React.FC<AssetFilterPanelProps> = ({
    searchTerm, setSearchTerm,
    onSearchSubmit,
    onSearchReset,
    periodOptions, selectedPeriods, setSelectedPeriods, periodEmptySelectionLabel,
    huOptions, huEmptySelectionLabel, selectedHUs, setSelectedHUs,
    completionRange, setCompletionRange,
    priorityOptions, selectedPriorities, setSelectedPriorities,
    finishedTaskOptions, selectedFinishedTasks, setSelectedFinishedTasks,
    selectedBudgetFilter, setSelectedBudgetFilter,
    budgetCategoryOptions,
    selectedBudgetCategoryIds,
    setSelectedBudgetCategoryIds,
    onFilterPanelOpen,
    archetypeOptions,
    assetTypeGroupOptions,
    selectedArchetype = null,
    selectedAssetTypeGroup = null,
    onMeetingFilterChange,
    showAssetGroupFilter = true,
    toolbarLeading,
    hasActiveFilters = false,
    defaultSelectedPeriods,
    onExtraReset,
}) => {
    const [isFilterVisible, setIsFilterVisible] = useState(false);
    const isFilterButtonHighlighted = hasActiveFilters || isFilterVisible;

    const resetFilters = () => {
        if (onSearchReset) {
            onSearchReset();
        } else {
            setSearchTerm('');
        }
        setSelectedHUs([]);
        if (setSelectedPriorities) setSelectedPriorities([]);
        if (setSelectedFinishedTasks) setSelectedFinishedTasks([]);
        if (setSelectedBudgetFilter) setSelectedBudgetFilter(null);
        if (setSelectedBudgetCategoryIds) setSelectedBudgetCategoryIds([]);
        if (setSelectedPeriods) {
            setSelectedPeriods(
                defaultSelectedPeriods?.length ? defaultSelectedPeriods : [],
            );
        }
        if (onMeetingFilterChange) {
            onMeetingFilterChange({ archetype: null, assetTypeGroup: null });
        }
        setCompletionRange({ min: 0, max: 100 });
        onExtraReset?.();
    };

    return (
        <div className={`p-4 border-b border-siloam-border ${isFilterVisible ? 'relative z-30' : ''}`}>
            <div className="flex flex-wrap items-center gap-4">
                {toolbarLeading ? <div className="shrink-0">{toolbarLeading}</div> : null}
                <div className="flex flex-grow min-w-[200px] items-center gap-2">
                    <input
                        type="text"
                        placeholder="Search assets, projects, HU..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                onSearchSubmit?.();
                            }
                        }}
                        className="w-full min-w-0 px-4 py-2 border border-siloam-border rounded-xl bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue transition-all"
                    />
                </div>
                <button
                    type="button"
                    onClick={() => onSearchSubmit?.()}
                    className="shrink-0 px-4 py-2 flex items-center gap-2 rounded-xl border border-siloam-blue bg-siloam-blue text-white transition-all duration-200 font-medium hover:bg-siloam-blue/90 shadow-sm"
                    aria-label="Cari"
                >
                    <SearchIcon />
                    <span>Cari</span>
                </button>
                <button
                    onClick={() => {
                      const next = !isFilterVisible;
                      if (next) onFilterPanelOpen?.();
                      setIsFilterVisible(next);
                    }}
                    className={`px-4 py-2 flex items-center gap-2 rounded-xl border transition-all duration-200 font-medium ${isFilterButtonHighlighted ? 'bg-siloam-blue text-white border-siloam-blue shadow-md' : 'bg-siloam-surface border-siloam-border hover:bg-siloam-bg text-siloam-text-primary'}`}
                >
                    <FilterIcon />
                    <span>Filter Semua</span>
                </button>
            </div>
            {isFilterVisible && (
                <div className="relative z-20 mt-4 overflow-visible p-4 bg-siloam-bg/50 rounded-xl border border-siloam-border animate-fade-in space-y-4">
                    {periodOptions && periodOptions.length > 0 && selectedPeriods && setSelectedPeriods ? (
                        <PeriodCheckboxFilter
                            options={periodOptions}
                            selectedPeriods={selectedPeriods}
                            onChange={setSelectedPeriods}
                            className="items-start"
                        />
                    ) : null}
                    {onMeetingFilterChange && archetypeOptions ? (
                        <SlicerPanel
                            title="Filter by Network"
                            options={archetypeOptions}
                            selectedOption={selectedArchetype}
                            onSelectOption={(value) =>
                                onMeetingFilterChange({
                                    archetype: value,
                                    assetTypeGroup: selectedAssetTypeGroup,
                                })
                            }
                        />
                    ) : null}
                    {onMeetingFilterChange &&
                    showAssetGroupFilter &&
                    assetTypeGroupOptions &&
                    assetTypeGroupOptions.length > 0 ? (
                        <SlicerPanel
                            title="Filter by Asset Type Group"
                            options={assetTypeGroupOptions}
                            selectedOption={selectedAssetTypeGroup}
                            onSelectOption={(value) =>
                                onMeetingFilterChange({
                                    archetype: selectedArchetype,
                                    assetTypeGroup: value,
                                })
                            }
                        />
                    ) : null}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 overflow-visible items-start">
                        <div className="relative overflow-visible min-w-0">
                            <MultiSelectDropdown
                                title="Hospital Unit"
                                options={huOptions}
                                selected={selectedHUs}
                                onSelectionChange={setSelectedHUs}
                                emptySelectionLabel={huEmptySelectionLabel ?? 'All'}
                            />
                        </div>
                        
                        {priorityOptions && selectedPriorities && setSelectedPriorities && (
                            <div className="relative overflow-visible min-w-0">
                                <MultiSelectDropdown 
                                    title="Priority" 
                                    options={priorityOptions} 
                                    selected={selectedPriorities} 
                                    onSelectionChange={setSelectedPriorities} 
                                />
                            </div>
                        )}

                        {budgetCategoryOptions &&
                            budgetCategoryOptions.length > 0 &&
                            selectedBudgetCategoryIds &&
                            setSelectedBudgetCategoryIds && (
                                <div className="relative overflow-visible min-w-0">
                                    <MultiSelectDropdown
                                        title="Budget Category"
                                        options={budgetCategoryOptions.map((c) => c.name)}
                                        selected={selectedBudgetCategoryIds
                                            .map((id) => budgetCategoryOptions.find((c) => c.id === id)?.name)
                                            .filter((n): n is string => !!n)}
                                        onSelectionChange={(names) => {
                                            const nextIds = names
                                                .map((n) => budgetCategoryOptions.find((c) => c.name === n)?.id)
                                                .filter((id): id is string => !!id);
                                            setSelectedBudgetCategoryIds(nextIds);
                                        }}
                                    />
                                </div>
                            )}

                        {finishedTaskOptions && selectedFinishedTasks && setSelectedFinishedTasks && (
                            <div className="relative overflow-visible min-w-0">
                                <MultiSelectDropdown 
                                    title="Last Completed Task" 
                                    options={finishedTaskOptions} 
                                    selected={selectedFinishedTasks} 
                                    onSelectionChange={setSelectedFinishedTasks} 
                                />
                            </div>
                        )}

                        {setSelectedBudgetFilter && (
                            <div className="bg-white border border-siloam-border rounded-lg p-3">
                                <p className="text-xs font-bold text-siloam-text-secondary uppercase mb-2">Budget Project</p>
                                <select
                                    value={selectedBudgetFilter || ''}
                                    onChange={(e) => setSelectedBudgetFilter(e.target.value || null)}
                                    className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg focus:ring-1 focus:ring-siloam-blue focus:outline-none text-sm"
                                >
                                    <option value="">All Budgets</option>
                                    <option value="low">≤ 300 juta</option>
                                    <option value="high">&gt; 300 juta</option>
                                </select>
                            </div>
                        )}

                        <div className="bg-white border border-siloam-border rounded-lg p-3">
                            <p className="text-xs font-bold text-siloam-text-secondary uppercase mb-2">Completion Rate (%)</p>
                            <div className="flex items-center gap-2">
                                <NumericInput
                                    min={0}
                                    max={100}
                                    value={completionRange.min}
                                    onValueChange={(val) => setCompletionRange({ ...completionRange, min: val })}
                                    allowDecimal={false}
                                    align="center"
                                    className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg focus:ring-1 focus:ring-siloam-blue focus:outline-none text-sm"
                                    placeholder="0"
                                />
                                <span className="text-siloam-text-secondary font-bold">-</span>
                                <NumericInput
                                    min={0}
                                    max={100}
                                    value={completionRange.max}
                                    onValueChange={(val) => setCompletionRange({ ...completionRange, max: val })}
                                    allowDecimal={false}
                                    align="center"
                                    className="w-full px-2 py-1.5 border border-siloam-border rounded-md bg-siloam-bg focus:ring-1 focus:ring-siloam-blue focus:outline-none text-sm"
                                    placeholder="100"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 flex justify-end">
                        <button onClick={resetFilters} className="text-sm font-semibold text-siloam-blue hover:text-siloam-blue/80 hover:underline transition-colors">
                            Clear All Filters
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
