import React, { useState, useEffect, useCallback } from 'react';
import { Asset, Project, WorkflowSet, AssetTypeConfig } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';
import { Spinner } from '../../atoms/Spinner/Spinner';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import { useDuplicateDetection } from '../../../hooks/useDuplicateDetection';
import { DuplicateSuggestionPanel } from '../DuplicateDetection/DuplicateSuggestionPanel';
import { DuplicateCreateConfirmDialog } from '../DuplicateDetection/DuplicateCreateConfirmDialog';
import { listOperationalAssetTypes } from '@/features/configuration/workflow/utils/assetTypeOptions';
import {
  fetchDuplicateAsset,
  type DuplicateAssetHit,
} from '../../../services/duplicateDetectionApi';

/** Nilai select: aktif = kosong, cancel = disembunyikan di Capex list (sinkron dengan `isAssetCancelledForProjectList`). */
function lifecycleToSelectValue(status: string | null | undefined): '' | 'cancel' {
    const raw = status?.trim().toLowerCase();
    if (!raw) return '';
    if (raw === 'cancel' || raw === 'cancelled' || raw === 'canceled') return 'cancel';
    return '';
}

const FormField: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode; }> = ({ label, icon, children }) => (
    <div>
        <label className="flex items-center text-sm font-medium text-siloam-text-secondary mb-1">
            {icon}
            <span className="ml-2">{label}</span>
        </label>
        {children}
    </div>
);

interface AssetDetailEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (asset: Asset) => void | Promise<void>;
    asset: Asset | null;
    project: Project | null;
    allWorkflows: WorkflowSet[];
    allAssetTypes: AssetTypeConfig[];
    isCreating?: boolean;
    periodName?: string;
    userId?: number;
    huId?: string | null;
    onUseExistingAsset?: (asset: Asset) => void | Promise<void>;
}

