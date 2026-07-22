import React, { useState, useEffect, useMemo } from 'react';
import { Asset, Project, TaskLog } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';
import * as taskService from '../../../services/taskService';
import * as configService from '../../../services/configService';

interface AssetDetailViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: Asset | null;
    project: Project | null;
    categoryName?: string;
    assetTypeName?: string;
}

export const AssetDetailViewModal: React.FC<AssetDetailViewModalProps> = ({
    isOpen,
    onClose,
    asset,
    project,
    categoryName,
    assetTypeName,
}) => {
    const [taskLogs, setTaskLogs] = useState<TaskLog[]>([]);
    const [taskNames, setTaskNames] = useState<Map<string, string>>(new Map());
    const [loadingTaskStatus, setLoadingTaskStatus] = useState(false);

    useEffect(() => {
        if (!isOpen || !asset) {
            setTaskLogs([]);
            setTaskNames(new Map());
            return;
        }
        let cancelled = false;
        setLoadingTaskStatus(true);
        (async () => {
            try {
                const [logs, tasks] = await Promise.all([
                    taskService.getTaskLogsForAsset(asset.id),
                    configService.getAllTasks(),
                ]);
                if (cancelled) return;
                setTaskLogs(logs || []);
                const map = new Map<string, string>();
                (tasks || []).forEach((t: { id: string; name: string }) => map.set(t.id, t.name));
                setTaskNames(map);
            } catch (e) {
                if (!cancelled) {
                    setTaskLogs([]);
                    setTaskNames(new Map());
                }
            } finally {
                if (!cancelled) setLoadingTaskStatus(false);
            }
        })();
        return () => { cancelled = true; };
    }, [isOpen, asset?.id]);

    const lastCompletedTask = useMemo(() => {
        if (!taskLogs.length) return null;
        const sorted = [...taskLogs].sort(
            (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
        );
        return sorted[0];
    }, [taskLogs]);

    const lastCompletedTaskName = lastCompletedTask
        ? taskNames.get(lastCompletedTask.taskId) || lastCompletedTask.taskId
        : '';

    if (!isOpen || !asset || !project) return null;

    const orderedQty = asset.qty || 1;
    const receivedQty = asset.receivedQty || 0;
    const remainingQty = orderedQty - receivedQty;
    const progressPercentage = orderedQty > 0 ? Math.round((receivedQty / orderedQty) * 100) : 0;
    const remainingBudget = asset.budgetPlan - asset.consumedBudget;

    const getReceivingStatus = () => {
        if (receivedQty === 0) {
            return { text: 'Not Received', color: 'text-orange-600', bg: 'bg-orange-100', border: 'border-orange-300' };
        }
        if (receivedQty === orderedQty) {
            return { text: 'Fully Received', color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300' };
        }
        return { text: 'Partially Received', color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300' };
    };
    const receivingStatus = getReceivingStatus();

    const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
        <div>
            <label className="block text-xs font-medium text-siloam-text-secondary mb-1">{label}</label>
            <p className="text-sm font-semibold text-siloam-text-primary">{value ?? '—'}</p>
        </div>
    );

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-3xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-4 border-b border-siloam-border flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">Asset Details</h3>
                        <p className="text-sm text-siloam-text-secondary">{asset.assetCode}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* General Information */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">General Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Asset ID" value={asset.id} />
                            <DetailRow label="Asset Name" value={asset.assetName} />
                            <DetailRow label="Asset Code" value={asset.assetCode} />
                            <DetailRow label="Project" value={project.projectName} />
                            <DetailRow label="Project Code" value={project.projectCode} />
                            <DetailRow label="Budget Category" value={categoryName || asset.budgetCategoryId} />
                            <DetailRow label="Asset Type / Workflow" value={assetTypeName || asset.workflowSetId} />
                            {asset.description && (
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-siloam-text-secondary mb-1">Description</label>
                                    <p className="text-sm text-siloam-text-primary">{asset.description}</p>
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Quantity & Status */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Quantity & Status</h4>
                        <div className="space-y-4">
                            {/* Receiving Status Card */}
                            <div className={`p-4 rounded-lg border-2 ${receivingStatus.bg} ${receivingStatus.border}`}>
                                <div className="flex items-center justify-between">
                                    <span className="font-semibold text-siloam-text-primary">Receiving Status:</span>
                                    <span className={`font-bold ${receivingStatus.color}`}>{receivingStatus.text}</span>
                                </div>
                            </div>

                            {/* Status Task Terakhir (Last Completed Task) */}
                            <div className="p-4 rounded-lg border-2 border-siloam-border bg-siloam-bg">
                                <h5 className="text-sm font-semibold text-siloam-text-primary mb-3">Status Task Terakhir (Diselesaikan)</h5>
                                {loadingTaskStatus ? (
                                    <p className="text-sm text-siloam-text-secondary">Loading...</p>
                                ) : lastCompletedTask ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                                        <div>
                                            <span className="text-siloam-text-secondary">Task:</span>
                                            <p className="font-semibold text-siloam-text-primary">{lastCompletedTaskName}</p>
                                        </div>
                                        <div>
                                            <span className="text-siloam-text-secondary">Selesai pada:</span>
                                            <p className="font-semibold text-siloam-text-primary">
                                                {new Date(lastCompletedTask.completedAt).toLocaleString('id-ID', {
                                                    dateStyle: 'medium',
                                                    timeStyle: 'short',
                                                })}
                                            </p>
                                        </div>
                                        {(lastCompletedTask.completedByUsername || lastCompletedTask.completedByUserRole) && (
                                            <div className="md:col-span-2">
                                                <span className="text-siloam-text-secondary">Diselesaikan oleh:</span>
                                                <p className="font-semibold text-siloam-text-primary">
                                                    {[lastCompletedTask.completedByUsername, lastCompletedTask.completedByUserRole]
                                                        .filter(Boolean)
                                                        .join(' · ')}
                                                    {lastCompletedTask.completedByType === 'System' && ' (System)'}
                                                </p>
                                            </div>
                                        )}
                                        {lastCompletedTask.remark && (
                                            <div className="md:col-span-2">
                                                <span className="text-siloam-text-secondary">Remark:</span>
                                                <p className="text-siloam-text-primary mt-0.5">{lastCompletedTask.remark}</p>
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className="text-sm text-siloam-text-secondary">Belum ada task yang diselesaikan untuk asset ini.</p>
                                )}
                            </div>

                            {/* Quantity Grid */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="p-4 border border-siloam-border rounded-lg bg-siloam-bg">
                                    <div className="text-xs text-siloam-text-secondary uppercase mb-1">Ordered QTY</div>
                                    <div className="text-2xl font-bold text-siloam-text-primary">{orderedQty}</div>
                                </div>
                                <div className="p-4 border border-siloam-border rounded-lg bg-siloam-bg">
                                    <div className="text-xs text-siloam-text-secondary uppercase mb-1">Received QTY</div>
                                    <div className="text-2xl font-bold text-siloam-text-primary">{receivedQty}</div>
                                </div>
                                <div className="p-4 border border-siloam-border rounded-lg bg-siloam-bg">
                                    <div className="text-xs text-siloam-text-secondary uppercase mb-1">Remaining</div>
                                    <div className={`text-2xl font-bold ${remainingQty > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                        {remainingQty}
                                    </div>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between text-xs text-siloam-text-secondary mb-1">
                                    <span>Progress</span>
                                    <span>{progressPercentage}%</span>
                                </div>
                                <div className="w-full bg-siloam-sidebar rounded-full h-3">
                                    <div
                                        className={`h-3 rounded-full transition-all ${
                                            receivedQty === orderedQty ? 'bg-green-500' : receivedQty > 0 ? 'bg-yellow-500' : 'bg-orange-500'
                                        }`}
                                        style={{ width: `${Math.min(100, progressPercentage)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* Budget Information */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Budget Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow label="Budget Plan" value={formatCurrency(asset.budgetPlan)} />
                            <DetailRow label="Budget Allocated" value={formatCurrency(asset.budgetAllocated)} />
                            <DetailRow label="Consumed Budget" value={formatCurrency(asset.consumedBudget)} />
                            <DetailRow label="Remaining Budget" value={formatCurrency(remainingBudget)} />
                        </div>
                    </section>

                    {/* Additional Information */}
                    <section>
                        <h4 className="text-md font-semibold text-siloam-text-primary border-b border-siloam-border pb-2 mb-4">Additional Information</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <DetailRow
                                label="End Target Date"
                                value={asset.endTargetDate ? new Date(asset.endTargetDate).toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' }) : null}
                            />
                            <DetailRow label="PO Number" value={asset.poNumber} />
                            <DetailRow label="Goods Received" value={asset.isGoodsReceived ? 'Yes' : 'No'} />
                            <DetailRow label="BDD Priority" value={asset.bddPriority} />
                            <DetailRow label="Catalogue ID" value={asset.catalogueId} />
                        </div>
                    </section>
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
    );
};

AssetDetailViewModal.displayName = 'AssetDetailViewModal';
