import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Project, Asset, BudgetCategoryConfig, WorkflowSet, AssetTypeConfig } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import { CurrencyInput } from '../../atoms/CurrencyInput/CurrencyInput';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import * as configService from '../../../services/configService';
import { useToast } from '../../../contexts/ToastContext';
import { useDuplicateDetection } from '../../../hooks/useDuplicateDetection';
import { DuplicateSuggestionPanel } from '../DuplicateDetection/DuplicateSuggestionPanel';
import { DuplicateCreateConfirmDialog } from '../DuplicateDetection/DuplicateCreateConfirmDialog';
import {
  fetchDuplicateAsset,
  type DuplicateAssetHit,
} from '../../../services/duplicateDetectionApi';
import { newAssetId, nextAssetCode } from '../../../utils/assetCodeUtils';
import { applyAssetTypeToAsset } from '../../../utils/routineAssetTypeUtils';

interface RoutineAssetCardProps {
    project: Project;
    onManageAssets: () => void;
    onAssetsChange: (updatedAssets: Asset[]) => void;
    onProjectChange: (updatedProject: Project) => void;
    isEditable: boolean;
    maxBudgetPerAsset: number;
    activeCategories: BudgetCategoryConfig[];
    allWorkflows: WorkflowSet[];
    allAssetTypes: AssetTypeConfig[];
    periodName?: string;
    userId?: number;
    huId?: string | null;
    onUseExistingAsset?: (asset: Asset) => void;
}

interface AddAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (newAsset: Asset) => void;
    project: Project;
    maxBudgetPerAsset: number;
    activeCategories: BudgetCategoryConfig[];
    allAssetTypes: AssetTypeConfig[];
    initialAssetTypeId: string;
    periodName?: string;
    userId?: number;
    huId?: string | null;
    onUseExistingAsset?: (asset: Asset) => void;
}

