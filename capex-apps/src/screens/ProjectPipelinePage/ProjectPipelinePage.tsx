import React, { useState, useEffect, useMemo, useCallback } from 'react';
// FIX: Added missing imports for 'ProjectType' and 'ProjectStatus' enums.
import { BudgetPeriod, Project, MasterCatalogueItem, RoomConfig, Asset, ProjectType, ProjectStatus, PurchaseOrder, Vendor, User, UserRole, Archetype, HospitalUnit } from '../../types';
import * as configService from '../../services/configService';
import * as poService from '../../services/poService';
import { formatCurrency } from '../../lib/formatter';
import { Dropdown } from '../../components/molecules/Dropdown/Dropdown';
import { RoomCard } from '../../components/molecules/RoomCard/RoomCard';
import { RoomEquipmentEditor } from '../../components/organisms/RoomEquipmentEditor/RoomEquipmentEditor';
import { POManagementPanel } from '../../components/organisms/POManagementPanel/POManagementPanel';
import { CreatePOModal } from '../../components/organisms/CreatePOModal/CreatePOModal';
import { usePermissions } from '../../hooks/usePermissions';
import { GoodsReceivedModal } from '../../components/organisms/GoodsReceivedModal/GoodsReceivedModal';
import { allocateProjectCodeViaBackend } from '../../services/capexCrudApi';
import { cloneDeep } from '../../lib/clone';
import { dedupeProjectsById } from '../BudgetHU/budgetHuHelpers';

function stageOptionLabel(project: Project, all: Project[]): string {
    const stage = project.stage ?? 0;
    const duplicates = all.filter((p) => (p.stage ?? 0) === stage).length;
    if (duplicates > 1) {
        const code = project.projectCode?.trim() || project.id.slice(-8);
        return `Stage ${stage} — ${code}`;
    }
    return `Stage ${stage}`;
}


const BackIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
);

const regenerateAssetsFromPipelineData = (project: Project, catalogue: MasterCatalogueItem[], workflowId: string | null): Project => {
    const newProject = { ...project };
    if (!newProject.pipelineData) {
        newProject.assets = [];
        return newProject;
    }

    const catalogueMap = new Map(catalogue.map(c => [c.id, c]));
    const assetQuantities = new Map<string, number>();

    for (const item of newProject.pipelineData) {
        assetQuantities.set(item.catalogueId, (assetQuantities.get(item.catalogueId) || 0) + item.qty);
    }
    
    const newAssets: Asset[] = [];
    let assetIndex = 0;

    for (const [catalogueId, totalQty] of assetQuantities.entries()) {
        const catalogueItem = catalogueMap.get(catalogueId);
        if (catalogueItem && totalQty > 0) {
            const budgetPlan = catalogueItem.price * totalQty;
            const existingAsset = newProject.assets.find(a => a.catalogueId === catalogueId);

            const assetNum = String(assetIndex + 1).padStart(3, '0');
            const assetCode = `${newProject.projectCode}.${assetNum}`;
            
            newAssets.push({
                id: existingAsset?.id || `ASSET-${newProject.projectCode}-${Date.now()}-${assetIndex}`,
                assetCode: existingAsset?.assetCode || assetCode,
                assetName: catalogueItem.name,
                budgetPlan,
                catalogueId,
                budgetAllocated: existingAsset?.budgetAllocated || 0,
                consumedBudget: existingAsset?.consumedBudget || 0,
                workflowSetId: existingAsset?.workflowSetId || workflowId || '',
                budgetCategoryId: existingAsset?.budgetCategoryId || newProject.budgetCategoryId,
                endTargetDate: existingAsset?.endTargetDate,
            });
            assetIndex++;
        }
    }

    newProject.assets = newAssets;
    newProject.budgetPlan = newAssets.reduce((sum, asset) => sum + asset.budgetPlan, 0);

    return newProject;
};

interface ProjectPipelinePageProps {
    budgetPeriod: BudgetPeriod;
    huId: string;
    onDataUpdate: (updatedPeriod: BudgetPeriod) => void;
    showToast: (message: string, type?: 'success' | 'error') => void;
    currentUser: User;
    allRoles: UserRole[];
}

