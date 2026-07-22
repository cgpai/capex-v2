import React, { useState, useEffect } from 'react';
import { Task, AssetTaskStatus, TaskLog, TaskLogRemarkEdit, UserRole, TaskCurrentStatus, User, WorkflowStep, Project, EnrichedAsset, SystemTriggerEvent } from '../../../types';
import * as taskService from '../../../services/taskService';
import { getEffectiveSlaDays } from '../../../lib/workflowRolePolicy';
import { getTaskTriggerEvents } from '../../../lib/systemTriggerEvents';
import { NumericInput } from '../../atoms/NumericInput/NumericInput';
import { useToast } from '../../../contexts/ToastContext';

const WorkflowStatusIcon: React.FC<{ status: TaskCurrentStatus; order: number }> = ({ status, order }) => {
    const baseClasses = "w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg border transition-all duration-200";
    
    // Normalize status to string for comparison (handle both enum and string)
    // TaskCurrentStatus.Done is an enum with value 'Done'
    const statusValue = status;
    
    // Convert to string for comparison
    let statusStr = '';
    if (typeof statusValue === 'string') {
        statusStr = statusValue;
    } else if (statusValue === TaskCurrentStatus.Done) {
        statusStr = 'Done';
    } else if (statusValue === TaskCurrentStatus.Open) {
        statusStr = 'Open';
    } else if (statusValue === TaskCurrentStatus.Locked) {
        statusStr = 'Locked';
    } else {
        statusStr = String(statusValue);
    }
    
    const normalizedStatus = statusStr.trim().toLowerCase();
    
    // Check if status is Done (case-insensitive comparison)
    const isDone = normalizedStatus === 'done' || 
                   statusValue === TaskCurrentStatus.Done;
    
    if (isDone) {
        return (
            <div className={`${baseClasses} bg-siloam-green text-white border-siloam-green`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
            </div>
        );
    }
    
    // Check if status is Open
    const isOpen = normalizedStatus === 'open' || 
                   statusValue === TaskCurrentStatus.Open;
    if (isOpen) {
        return <div className={`${baseClasses} bg-siloam-blue text-white border-siloam-blue`}>{order}</div>;
    }
    
    // Default: Locked or any other status
    return <div className={`${baseClasses} bg-gray-50 text-gray-400 border-gray-300`}>{order}</div>;
};

const SystemBadgeIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
);

const ReportIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6H8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
    </svg>
);

const WhatsAppIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-whatsapp" viewBox="0 0 16 16">
        <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
    </svg>
);

interface RescheduleModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (days: number, reason: string) => Promise<void>;
}

const RescheduleModal: React.FC<RescheduleModalProps> = ({ isOpen, onClose, onSubmit }) => {
    const { showToast } = useToast();
    const [days, setDays] = useState(7);
    const [reason, setReason] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async () => {
        if (!reason.trim() || days <= 0) {
            showToast('Masukkan jumlah hari (positif) dan alasan.', 'error');
            return;
        }
        setIsSubmitting(true);
        await onSubmit(days, reason);
        setIsSubmitting(false);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[52]">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
                <h3 className="text-lg font-bold mb-4">Reschedule Task</h3>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="reschedule-days" className="block text-sm font-medium text-siloam-text-secondary">Days from Today</label>
                        <NumericInput id="reschedule-days" min={1} value={days} onValueChange={setDays} allowDecimal={false} align="left" className="mt-1 block w-full border border-siloam-border rounded-xl p-2" />
                    </div>
                    <div>
                        <label htmlFor="reschedule-reason" className="block text-sm font-medium text-siloam-text-secondary">Reason</label>
                        <textarea id="reschedule-reason" value={reason} onChange={e => setReason(e.target.value)} rows={4} className="mt-1 block w-full border border-siloam-border rounded-xl p-2" placeholder="Explain the reason for the delay..."></textarea>
                    </div>
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || !reason.trim() || days <= 0} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400">
                        {isSubmitting ? 'Submitting...' : 'Reschedule'}
                    </button>
                </div>
            </div>
        </div>
    );
};