const AddAssetModal: React.FC<AddAssetModalProps> = ({
    isOpen,
    onClose,
    onSave,
    project,
    maxBudgetPerAsset,
    activeCategories,
    allAssetTypes,
    initialAssetTypeId,
    periodName = '',
    userId = 0,
    huId = null,
    onUseExistingAsset,
}) => {
    const [assetName, setAssetName] = useState('');
    const [budgetPlan, setBudgetPlan] = useState(0);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>(activeCategories[0]?.id || '');
    const [endTargetDate, setEndTargetDate] = useState('');
    const [qty, setQty] = useState(1);
    const [selectedAssetTypeId, setSelectedAssetTypeId] = useState(initialAssetTypeId);
    const [error, setError] = useState('');
    const [showCreateConfirm, setShowCreateConfirm] = useState(false);

    const activeAssetTypes = useMemo(
        () => allAssetTypes.filter((at) => at.isActive),
        [allAssetTypes],
    );

    useEffect(() => {
        if (isOpen) {
            setSelectedAssetTypeId(initialAssetTypeId);
        }
    }, [isOpen, initialAssetTypeId]);

    const duplicate = useDuplicateDetection({
        enabled: isOpen && !!periodName && userId > 0,
        entityType: 'asset',
        name: assetName,
        periodName,
        userId,
        huId,
        projectId: project.id,
    });

    const buildNewAsset = useCallback((): Asset | null => {
        if (!assetName || budgetPlan <= 0 || !selectedCategoryId || !endTargetDate || !selectedAssetTypeId) {
            return null;
        }
        const draft: Asset = {
            id: newAssetId(project.projectCode),
            assetCode: nextAssetCode(project.projectCode, project.assets),
            assetName,
            description: '',
            budgetPlan,
            budgetAllocated: 0,
            consumedBudget: 0,
            workflowSetId: '',
            assetTypeId: selectedAssetTypeId,
            budgetCategoryId: selectedCategoryId,
            endTargetDate,
            qty: qty || 1,
            receivedQty: 0,
        };
        return applyAssetTypeToAsset(draft, selectedAssetTypeId, allAssetTypes);
    }, [assetName, budgetPlan, endTargetDate, project, qty, selectedCategoryId, selectedAssetTypeId, allAssetTypes]);

    if (!isOpen) return null;

    const validateAndPrepare = (): boolean => {
        setError('');
        if (!assetName || budgetPlan <= 0 || !selectedCategoryId || !endTargetDate || !selectedAssetTypeId) {
            setError('All fields are required.');
            return false;
        }
        if (budgetPlan > maxBudgetPerAsset) {
            setError(`Budget for a single asset cannot exceed the limit of ${formatCurrency(maxBudgetPerAsset)}.`);
            return false;
        }

        const categoryBudgetPlan = project.categoryBudgetPlan?.[selectedCategoryId] || 0;
        const currentAllocated = project.assets
            .filter(a => a.budgetCategoryId === selectedCategoryId)
            .reduce((sum, a) => sum + a.budgetPlan, 0);
        
        const categoryName = activeCategories.find(c => c.id === selectedCategoryId)?.name || 'the selected category';
        if (budgetPlan > (categoryBudgetPlan - currentAllocated)) {
            setError(`Budget exceeds remaining budget for ${categoryName} (${formatCurrency(categoryBudgetPlan - currentAllocated)}).`);
            return false;
        }
        return true;
    };

    const commitSave = () => {
        const newAsset = buildNewAsset();
        if (!newAsset) return;
        onSave(newAsset);
        onClose();
    };

    const handleSave = () => {
        setError('');
        if (!validateAndPrepare()) return;
        if (duplicate.needsCreateConfirmation) {
            setShowCreateConfirm(true);
            return;
        }
        commitSave();
    };

    const handleUseExisting = async (hit: DuplicateAssetHit) => {
        if (!onUseExistingAsset || !periodName || !userId) return;
        const existing = await fetchDuplicateAsset(userId, periodName, hit.id);
        if (!existing) return;
        onUseExistingAsset(existing);
        onClose();
    };

    const handleConfirmCreateNew = () => {
        duplicate.confirmCreateNew();
        setShowCreateConfirm(false);
        commitSave();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
                <h3 className="text-lg font-bold mb-4">Add New Routine Asset</h3>
                 <div className="text-sm bg-siloam-bg p-3 rounded-lg mb-4">
                    Global max budget per asset: <span className="font-bold">{formatCurrency(maxBudgetPerAsset)}</span>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Asset Name</label>
                        <input type="text" value={assetName} onChange={e => setAssetName(e.target.value)} className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" />
                        {onUseExistingAsset ? (
                            <DuplicateSuggestionPanel
                                entityType="asset"
                                hits={duplicate.assetHits}
                                isSearching={duplicate.isSearching}
                                projectId={project.id}
                                huId={huId}
                                hasMore={!!duplicate.nextCursor}
                                onLoadMore={duplicate.loadMore}
                                onUseExisting={(hit) => void handleUseExisting(hit)}
                                onCreateNew={() => {
                                    setError('');
                                    if (!validateAndPrepare()) return;
                                    setShowCreateConfirm(true);
                                }}
                            />
                        ) : null}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Budget Category</label>
                         <select value={selectedCategoryId} onChange={e => setSelectedCategoryId(e.target.value)} className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue">
                            {activeCategories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                        </select>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Budget Plan</label>
                        <CurrencyInput value={budgetPlan} onValueChange={setBudgetPlan} className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Quantity (QTY)</label>
                        <NumericInput value={qty} onValueChange={setQty} min={1} allowDecimal={false} className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">End Target Date</label>
                        <input type="date" value={endTargetDate} onChange={e => setEndTargetDate(e.target.value)} className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Type</label>
                        <select
                            value={selectedAssetTypeId}
                            onChange={(e) => setSelectedAssetTypeId(e.target.value)}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        >
                            <option value="" disabled>Select type</option>
                            {activeAssetTypes.map((at) => (
                                <option key={at.id} value={at.id}>
                                    {at.name}
                                </option>
                            ))}
                        </select>
                    </div>
                     {error && <p className="text-sm text-danger">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400">Add Asset</button>
                </div>
            </div>
            <DuplicateCreateConfirmDialog
                isOpen={showCreateConfirm}
                entityType="asset"
                onConfirm={handleConfirmCreateNew}
                onCancel={() => setShowCreateConfirm(false)}
            />
        </div>
    );
};

const EditBudgetModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedBudgets: Record<string, number>) => void;
    initialBudgets: Record<string, number>;
    activeCategories: BudgetCategoryConfig[];
}> = ({ isOpen, onClose, onSave, initialBudgets, activeCategories }) => {
    const [budgets, setBudgets] = useState(initialBudgets);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (isOpen && !wasOpenRef.current) {
            setBudgets(initialBudgets);
        }
        wasOpenRef.current = isOpen;
    }, [isOpen, initialBudgets]);

    if (!isOpen) return null;

    const handleBudgetChange = (categoryId: string, value: number) => {
        setBudgets({
            ...budgets,
            [categoryId]: value
        });
    };

    const handleSave = () => {
        onSave(budgets);
        onClose();
    };
    
    return (
         <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <h3 className="text-lg font-bold mb-4">Edit Budget Plan by Category</h3>
                <div className="max-h-96 overflow-y-auto space-y-4 pr-2">
                    {activeCategories.map(cat => (
                        <div key={cat.id}>
                            <label className="block text-sm font-medium text-siloam-text-secondary">{cat.name}</label>
                            <CurrencyInput
                                value={budgets[cat.id] || 0}
                                onValueChange={(val) => handleBudgetChange(cat.id, val)}
                                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                        </div>
                    ))}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90">Save Budgets</button>
                </div>
            </div>
        </div>
    );
};


