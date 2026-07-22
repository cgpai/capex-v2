
import React, { useState, useMemo, useEffect } from 'react';
import { Project, Asset, WorkflowSet, BudgetCategoryConfig, ProjectPriorityConfig, User, AssetTypeConfig, AssetTaskStatus } from '../../../types';
import { GenericTable, Column } from '../GenericTable/GenericTable';
import { ProjectEditorModal } from '../ProjectEditorModal/ProjectEditorModal';
import { AssetDetailEditorModal } from '../AssetDetailEditorModal/AssetDetailEditorModal';
import { SelectAssetTypeModal } from '../SelectWorkflowModal/SelectWorkflowModal';
import { MassAddAssetsModal } from '../MassAddAssetsModal/MassAddAssetsModal';
import { ProjectHistoryModal } from '../ProjectHistoryModal/ProjectHistoryModal';
import { DeleteAssetConfirmModal } from '../DeleteAssetConfirmModal/DeleteAssetConfirmModal';
import { AssetGoodsReceivedModal } from '../AssetGoodsReceivedModal/AssetGoodsReceivedModal';
import { AssetDetailViewModal } from '../AssetDetailViewModal/AssetDetailViewModal';
import { ProjectDetailViewModal } from '../ProjectDetailViewModal/ProjectDetailViewModal';
import { formatCurrency } from '../../../lib/formatter';
import * as configService from '../../../services/configService';
import * as taskService from '../../../services/taskService';
import { newAssetId, nextAssetCode } from '../../../utils/assetCodeUtils';
import { sortAssetsByCode, filterAssets } from '../../../screens/BudgetHU/budgetHuHelpers';
import { useDebouncedValue } from '../../../screens/BudgetHU/useDebouncedValue';

const ASSET_SEARCH_DEBOUNCE_MS = 200;

interface ProjectAssetsModalProps {
    isOpen: boolean;
    onClose: () => void;
    project: Project | null;
    onSaveProject: (updatedProject: Project) => Promise<void> | void;
    onSaveAsset: (updatedAsset: Asset) => void;
    allWorkflows: WorkflowSet[];
    allAssetTypes: AssetTypeConfig[];
    allCategories: BudgetCategoryConfig[];
    allPriorities: ProjectPriorityConfig[];
    allUsers: User[];
    showToast: (message: string, type?: 'success' | 'error') => void;
    isCreating?: boolean;
    canEditPriority?: boolean;
    periodName?: string;
    userId?: number;
    huId?: string | null;
    onUseExistingProject?: (project: Project) => void | Promise<void>;
    onUseExistingAsset?: (asset: Asset) => void | Promise<void>;
}

