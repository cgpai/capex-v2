import React from 'react';
import { Asset, AssetTaskStatus, TaskCurrentStatus } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface DeleteAssetConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    asset: Asset | null;
    taskStatuses: AssetTaskStatus[];
    allTasks: Array<{ id: string; name: string }>;
}

export const DeleteAssetConfirmModal: React.FC<DeleteAssetConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    asset,
    taskStatuses,
    allTasks,
}) => {
    if (!isOpen || !asset) return null;

    const completedTasks = taskStatuses.filter((ts) => ts.status === TaskCurrentStatus.Done);
    const hasCompletedTasks = completedTasks.length > 0;
    const hasConsumedBudget = asset.consumedBudget > 0;
    const hasPO = !!asset.poNumber;
    const hasGoodsReceived = asset.isGoodsReceived || false;

    const hasWarnings = hasCompletedTasks || hasConsumedBudget || hasPO || hasGoodsReceived;

    const completedTaskNames = completedTasks.map((ts) => {
        const task = allTasks.find((t) => t.id === ts.taskId);
        return task?.name || ts.taskId;
    });

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-2xl">
                <div className="px-6 py-4 border-b border-siloam-border">
                    <h3 className="text-xl font-bold text-siloam-text-primary">Confirm Delete Asset</h3>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-siloam-text-primary mb-2">Asset Information:</p>
                        <div className="bg-siloam-bg p-3 rounded-lg space-y-1">
                            <p className="text-sm"><span className="font-medium">Code:</span> {asset.assetCode}</p>
                            <p className="text-sm"><span className="font-medium">Name:</span> {asset.assetName}</p>
                            <p className="text-sm"><span className="font-medium">Budget Plan:</span> {formatCurrency(asset.budgetPlan)}</p>
                        </div>
                    </div>

                    {hasWarnings && (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-amber-900">
                                ⚠️ Asset ini memiliki data terkait yang juga akan dihapus:
                            </p>

                            {hasCompletedTasks && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-amber-900 mb-2">
                                        {completedTasks.length} task selesai:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 text-sm text-amber-800">
                                        {completedTaskNames.map((name, idx) => (
                                            <li key={idx}>{name}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {hasConsumedBudget && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-amber-900">
                                        Realisasi budget: {formatCurrency(asset.consumedBudget)}
                                    </p>
                                </div>
                            )}

                            {hasPO && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-amber-900">
                                        Purchase Order: {asset.poNumber}
                                    </p>
                                </div>
                            )}

                            {hasGoodsReceived && (
                                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-amber-900">
                                        Status goods received sudah tercatat
                                    </p>
                                </div>
                            )}

                            <p className="text-xs text-amber-700">
                                Task, log workflow, dan data terkait asset akan ikut dihapus saat perubahan disimpan.
                            </p>
                        </div>
                    )}

                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                        <p className="text-sm text-yellow-800">
                            ⚠️ Yakin ingin menghapus asset ini? Tindakan ini tidak dapat dibatalkan.
                        </p>
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-siloam-border flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg transition"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="px-4 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 transition"
                    >
                        Delete Asset
                    </button>
                </div>
            </div>
        </div>
    );
};

DeleteAssetConfirmModal.displayName = 'DeleteAssetConfirmModal';