export const AssetDetailEditorModal: React.FC<AssetDetailEditorModalProps> = ({
    isOpen,
    onClose,
    onSave,
    asset,
    project,
    allWorkflows,
    allAssetTypes,
    isCreating = false,
    periodName = '',
    userId = 0,
    huId = null,
    onUseExistingAsset,
}) => {
    const { showToast } = useToast();
    const [editedAsset, setEditedAsset] = useState<Asset | null>(asset);
    const [isDirty, setIsDirty] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showCreateConfirm, setShowCreateConfirm] = useState(false);

    const duplicate = useDuplicateDetection({
        enabled: isOpen && isCreating && !!periodName && userId > 0,
        entityType: 'asset',
        name: editedAsset?.assetName ?? '',
        periodName,
        userId,
        huId,
        projectId: project?.id,
        excludeId: editedAsset?.id,
    });

    useEffect(() => {
        setEditedAsset(asset);
        setIsDirty(isCreating);
        setIsSubmitting(false);
        setShowCreateConfirm(false);
        duplicate.resetCreateConfirmation();
    }, [asset, isOpen, isCreating]);

    if (!isOpen || !editedAsset || !project) return null;

    const resolveAssetType = (assetRow: Asset) =>
        (assetRow.assetTypeId ? allAssetTypes.find((at) => at.id === assetRow.assetTypeId) : undefined)
        ?? allAssetTypes.find((at) => at.workflowSetId === assetRow.workflowSetId);

    const selectedAssetTypeId = resolveAssetType(editedAsset)?.id ?? editedAsset.assetTypeId ?? '';
    const typeOptions = listOperationalAssetTypes(allAssetTypes, editedAsset);

    const handleInputChange = (field: keyof Asset, value: string | number) => {
        setEditedAsset(prev => prev ? { ...prev, [field]: value } : null);
        setIsDirty(true);
    };

    const handleCurrencyChange = (field: keyof Asset, value: number) => {
        handleInputChange(field, value);
    };

    const persistSave = useCallback(async () => {
        if (!editedAsset) return;
        setIsSubmitting(true);
        try {
            await Promise.resolve(onSave(editedAsset));
        } finally {
            setIsSubmitting(false);
        }
    }, [editedAsset, onSave]);

    const handleSave = async () => {
        if (!editedAsset || isSubmitting) return;
        if (!editedAsset.workflowSetId) {
            showToast('Silakan pilih tipe aset.', 'error', { title: 'Validasi' });
            return;
        }
        if (isCreating && duplicate.needsCreateConfirmation) {
            setShowCreateConfirm(true);
            return;
        }
        await persistSave();
    };

    const handleUseExisting = async (hit: DuplicateAssetHit) => {
        if (!onUseExistingAsset || !periodName || !userId) return;
        setIsSubmitting(true);
        try {
            const existing = await fetchDuplicateAsset(userId, periodName, hit.id);
            if (!existing) return;
            await Promise.resolve(onUseExistingAsset(existing));
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
                        <h3 className="text-xl font-bold text-siloam-text-primary">{isCreating ? 'Create New Asset' : 'Edit Asset'}</h3>
                        <p className="text-sm text-siloam-text-secondary">{isCreating ? `in ${project.projectName}` : `${editedAsset.assetName} in ${project.projectName}`}</p>
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
                           <FormField label="Asset Name" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}>
                                <input type="text" value={editedAsset.assetName ?? ''} onChange={e => handleInputChange('assetName', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                                {isCreating && onUseExistingAsset ? (
                                    <DuplicateSuggestionPanel
                                        entityType="asset"
                                        hits={duplicate.assetHits}
                                        isSearching={duplicate.isSearching}
                                        projectId={project?.id}
                                        huId={huId}
                                        hasMore={!!duplicate.nextCursor}
                                        onLoadMore={duplicate.loadMore}
                                        onUseExisting={(hit) => void handleUseExisting(hit)}
                                        onCreateNew={() => setShowCreateConfirm(true)}
                                    />
                                ) : null}
                           </FormField>
                           <FormField label="Asset Code" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" /></svg>}>
                                <input type="text" value={editedAsset.assetCode ?? ''} readOnly className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-sidebar/50 text-siloam-text-secondary cursor-not-allowed"/>
                           </FormField>
                           <FormField label="Ordered Quantity (QTY)" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" /></svg>}>
                                <NumericInput
                                    min={1}
                                    value={editedAsset.qty ?? 1}
                                    onValueChange={(val) => handleInputChange('qty', val)}
                                    allowDecimal={false}
                                    align="left"
                                    className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                />
                           </FormField>
                           <FormField label="Deskripsi" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}>
                                <textarea 
                                    value={editedAsset.description ?? ''} 
                                    onChange={e => handleInputChange('description', e.target.value)} 
                                    className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue resize-y min-h-[100px]"
                                    placeholder="Masukkan deskripsi atau keterangan tambahan tentang asset ini..."
                                    rows={4}
                                />
                           </FormField>
                        </div>
                    </section>
                    
                    {/* Budget Section */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Budget</h4>
                         <div className="space-y-4">
                           <FormField label="Budget Plan" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}>
                                <CurrencyInput value={editedAsset.budgetPlan ?? 0} onValueChange={(val) => handleCurrencyChange('budgetPlan', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                             <FormField label="Consumed Budget" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>}>
                                <CurrencyInput value={editedAsset.consumedBudget ?? 0} onValueChange={(val) => handleCurrencyChange('consumedBudget', val)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                        </div>
                    </section>
                    
                     {/* Timeline & Workflow Section */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Timeline & Type</h4>
                         <div className="space-y-4">
                            <FormField label="End Target Date" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}>
                                <input type="date" value={editedAsset.endTargetDate || ''} onChange={e => handleInputChange('endTargetDate', e.target.value)} className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"/>
                            </FormField>
                            <FormField
                                label="Status (Capex Project List)"
                                icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                            >
                                <select
                                    value={lifecycleToSelectValue(editedAsset.lifecycleStatus)}
                                    onChange={(e) => {
                                        const v = e.target.value as '' | 'cancel';
                                        setEditedAsset((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      lifecycleStatus: v === '' ? undefined : 'cancel',
                                                  }
                                                : null,
                                        );
                                        setIsDirty(true);
                                    }}
                                    className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                >
                                    <option value="">On progress</option>
                                    <option value="cancel">Cancel</option>
                                </select>
                                <p className="text-xs text-siloam-text-secondary mt-1.5">
                                    Cancel menyembunyikan aset dari Capex Project List (data tetap di database).
                                </p>
                            </FormField>
                            <FormField label="Type" icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>}>
                                <select
                                    value={selectedAssetTypeId}
                                    onChange={(e) => {
                                        const selected = allAssetTypes.find((at) => at.id === e.target.value);
                                        if (!selected) return;
                                        setEditedAsset((prev) =>
                                            prev
                                                ? {
                                                      ...prev,
                                                      assetTypeId: selected.id,
                                                      workflowSetId: selected.workflowSetId,
                                                  }
                                                : null,
                                        );
                                        setIsDirty(true);
                                    }}
                                    className="w-full border border-siloam-border rounded-lg p-2 bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                >
                                    <option value="" disabled>Select type</option>
                                    {typeOptions.map((at) => (
                                        <option key={at.id} value={at.id}>
                                            {at.name}
                                            {at.isActive === false ? ' (Hidden)' : ''}
                                        </option>
                                    ))}
                                </select>
                                {!editedAsset.workflowSetId && <p className="text-xs text-danger mt-1">Type is required.</p>}
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
                        disabled={(!isDirty && !isCreating) || !editedAsset.workflowSetId || isSubmitting}
                        className="inline-flex items-center justify-center gap-2 min-w-[7.5rem] px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isSubmitting && <Spinner className="text-white" size={16} />}
                        {isSubmitting ? 'Menyimpan…' : 'Save'}
                    </button>
                </div>
            </div>
            <DuplicateCreateConfirmDialog
                isOpen={showCreateConfirm}
                entityType="asset"
                onConfirm={() => void handleConfirmCreateNew()}
                onCancel={() => setShowCreateConfirm(false)}
            />
        </div>
    );
};
