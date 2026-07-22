import { PurchaseOrder, POItem, Project, BudgetPeriod, MasterCatalogueItem, User } from '../types';
import * as budgetService from './budgetService';
import * as taskService from './taskService';
import {
  saveProjectViaBackend,
  savePurchaseOrderViaBackend,
} from './capexCrudApi';
import {
  fetchPurchaseOrderFromBackend,
  fetchPurchaseOrdersForProjectFromBackend,
} from './poApi';
import * as configService from './configService';

// --- PO Services ---

export const getPurchaseOrdersForProject = async (projectId: string): Promise<PurchaseOrder[]> => {
  const fromBe = await fetchPurchaseOrdersForProjectFromBackend(projectId);
  if (fromBe !== undefined) return fromBe;
  throw new Error('Purchase orders unavailable: backend failed.');
};

async function loadPurchaseOrder(poId: string): Promise<PurchaseOrder | null> {
  const fromBe = await fetchPurchaseOrderFromBackend(poId);
  if (fromBe !== undefined) return fromBe;
  throw new Error('Purchase order unavailable: backend failed.');
}

/**
 * Aggregates all required equipment for a project stage and filters out
 * items that are already on an active PO.
 */
export const getAvailableItemsForPO = (project: Project, allPOs: PurchaseOrder[], masterCatalogue: MasterCatalogueItem[]): POItem[] => {
    if (!project.pipelineData) return [];
    
    const totalRequired = new Map<string, number>();
    project.pipelineData.forEach(item => {
        totalRequired.set(item.catalogueId, (totalRequired.get(item.catalogueId) || 0) + item.qty);
    });

    const alreadyOnPO = new Map<string, number>();
    allPOs.forEach(po => {
        if (po.status === 'Active' || po.status === 'Partially Received' || po.status === 'Completed') {
            po.items.forEach(item => {
                alreadyOnPO.set(item.catalogueId, (alreadyOnPO.get(item.catalogueId) || 0) + item.qty);
            });
        }
    });

    const availableItems: POItem[] = [];
    const catalogueMap = new Map(masterCatalogue.map(c => [c.id, c]));

    for (const [catalogueId, requiredQty] of totalRequired.entries()) {
        const onPoQty = alreadyOnPO.get(catalogueId) || 0;
        const availableQty = requiredQty - onPoQty;

        if (availableQty > 0) {
            const catalogueItem = catalogueMap.get(catalogueId);
            if (catalogueItem) {
                availableItems.push({
                    catalogueId,
                    name: catalogueItem.name,
                    rdsCode: catalogueItem.rdsCode,
                    qty: availableQty,
                    price: catalogueItem.price,
                    subtotal: availableQty * catalogueItem.price,
                    receivedQty: 0,
                });
            }
        }
    }

    return availableItems;
};

async function persistPurchaseOrder(
    po: PurchaseOrder,
    periodName: string,
    userId: number,
    action: 'create' | 'update',
): Promise<void> {
    const saved = await savePurchaseOrderViaBackend(userId, periodName, po, action);
    if (saved) return;
    throw new Error('Gagal menyimpan Purchase Order via backend (capexbe).');
}

export const createPurchaseOrder = async (
    budgetPeriod: BudgetPeriod,
    projectId: string,
    stage: number,
    vendorId: string,
    items: POItem[],
    shippingAddress: string,
    remarks: string,
    currentUser: User,
): Promise<PurchaseOrder> => {
    const vendors = await configService.getAllVendors();
    const vendor = vendors.find(v => v.id === vendorId);
    if (!vendor) throw new Error("Vendor not found");

    const project = budgetPeriod.archetypes
        .flatMap(a => a.units)
        .flatMap(u => u.projects)
        .find(p => p.id === projectId);
    
    if (!project) {
        throw new Error(`Project with id "${projectId}" not found in budget period. Please ensure the project is saved first.`);
    }

    const hu = budgetPeriod.archetypes
        .flatMap(a => a.units)
        .find(u => u.projects.some(p => p.id === projectId));
    
    if (!hu) {
        throw new Error(`Cannot find hospital unit for project "${projectId}". Please ensure the project is properly saved.`);
    }

    const savedProject = await saveProjectViaBackend(currentUser.id, budgetPeriod.periodName, project);
    if (!savedProject) {
        throw new Error('Gagal menyimpan project pipeline via backend sebelum membuat PO.');
    }

    const now = new Date();
    const poNumber = `PO-${now.getFullYear()}-${projectId.slice(-4)}-${String(now.getTime()).slice(-4)}`;
    const totalValue = items.reduce((sum, item) => sum + item.subtotal, 0);

    const newPO: PurchaseOrder = {
        id: `PO-${projectId}-${now.getTime()}`,
        poNumber,
        projectId,
        stage,
        vendorId,
        vendorName: vendor.name,
        items: items.map(item => ({ ...item, receivedQty: 0 })),
        totalValue,
        status: 'Active',
        createdAt: now.toISOString(),
        shippingAddress,
        remarks,
    };
    
    await persistPurchaseOrder(newPO, budgetPeriod.periodName, currentUser.id, 'create');

    const newPeriod = structuredClone(budgetPeriod) as BudgetPeriod;
    const projectInNewPeriod = newPeriod.archetypes
        .flatMap((a) => a.units)
        .flatMap((u) => u.projects)
        .find((p: Project) => p.id === projectId);
    
    if (projectInNewPeriod) {
        let remainingPoValue = totalValue;
        const relevantAssets = projectInNewPeriod.assets.filter((a) =>
            items.some((item) => item.catalogueId === a.catalogueId),
        );
        const totalPlanOfRelevantAssets = relevantAssets.reduce((sum, a) => sum + a.budgetPlan, 0);

        if (totalPlanOfRelevantAssets > 0) {
            for (const asset of relevantAssets) {
                const proportion = asset.budgetPlan / totalPlanOfRelevantAssets;
                const valueToConsume = Math.round(totalValue * proportion);
                asset.consumedBudget += valueToConsume;
                remainingPoValue -= valueToConsume;
            }
        }
        
        if (relevantAssets.length > 0 && remainingPoValue !== 0) {
            relevantAssets[0].consumedBudget += remainingPoValue;
        }

        const recalculated = budgetService.recalculateBudgets(newPeriod);
        const relevantAssetIds = relevantAssets.map((a) => a.id);

        await budgetService.updateBudgetPeriod(recalculated, currentUser, {
            compareAgainst: budgetPeriod,
            huId: hu.id,
            changedProjectIds: [projectId],
            recalculateTaskStatusesForAssetIds: relevantAssetIds,
        });

        const triggeredAssetIds = new Set<string>();
        for (const item of newPO.items) {
            const asset = projectInNewPeriod.assets.find((a) => a.catalogueId === item.catalogueId);
            if (asset && !triggeredAssetIds.has(asset.id)) {
                const poDateIso = new Date(`${now.toISOString().slice(0, 10)}T12:00:00`).toISOString();
                await taskService.triggerSystemTask(asset.id, 'PO_CREATED', currentUser, {
                    completedAt: poDateIso,
                });
                triggeredAssetIds.add(asset.id);
            }
        }
    }
    
    return newPO;
};