export const ProjectPipelinePage: React.FC<ProjectPipelinePageProps> = ({ budgetPeriod, huId, onDataUpdate, showToast, currentUser, allRoles }) => {
    const [activeTab, setActiveTab] = useState<'planner' | 'po'>('planner');
    const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
    const [masterCatalogue, setMasterCatalogue] = useState<MasterCatalogueItem[]>([]);
    const [rooms, setRooms] = useState<RoomConfig[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
    const [defaultPipelineWorkflowId, setDefaultPipelineWorkflowId] = useState<string | null>(null);

    // PO State
    const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
    const [vendors, setVendors] = useState<Vendor[]>([]);
    const [isCreatePOModalOpen, setIsCreatePOModalOpen] = useState(false);
    const [isGoodsReceivedModalOpen, setIsGoodsReceivedModalOpen] = useState(false);
    const [selectedPO, setSelectedPO] = useState<PurchaseOrder | null>(null);

    const permissions = usePermissions(currentUser, allRoles);
    
    const fetchData = useCallback(async () => {
        setLoading(true);
        const [catalogueData, roomsData, vendorsData, workflowConfig] = await Promise.all([
            configService.getAllMasterCatalogue(),
            configService.getAllRoomsConfig(),
            configService.getAllVendors(),
            configService.getAppConfig('defaultPipelineWorkflowId'),
        ]);
        setMasterCatalogue(catalogueData);
        setRooms(roomsData);
        setVendors(vendorsData);
        if (workflowConfig) setDefaultPipelineWorkflowId(workflowConfig.value);
        setLoading(false);
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const pipelineProjects = useMemo(() => {
        const raw =
            budgetPeriod.archetypes
                .flatMap((a) => a.units)
                .find((u) => u.id === huId)
                ?.projects.filter((p) => p.isPipelineProject) ?? [];
        return dedupeProjectsById(raw).sort((a, b) => {
            const stageDiff = (a.stage || 0) - (b.stage || 0);
            if (stageDiff !== 0) return stageDiff;
            return String(a.projectCode ?? '').localeCompare(String(b.projectCode ?? ''));
        });
    }, [budgetPeriod, huId]);

    const stageOptionByProjectId = useMemo(() => {
        const map = new Map<string, string>();
        for (const project of pipelineProjects) {
            map.set(project.id, stageOptionLabel(project, pipelineProjects));
        }
        return map;
    }, [pipelineProjects]);

    const stageLabelToProjectId = useMemo(() => {
        const map = new Map<string, string>();
        for (const [projectId, label] of stageOptionByProjectId.entries()) {
            map.set(label, projectId);
        }
        return map;
    }, [stageOptionByProjectId]);

    const stageDropdownOptions = useMemo(
        () => pipelineProjects.map((p) => stageOptionByProjectId.get(p.id) ?? `Stage ${p.stage ?? 0}`),
        [pipelineProjects, stageOptionByProjectId],
    );

    const selectedHU = useMemo(() => {
        return budgetPeriod.archetypes.flatMap(a => a.units).find(u => u.id === huId) || null;
    }, [budgetPeriod, huId]);
    
    const currentProject = useMemo(() => {
        if (!selectedProjectId) return pipelineProjects[0] ?? undefined;
        return pipelineProjects.find((p) => p.id === selectedProjectId) ?? pipelineProjects[0];
    }, [pipelineProjects, selectedProjectId]);

    useEffect(() => {
        if (pipelineProjects.length === 0) {
            setSelectedProjectId(null);
            return;
        }
        const stillExists = selectedProjectId
            ? pipelineProjects.some((p) => p.id === selectedProjectId)
            : false;
        if (!stillExists) {
            setSelectedProjectId(pipelineProjects[0].id);
            setSelectedRoomId(null);
        }
    }, [pipelineProjects, selectedProjectId]);
    
    const fetchPOs = useCallback(async () => {
        if (currentProject) {
            const pos = await poService.getPurchaseOrdersForProject(currentProject.id);
            setPurchaseOrders(pos);
        } else {
            setPurchaseOrders([]);
        }
    }, [currentProject]);

    useEffect(() => {
        fetchPOs();
    }, [fetchPOs]);

    const roomSummaries = useMemo(() => {
        const catalogueMap = new Map(masterCatalogue.map(c => [c.id, c]));
        return rooms.map(room => {
            let totalValue = 0;
            const itemsInRoom = new Set<string>();

            currentProject?.pipelineData?.forEach(item => {
                if (item.roomId === room.id) {
                    const catalogueItem = catalogueMap.get(item.catalogueId);
                    if (catalogueItem) {
                        totalValue += item.qty * (catalogueItem as MasterCatalogueItem).price;
                        if(item.qty > 0) itemsInRoom.add(item.catalogueId);
                    }
                }
            });
            return { ...room, totalValue, itemCount: itemsInRoom.size };
        });
    }, [currentProject, masterCatalogue, rooms]);
    
    useEffect(() => {
        if (selectedRoomId && !rooms.some(r => r.id === selectedRoomId)) {
            setSelectedRoomId(null);
        }
    }, [selectedRoomId, rooms]);

    const handleQtyChange = (catalogueId: string, roomId: string, newQty: number) => {
        if (!currentProject) return;

        const newPeriod = cloneDeep(budgetPeriod);
        const projectToUpdate = newPeriod.archetypes.flatMap((a) => a.units).find((u) => u.id === huId)?.projects.find((p: Project) => p.id === currentProject.id);
        
        if (!projectToUpdate) return;
        
        if (!projectToUpdate.pipelineData) projectToUpdate.pipelineData = [];

        type PipelineRow = NonNullable<Project['pipelineData']>[number];
        const existingEntry = projectToUpdate.pipelineData.find(
            (d: PipelineRow) => d.catalogueId === catalogueId && d.roomId === roomId
        );
        if (existingEntry) {
            existingEntry.qty = newQty;
        } else {
            projectToUpdate.pipelineData.push({ catalogueId, roomId, qty: newQty });
        }
        
        projectToUpdate.pipelineData = projectToUpdate.pipelineData.filter((d: PipelineRow) => d.qty > 0);

        const regeneratedProject = regenerateAssetsFromPipelineData(projectToUpdate, masterCatalogue, defaultPipelineWorkflowId);
        
        const hu = newPeriod.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
        if (hu) {
            const projIndex = hu.projects.findIndex((p: Project) => p.id === currentProject.id);
            if (projIndex > -1) {
                hu.projects[projIndex] = regeneratedProject;
            }
        }
        onDataUpdate(newPeriod);
    };

    const handlePOCreated = async () => {
        showToast('Purchase Order created successfully!', 'success');
        await fetchPOs(); // Re-fetch POs to update the list
        onDataUpdate(budgetPeriod); // This might be redundant but ensures parent is aware of potential budget changes
    };
    
    const handleCancelPO = async (poId: string) => {
        try {
            await poService.cancelPurchaseOrder(budgetPeriod, poId, currentUser);
            await fetchPOs();
            showToast('Purchase Order canceled successfully.', 'success');
        } catch(error) {
            showToast(`Failed to cancel PO: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
        }
    };
    
    const handleGoodsReceived = async () => {
        await fetchPOs();
        showToast('Goods reception status updated.', 'success');
    };
    
    const handleOpenGoodsReceivedModal = (po: PurchaseOrder) => {
        setSelectedPO(po);
        setIsGoodsReceivedModalOpen(true);
    };

    const itemsOnActivePO = useMemo(() => {
        const itemIds = new Set<string>();
        purchaseOrders.forEach(po => {
            if (po.status === 'Active' || po.status === 'Partially Received') {
                po.items.forEach(item => itemIds.add(item.catalogueId));
            }
        });
        return itemIds;
    }, [purchaseOrders]);
    
    const handleAddNewStage = async () => {
        const hu = budgetPeriod.archetypes.flatMap(a => a.units).find(u => u.id === huId);
        if (!hu) return;

        const maxStage = pipelineProjects.reduce((max, p) => Math.max(max, p.stage || 0), 0);
        const newStage = maxStage + 1;

        let allocated: string | null = null;
        try {
            allocated = await allocateProjectCodeViaBackend({
                userId: currentUser.id,
                periodName: budgetPeriod.periodName,
                huCode: hu.code,
            });
        } catch (err) {
            console.error('allocateProjectCodeViaBackend (pipeline stage) failed:', err);
        }
        if (!allocated) {
            showToast('Gagal mengalokasikan project code dari server untuk stage baru.', 'error');
            return;
        }

        const year = budgetPeriod.periodName.match(/\d{4}/)?.[0] || new Date().getFullYear().toString();

        const newProject: Project = {
            id: `PROJ-${hu.code}-${Date.now()}`,
            projectCode: allocated,
            projectName: `Pipeline Equipment Stage ${newStage}`,
            isPipelineProject: true, stage: newStage, pipelineData: [], assets: [],
            budgetCategoryId: 'cat-strat-pipe', type: ProjectType.ProjectPipeline, budgetPlan: 0,
            assetCode: '', axCode: '', assetName: '', completionRate: 0, taskToDo: '', owner: '',
            targetStart: `${year}-01-01`, endDate: `${year}-12-31`, status: ProjectStatus.OnTrack, plan: 'A',
            budgetCarryForward: 0, budgetAllocated: 0, approvedBudget: 0, consumedBudget: 0,
            revenueProjection: 0, priorityId: 'prio-must-have',
        };

        const newPeriod = cloneDeep(budgetPeriod);
        const huToUpdate = newPeriod.archetypes.flatMap((a) => a.units).find((u) => u.id === huId);
        if (huToUpdate) {
            huToUpdate.projects.push(newProject);
            onDataUpdate(newPeriod);
            setSelectedProjectId(newProject.id);
            setSelectedRoomId(null);
            showToast(`Created Stage ${newStage}.`, 'success');
        }
    };


    if (loading) return <div>Loading Pipeline Data...</div>;

    const grandTotal = roomSummaries.reduce((sum, room) => sum + room.totalValue, 0);
    const totalPipelineBudgetPlan = pipelineProjects.reduce((sum, project) => sum + (project.budgetPlan || 0), 0);
    const totalPipelineCarryForward = pipelineProjects.reduce((sum, project) => sum + (project.budgetCarryForward || 0), 0);
    const totalPipelineApproved = pipelineProjects.reduce((sum, project) => sum + (project.approvedBudget || 0), 0);
    const totalPipelineConsumed = pipelineProjects.reduce((sum, project) => sum + (project.consumedBudget || 0), 0);
    const totalPipelineBudget = totalPipelineBudgetPlan + totalPipelineCarryForward;
    const remainingToApprove = totalPipelineBudget - totalPipelineApproved;
    const remainingToConsume = totalPipelineBudget - totalPipelineConsumed;
    
    const PlannerView = () => (
        <>
            <div className="hidden md:flex h-[70vh] border border-siloam-border rounded-lg overflow-hidden">
                <div className="w-1/3 border-r border-siloam-border flex flex-col">
                    <div className="p-4 border-b border-siloam-border flex-shrink-0">
                        <h3 className="font-bold">Rooms</h3>
                    </div>
                    <div className="flex-1 overflow-y-auto">
                        {roomSummaries.map(room => (
                            <RoomCard 
                                key={room.id}
                                room={room}
                                itemCount={room.itemCount}
                                totalValue={room.totalValue}
                                isSelected={selectedRoomId === room.id}
                                onClick={() => setSelectedRoomId(room.id)}
                            />
                        ))}
                    </div>
                </div>
                <div className="w-2/3 flex flex-col">
                    {selectedRoomId && currentProject && rooms.find(r => r.id === selectedRoomId) ? (
                        <RoomEquipmentEditor
                            room={rooms.find(r => r.id === selectedRoomId)!}
                            project={currentProject}
                            masterCatalogue={masterCatalogue}
                            onQtyChange={handleQtyChange}
                            itemsOnActivePO={itemsOnActivePO}
                        />
                    ) : (
                        <div className="flex items-center justify-center h-full text-siloam-text-secondary">Select a room to plan its equipment.</div>
                    )}
                </div>
            </div>

            <div className="md:hidden h-[70vh] border border-siloam-border rounded-lg overflow-hidden">
                {selectedRoomId && currentProject && rooms.find(r => r.id === selectedRoomId) ? (
                    <div className="h-full flex flex-col">
                        <div className="p-4 border-b border-siloam-border flex items-center flex-shrink-0">
                            <button onClick={() => setSelectedRoomId(null)} className="flex items-center gap-2 text-siloam-blue font-semibold">
                                <BackIcon /> Rooms
                            </button>
                        </div>
                        <RoomEquipmentEditor
                            room={rooms.find(r => r.id === selectedRoomId)!}
                            project={currentProject}
                            masterCatalogue={masterCatalogue}
                            onQtyChange={handleQtyChange}
                            itemsOnActivePO={itemsOnActivePO}
                        />
                    </div>
                ) : (
                    <div className="h-full flex flex-col">
                        <div className="p-4 border-b border-siloam-border flex-shrink-0">
                            <h3 className="font-bold">Select a Room</h3>
                        </div>
                        <div className="flex-1 overflow-y-auto p-2 space-y-2">
                            {roomSummaries.map(room => (
                                <RoomCard 
                                    key={room.id}
                                    room={room}
                                    itemCount={room.itemCount}
                                    totalValue={room.totalValue}
                                    isSelected={false}
                                    onClick={() => setSelectedRoomId(room.id)}
                                />
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );

    return (
        <div className="bg-siloam-surface p-4 md:p-6 rounded-xl shadow-soft space-y-4">
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div>
                    <h2 className="text-xl font-bold">Pipeline Equipment Planning</h2>
                    <p className="text-sm text-siloam-text-secondary">
                        {selectedHU?.name ? `${selectedHU.name} - ` : ''}
                        Grand Total for this stage: {formatCurrency(grandTotal)}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="w-56">
                        <Dropdown 
                            label="Select Stage"
                            options={stageDropdownOptions}
                            selectedValue={
                                currentProject
                                    ? (stageOptionByProjectId.get(currentProject.id) ?? `Stage ${currentProject.stage ?? 0}`)
                                    : ''
                            }
                            onSelect={(label) => {
                                const projectId = stageLabelToProjectId.get(label);
                                if (projectId) {
                                    setSelectedProjectId(projectId);
                                    setSelectedRoomId(null);
                                }
                            }}
                        />
                    </div>
                    {permissions.isAllowed('Pipeline Planning', 'create') && (
                        <button type="button" onClick={() => void handleAddNewStage()} className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft">
                            + Add Stage
                        </button>
                    )}
                </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                <div className="bg-siloam-bg rounded-lg border border-siloam-border p-3">
                    <p className="text-xs text-siloam-text-secondary">Total Budget Pipeline HU</p>
                    <p className="text-base font-semibold text-siloam-text-primary">{formatCurrency(totalPipelineBudget)}</p>
                </div>
                <div className="bg-siloam-bg rounded-lg border border-siloam-border p-3">
                    <p className="text-xs text-siloam-text-secondary">Budget Planned (All Stages)</p>
                    <p className="text-base font-semibold text-siloam-text-primary">{formatCurrency(totalPipelineBudgetPlan)}</p>
                </div>
                <div className="bg-siloam-bg rounded-lg border border-siloam-border p-3">
                    <p className="text-xs text-siloam-text-secondary">Remaining to Approve</p>
                    <p className={`text-base font-semibold ${remainingToApprove < 0 ? 'text-danger' : 'text-siloam-text-primary'}`}>
                        {formatCurrency(remainingToApprove)}
                    </p>
                </div>
                <div className="bg-siloam-bg rounded-lg border border-siloam-border p-3">
                    <p className="text-xs text-siloam-text-secondary">Remaining to Consume</p>
                    <p className={`text-base font-semibold ${remainingToConsume < 0 ? 'text-danger' : 'text-siloam-text-primary'}`}>
                        {formatCurrency(remainingToConsume)}
                    </p>
                </div>
            </div>

            <div className="border-b border-siloam-border">
                <nav className="-mb-px flex space-x-6">
                    <button
                        onClick={() => setActiveTab('planner')}
                        className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'planner'
                            ? 'border-siloam-blue text-siloam-blue'
                            : 'border-transparent text-siloam-text-secondary hover:text-siloam-text-primary hover:border-gray-300'
                        }`}
                    >
                        Planner
                    </button>
                    {permissions.isAllowed('Purchase Order', 'view') && (
                        <button
                            onClick={() => setActiveTab('po')}
                            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'po'
                                ? 'border-siloam-blue text-siloam-blue'
                                : 'border-transparent text-siloam-text-secondary hover:text-siloam-text-primary hover:border-gray-300'
                            }`}
                        >
                            Purchase Orders
                        </button>
                    )}
                </nav>
            </div>
            
            {activeTab === 'planner' && <PlannerView />}

            {activeTab === 'po' && currentProject && permissions.isAllowed('Purchase Order', 'view') && (
                <POManagementPanel
                    purchaseOrders={purchaseOrders}
                    allVendors={vendors}
                    onOpenCreateModal={() => setIsCreatePOModalOpen(true)}
                    onCancelPO={handleCancelPO}
                    onOpenGoodsReceivedModal={handleOpenGoodsReceivedModal}
                    canCreate={permissions.isAllowed('Purchase Order', 'create')}
                    hospitalUnitName={selectedHU?.name}
                    hospitalUnitCode={selectedHU?.code}
                    projectName={currentProject.projectName}
                    masterCatalogue={masterCatalogue}
                    showToast={showToast}
                />
            )}
            
            {currentProject && (
                 <CreatePOModal
                    isOpen={isCreatePOModalOpen}
                    onClose={() => setIsCreatePOModalOpen(false)}
                    onPOCreated={handlePOCreated}
                    project={currentProject}
                    allVendors={vendors}
                    budgetPeriod={budgetPeriod}
                    currentUser={currentUser}
                />
            )}

            <GoodsReceivedModal
                isOpen={isGoodsReceivedModalOpen}
                onClose={() => setIsGoodsReceivedModalOpen(false)}
                onSave={handleGoodsReceived}
                po={selectedPO}
                budgetPeriod={budgetPeriod}
                currentUser={currentUser}
            />
        </div>
    );
};