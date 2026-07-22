import React, { useState, useEffect, useCallback } from 'react';
import { Project, BudgetCategoryConfig, User, ProjectPriorityConfig } from '../../../types';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';
import { Spinner } from '../../atoms/Spinner/Spinner';
import { useDuplicateDetection } from '../../../hooks/useDuplicateDetection';
import { DuplicateSuggestionPanel } from '../DuplicateDetection/DuplicateSuggestionPanel';
import { DuplicateCreateConfirmDialog } from '../DuplicateDetection/DuplicateCreateConfirmDialog';
import {
  fetchDuplicateProject,
  type DuplicateProjectHit,
} from '../../../services/duplicateDetectionApi';
import { resolveDefaultRegularPriorityId } from '../../../lib/projectPriorityPolicy';

const FormField: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode; }> = ({ label, icon, children }) => (
    <div>
        <label className="flex items-center text-sm font-medium text-siloam-text-secondary mb-1">
            {icon}
            <span className="ml-2">{label}</span>
        </label>
        {children}
    </div>
);

interface ProjectEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (project: Project) => void | Promise<void>;
    project: Project | null;
    allCategories: BudgetCategoryConfig[];
    allPriorities: ProjectPriorityConfig[];
    allUsers: User[];
    isCreating?: boolean;
    /** When false, the Project Priority field is hidden (priorityId on the model is unchanged on save). */
    canEditPriority?: boolean;
    periodName?: string;
    userId?: number;
    huId?: string | null;
    onUseExistingProject?: (project: Project) => void | Promise<void>;
}

