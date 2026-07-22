import React from 'react';
import { Project, Asset } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface DeleteProjectConfirmModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    project: Project | null;
    /** Remote asset count when nested `project.assets` is not hydrated (Budget HU table). */
    assetCount?: number;
}

export const DeleteProjectConfirmModal: React.FC<DeleteProjectConfirmModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    project,
    assetCount: assetCountProp,
}) => {
    if (!isOpen || !project) return null;

    const assetCount = assetCountProp ?? project.assets?.length ?? 0;

    // Check if project has assets
    const hasAssets = assetCount > 0;
    
    // Check if project has consumed budget
    const hasConsumedBudget = project.consumedBudget > 0;
    
    // Check if project has approved budget
    const hasApprovedBudget = project.approvedBudget > 0;
    
    // Determine if project can be deleted
    const canDelete = !hasAssets;
    const hasWarnings = hasAssets || hasConsumedBudget || hasApprovedBudget;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-2xl">
                <div className="px-6 py-4 border-b border-siloam-border">
                    <h3 className="text-xl font-bold text-siloam-text-primary">
                        {canDelete ? 'Confirm Delete Project' : '⚠️ Cannot Delete Project'}
                    </h3>
                </div>

                <div className="px-6 py-4 space-y-4">
                    <div>
                        <p className="text-sm font-semibold text-siloam-text-primary mb-2">Project Information:</p>
                        <div className="bg-siloam-bg p-3 rounded-lg space-y-1">
                            <p className="text-sm"><span className="font-medium">Code:</span> {project.projectCode}</p>
                            <p className="text-sm"><span className="font-medium">Name:</span> {project.projectName}</p>
                            <p className="text-sm"><span className="font-medium">Budget Plan:</span> {formatCurrency(project.budgetPlan)}</p>
                            <p className="text-sm"><span className="font-medium">Budget Carry Forward:</span> {formatCurrency(project.budgetCarryForward)}</p>
                            <p className="text-sm"><span className="font-medium">Total Budget:</span> {formatCurrency(project.budgetPlan + project.budgetCarryForward)}</p>
                        </div>
                    </div>

                    {hasWarnings && (
                        <div className="space-y-3">
                            <p className="text-sm font-semibold text-danger mb-2">⚠️ This project cannot be deleted because:</p>
                            
                            {hasAssets && (
                                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-red-800 mb-2">
                                        ❌ Has {assetCount} asset(s) associated with this project
                                    </p>
                                    <div className="space-y-2">
                                        <p className="text-xs text-red-700">
                                            Projects with assets cannot be deleted to maintain data integrity and relationships.
                                        </p>
                                        <div className="bg-red-100 p-2 rounded mt-2">
                                            <p className="text-xs font-medium text-red-800 mb-1">
                                                <strong>To delete this project, you must first:</strong>
                                            </p>
                                            <ol className="list-decimal list-inside space-y-1 text-xs text-red-700">
                                                <li>Open the project's Asset Management</li>
                                                <li>Delete all assets in this project</li>
                                                <li>Then you can delete this project</li>
                                            </ol>
                                        </div>
                                        {assetCount > 0 && (
                                            <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                                                <p className="text-xs font-medium text-red-800 mb-1">Assets in this project:</p>
                                                <ul className="list-disc list-inside space-y-1 text-xs text-red-700 max-h-32 overflow-y-auto">
                                                    {(project.assets ?? []).slice(0, 10).map((asset: Asset) => (
                                                        <li key={asset.id}>
                                                            {asset.assetCode} - {asset.assetName}
                                                        </li>
                                                    ))}
                                                    {assetCount > 10 && project.assets?.length ? (
                                                        <li className="text-red-600 italic">... and {assetCount - 10} more asset(s)</li>
                                                    ) : assetCount > 0 && !(project.assets?.length) ? (
                                                        <li className="text-red-600 italic">{assetCount} asset(s) linked to this project</li>
                                                    ) : null}
                                                </ul>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {hasConsumedBudget && !hasAssets && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-yellow-800">
                                        ⚠️ Has consumed budget: {formatCurrency(project.consumedBudget)}
                                    </p>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        This project has financial transactions recorded. Deleting it may affect budget reports.
                                    </p>
                                </div>
                            )}

                            {hasApprovedBudget && !hasAssets && (
                                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                                    <p className="text-sm font-medium text-yellow-800">
                                        ⚠️ Has approved budget: {formatCurrency(project.approvedBudget)}
                                    </p>
                                    <p className="text-xs text-yellow-700 mt-1">
                                        This project has approved budget. Deleting it may affect budget reports.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {canDelete && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <p className="text-sm text-yellow-800">
                                ⚠️ Are you sure you want to delete this project? This action cannot be undone.
                            </p>
                            {(hasConsumedBudget || hasApprovedBudget) && (
                                <p className="text-xs text-yellow-700 mt-2">
                                    <strong>Note:</strong> This project has financial data (consumed/approved budget). 
                                    Deleting it will remove all associated records.
                                </p>
                            )}
                        </div>
                    )}

                    {!canDelete && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                            <p className="text-sm text-blue-800">
                                <strong>How to delete this project:</strong>
                            </p>
                            <ol className="list-decimal list-inside space-y-1 text-sm text-blue-700 mt-2">
                                <li>Click the "<strong>[ {assetCount} ] Assets</strong>" button in the Asset Management column</li>
                                <li>In the Asset Management modal, delete all assets one by one</li>
                                <li>After all assets are deleted, return here and click Delete again</li>
                            </ol>
                        </div>
                    )}
                </div>

                <div className="px-6 py-4 border-t border-siloam-border flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg transition"
                    >
                        {canDelete ? 'Cancel' : 'Close'}
                    </button>
                    {canDelete && (
                        <button
                            onClick={onConfirm}
                            className="px-4 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 transition"
                        >
                            Delete Project
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};


