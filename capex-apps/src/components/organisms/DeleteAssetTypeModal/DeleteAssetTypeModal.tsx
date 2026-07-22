import React, { useState, useEffect, useMemo } from 'react';
import { AssetTypeConfig, User } from '../../../types';
import * as budgetService from '../../../services/budgetService';

interface DeleteAssetTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmDelete: (migrationTargetId?: string) => void | Promise<void>;
    assetTypeToDelete: AssetTypeConfig | null;
    allAssetTypes: AssetTypeConfig[];
    currentUser: User;
}

export const DeleteAssetTypeModal: React.FC<DeleteAssetTypeModalProps> = ({
    isOpen,
    onClose,
    onConfirmDelete,
    assetTypeToDelete,
    allAssetTypes,
    currentUser,
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [assetCount, setAssetCount] = useState(0);
    const [migrationTargetId, setMigrationTargetId] = useState('');

    const migrationOptions = useMemo(() => {
        return allAssetTypes.filter((at) => at.isActive && at.id !== assetTypeToDelete?.id);
    }, [allAssetTypes, assetTypeToDelete]);

    useEffect(() => {
        if (isOpen && assetTypeToDelete) {
            setIsLoading(true);
            const checkUsage = async () => {
                const { count } = await budgetService.isAssetTypeInUse(assetTypeToDelete, currentUser.id);
                setAssetCount(count);
                setIsLoading(false);
                if (count > 0 && migrationOptions.length > 0) {
                    setMigrationTargetId(migrationOptions[0].id);
                } else {
                    setMigrationTargetId('');
                }
            };
            void checkUsage();
        }
    }, [isOpen, assetTypeToDelete, migrationOptions, currentUser.id]);

    if (!isOpen || !assetTypeToDelete) return null;

    const handleConfirm = async () => {
        setIsLoading(true);
        try {
            await onConfirmDelete(assetCount > 0 ? migrationTargetId : undefined);
        } finally {
            setIsLoading(false);
        }
    };

    const isMigrationRequired = assetCount > 0;
    const canProceed = !isMigrationRequired || (migrationTargetId && migrationOptions.length > 0);

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <div className="flex items-start">
                    <div className="mr-4 flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-danger/10 sm:h-10 sm:w-10">
                        <svg
                            className="h-6 w-6 text-danger"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">
                            Delete &apos;{assetTypeToDelete.name}&apos;?
                        </h3>
                        <p className="text-sm text-siloam-text-secondary mt-1">This action cannot be undone.</p>
                    </div>
                </div>

                <div className="mt-4">
                    {isLoading ? (
                        <p className="text-center">Checking asset usage...</p>
                    ) : (
                        <>
                            {isMigrationRequired ? (
                                <div className="space-y-4">
                                    <p className="bg-yellow-50 border border-yellow-200 p-3 rounded-lg text-sm text-yellow-800">
                                        This Asset Type is currently assigned to <strong>{assetCount} asset(s)</strong>.
                                        To delete it, you must first migrate these assets to another type.
                                    </p>
                                    {migrationOptions.length > 0 ? (
                                        <div>
                                            <label className="block text-sm font-medium text-siloam-text-secondary">
                                                Migrate assets to:
                                            </label>
                                            <select
                                                value={migrationTargetId}
                                                onChange={(e) => setMigrationTargetId(e.target.value)}
                                                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                            >
                                                {migrationOptions.map((opt) => (
                                                    <option key={opt.id} value={opt.id}>
                                                        {opt.name}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    ) : (
                                        <p className="text-danger text-sm font-semibold">
                                            There are no other active Asset Types to migrate to. Please create a new one
                                            before deleting this.
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <p>This Asset Type is not currently in use by any assets and can be safely deleted.</p>
                            )}
                        </>
                    )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isLoading || !canProceed}
                        className="px-4 py-2 rounded-xl bg-danger text-white hover:bg-danger/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Processing...' : isMigrationRequired ? 'Migrate & Delete' : 'Confirm Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
};
DeleteAssetTypeModal.displayName = 'DeleteAssetTypeModal';