export const ProjectAssetsModal: React.FC<ProjectAssetsModalProps> = ({
    isOpen,
    onClose,
    project,
    onSaveProject,
    onSaveAsset,
    allWorkflows,
    allAssetTypes,
    allCategories,
    allPriorities,
    allUsers,
    showToast,
    isCreating = false,
    canEditPriority = false,
    periodName = '',
    userId = 0,
    huId = null,
    onUseExistingProject,
    onUseExistingAsset,
}) => {
    const [isProjectEditorOpen, setIsProjectEditorOpen] = useState(false);
    const [editingAsset, setEditingAsset] = useState<Asset | null>(null);
    const [isCreatingAsset, setIsCreatingAsset] = useState(false);
    const [isSelectingAssetType, setIsSelectingAssetType] = useState(false);
    const [isMassAddModalOpen, setIsMassAddModalOpen] = useState(false);
    const [isCopyingFromProject, setIsCopyingFromProject] = useState(false);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);
    const [assetToDelete, setAssetToDelete] = useState<Asset | null>(null);
    const [assetTaskStatuses, setAssetTaskStatuses] = useState<AssetTaskStatus[]>([]);
    const [allTasks, setAllTasks] = useState<Array<{ id: string; name: string }>>([]);
    const [isLoadingDeleteCheck, setIsLoadingDeleteCheck] = useState(false);
    const [assetForReceived, setAssetForReceived] = useState<Asset | null>(null);
    const [isGoodsReceivedModalOpen, setIsGoodsReceivedModalOpen] = useState(false);
    const [assetForDetail, setAssetForDetail] = useState<Asset | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
    const [isProjectDetailOpen, setIsProjectDetailOpen] = useState(false);
    const [assetSearch, setAssetSearch] = useState('');
    const debouncedAssetSearch = useDebouncedValue(assetSearch, ASSET_SEARCH_DEBOUNCE_MS);

    useEffect(() => {
        if (isOpen && isCreating) {
            setIsProjectEditorOpen(true);
        }
        if (!isOpen) {
            setIsProjectEditorOpen(false);
            setAssetSearch('');
        }
    }, [isOpen, isCreating]);

    const sortedAssets = useMemo(
        () => (project ? sortAssetsByCode(project.assets) : []),
        [project],
    );

    const visibleAssets = useMemo(
        () => filterAssets(sortedAssets, debouncedAssetSearch, allCategories),
        [sortedAssets, debouncedAssetSearch, allCategories],
    );

    if (!isOpen || !project) return null;
    
    const handleAddNewAsset = () => {
        setIsCopyingFromProject(false);
        setIsSelectingAssetType(true);
    };

    const handleCopyFromProject = () => {
        setIsCopyingFromProject(true);
        setIsSelectingAssetType(true);
    };

    const handleAssetTypeSelectedForNewAsset = ({ assetTypeId, workflowSetId }: { assetTypeId: string; workflowSetId: string }) => {
        setIsSelectingAssetType(false);

        let newAsset: Asset;

        const assetCode = nextAssetCode(project.projectCode, project.assets);
        if (isCopyingFromProject) {
            newAsset = {
                id: newAssetId(project.projectCode),
                assetCode,
                assetName: project.projectName,
                description: '',
                budgetPlan: project.budgetPlan,
                consumedBudget: 0,
                workflowSetId,
                assetTypeId,
                budgetCategoryId: project.budgetCategoryId,
                budgetAllocated: 0,
                endTargetDate: project.endDate,
                qty: 1, // Default ordered quantity
                receivedQty: 0, // Default received quantity
            };
            setIsCopyingFromProject(false);
        } else {
            newAsset = {
                id: newAssetId(project.projectCode),
                assetCode,
                assetName: 'New Asset',
                qty: 1, // Default ordered quantity
                receivedQty: 0, // Default received quantity
                description: '',
                budgetPlan: 0, 
                consumedBudget: 0,
                workflowSetId,
                assetTypeId,
                budgetCategoryId: project.budgetCategoryId, 
                budgetAllocated: 0,
            };
        }
        
        setIsCreatingAsset(true);
        setEditingAsset(newAsset);
    };

    const handleMassSaveAssets = (newAssetsData: Omit<Asset, 'id' | 'assetCode' | 'budgetCategoryId' | 'budgetAllocated' | 'consumedBudget'>[]) => {
        const built: Asset[] = [];
        const newAssets: Asset[] = newAssetsData.map((data) => {
            const asset: Asset = {
                ...data,
                id: newAssetId(project.projectCode),
                assetCode: nextAssetCode(project.projectCode, [...project.assets, ...built]),
                budgetCategoryId: project.budgetCategoryId,
                budgetAllocated: 0,
                consumedBudget: 0,
            };
            built.push(asset);
            return asset;
        });

        const updatedProject = {
            ...project,
            assets: sortAssetsByCode([...project.assets, ...newAssets]),
        };

        onSaveProject(updatedProject);
        showToast(`${newAssets.length} assets added successfully!`, 'success');
        setIsMassAddModalOpen(false);
    };

    const handleProjectEditorClose = () => {
        setIsProjectEditorOpen(false);
        if (isCreating) {
            onClose();
        }
    };

    const handleDeleteAsset = async (asset: Asset) => {
        setIsLoadingDeleteCheck(true);
        try {
            // Fetch task statuses for this asset
            const taskStatuses = await taskService.getAssetTaskStatusesForAsset(asset.id);
            setAssetTaskStatuses(taskStatuses);
            
            // Fetch all tasks for task names
            const tasks = await configService.getAllTasks();
            setAllTasks(tasks.map(t => ({ id: t.id, name: t.name })));
            
            // Set asset to delete and show confirmation modal
            setAssetToDelete(asset);
        } catch (error) {
            console.error('Error checking asset status:', error);
            showToast('Failed to check asset status. Please try again.', 'error');
        } finally {
            setIsLoadingDeleteCheck(false);
        }
    };

    const handleConfirmDelete = () => {
        if (!assetToDelete) return;

        const updatedProject = {
            ...project,
            assets: project.assets.filter(a => a.id !== assetToDelete.id),
        };
        onSaveProject(updatedProject);
        showToast('Asset dihapus dari daftar. Klik Save Changes untuk menyimpan.', 'success');
        setAssetToDelete(null);
        setAssetTaskStatuses([]);
    };

    const handleOpenMarkReceived = (asset: Asset) => {
        setAssetForReceived(asset);
        setIsGoodsReceivedModalOpen(true);
    };

    const handleSaveReceivedQty = async (receivedQty: number) => {
        if (!assetForReceived) return;
        
        const orderedQty = assetForReceived.qty || 1;
        const updatedAsset = { 
            ...assetForReceived, 
            receivedQty: receivedQty,
            isGoodsReceived: receivedQty === orderedQty && receivedQty > 0
        };
        
        await onSaveAsset(updatedAsset);
        
        let message = '';
        if (receivedQty === 0) {
            message = 'Asset marked as not received';
        } else if (receivedQty === orderedQty) {
            message = `Asset fully received (${receivedQty}/${orderedQty})`;
        } else {
            message = `Asset partially received (${receivedQty}/${orderedQty})`;
        }
        
        showToast(message, 'success');
        setAssetForReceived(null);
    };

    const getAssetStatus = (item: Asset) => {
        const orderedQty = item.qty || 1;
        const receivedQty = item.receivedQty || 0;
        
        if (receivedQty === 0) {
            return { text: 'Not Received', color: 'text-orange-600', bg: 'bg-orange-100' };
        }
        if (receivedQty === orderedQty) {
            return { text: 'Fully Received', color: 'text-green-600', bg: 'bg-green-100' };
        }
        return { text: `Partially Received (${receivedQty}/${orderedQty})`, color: 'text-yellow-600', bg: 'bg-yellow-100' };
    };

    const handleViewDetail = (asset: Asset) => {
        setAssetForDetail(asset);
        setIsDetailModalOpen(true);
    };

    const assetColumns: Column<Asset>[] = [
        { header: 'Asset Code', accessor: 'assetCode' },
        { header: 'Asset Name', accessor: 'assetName' },
        { header: 'Ordered QTY', accessor: (item) => item.qty ?? 1 },
        { header: 'Budget Plan', accessor: 'budgetPlan', isNumeric: true },
        { header: 'Consumed Budget', accessor: 'consumedBudget', isNumeric: true },
        { 
            header: 'Status', 
            accessor: (item) => {
                const status = getAssetStatus(item);
                return (
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${status.bg} ${status.color}`}>
                        {status.text}
                    </span>
                );
            }
        },
        {
            header: 'Actions',
            accessor: (item) => (
                <div className="flex items-center gap-2">
                    <button
                        onClick={(e) => { e.stopPropagation(); handleViewDetail(item); }}
                        className="text-siloam-blue hover:underline text-xs font-semibold"
                    >
                        Details
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); setEditingAsset(item); setIsCreatingAsset(false); }}
                        className="text-siloam-blue hover:underline text-xs font-semibold"
                    >
                        Edit
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleOpenMarkReceived(item); }}
                        className="text-siloam-green hover:underline text-xs font-semibold"
                    >
                        Mark Received
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteAsset(item); }}
                        className="text-danger hover:underline text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={isLoadingDeleteCheck}
                    >
                        {isLoadingDeleteCheck ? 'Checking...' : 'Delete'}
                    </button>
                </div>
            )
        }
    ];

    return (
        <>
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
                <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
                    <div className="flex-shrink-0 px-6 py-4 border-b border-siloam-border flex justify-between items-center">
                        <div>
                            <h3 className="text-xl font-bold text-siloam-text-primary">Asset Details: {project.projectName}</h3>
                            <p className="text-sm text-siloam-text-secondary">{project.projectCode}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <button onClick={() => setIsProjectDetailOpen(true)} className="flex items-center gap-1 text-sm text-siloam-blue hover:text-siloam-blue/80 hover:underline">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                Project Details
                            </button>
                            <button onClick={() => setIsHistoryOpen(true)} className="flex items-center gap-1 text-sm text-siloam-blue hover:text-siloam-blue/80 hover:underline">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                History Log
                            </button>
                            <button onClick={onClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                            </button>
                        </div>
                    </div>

                    <div className="flex-shrink-0 px-6 py-3 border-b border-siloam-border flex items-center gap-2 flex-wrap">
                        <button onClick={() => setIsProjectEditorOpen(true)} className="bg-siloam-sidebar text-siloam-text-primary px-4 py-2 text-sm rounded-xl hover:bg-siloam-border transition">
                            Edit Project
                        </button>
                        <button onClick={handleAddNewAsset} className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft">
                            + New Asset
                        </button>
                        <button onClick={handleCopyFromProject} className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-green-700 transition shadow-soft">
                            Copy from Project
                        </button>
                        <button onClick={() => setIsMassAddModalOpen(true)} className="bg-purple-600 text-white px-4 py-2 rounded-xl text-sm hover:bg-purple-700 transition shadow-soft">
                            Mass Add Assets
                        </button>
                    </div>

                    <div className="flex-shrink-0 px-6 py-3 border-b border-siloam-border">
                        <div className="relative max-w-md">
                            <input
                                type="text"
                                placeholder="Cari asset berdasarkan kode, nama, kategori, atau deskripsi..."
                                value={assetSearch}
                                onChange={(e) => setAssetSearch(e.target.value)}
                                className="w-full px-4 py-2 pl-10 border border-siloam-border rounded-lg bg-siloam-bg focus:outline-none focus:ring-2 focus:ring-siloam-blue text-sm"
                            />
                            <svg
                                className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-siloam-text-secondary"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                                aria-hidden
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                            </svg>
                            {assetSearch ? (
                                <button
                                    type="button"
                                    onClick={() => setAssetSearch('')}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary"
                                    aria-label="Clear search"
                                >
                                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            ) : null}
                        </div>
                        {debouncedAssetSearch.trim() ? (
                            <p className="mt-2 text-xs text-siloam-text-secondary">
                                Menampilkan {visibleAssets.length} dari {sortedAssets.length} asset
                            </p>
                        ) : null}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {visibleAssets.length > 0 ? (
                            <GenericTable columns={assetColumns} data={visibleAssets} />
                        ) : (
                            <p className="text-center text-siloam-text-secondary py-6 text-sm">
                                {debouncedAssetSearch.trim()
                                    ? `Tidak ada asset yang cocok dengan "${debouncedAssetSearch.trim()}"`
                                    : 'Belum ada asset pada project ini.'}
                            </p>
                        )}
                    </div>

                    <div className="flex-shrink-0 px-6 py-4 border-t border-siloam-border flex justify-end">
                         <button 
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded-lg bg-siloam-blue text-white font-semibold hover:bg-siloam-blue/90"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {isProjectEditorOpen && (
                 <ProjectEditorModal
                    isOpen={isProjectEditorOpen}
                    onClose={handleProjectEditorClose}
                    project={project}
                    allCategories={allCategories}
                    allPriorities={allPriorities}
                    allUsers={allUsers}
                    onSave={(updatedProject) => {
                        onSaveProject(updatedProject);
                        setIsProjectEditorOpen(false);
                        showToast(isCreating ? 'Project created successfully!' : 'Project details updated!');
                    }}
                    isCreating={isCreating}
                    canEditPriority={canEditPriority}
                    periodName={periodName}
                    userId={userId}
                    huId={huId}
                    onUseExistingProject={
                        onUseExistingProject
                            ? async (existing) => {
                                await onUseExistingProject(existing);
                                setIsProjectEditorOpen(false);
                                if (isCreating) onClose();
                            }
                            : undefined
                    }
                />
            )}

             <SelectAssetTypeModal
                isOpen={isSelectingAssetType}
                onClose={() => setIsSelectingAssetType(false)}
                onSelect={handleAssetTypeSelectedForNewAsset}
                assetTypes={allAssetTypes}
                title="Select Asset Type for New Asset"
            />

            {editingAsset && (
                 <AssetDetailEditorModal
                    isOpen={!!editingAsset}
                    onClose={() => { setEditingAsset(null); setIsCreatingAsset(false); }}
                    asset={editingAsset}
                    project={project}
                    allWorkflows={allWorkflows}
                    allAssetTypes={allAssetTypes}
                    isCreating={isCreatingAsset}
                    periodName={periodName}
                    userId={userId}
                    huId={huId}
                    onUseExistingAsset={
                        onUseExistingAsset
                            ? async (existing) => {
                                await onUseExistingAsset(existing);
                                setEditingAsset(null);
                                setIsCreatingAsset(false);
                            }
                            : undefined
                    }
                    onSave={(updatedAsset) => {
                        onSaveAsset(updatedAsset);
                        setEditingAsset(null);
                        setIsCreatingAsset(false);
                        showToast('Asset saved successfully!');
                    }}
                />
            )}

            <MassAddAssetsModal
                isOpen={isMassAddModalOpen}
                onClose={() => setIsMassAddModalOpen(false)}
                onSave={handleMassSaveAssets}
                allAssetTypes={allAssetTypes}
            />

            <ProjectHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                projectId={project.id}
                projectName={project.projectName}
                userId={userId}
            />

            <DeleteAssetConfirmModal
                isOpen={!!assetToDelete}
                onClose={() => {
                    setAssetToDelete(null);
                    setAssetTaskStatuses([]);
                }}
                onConfirm={handleConfirmDelete}
                asset={assetToDelete}
                taskStatuses={assetTaskStatuses}
                allTasks={allTasks}
            />

            <AssetGoodsReceivedModal
                isOpen={isGoodsReceivedModalOpen}
                onClose={() => {
                    setIsGoodsReceivedModalOpen(false);
                    setAssetForReceived(null);
                }}
                onSave={handleSaveReceivedQty}
                asset={assetForReceived}
            />

            <AssetDetailViewModal
                isOpen={isDetailModalOpen}
                onClose={() => {
                    setIsDetailModalOpen(false);
                    setAssetForDetail(null);
                }}
                asset={assetForDetail}
                project={project}
                categoryName={assetForDetail ? allCategories.find(c => c.id === assetForDetail.budgetCategoryId)?.name : undefined}
                assetTypeName={
                    assetForDetail
                        ? allAssetTypes.find((a) => a.id === assetForDetail.assetTypeId)?.name
                            ?? allAssetTypes.find((a) => a.workflowSetId === assetForDetail.workflowSetId)?.name
                        : undefined
                }
            />

            <ProjectDetailViewModal
                isOpen={isProjectDetailOpen}
                onClose={() => setIsProjectDetailOpen(false)}
                project={project}
                categoryName={allCategories.find(c => c.id === project.budgetCategoryId)?.name}
                priorityName={allPriorities.find(p => p.id === project.priorityId)?.name}
            />
        </>
    );
};
ProjectAssetsModal.displayName = 'ProjectAssetsModal';
