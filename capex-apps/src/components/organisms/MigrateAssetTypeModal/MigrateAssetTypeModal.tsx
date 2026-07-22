import React, { useState, useEffect, useMemo } from 'react';
import { AssetTypeConfig, User } from '../../../types';
import * as budgetService from '../../../services/budgetService';

interface MigrateAssetTypeModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirmMigrate: (migrationTargetId: string) => void | Promise<void>;
    sourceAssetType: AssetTypeConfig | null;
    allAssetTypes: AssetTypeConfig[];
    currentUser: User;
}

export const MigrateAssetTypeModal: React.FC<MigrateAssetTypeModalProps> = ({
    isOpen,
    onClose,
    onConfirmMigrate,
    sourceAssetType,
    allAssetTypes,
    currentUser,
}) => {
    const [isLoading, setIsLoading] = useState(true);
    const [assetCount, setAssetCount] = useState(0);
    const [migrationTargetId, setMigrationTargetId] = useState('');

    const migrationOptions = useMemo(() => {
        return allAssetTypes.filter((at) => at.isActive && at.id !== sourceAssetType?.id);
    }, [allAssetTypes, sourceAssetType]);

    const targetType = migrationOptions.find((t) => t.id === migrationTargetId);

    useEffect(() => {
        if (!isOpen || !sourceAssetType) return;
        setIsLoading(true);
        const checkUsage = async () => {
            const { count } = await budgetService.isAssetTypeInUse(sourceAssetType, currentUser.id);
            setAssetCount(count);
            setIsLoading(false);
            if (count > 0 && migrationOptions.length > 0) {
                setMigrationTargetId(migrationOptions[0].id);
            } else {
                setMigrationTargetId('');
            }
        };
        void checkUsage();
    }, [isOpen, sourceAssetType, migrationOptions, currentUser.id]);

    if (!isOpen || !sourceAssetType) return null;

    const handleConfirm = async () => {
        if (!migrationTargetId) return;
        setIsLoading(true);
        try {
            await onConfirmMigrate(migrationTargetId);
        } finally {
            setIsLoading(false);
        }
    };

    const canProceed = assetCount > 0 && migrationTargetId && migrationOptions.length > 0;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <div className="flex items-start">
                    <div className="mr-4 flex-shrink-0 flex items-center justify-center h-12 w-12 rounded-full bg-siloam-blue/10 sm:h-10 sm:w-10">
                        <svg
                            className="h-6 w-6 text-siloam-blue"
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth="1.5"
                            stroke="currentColor"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
                            />
                        </svg>
                    </div>
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">
                            Pindahkan data &apos;{sourceAssetType.name}&apos;
                        </h3>
                        <p className="text-sm text-siloam-text-secondary mt-1">
                            Semua asset yang memakai type ini akan dipindahkan ke type lain. Type sumber tetap ada.
                        </p>
                    </div>
                </div>

                <div className="mt-4">
                    {isLoading ? (
                        <p className="text-center">Memeriksa jumlah asset...</p>
                    ) : assetCount === 0 ? (
                        <p className="text-sm text-siloam-text-secondary">
                            Tidak ada asset yang terhubung ke Asset Type ini.
                        </p>
                    ) : migrationOptions.length === 0 ? (
                        <p className="text-danger text-sm font-semibold">
                            Tidak ada Asset Type aktif lain sebagai tujuan. Buat type baru terlebih dahulu.
                        </p>
                    ) : (
                        <div className="space-y-4">
                            <p className="bg-siloam-blue/5 border border-siloam-blue/20 p-3 rounded-lg text-sm text-siloam-text-primary">
                                <strong>{assetCount} asset</strong> akan dipindahkan dari{' '}
                                <strong>{sourceAssetType.name}</strong>
                                {targetType ? (
                                    <>
                                        {' '}
                                        ke <strong>{targetType.name}</strong> (workflow ikut disesuaikan).
                                    </>
                                ) : (
                                    '.'
                                )}
                            </p>
                            <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary">
                                    Pindahkan ke Asset Type:
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
                        </div>
                    )}
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={isLoading || !canProceed}
                        className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? 'Memproses...' : 'Pindahkan data'}
                    </button>
                </div>
            </div>
        </div>
    );
};
MigrateAssetTypeModal.displayName = 'MigrateAssetTypeModal';
