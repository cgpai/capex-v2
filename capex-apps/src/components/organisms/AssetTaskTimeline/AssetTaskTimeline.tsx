
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { EnrichedAsset, User, UserRole, TimelineItem, TaskCurrentStatus, Task, Project, SystemTriggerEvent, WorkflowStep } from '../../../types';
import type { ProjectListTriggerTaskSaveParams } from '../../../screens/CapexProjectList/handleProjectListTriggerTaskSave';
import * as configService from '../../../services/configService';
import * as taskService from '../../../services/taskService';
import * as dataIntegrityService from '../../../services/dataIntegrityService';
import { TaskTimelineItem } from '../../molecules/TaskTimelineItem/TaskTimelineItem';
import { MomTimelineItem } from '../../molecules/MomTimelineItem/MomTimelineItem';
import { AdhocTaskTimelineItem } from '../../molecules/AdhocTaskTimelineItem/AdhocTaskTimelineItem';
import { AuditLogTimelineItem } from '../../molecules/AuditLogTimelineItem/AuditLogTimelineItem';
import { SystemTriggerDataModal } from '../SystemTriggerDataModal/SystemTriggerDataModal';
import {
  getStepAssignedRoles,
  isWorkflowBypassRole,
  resolveWorkflowActionableRole,
} from '../../../lib/workflowRolePolicy';
import {
  assetTimelineCacheKey,
  getCachedAssetTimeline,
  invalidateAssetTimelineCache,
  setCachedAssetTimeline,
} from '../../../lib/assetTimelineCache';
import {
  resolveMyTasksAccessToken,
  upsertFsApprovalViaBe,
} from '../../../services/myTasksApi';
import { getAccessTokenForBackend } from '../../../lib/authSession';

interface AssetTaskTimelineProps {
  asset: EnrichedAsset;
  currentUser: User;
  /** Dipanggil setelah task di-update; opsional assetId agar parent hanya update row yang berubah. */
  onTaskUpdate: (assetId?: string) => void;
  project: Project | null;
  /** Roles from parent screen — avoids empty timeline actions when a separate roles fetch fails. */
  allRoles?: UserRole[];
  onWhatsAppReminder?: (payload: { taskId: string; taskName: string; assignedRoleNames: string[] }) => void;
  /** Project list: save trigger data + complete task via backend (avoids full budget-period load). */
  onTriggerDataSave?: (
    params: Omit<ProjectListTriggerTaskSaveParams, 'currentUser' | 'periodName'>,
  ) => Promise<void>;
}

const TimelineSkeleton: React.FC = () => (
    <div className="relative p-6 space-y-8 animate-pulse" aria-busy="true" aria-label="Memuat timeline task">
        <div className="absolute left-[44px] top-8 bottom-8 w-0.5 bg-siloam-border rounded" />
        {[1, 2, 3, 4].map((n) => (
            <div key={n} className="flex gap-4 pl-2">
                <div className="w-10 h-10 rounded-full bg-siloam-border flex-shrink-0" />
                <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 w-2/3 rounded bg-siloam-border" />
                    <div className="h-3 w-1/2 rounded bg-siloam-border/70" />
                </div>
            </div>
        ))}
    </div>
);