export const RoutineAssetCard: React.FC<RoutineAssetCardProps> = ({
    project,
    onManageAssets,
    onAssetsChange,
    onProjectChange,
    isEditable,
    maxBudgetPerAsset,
    activeCategories,
    allWorkflows,
    allAssetTypes,
    periodName,
    userId,
    huId,
    onUseExistingAsset,
}) => {
    const { showToast } = useToast();
    const [isAddAssetModalOpen, setIsAddAssetModalOpen] = useState(false);
    const [defaultAssetTypeId, setDefaultAssetTypeId] = useState<string>('');
    const [isEditBudgetModalOpen, setEditBudgetModalOpen] = useState(false);

    const handleAddAssetClick = async () => {
        const activeTypes = allAssetTypes.filter((at) => at.isActive);
        if (activeTypes.length === 0) {
            showToast('Belum ada asset type aktif. Atur di halaman Configuration.', 'error');
            return;
        }
        const config = await configService.getAppConfig('defaultRoutineWorkflowId');
        const preferredWorkflowId = config?.value ? String(config.value) : null;
        const match =
            (preferredWorkflowId && activeTypes.find((at) => at.workflowSetId === preferredWorkflowId)) ||
            activeTypes[0];
        setDefaultAssetTypeId(match.id);
        setIsAddAssetModalOpen(true);
    };

    const handleAddAsset = (newAsset: Asset) => {
        onAssetsChange([...project.assets, newAsset]);
    };

    const handleUseExistingAsset = (existing: Asset) => {
        if (project.assets.some((a) => a.id === existing.id)) {
            showToast(`Asset ${existing.assetCode} is already in this routine project.`, 'error');
            return;
        }
        if (onUseExistingAsset) {
            onUseExistingAsset(existing);
        } else {
            onAssetsChange([...project.assets, existing]);
        }
        showToast(`Using existing asset ${existing.assetCode}`, 'success');
    };
    
    const handleBudgetPlanSave = (updatedBudgets: Record<string, number>) => {
        const updatedProject = { ...project, categoryBudgetPlan: updatedBudgets };
        onProjectChange(updatedProject);
    };

    const budgetDetails = useMemo(() => {
        return activeCategories.map(cat => {
            const plan = project.categoryBudgetPlan?.[cat.id] || 0;
            const allocated = project.assets
                .filter(a => a.budgetCategoryId === cat.id)
                .reduce((sum, a) => sum + a.budgetPlan, 0);
            return { category: cat, plan, allocated };
        }).filter(d => d.plan > 0 || d.allocated > 0);
    }, [project, activeCategories]);

    return (
        <div className="bg-siloam-surface p-6 rounded-xl shadow-soft space-y-4 border-l-4 border-siloam-blue">
            <div className="flex flex-wrap justify-between items-start gap-4">
                <div>
                    <h2 className="text-xl font-bold text-siloam-text-primary">
                        {project.isRoutineAssetAggregator
                            ? 'General & Regular Assets'
                            : project.projectName}
                    </h2>
                    <p className="text-sm text-siloam-text-secondary">A dedicated budget for routine, low-value asset procurement.</p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {isEditable && (
                         <button 
                            onClick={() => setEditBudgetModalOpen(true)}
                            className="bg-siloam-green text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-green/90 transition shadow-soft"
                        >
                           Edit Budget Plan
                        </button>
                    )}
                    {isEditable && (
                        <button 
                            onClick={handleAddAssetClick}
                            className="bg-siloam-blue text-white px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-blue/90 transition shadow-soft"
                        >
                           + Add Asset
                        </button>
                    )}
                    <button 
                        onClick={onManageAssets}
                        className="bg-siloam-sidebar text-siloam-text-primary px-3 py-1.5 rounded-lg text-sm hover:bg-siloam-border transition"
                    >
                       Manage Assets
                    </button>
                </div>
            </div>
            
            <div className="bg-siloam-bg p-4 rounded-lg">
                <h4 className="text-md font-semibold text-siloam-text-primary mb-3">Budget Breakdown by Category</h4>
                {budgetDetails.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {budgetDetails.map(({ category, plan, allocated }) => (
                            <div key={category.id}>
                                <div className="flex justify-between items-baseline mb-1">
                                    <p className="text-sm font-medium text-siloam-text-primary">{category.name}</p>
                                    <p className="text-xs text-siloam-text-secondary">
                                        <span className={allocated > plan ? 'text-danger font-bold' : ''}>{formatCurrency(allocated)}</span> / {formatCurrency(plan)}
                                    </p>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2.5">
                                    <div
                                        className={`h-2.5 rounded-full ${allocated > plan ? 'bg-danger' : 'bg-siloam-blue'}`}
                                        style={{ width: `${Math.min(100, (allocated / plan) * 100)}%` }}
                                    ></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-siloam-text-secondary text-center py-4">No budget plan set. Click 'Edit Budget Plan' to start.</p>
                )}
            </div>
            
            {defaultAssetTypeId ? (
                <AddAssetModal 
                    isOpen={isAddAssetModalOpen}
                    onClose={() => setIsAddAssetModalOpen(false)}
                    onSave={handleAddAsset}
                    project={project}
                    maxBudgetPerAsset={maxBudgetPerAsset}
                    activeCategories={activeCategories}
                    allAssetTypes={allAssetTypes}
                    initialAssetTypeId={defaultAssetTypeId}
                    periodName={periodName}
                    userId={userId}
                    huId={huId}
                    onUseExistingAsset={handleUseExistingAsset}
                />
            ) : null}
            
            <EditBudgetModal
                isOpen={isEditBudgetModalOpen}
                onClose={() => setEditBudgetModalOpen(false)}
                onSave={handleBudgetPlanSave}
                initialBudgets={project.categoryBudgetPlan || {}}
                activeCategories={activeCategories}
            />
        </div>
    );
};
