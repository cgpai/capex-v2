import {
    Asset,
    FINAL_FS_APPROVAL_CONCLUSIONS,
    Project,
    SYSTEM_TRIGGER_EVENTS,
    SystemTriggerEvent,
    Task,
} from '../types';

export function getTaskTriggerEvents(
    task: Pick<Task, 'triggerEvent' | 'triggerEvents'>,
): SystemTriggerEvent[] {
    const fromArray = (task.triggerEvents ?? []).filter(Boolean) as SystemTriggerEvent[];
    if (fromArray.length > 0) {
        return [...new Set(fromArray)];
    }
    const legacy = String(task.triggerEvent ?? '').trim();
    if (!legacy) return [];
    // Support single value or pipe/comma-separated values stored in trigger_event.
    const parts = legacy
        .split(/[|,]/)
        .map((p) => p.trim())
        .filter(Boolean) as SystemTriggerEvent[];
    return [...new Set(parts)];
}

export function taskHasTriggerEvent(
    task: Pick<Task, 'isSystemTriggered' | 'triggerEvent' | 'triggerEvents'>,
    event: SystemTriggerEvent,
): boolean {
    return !!task.isSystemTriggered && getTaskTriggerEvents(task).includes(event);
}

export function formatTaskTriggerEventLabels(
    task: Pick<Task, 'triggerEvent' | 'triggerEvents'>,
): string {
    const events = getTaskTriggerEvents(task);
    if (events.length === 0) return '—';
    return events
        .map((value) => SYSTEM_TRIGGER_EVENTS.find((e) => e.value === value)?.label ?? value)
        .join(', ');
}

export function prepareTaskTriggerEventsForSave(task: Partial<Task>): Partial<Task> {
    if (!task.isSystemTriggered) {
        const { triggerEvent: _a, triggerEvents: _b, ...rest } = task;
        return { ...rest, triggerEvents: undefined, triggerEvent: undefined };
    }
    const events = getTaskTriggerEvents(task as Task);
    const { triggerEvent: _legacy, triggerEvents: _arr, ...rest } = task;
    // DB column is still `trigger_event` (varchar). Persist all events pipe-joined
    // and keep triggerEvents in the in-memory object for the UI.
    return {
        ...rest,
        triggerEvents: events.length > 0 ? events : undefined,
        // Keep singular column in sync so Capex Project List timeline can read triggers.
        triggerEvent: events.length > 0 ? (events.join('|') as SystemTriggerEvent) : undefined,
    };
}

export function isTriggerEventDataMissing(
    triggerEvent: SystemTriggerEvent,
    asset: Asset,
    project: Project | null | undefined,
): boolean {
    switch (triggerEvent) {
        case 'BUDGET_APPROVED':
            return (project?.approvedBudget ?? 0) <= 0;
        case 'PO_CREATED':
            return (Number(asset.consumedBudget) || 0) <= 0 && !String(asset.poNumber ?? '').trim();
        case 'PO_GOODS_RECEIVED':
            return !asset.isGoodsReceived;
        case 'ASSET_BUDGET_PLAN_FILLED':
            return (Number(asset.budgetPlan) || 0) <= 0;
        case 'FS_APPROVAL': {
            const fsStatus = String(
                (project as { fsStatus?: string } | null | undefined)?.fsStatus ?? '',
            ).trim();
            if (!fsStatus || fsStatus === 'Pending' || fsStatus === 'Not Submitted') {
                return true;
            }
            return !FINAL_FS_APPROVAL_CONCLUSIONS.includes(fsStatus as (typeof FINAL_FS_APPROVAL_CONCLUSIONS)[number]);
        }
        case 'FS_REQUEST':
        case 'ASSET_CREATED':
        default:
            return false;
    }
}

export function getMissingTaskTriggerEvents(
    task: Pick<Task, 'isSystemTriggered' | 'triggerEvent' | 'triggerEvents'>,
    asset: Asset,
    project: Project | null | undefined,
): SystemTriggerEvent[] {
    if (!task.isSystemTriggered) return [];
    return getTaskTriggerEvents(task).filter((event) =>
        isTriggerEventDataMissing(event, asset, project),
    );
}
