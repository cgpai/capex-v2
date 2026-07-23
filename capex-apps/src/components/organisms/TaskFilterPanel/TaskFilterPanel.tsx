import React, { useEffect, useState } from 'react';

const FilterIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
);

interface MultiSelectDropdownProps {
    title: string;
    options: string[];
    selected: string[];
    onSelectionChange: (selected: string[]) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({ title, options, selected, onSelectionChange }) => {
    // This is a simplified version. A more robust one might handle outside clicks to close.
    return (
         <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">{title}</label>
            <select
                multiple
                value={selected}
                onChange={(e) => {
                    // FIX: Cast event target to HTMLSelectElement to correctly type its selectedOptions.
                    const target = e.target as HTMLSelectElement;
                    const selectedOptions = Array.from(target.selectedOptions, option => option.value);
                    onSelectionChange(selectedOptions);
                }}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue h-32"
            >
                {options.map(option => (
                    <option key={option} value={option}>{option}</option>
                ))}
            </select>
        </div>
    );
};


interface TaskFilterPanelProps {
    children: React.ReactNode;
    extraFilters?: React.ReactNode;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    huOptions: string[];
    selectedHUs: string[];
    setSelectedHUs: (hus: string[]) => void;
    // Optional Archetype Filters
    archetypeOptions?: string[];
    selectedArchetypes?: string[];
    setSelectedArchetypes?: (archetypes: string[]) => void;
    categoryOptions?: string[];
    selectedCategories?: string[];
    setSelectedCategories?: (categories: string[]) => void;
    assignedRoleOptions?: string[];
    selectedAssignedRoles?: string[];
    setSelectedAssignedRoles?: (roles: string[]) => void;
    taskViewModeOptions?: { label: string; value: string }[];
    taskViewMode?: string;
    setTaskViewMode?: (mode: string) => void;
    onResetFilters?: () => void;
    searchPlaceholder?: string;
    /** Optional actions rendered before the search input (e.g. Quick edit buttons). */
    toolbarLeading?: React.ReactNode;
    /** Fired when filter drawer opens/closes — enables lazy master-data fetch. */
    onFilterVisibilityChange?: (visible: boolean) => void;
}

export const TaskFilterPanel: React.FC<TaskFilterPanelProps> = ({
    children,
    extraFilters,
    searchTerm, setSearchTerm,
    huOptions, selectedHUs, setSelectedHUs,
    archetypeOptions, selectedArchetypes, setSelectedArchetypes,
    categoryOptions, selectedCategories, setSelectedCategories,
    assignedRoleOptions, selectedAssignedRoles, setSelectedAssignedRoles,
    taskViewModeOptions, taskViewMode, setTaskViewMode,
    onResetFilters,
    searchPlaceholder = 'Search tasks, projects, assets...',
    toolbarLeading,
    onFilterVisibilityChange,
}) => {
    const [isFilterVisible, setIsFilterVisible] = useState(false);

    useEffect(() => {
        onFilterVisibilityChange?.(isFilterVisible);
    }, [isFilterVisible, onFilterVisibilityChange]);

    const toggleFilterVisible = () => {
        setIsFilterVisible((prev) => !prev);
    };

    const resetFilters = () => {
        setSearchTerm('');
        setSelectedHUs([]);
        if (setSelectedArchetypes) setSelectedArchetypes([]);
        if (setSelectedCategories) setSelectedCategories([]);
        if (setSelectedAssignedRoles) setSelectedAssignedRoles([]);
        if (setTaskViewMode && taskViewModeOptions?.[0]) setTaskViewMode(taskViewModeOptions[0].value);
        onResetFilters?.();
    };

    return (
        <div className="bg-siloam-surface p-4 rounded-xl shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
                {toolbarLeading ? <div className="shrink-0">{toolbarLeading}</div> : null}
                 <div className="flex-grow min-w-[250px]">
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                    />
                </div>
                <div className="flex items-center gap-4">
                     {children}
                    <button
                        onClick={toggleFilterVisible}
                        className={`px-4 py-2 flex items-center gap-2 rounded-lg border transition-colors ${isFilterVisible ? 'bg-siloam-blue text-white border-siloam-blue' : 'bg-siloam-surface border-siloam-border hover:bg-siloam-bg'}`}
                    >
                        <FilterIcon />
                        <span>Filter</span>
                    </button>
                </div>
            </div>
            {isFilterVisible && (
                <div className="mt-4 pt-4 border-t border-siloam-border animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {taskViewModeOptions && taskViewMode && setTaskViewMode && (
                            <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary">
                                    Tampilan Task
                                </label>
                                <select
                                    value={taskViewMode}
                                    onChange={(e) => setTaskViewMode(e.target.value)}
                                    className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                >
                                    {taskViewModeOptions.map((option) => (
                                        <option key={option.value} value={option.value}>
                                            {option.label}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        )}
                        {archetypeOptions && selectedArchetypes && setSelectedArchetypes && (
                             <MultiSelectDropdown title="Filter by Network" options={archetypeOptions} selected={selectedArchetypes} onSelectionChange={setSelectedArchetypes} />
                        )}
                        <MultiSelectDropdown title="Filter by Hospital Unit" options={huOptions} selected={selectedHUs} onSelectionChange={setSelectedHUs} />
                        {assignedRoleOptions && selectedAssignedRoles && setSelectedAssignedRoles && assignedRoleOptions.length > 0 && (
                            <MultiSelectDropdown
                                title="Filter by Assigned Role"
                                options={assignedRoleOptions}
                                selected={selectedAssignedRoles}
                                onSelectionChange={setSelectedAssignedRoles}
                            />
                        )}
                        {categoryOptions && selectedCategories && setSelectedCategories && (
                            <MultiSelectDropdown title="Filter by Budget Category" options={categoryOptions} selected={selectedCategories} onSelectionChange={setSelectedCategories} />
                        )}
                        <div className="space-y-4">
                             {extraFilters}
                            <button onClick={resetFilters} className="w-full text-sm text-siloam-blue hover:underline">Reset Filters</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};