interface TaskTimelineItemProps {
    task: Task;
    step: WorkflowStep;
    statusInfo: AssetTaskStatus;
    log: TaskLog | null;
    assignedRoles: UserRole[];
    isActionable: boolean;
    actionableRole?: UserRole;
    onTaskUpdate: () => void;
    currentUser: User;
    asset: EnrichedAsset;
    project: Project | null;
    onOpenTriggerModal: (missingEvents: SystemTriggerEvent[]) => void;
    onWhatsAppReminder?: (payload: { taskId: string; taskName: string; assignedRoleNames: string[] }) => void;
    canEditSla?: boolean;
}

export const TaskTimelineItem: React.FC<TaskTimelineItemProps> = ({ task, step, statusInfo, log, assignedRoles, isActionable, actionableRole, onTaskUpdate, currentUser, asset, project, onOpenTriggerModal, onWhatsAppReminder, canEditSla = false }) => {
    const { showToast } = useToast();
    const [isRemarkVisible, setIsRemarkVisible] = useState(false);
    const [remark, setRemark] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [actionError, setActionError] = useState('');
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [slaDraft, setSlaDraft] = useState<number>(() => getEffectiveSlaDays(step, statusInfo));
    const [isSavingSla, setIsSavingSla] = useState(false);
    const [isEditingRemark, setIsEditingRemark] = useState(false);
    const [editRemark, setEditRemark] = useState(log?.remark ?? '');
    const [displayRemark, setDisplayRemark] = useState(log?.remark ?? '');
    const [remarkEditHistory, setRemarkEditHistory] = useState<TaskLogRemarkEdit[]>(
        () => (Array.isArray(log?.remarkEditHistory) ? log.remarkEditHistory : []),
    );

    useEffect(() => {
        setDisplayRemark(log?.remark ?? '');
        setEditRemark(log?.remark ?? '');
        setRemarkEditHistory(Array.isArray(log?.remarkEditHistory) ? log.remarkEditHistory : []);
        setIsEditingRemark(false);
    }, [log?.id, log?.remark, log?.remarkEditHistory]);

    const effectiveSlaDays = getEffectiveSlaDays(step, statusInfo);
    const hasSlaOverride = statusInfo.slaToCompleteOverride != null;
    const isSuperAdminUser =
        currentUser.assignments?.some(
            (a) =>
                String(a.roleName ?? '')
                    .trim()
                    .toLowerCase()
                    .replace(/\s+/g, ' ') === 'super admin',
        ) ?? false;
    const completedByCurrentUser =
        log != null && Number(log.completedByUserId) === Number(currentUser.id);
    const canEditCompletedRemark =
        !!log &&
        log.completedByType !== 'System' &&
        (completedByCurrentUser || isSuperAdminUser);
    const canRevert =
        !!log && log.completedByType !== 'System' && (completedByCurrentUser || isSuperAdminUser);
    const canReport =
        !!log &&
        log.completedByType !== 'System' &&
        !completedByCurrentUser &&
        !statusInfo.reportedNotYetByUserId;
    const canWithdraw =
        Number(statusInfo.reportedNotYetByUserId) === Number(currentUser.id) ||
        (isSuperAdminUser && !!statusInfo.reportedNotYetByUserId);

    const handleSaveSlaOverride = async () => {
        if (!statusInfo.assetId) return;
        const parsed = slaDraft;
        if (!Number.isFinite(parsed) || parsed < 0) {
            showToast('SLA harus berupa angka hari ≥ 0.', 'error');
            return;
        }
        setIsSavingSla(true);
        try {
            const result = await taskService.updateAssetTaskSlaOverride(statusInfo.assetId, task.id, parsed);
            if (result.success) {
                showToast(result.message, 'success');
                onTaskUpdate();
            } else {
                showToast(result.message, 'error');
            }
        } catch {
            showToast('Gagal menyimpan SLA override.', 'error');
        } finally {
            setIsSavingSla(false);
        }
    };

    const handleClearSlaOverride = async () => {
        if (!statusInfo.assetId) return;
        setIsSavingSla(true);
        try {
            const result = await taskService.updateAssetTaskSlaOverride(statusInfo.assetId, task.id, null);
            if (result.success) {
                setSlaDraft(step.slaToComplete);
                showToast(result.message, 'success');
                onTaskUpdate();
            } else {
                showToast(result.message, 'error');
            }
        } catch {
            showToast('Gagal menghapus SLA override.', 'error');
        } finally {
            setIsSavingSla(false);
        }
    };

    const handleMarkAsDoneClick = () => {
        const configuredEvents = task.isSystemTriggered ? getTaskTriggerEvents(task) : [];
        if (configuredEvents.length > 0) {
            if (!project) {
                showToast(
                    'Data project belum ter-load. Tutup panel lalu buka ulang asset, atau refresh halaman.',
                    'error',
                );
                return;
            }
            // Always open trigger modal for configured events (Create PO, FS Approval, etc.)
            // so users can fill/confirm data — not only when fields are empty.
            onOpenTriggerModal(configuredEvents);
            return;
        }
        if (task.isSystemTriggered) {
            showToast(
                'Task ini System Triggered, tetapi Trigger Event kosong. Periksa Configuration → Tasks (mis. PO_CREATED).',
                'error',
            );
        }
        setIsRemarkVisible(true);
    };

    const handleSubmitRemark = async () => {
        if (!actionableRole || !statusInfo.assetId) {
            showToast('Tidak dapat menyelesaikan task: informasi wajib tidak lengkap.', 'error');
            return;
        }
        if (!remark.trim()) {
            showToast('Remark wajib diisi untuk menyelesaikan task.', 'error');
            return;
        }

        setIsSubmitting(true);
        try {
            const result = await taskService.markTaskAsDone(statusInfo.assetId, task.id, remark, currentUser, actionableRole);
            
            if (result.success) {
                onTaskUpdate();
            } else {
                showToast(`Error: ${result.message}`, 'error');
            }
        } catch (e) {
            console.error("Failed to mark task as done:", e);
            showToast('Terjadi kesalahan tak terduga saat menyelesaikan task.', 'error');
        } finally {
            setIsSubmitting(false);
            setRemark('');
            setIsRemarkVisible(false);
        }
    };
    
    const handleAction = async (action: () => Promise<{ success: boolean; message: string; }>) => {
        setActionError('');
        setIsSubmitting(true);
        try {
            const result = await action();
            if (result.success) {
                showToast(result.message, 'success');
                onTaskUpdate();
            } else {
                setActionError(result.message);
                showToast(result.message, 'error');
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'An unexpected error occurred.';
            setActionError(msg);
            showToast(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleRevert = () => handleAction(() => taskService.revertTaskToOpen(statusInfo.assetId, task.id, currentUser));
    const handleReport = () => handleAction(() => taskService.reportTaskNotYetDone(statusInfo.assetId, task.id, currentUser));
    const handleWithdraw = () => handleAction(() => taskService.withdrawReportNotYetDone(statusInfo.assetId, task.id, currentUser));

    const handleSaveEditedRemark = async () => {
        if (!editRemark.trim()) {
            showToast('Remark wajib diisi.', 'error');
            return;
        }
        setIsSubmitting(true);
        setActionError('');
        try {
            const result = await taskService.updateTaskRemark(
                statusInfo.assetId,
                task.id,
                editRemark,
                currentUser,
            );
            if (result.success) {
                setDisplayRemark(result.remark || editRemark.trim());
                if (result.remarkEditHistory) {
                    setRemarkEditHistory(result.remarkEditHistory);
                }
                setIsEditingRemark(false);
                showToast(result.message, 'success');
                onTaskUpdate();
            } else {
                setActionError(result.message);
                showToast(result.message, 'error');
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Gagal menyimpan remark.';
            setActionError(msg);
            showToast(msg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleRescheduleSubmit = async (days: number, reason: string) => {
        setIsSubmitting(true);
        try {
            const result = await taskService.rescheduleTask(statusInfo.assetId, task.id, days, reason, currentUser);
            if (result.success) {
                onTaskUpdate();
                setIsRescheduleModalOpen(false);
            } else {
                setActionError(result.message);
                showToast(result.message, 'error');
            }
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : 'An unexpected error occurred.';
            setActionError(errorMsg);
            showToast(errorMsg, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleWhatsAppReminder = () => {
        const assignedRoleNames = assignedRoles.map((role) => role.roleName);
        if (onWhatsAppReminder) {
            onWhatsAppReminder({ taskId: task.id, taskName: task.name, assignedRoleNames });
            return;
        }

        const assetCode = asset.assetCode?.trim() || project?.assetCode?.trim() || 'N/A';
        const message = `Halo ${assignedRoleNames.join(', ')},

Mohon perhatiannya untuk task berikut:
*Task Name:* ${task.name}
*Project:* ${project?.projectName || 'N/A'}
*Asset:* ${asset.assetName}
*Kode Asset:* ${assetCode}
*Status:* ${statusInfo.status}
*Due Date:* ${statusInfo.targetEndDate ? new Date(statusInfo.targetEndDate).toLocaleDateString() : 'N/A'}

Mohon segera ditindaklanjuti. Terima kasih.`;

        window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
    };


    // Ensure status is properly typed and normalized
    // statusInfo.status should be TaskCurrentStatus enum, but handle string conversion if needed
    let taskStatus: TaskCurrentStatus = statusInfo?.status || TaskCurrentStatus.Locked;
    
    // If status is a string, try to convert to enum
    if (typeof taskStatus === 'string') {
        if (taskStatus.toLowerCase() === 'done') {
            taskStatus = TaskCurrentStatus.Done;
        } else if (taskStatus.toLowerCase() === 'open') {
            taskStatus = TaskCurrentStatus.Open;
        } else {
            taskStatus = TaskCurrentStatus.Locked;
        }
    }
    // Do NOT force Done from orphan log/completedAt — Revert to Open clears status while logs may linger briefly.
    
    return (
        <>
        <div className="relative flex items-start">
            <div className="flex-shrink-0 z-10">
                <WorkflowStatusIcon status={taskStatus} order={step.order + 1} />
            </div>
            <div className="ml-6 flex-1 pt-1">
                <div className="bg-siloam-bg p-4 rounded-xl">
                    <div className="flex justify-between items-start">
                        <div>
                             <div className="flex items-center gap-2">
                                <p className="font-bold text-lg text-siloam-text-primary">{task.name}</p>
                                {task.isSystemTriggered && (
                                    <div className="relative group">
                                        <SystemBadgeIcon />
                                        <div className="absolute bottom-full mb-2 w-64 bg-white text-siloam-text-primary border border-siloam-border shadow-xl text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 -translate-x-1/2 left-1/2">
                                            This task can be automatically completed by the system.
                                        </div>
                                    </div>
                                )}
                            </div>
                            <p className="text-sm text-siloam-text-secondary">{task.description}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <div className="text-right text-xs">
                                {assignedRoles.length > 0 && (
                                    <>
                                        <p className="font-semibold text-siloam-text-secondary">Assigned To:</p>
                                        {assignedRoles.map(role => (
                                            <span key={role.id} className="block text-siloam-text-primary">{role.roleName}</span>
                                        ))}
                                    </>
                                )}
                            </div>
                            {/* WhatsApp Button - only for Open tasks */}
                            {taskStatus !== TaskCurrentStatus.Done && (
                                <button 
                                    onClick={handleWhatsAppReminder}
                                    className="flex items-center gap-1.5 bg-[#25D366] hover:bg-[#128C7E] text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shadow-sm"
                                    title="Send WhatsApp Reminder"
                                >
                                    <WhatsAppIcon />
                                    <span>Remind</span>
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="text-xs text-siloam-text-secondary mt-2 pt-2 border-t border-siloam-border flex flex-wrap justify-between gap-2">
                         <p>
                            Target SLA:{' '}
                            <span className="font-semibold">{effectiveSlaDays} days</span>
                            {hasSlaOverride && (
                                <span className="ml-1 text-siloam-blue">(override; default workflow: {step.slaToComplete}d)</span>
                            )}
                         </p>
                         {statusInfo.startDate && (
                            <p>Start Date: <span className="font-semibold">{new Date(statusInfo.startDate).toLocaleDateString()}</span></p>
                         )}
                         {statusInfo.targetEndDate && (
                            <p>Target End Date: <span className="font-semibold">{new Date(statusInfo.targetEndDate).toLocaleDateString()}</span></p>
                         )}
                    </div>

                    {canEditSla && taskStatus !== TaskCurrentStatus.Done && (
                        <div className="mt-2 p-2 rounded-lg border border-dashed border-siloam-border bg-siloam-surface/80">
                            <p className="text-xs font-semibold text-siloam-text-secondary mb-1">Override SLA (asset ini saja)</p>
                            <div className="flex flex-wrap items-center gap-2">
                                <NumericInput
                                    min={0}
                                    value={slaDraft}
                                    onValueChange={setSlaDraft}
                                    allowDecimal={false}
                                    align="left"
                                    className="w-20 text-xs p-1.5 rounded border border-siloam-border"
                                />
                                <span className="text-xs">hari</span>
                                <button
                                    type="button"
                                    onClick={handleSaveSlaOverride}
                                    disabled={isSavingSla}
                                    className="text-xs px-2 py-1 rounded bg-siloam-blue text-white disabled:opacity-50"
                                >
                                    Simpan
                                </button>
                                {hasSlaOverride && (
                                    <button
                                        type="button"
                                        onClick={handleClearSlaOverride}
                                        disabled={isSavingSla}
                                        className="text-xs px-2 py-1 rounded border border-siloam-border"
                                    >
                                        Reset ke default
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                    
                    {statusInfo.rescheduledEndDate && (
                        <div className="mt-2 text-xs bg-yellow-100 text-yellow-800 p-2 rounded-lg">
                            <p><span className="font-bold">Rescheduled:</span> New target date is {new Date(statusInfo.rescheduledEndDate).toLocaleDateString()}.</p>
                            <p><span className="font-bold">Reason:</span> {statusInfo.rescheduleReason}</p>
                        </div>
                    )}

                    {taskStatus === TaskCurrentStatus.Done && (
                        <div className="mt-3 pt-3 border-t border-siloam-border space-y-2">
                             {actionError && <p className="text-danger text-xs text-center">{actionError}</p>}
                             <div className="flex items-center justify-end gap-2 flex-wrap">
                                {canRevert && (
                                    <button onClick={handleRevert} disabled={isSubmitting} className="text-xs font-semibold bg-yellow-100 text-yellow-800 px-3 py-1.5 rounded-lg hover:bg-yellow-200 disabled:opacity-50">Revert to Open</button>
                                )}
                                {canReport && (
                                    <button onClick={handleReport} disabled={isSubmitting} className="text-xs font-semibold bg-red-100 text-danger px-3 py-1.5 rounded-lg hover:bg-red-200 disabled:opacity-50">Report Not Yet Done</button>
                                )}
                                {canWithdraw && (
                                    <button onClick={handleWithdraw} disabled={isSubmitting} className="text-xs font-semibold bg-green-100 text-siloam-green px-3 py-1.5 rounded-lg hover:bg-green-200 disabled:opacity-50">Withdraw Report</button>
                                )}
                             </div>
                        </div>
                    )}

                    {taskStatus === TaskCurrentStatus.Done && log && (
                        <div className="mt-4 p-3 bg-siloam-surface rounded-lg border border-siloam-border">
                            <div className="flex items-start justify-between gap-2">
                                <p className="text-sm font-semibold text-siloam-green">Completed</p>
                                {canEditCompletedRemark && !isEditingRemark && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditRemark(displayRemark || log.remark || '');
                                            setIsEditingRemark(true);
                                        }}
                                        className="text-xs font-semibold text-siloam-blue hover:underline"
                                    >
                                        Edit Remark
                                    </button>
                                )}
                            </div>
                            {isEditingRemark ? (
                                <div className="mt-2 space-y-2">
                                    <textarea
                                        value={editRemark}
                                        onChange={(e) => setEditRemark(e.target.value)}
                                        className="w-full p-2 border border-siloam-border rounded-lg bg-siloam-bg text-sm"
                                        rows={3}
                                    />
                                    <div className="flex justify-end gap-2">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setIsEditingRemark(false);
                                                setEditRemark(displayRemark || log.remark || '');
                                            }}
                                            className="px-3 py-1.5 rounded-lg border border-siloam-border text-xs"
                                            disabled={isSubmitting}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void handleSaveEditedRemark()}
                                            disabled={isSubmitting || !editRemark.trim()}
                                            className="px-3 py-1.5 rounded-lg bg-siloam-blue text-white text-xs disabled:bg-gray-400"
                                        >
                                            {isSubmitting ? 'Saving...' : 'Save Remark'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <p className="text-sm my-1 italic">&quot;{displayRemark || log.remark}&quot;</p>
                            )}
                             <p className="text-xs text-siloam-text-secondary">
                                {log.completedByType === 'System' 
                                    ? `By System (triggered by ${log.completedByUsername}) on ${new Date(log.completedAt).toLocaleString()}` 
                                    : `By ${log.completedByUsername} (${log.completedByUserRole}) on ${new Date(log.completedAt).toLocaleString()}`}
                             </p>
                             {remarkEditHistory.length > 0 && (
                                <div className="mt-3 pt-2 border-t border-dashed border-siloam-border space-y-2">
                                    <p className="text-xs font-semibold text-siloam-text-secondary uppercase tracking-wide">
                                        Edit log
                                    </p>
                                    <ul className="space-y-2">
                                        {[...remarkEditHistory].reverse().map((edit, idx) => (
                                            <li
                                                key={`${edit.editedAt}-${idx}`}
                                                className="text-xs text-siloam-text-secondary bg-siloam-bg/80 rounded-lg p-2 border border-siloam-border/70"
                                            >
                                                <p className="font-semibold text-siloam-text-primary">
                                                    {edit.editedByUsername || 'User'} ·{' '}
                                                    {new Date(edit.editedAt).toLocaleString()}
                                                </p>
                                                <p className="mt-1">
                                                    <span className="text-siloam-text-secondary">Dari:</span>{' '}
                                                    <span className="italic">&quot;{edit.previousRemark || '—'}&quot;</span>
                                                </p>
                                                <p>
                                                    <span className="text-siloam-text-secondary">Ke:</span>{' '}
                                                    <span className="italic">&quot;{edit.newRemark}&quot;</span>
                                                </p>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                             )}
                             {statusInfo.reportedNotYetByUserId && (
                                <div className="mt-2 pt-2 border-t border-dashed border-danger/50 text-danger text-sm flex items-center gap-2">
                                    <ReportIcon />
                                    <span>Disputed by {statusInfo.reportedNotYetByUsername}.</span>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Show Reschedule / Mark as Done when workflow says actionable (Open + role) and task not Done */}
                    {isActionable && taskStatus !== TaskCurrentStatus.Done && !isRemarkVisible && (
                        <div className="mt-4 pt-4 border-t border-siloam-border grid grid-cols-2 gap-2">
                            <button
                                onClick={() => setIsRescheduleModalOpen(true)}
                                disabled={isSubmitting}
                                className="w-full bg-yellow-500 text-white font-bold py-2 px-4 rounded-lg hover:bg-yellow-600 disabled:bg-gray-400"
                            >
                                Reschedule
                            </button>
                            <button
                                onClick={handleMarkAsDoneClick}
                                disabled={isSubmitting}
                                className="w-full bg-siloam-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-siloam-blue/90 disabled:bg-gray-400"
                            >
                                Mark as Done
                            </button>
                        </div>
                    )}

                    {isActionable && taskStatus !== TaskCurrentStatus.Done && isRemarkVisible && (
                        <div className="mt-4 pt-4 border-t border-siloam-border">
                            <h4 className="text-sm font-semibold text-siloam-text-primary mb-2">Complete this task as '{actionableRole?.roleName}'</h4>
                            <textarea
                                value={remark}
                                onChange={(e) => setRemark(e.target.value)}
                                placeholder="Add a remark for the log book..."
                                className="w-full p-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                rows={3}
                            />
                             <div className="mt-2 flex justify-end gap-2">
                                <button onClick={() => setIsRemarkVisible(false)} className="px-4 py-2 rounded-lg border border-siloam-border text-sm">Cancel</button>
                                <button
                                    onClick={handleSubmitRemark}
                                    disabled={isSubmitting || !remark}
                                    className="px-4 py-2 rounded-lg bg-siloam-blue text-white text-sm disabled:bg-gray-400"
                                >
                                    {isSubmitting ? 'Submitting...' : 'Submit'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
         <RescheduleModal
            isOpen={isRescheduleModalOpen}
            onClose={() => setIsRescheduleModalOpen(false)}
            onSubmit={handleRescheduleSubmit}
        />
        </>
    );
};
