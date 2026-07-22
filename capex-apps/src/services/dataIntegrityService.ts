import { BudgetPeriod, Project, Asset, SystemTriggerEvent, User } from '../types';
import * as budgetService from './budgetService';

type TriggerData = {
    approvedBudget?: number;
    consumedBudget?: number;
    poNumber?: string;
    poDate?: string;
    isGoodsReceived?: boolean;
    budgetPlan?: number;
};

/**
 * Finds and updates the data field associated with a system trigger event.
 * This is used when a user manually completes a task that should have been system-triggered,
 * ensuring the underlying data is consistent with the task's completion.
 * @param assetId The ID of the asset related to the task.
 * @param projectId The ID of the project related to the task.
 * @param triggerEvent The system event linked to the task.
 * @param newData An object containing the new data to be saved.
 * @param currentUser The user performing the action.
 */
export const updateTriggerData = async (
    assetId: string,
    projectId: string,
    triggerEvent: SystemTriggerEvent,
    newData: TriggerData,
    currentUser: User
): Promise<void> => {
    const allPeriods = await budgetService.getAllBudgetPeriods();
    let periodToUpdate: BudgetPeriod | null = null;

    // Find the correct period and update the nested data
    for (const period of allPeriods) {
        let found = false;
        for (const arch of period.archetypes) {
            for (const unit of arch.units) {
                const projIndex = unit.projects.findIndex(p => p.id === projectId);
                if (projIndex !== -1) {
                    const project = unit.projects[projIndex];
                    
                    switch (triggerEvent) {
                        case 'BUDGET_APPROVED':
                            if (newData.approvedBudget !== undefined) {
                                project.approvedBudget = newData.approvedBudget;
                            }
                            break;
                        
                        case 'PO_CREATED':
                        case 'PO_GOODS_RECEIVED':
                        case 'ASSET_BUDGET_PLAN_FILLED':
                            const assetIndex = project.assets.findIndex(a => a.id === assetId);
                            if (assetIndex !== -1) {
                                const asset = project.assets[assetIndex];
                                if (newData.consumedBudget !== undefined) asset.consumedBudget = newData.consumedBudget;
                                if (newData.poNumber !== undefined) asset.poNumber = newData.poNumber;
                                if (newData.poDate !== undefined) asset.poDate = newData.poDate;
                                if (newData.isGoodsReceived !== undefined) asset.isGoodsReceived = newData.isGoodsReceived;
                                if (newData.budgetPlan !== undefined) asset.budgetPlan = newData.budgetPlan;
                            }
                            break;
                    }
                    found = true;
                    break;
                }
            }
            if (found) break;
        }
        if (found) {
            periodToUpdate = period;
            break;
        }
    }

    if (periodToUpdate) {
        const recalculated = budgetService.recalculateBudgets(periodToUpdate);
        await budgetService.updateBudgetPeriod(recalculated, currentUser);
    } else {
        throw new Error(`Could not find project or asset to update for event: ${triggerEvent}`);
    }
};