export const AssetTaskTimeline: React.FC<AssetTaskTimelineProps> = ({
  asset,
  currentUser,
  onTaskUpdate,
  project,
  allRoles: parentRoles,
  onWhatsAppReminder,
  onTriggerDataSave,
}) => {
    const workflowSetId = asset.workflowSetId ?? (asset as any).workflow_set_id ?? '';
    const cacheKey = assetTimelineCacheKey(asset.id, String(workflowSetId));
    const initialCache = getCachedAssetTimeline(cacheKey);

    const [timelineItems, setTimelineItems] = useState<TimelineItem[]>(() => initialCache?.items ?? []);
    const [allRoles, setAllRoles] = useState<UserRole[]>(() => initialCache?.roles ?? parentRoles ?? []);
    const [loading, setLoading] = useState(() => !initialCache);
    const [error, setError] = useState<string | null>(null);

    const [triggerModalState, setTriggerModalState] = useState<{
        isOpen: boolean;
        task: Task | null;
        activeTriggerEvents: SystemTriggerEvent[];
    }>({ isOpen: false, task: null, activeTriggerEvents: [] });

    const applyTimelinePayload = useCallback((roles: UserRole[], items: TimelineItem[]) => {
        setAllRoles(roles);
        setTimelineItems(items);
        setCachedAssetTimeline(cacheKey, { items, roles, fetchedAt: Date.now() });
        const workflowItemCount = items.filter((i: TimelineItem) => i.type === 'workflow').length;
        if (workflowItemCount === 0 && workflowSetId) {
            setError('Workflow Set tidak ditemukan atau belum punya step. Cek Configuration → Workflow Sets.');
        } else {
            setError(null);
        }
    }, [cacheKey, workflowSetId]);

    const loadRoles = useCallback(async (): Promise<UserRole[]> => {
        if (parentRoles?.length) return parentRoles;
        return configService.getAllRoles();
    }, [parentRoles]);

    useEffect(() => {
        if (parentRoles?.length) {
            setAllRoles(parentRoles);
        }
    }, [parentRoles]);

    const fetchAndProcessData = useCallback(async () => {
        const cached = getCachedAssetTimeline(cacheKey);
        if (cached) {
            setAllRoles(cached.roles?.length ? cached.roles : (parentRoles ?? []));
            setTimelineItems(cached.items);
            setLoading(false);
            setError(null);
        } else {
            setLoading(true);
            setError(null);
        }
        try {
            if (!workflowSetId || String(workflowSetId).trim() === '') {
                setTimelineItems([]);
                setAllRoles([]);
                setError('Asset ini belum punya Workflow Set. Atur Workflow Set di Configuration → Asset Types atau saat edit asset.');
                setLoading(false);
                return;
            }
            const [roles, items] = await Promise.all([
                loadRoles(),
                taskService.getTimelineForAsset(asset.id, workflowSetId, project?.id),
            ]);
            applyTimelinePayload(roles, items);
            setLoading(false);

            taskService.recalculateAssetTaskStatuses(asset.id)
                .then(() => taskService.getTimelineForAsset(asset.id, workflowSetId, project?.id))
                .then((updatedItems) => {
                    setTimelineItems(updatedItems);
                    setCachedAssetTimeline(cacheKey, {
                        items: updatedItems,
                        roles,
                        fetchedAt: Date.now(),
                    });
                })
                .catch(() => {});
        } catch (err: unknown) {
            console.error('Error fetching task timeline:', err);
            const message = (err as Error)?.message ?? 'Failed to load task details.';
            if (!cached) {
                setError(message);
                setTimelineItems([]);
            }
            setLoading(false);
        }
    }, [asset.id, workflowSetId, project?.id, cacheKey, applyTimelinePayload, loadRoles, parentRoles]);
    
    useEffect(() => {
        fetchAndProcessData();
    }, [fetchAndProcessData]);
    
    /** Refresh timeline di background (tanpa loading screen), lalu beri tahu parent untuk update row saja. */
    const refreshTimelineInBackground = useCallback(async () => {
        if (!workflowSetId || String(workflowSetId).trim() === '') return;
        try {
            await taskService.recalculateAssetTaskStatuses(asset.id);
            const [roles, items] = await Promise.all([
                loadRoles(),
                taskService.getTimelineForAsset(asset.id, workflowSetId, project?.id),
            ]);
            applyTimelinePayload(roles, items);
        } catch (_err) {
        }
    }, [asset.id, workflowSetId, project?.id, applyTimelinePayload, loadRoles]);

    const handleAction = useCallback(async () => {
        invalidateAssetTimelineCache(asset.id);
        await refreshTimelineInBackground();
        onTaskUpdate(asset.id);
    }, [refreshTimelineInBackground, onTaskUpdate, asset.id]);

    const handleTriggerDataSave = async ({
        triggerDataByEvent,
        remark,
    }: {
        triggerDataByEvent: Partial<Record<SystemTriggerEvent, Record<string, unknown>>>;
        remark: string;
    }) => {
        if (!triggerModalState.task || !project) {
            throw new Error('Project data is required to save trigger fields.');
        }

        const stepItem = timelineItems.find(
            (item) => item.type === 'workflow' && item.task.id === triggerModalState.task!.id,
        );
        const workflowStep =
            stepItem?.type === 'workflow' ? (stepItem.step as WorkflowStep) : undefined;
        const assignedRole = workflowStep
            ? resolveWorkflowActionableRole(currentUser, workflowStep, allRoles)
            : undefined;

        if (!assignedRole) {
            throw new Error('Could not find an actionable role to complete the task.');
        }

        if (onTriggerDataSave) {
            await onTriggerDataSave({
                asset,
                project,
                task: triggerModalState.task,
                activeTriggerEvents: triggerModalState.activeTriggerEvents,
                triggerDataByEvent,
                remark,
                assignedRole,
            });
        } else {
            for (const event of triggerModalState.activeTriggerEvents) {
                const triggerData = triggerDataByEvent[event];
                if (event === 'FS_APPROVAL') {
                    if (!triggerData || !String(triggerData.conclusion ?? '').trim()) {
                        throw new Error('FS Conclusion wajib diisi.');
                    }
                    const accessToken = await resolveMyTasksAccessToken(getAccessTokenForBackend);
                    await upsertFsApprovalViaBe({
                        userId: currentUser.id,
                        accessToken,
                        projectId: String(project.id),
                        conclusion: String(triggerData.conclusion),
                        amount:
                            triggerData.amount !== undefined
                                ? Number(triggerData.amount) || 0
                                : undefined,
                        followUpAction:
                            triggerData.followUpAction === undefined
                                ? undefined
                                : triggerData.followUpAction == null
                                  ? null
                                  : String(triggerData.followUpAction),
                        fsType:
                            triggerData.fsType !== undefined
                                ? String(triggerData.fsType)
                                : undefined,
                    });
                    continue;
                }
                if (triggerData && Object.keys(triggerData).length > 0) {
                    await dataIntegrityService.updateTriggerData(
                        asset.id,
                        project.id,
                        event,
                        triggerData,
                        currentUser,
                    );
                }
            }

            const result = await taskService.markTaskAsDone(
                asset.id,
                triggerModalState.task.id,
                remark,
                currentUser,
                assignedRole,
            );
            if (!result.success) {
                throw new Error(result.message);
            }
        }

        await handleAction();
    };

    const isBypassRole = useMemo(() => isWorkflowBypassRole(currentUser), [currentUser]);

    const renderTimelineItem = (item: TimelineItem) => {
        switch (item.type) {
            case 'workflow': {
                const assignedRoles = getStepAssignedRoles(item.step, allRoles);
                // Normalize status: Done if log/completedAt or status Done; Open if status Open; else Locked (sesuai trigger workflow)
                const rawStatus = item.statusInfo?.status;
                const hasCompletion = !!item.log || !!item.statusInfo?.completedAt;
                let normalizedStatus: TaskCurrentStatus;
                if (hasCompletion || rawStatus === TaskCurrentStatus.Done || (typeof rawStatus === 'string' && String(rawStatus).toLowerCase() === 'done')) {
                    normalizedStatus = TaskCurrentStatus.Done;
                } else if (rawStatus === TaskCurrentStatus.Open || (typeof rawStatus === 'string' && String(rawStatus).toLowerCase() === 'open')) {
                    normalizedStatus = TaskCurrentStatus.Open;
                } else {
                    normalizedStatus = TaskCurrentStatus.Locked;
                }
                const actionableRole = resolveWorkflowActionableRole(currentUser, item.step, allRoles);
                // Sesuai kebutuhan operasional: user dengan role step boleh update kapan saja
                // selama task belum Done (tidak dibatasi hanya status Open).
                const canWorkOnStatus = normalizedStatus !== TaskCurrentStatus.Done;
                const isActionable = canWorkOnStatus && !!actionableRole;

                return (
                    <TaskTimelineItem
                        key={`workflow-${item.task.id}`}
                        task={item.task}
                        step={item.step}
                        statusInfo={{ ...item.statusInfo, status: normalizedStatus } as any}
                        log={item.log}
                        assignedRoles={assignedRoles}
                        isActionable={isActionable}
                        actionableRole={actionableRole}
                        onTaskUpdate={handleAction}
                        currentUser={currentUser}
                        asset={asset}
                        project={project}
                        onOpenTriggerModal={(missingEvents) =>
                            setTriggerModalState({
                                isOpen: true,
                                task: item.task,
                                activeTriggerEvents: missingEvents,
                            })
                        }
                        onWhatsAppReminder={onWhatsAppReminder}
                        canEditSla={isBypassRole}
                    />
                );
            }
            case 'mom':
                return <MomTimelineItem key={`mom-${item.mom.id}`} mom={item.mom} />;
            case 'adhoc':
                 return (
                    <AdhocTaskTimelineItem 
                        key={`adhoc-${item.adhocTask.id}`} 
                        task={item.adhocTask}
                        currentUser={currentUser}
                        onTaskUpdate={handleAction}
                    />
                );
            case 'audit':
                return <AuditLogTimelineItem key={`audit-${item.log.id}`} log={item.log} />;
            default:
                return null;
        }
    };

    if (error && timelineItems.length === 0) {
        return <div className="p-8 text-center text-danger">{error}</div>;
    }
    if (timelineItems.length === 0 && !asset.workflowSetId && !loading) {
        return <div className="p-8 text-center text-siloam-text-secondary">No workflow is assigned to this asset.</div>;
    }

    return (
        <div className="relative">
            {loading && timelineItems.length === 0 ? <TimelineSkeleton /> : null}
            {timelineItems.length > 0 ? (
                <div className="relative p-6">
                    {loading ? (
                        <div className="absolute right-4 top-2 z-10 rounded border border-siloam-border bg-siloam-surface/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-siloam-text-secondary">
                            Memperbarui…
                        </div>
                    ) : null}
                    <div className="absolute left-[44px] top-8 bottom-8 w-0.5 bg-siloam-border rounded" />
                    <div className="space-y-8">
                        {timelineItems.map(renderTimelineItem)}
                    </div>
                </div>
            ) : null}
            <SystemTriggerDataModal
                isOpen={triggerModalState.isOpen}
                onClose={() => setTriggerModalState({ isOpen: false, task: null, activeTriggerEvents: [] })}
                onSave={handleTriggerDataSave}
                task={triggerModalState.task}
                asset={asset}
                project={project}
                activeTriggerEvents={triggerModalState.activeTriggerEvents}
            />
        </div>
    );
};