export const ProjectEditorModal: React.FC<ProjectEditorModalProps> = ({
    isOpen,
    onClose,
    onSave,
    project,
    allCategories,
    allPriorities,
    allUsers,
    isCreating = false,
    canEditPriority = false,
    periodName = '',
    userId = 0,
    huId = null,
    onUseExistingProject,
}) => {
    const [editedProject, setEditedProject] = useState<Project | null>(project);
    const [isDirty, setIsDirty] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCreateConfirm, setShowCreateConfirm] = useState(false);

    const duplicate = useDuplicateDetection({
        enabled: isOpen && isCreating && !!periodName && userId > 0,
        entityType: 'project',
        name: editedProject?.projectName ?? '',
        periodName,
        userId,
        huId,
        excludeId: editedProject?.id,
    });

    useEffect(() => {
        setEditedProject(project);
        setIsDirty(isCreating); // Mark as dirty if creating a new one
        setIsSubmitting(false);
        setShowCreateConfirm(false);
        duplicate.resetCreateConfirmation();
    }, [project, isOpen, isCreating]);
    
    if (!isOpen || !editedProject) return null;

    const handleInputChange = (field: keyof Project, value: string | number) => {
        if (!editedProject) return;
        setEditedProject({ ...editedProject, [field]: value });
        setIsDirty(true);
    };

    const handleCurrencyChange = (field: keyof Project, value: number) => {
        handleInputChange(field, value);
    };

    const persistSave = useCallback(async () => {
        if (!editedProject) return;
        setIsSubmitting(true);
        try {
            const lockedPriorityId = canEditPriority
                ? editedProject.priorityId
                : (project?.priorityId || resolveDefaultRegularPriorityId(allPriorities));
            const toSave = canEditPriority
                ? editedProject
                : { ...editedProject, priorityId: lockedPriorityId };
            await Promise.resolve(onSave(toSave));
        } finally {
            setIsSubmitting(false);
        }
    }, [editedProject, onSave, canEditPriority, project?.priorityId, allPriorities]);

    const handleSave = async () => {
        if (!editedProject || isSubmitting) return;
        if (isCreating && duplicate.needsCreateConfirmation) {
            setShowCreateConfirm(true);
            return;
        }
        await persistSave();
    };

    const handleUseExisting = async (hit: DuplicateProjectHit) => {
        if (!onUseExistingProject || !periodName || !userId) return;
        setIsSubmitting(true);
        try {
            const existing = await fetchDuplicateProject(userId, periodName, hit.id);
            if (!existing) return;
            await Promise.resolve(onUseExistingProject(existing as Project));
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmCreateNew = async () => {
        duplicate.confirmCreateNew();
        setShowCreateConfirm(false);
        await persistSave();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-2xl max-h-[90vh] flex flex-col transition-all duration-300">
                {/* Sticky Header */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-siloam-border flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">{isCreating ? 'Create New Project' : 'Edit Project'}</h3>
                        <p className="text-sm text-siloam-text-secondary">{editedProject.projectCode} - {editedProject.projectName}</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition disabled:opacity-50"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* General Section */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">General Information</h4>
                        <div className="space-y-4">
                           <FormField label="Project Name" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}>
                                <input type="text" value={editedProject.projectName ?? ''} onChange={e => handleInputChange('projectName', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                                {isCreating && onUseExistingProject ? (
                                    <DuplicateSuggestionPanel
                                        entityType="project"
                                        hits={duplicate.projectHits}
                                        isSearching={duplicate.isSearching}
                                        huId={huId}
                                        hasMore={!!duplicate.nextCursor}
                                        onLoadMore={duplicate.loadMore}
                                        onUseExisting={(hit) => void handleUseExisting(hit)}
                                        onCreateNew={() => setShowCreateConfirm(true)}
                                    />
                                ) : null}
                           </FormField>
                           <FormField label="AX Code" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>}>
                                <input type="text" value={editedProject.axCode ?? ''} onChange={e => handleInputChange('axCode', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue" placeholder="Enter AX Code"/>
                           </FormField>
                           <FormField label="Owner" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}>
                                <select value={editedProject.owner ?? ''} onChange={e => handleInputChange('owner', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue">
                                   <option value="">Select Owner</option>
                                   {allUsers.map(user => <option key={user.id} value={user.username}>{user.username}</option>)}
                               </select>
                           </FormField>
                        </div>
                    </section>

                    {/* Budget Section */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Budget Details</h4>
                        <div className="space-y-4">
                            <FormField label="Budget Plan" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}>
                                <CurrencyInput value={editedProject.budgetPlan ?? 0} onValueChange={(val) => handleCurrencyChange('budgetPlan', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                            <FormField label="Target Budget Start" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}>
                                <input type="date" value={editedProject.targetBudgetStart ?? ''} onChange={e => handleInputChange('targetBudgetStart', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                            <FormField label="Budget Revenue Permonth" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}>
                                <CurrencyInput value={editedProject.budgetRevenuePermonth ?? 0} onValueChange={(val) => handleCurrencyChange('budgetRevenuePermonth', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                             <FormField label="Budget Carry Forward" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}>
                                <CurrencyInput value={editedProject.budgetCarryForward ?? 0} onValueChange={(val) => handleCurrencyChange('budgetCarryForward', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                            <FormField label="Approved Budget" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}>
                                <CurrencyInput value={editedProject.approvedBudget ?? 0} onValueChange={(val) => handleCurrencyChange('approvedBudget', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                        </div>
                    </section>
                    
                     {/* Category Section */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Classification</h4>
                        <div className="space-y-4">
                            <FormField label="Budget Category" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>}>
                               <select value={editedProject.budgetCategoryId ?? ''} onChange={e => handleInputChange('budgetCategoryId', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:bg-siloam-sidebar/50 disabled:cursor-not-allowed" disabled={isCreating}>
                                   {allCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                               </select>
                           </FormField>
                           <FormField label="Project Priority" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>}>
                               <select
                                   value={editedProject.priorityId}
                                   onChange={e => handleInputChange('priorityId', e.target.value)}
                                   disabled={!canEditPriority}
                                   className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue disabled:bg-siloam-sidebar/50 disabled:cursor-not-allowed disabled:text-siloam-text-secondary"
                               >
                                   {allPriorities.map(prio => <option key={prio.id} value={prio.id}>{prio.name}</option>)}
                               </select>
                               {!canEditPriority ? (
                                   <p className="mt-1 text-xs text-siloam-text-secondary">
                                       Default: Regular. Hanya PMO dan Super Admin yang dapat mengubah priority.
                                   </p>
                               ) : null}
                           </FormField>
                        </div>
                    </section>
                </div>
                
                {/* Sticky Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-siloam-border flex justify-end items-center space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 text-sm rounded-lg border border-siloam-border text-siloam-text-primary font-semibold hover:bg-siloam-bg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => void handleSave()}
                        disabled={!isDirty || isSubmitting}
                        className="inline-flex items-center justify-center gap-2 min-w-[7.5rem] px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting && <Spinner className="text-white" size={16} />}
                        {isSubmitting ? 'Menyimpan…' : 'Save'}
                    </button>
                </div>
            </div>
            <DuplicateCreateConfirmDialog
                isOpen={showCreateConfirm}
                entityType="project"
                onConfirm={() => void handleConfirmCreateNew()}
                onCancel={() => setShowCreateConfirm(false)}
            />
        </div>
    );
};