export const cancelPurchaseOrder = async (budgetPeriod: BudgetPeriod, poId: string, currentUser: User): Promise<void> => {
    const po = await loadPurchaseOrder(poId);
    if (!po) throw new Error("Purchase Order not found");
    if (po.status !== 'Active') throw new Error(`Cannot cancel a PO with status '${po.status}'.`);

    po.status = 'Canceled';
    await persistPurchaseOrder(po, budgetPeriod.periodName, currentUser.id, 'update');

    const hu = budgetPeriod.archetypes
        .flatMap((a) => a.units)
        .find((u) => u.projects.some((p) => p.id === po.projectId));

    const newPeriod = structuredClone(budgetPeriod) as BudgetPeriod;
    const project = newPeriod.archetypes
        .flatMap((a) => a.units)
        .flatMap((u) => u.projects)
        .find((p: Project) => p.id === po.projectId);
    
    if (project) {
        let remainingPoValue = po.totalValue;
        const relevantAssets = project.assets.filter((a) =>
            po.items.some((item) => item.catalogueId === a.catalogueId),
        );
        const totalPlanOfRelevantAssets = relevantAssets.reduce((sum, a) => sum + a.budgetPlan, 0);
        
        if (totalPlanOfRelevantAssets > 0) {
            for (const asset of relevantAssets) {
                const proportion = asset.budgetPlan / totalPlanOfRelevantAssets;
                const valueToRevert = Math.round(po.totalValue * proportion);
                asset.consumedBudget = Math.max(0, asset.consumedBudget - valueToRevert);
                remainingPoValue -= valueToRevert;
            }
        }

        if (relevantAssets.length > 0 && remainingPoValue !== 0) {
            relevantAssets[0].consumedBudget = Math.max(0, relevantAssets[0].consumedBudget - remainingPoValue);
        }
        
        const recalculated = budgetService.recalculateBudgets(newPeriod);
        await budgetService.updateBudgetPeriod(recalculated, currentUser, {
            compareAgainst: budgetPeriod,
            huId: hu?.id,
            changedProjectIds: [po.projectId],
            recalculateTaskStatusesForAssetIds: relevantAssets.map((a) => a.id),
        });
    }
};

export const receivePOItems = async (
    poId: string,
    receivedQuantities: Map<string, number>,
    budgetPeriod?: BudgetPeriod,
    currentUser?: User,
): Promise<PurchaseOrder> => {
    const po = await loadPurchaseOrder(poId);
    if (!po) throw new Error("PO not found");
    if (po.status === 'Canceled' || po.status === 'Completed') throw new Error(`PO is already ${po.status}.`);

    let allItemsFullyReceived = true;

    po.items.forEach(item => {
        const newlyReceived = receivedQuantities.get(item.catalogueId);
        if (typeof newlyReceived === 'number') {
            item.receivedQty = newlyReceived;
        }

        if (item.receivedQty < item.qty) {
            allItemsFullyReceived = false;
        }
    });

    const anyItemsReceived = po.items.some(item => (item.receivedQty || 0) > 0);

    if (allItemsFullyReceived) {
        po.status = 'Completed';
    } else if (anyItemsReceived) {
        po.status = 'Partially Received';
    }

    if (budgetPeriod && currentUser) {
        await persistPurchaseOrder(po, budgetPeriod.periodName, currentUser.id, 'update');
    } else {
        throw new Error('Cannot save PO: backend unavailable.');
    }
    return po;
};
