import React, { useCallback } from 'react';
import { AssetTypeConfig, WorkflowSet, User, AssetTypeGroupConfig } from '../../../types';
import { DeleteAssetTypeModal } from '../DeleteAssetTypeModal/DeleteAssetTypeModal';
import { MigrateAssetTypeModal } from '../MigrateAssetTypeModal/MigrateAssetTypeModal';
import { ConfigListHeader } from '@/features/configuration/shared/components/ConfigListHeader';
import { ConfigModalShell } from '@/features/configuration/shared/components/ConfigModalShell';
import { ConfigActiveStatusBadge } from '@/features/configuration/shared/components/ConfigActiveStatusBadge';
import { useAssetTypeManagement } from '@/features/configuration/workflow/hooks/useAssetTypeManagement';
import { useAssetTypeGroupManagement } from '@/features/configuration/workflow/hooks/useAssetTypeGroupManagement';
import { AssetTypeUsageCount } from '@/features/configuration/workflow/components/AssetTypeUsageCount';

export type AssetTypeMasterPatch = {
    assetTypeConfigs: AssetTypeConfig[];
    assetTypeGroups: AssetTypeGroupConfig[];
};

interface AssetTypeGroupEditorFieldsProps {
    draft: Partial<AssetTypeGroupConfig>;
    onChange: (partial: Partial<AssetTypeGroupConfig>) => void;
}

const AssetTypeGroupEditorFields: React.FC<AssetTypeGroupEditorFieldsProps> = ({ draft, onChange }) => (
    <div>
        <label className="block text-sm font-medium text-siloam-text-secondary">Group Name</label>
        <input
            type="text"
            value={draft.name || ''}
            onChange={(e) => onChange({ name: e.target.value })}
            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
        />
    </div>
);

interface AssetTypeEditorFieldsProps {
    draft: Partial<AssetTypeConfig>;
    onChange: (partial: Partial<AssetTypeConfig>) => void;
    workflows: WorkflowSet[];
    assetTypeGroups: AssetTypeGroupConfig[];
}

const AssetTypeEditorFields: React.FC<AssetTypeEditorFieldsProps> = ({
    draft,
    onChange,
    workflows,
    assetTypeGroups,
}) => (
    <div className="space-y-4">
        <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Asset Type Name</label>
            <input
                type="text"
                value={draft.name || ''}
                onChange={(e) => onChange({ name: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            />
        </div>
        <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Asset Type Group</label>
            <select
                value={draft.groupId || ''}
                onChange={(e) => onChange({ groupId: e.target.value || undefined })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
                <option value="">No Group</option>
                {assetTypeGroups.map((g) => (
                    <option key={g.id} value={g.id}>
                        {g.name}
                    </option>
                ))}
            </select>
        </div>
        <div>
            <label className="block text-sm font-medium text-siloam-text-secondary">Associated Workflow</label>
            <select
                value={draft.workflowSetId || ''}
                onChange={(e) => onChange({ workflowSetId: e.target.value })}
                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
            >
                <option value="" disabled>
                    Select a workflow
                </option>
                {workflows.map((wf) => (
                    <option key={wf.id} value={wf.id}>
                        {wf.name}
                    </option>
                ))}
            </select>
        </div>
    </div>
);

/**
 * Asset Types & Groups — data dari Configuration pack (Realtime + patch CRUD lokal).
 */
export const AssetTypeManagement: React.FC<{
    assetTypes: AssetTypeConfig[];
    assetTypeGroups: AssetTypeGroupConfig[];
    workflows: WorkflowSet[];
    onAssetTypesPatched: (patch: AssetTypeMasterPatch) => void;
    currentUser: User;
}> = ({ assetTypes, assetTypeGroups, workflows, onAssetTypesPatched, currentUser }) => {
    const displayTypes = assetTypes ?? [];
    const displayGroups = assetTypeGroups ?? [];

    const commitPatch = useCallback(
        (nextTypes: AssetTypeConfig[], nextGroups: AssetTypeGroupConfig[]) => {
            onAssetTypesPatched({ assetTypeConfigs: nextTypes, assetTypeGroups: nextGroups });
        },
        [onAssetTypesPatched],
    );

    const patchTypes = useCallback(
        (nextTypes: AssetTypeConfig[]) => commitPatch(nextTypes, displayGroups),
        [commitPatch, displayGroups],
    );

    const patchGroups = useCallback(
        (nextGroups: AssetTypeGroupConfig[]) => commitPatch(displayTypes, nextGroups),
        [commitPatch, displayTypes],
    );

    const typeCrud = useAssetTypeManagement(displayTypes, displayGroups, patchTypes, currentUser);
    const groupCrud = useAssetTypeGroupManagement(displayGroups, displayTypes, patchGroups);

    const groupMap = new Map(displayGroups.map((g) => [g.id, g.name]));
    const workflowMap = new Map(workflows.map((wf) => [wf.id, wf.name]));

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1 bg-siloam-bg p-4 rounded-xl">
                <ConfigListHeader
                    title="Asset Type Groups"
                    newButtonLabel="+ New Group"
                    onNew={() => groupCrud.modal.open()}
                />
                <table className="w-full text-left text-sm">
                    <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayGroups.map((g) => (
                            <tr key={g.id} className="bg-siloam-surface border-b border-siloam-border hover:bg-siloam-bg">
                                <td className="px-4 py-3 font-medium">{g.name}</td>
                                <td className="px-4 py-3 space-x-2">
                                    <button
                                        type="button"
                                        onClick={() => groupCrud.modal.open(g)}
                                        className="text-siloam-blue hover:underline"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => groupCrud.remove(g.id)}
                                        className="text-danger hover:underline"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div className="lg:col-span-2">
                <ConfigListHeader
                    title="Asset Types"
                    newButtonLabel="+ New Asset Type"
                    onNew={() => typeCrud.modal.open()}
                />
                <table className="w-full text-left text-sm">
                    <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar">
                        <tr>
                            <th className="px-4 py-3">Name</th>
                            <th className="px-4 py-3">Group</th>
                            <th className="px-4 py-3">Workflow</th>
                            <th className="px-4 py-3">Status</th>
                            <th className="px-4 py-3">Assets</th>
                            <th className="px-4 py-3">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {displayTypes.map((at) => (
                            <tr key={at.id} className="bg-siloam-surface border-b border-siloam-border hover:bg-siloam-bg">
                                <td className="px-4 py-3 font-medium">{at.name}</td>
                                <td className="px-4 py-3">{at.groupId ? groupMap.get(at.groupId) : 'N/A'}</td>
                                <td className="px-4 py-3">{workflowMap.get(at.workflowSetId) || 'N/A'}</td>
                                <td className="px-4 py-3">
                                    <ConfigActiveStatusBadge isActive={at.isActive} />
                                </td>
                                <td className="px-4 py-3">
                                    <AssetTypeUsageCount
                                        key={`${at.id}-${typeCrud.usageRefreshKey}`}
                                        assetType={at}
                                        userId={currentUser.id}
                                    />
                                </td>
                                <td className="px-4 py-3 space-x-2">
                                    <button
                                        type="button"
                                        onClick={() => typeCrud.modal.open(at)}
                                        className="text-siloam-blue hover:underline"
                                    >
                                        Edit
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => typeCrud.openMigrate(at)}
                                        className="text-siloam-blue hover:underline"
                                    >
                                        Pindahkan
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => typeCrud.toggleActive(at)}
                                        className="text-siloam-blue hover:underline"
                                    >
                                        {at.isActive ? 'Hide' : 'Show'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => typeCrud.openDelete(at)}
                                        className="text-danger hover:underline"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {groupCrud.modal.isOpen && groupCrud.modal.draft && (
                <ConfigModalShell
                    title={groupCrud.modal.isEditing ? 'Edit Asset Type Group' : 'Create Asset Type Group'}
                    onClose={groupCrud.modal.close}
                    onSave={groupCrud.save}
                >
                    <AssetTypeGroupEditorFields draft={groupCrud.modal.draft} onChange={groupCrud.modal.patchDraft} />
                </ConfigModalShell>
            )}

            {typeCrud.modal.isOpen && typeCrud.modal.draft && (
                <ConfigModalShell
                    title={typeCrud.modal.isEditing ? 'Edit Asset Type' : 'Create Asset Type'}
                    onClose={typeCrud.modal.close}
                    onSave={typeCrud.save}
                >
                    <AssetTypeEditorFields
                        draft={typeCrud.modal.draft}
                        onChange={typeCrud.modal.patchDraft}
                        workflows={workflows}
                        assetTypeGroups={displayGroups}
                    />
                </ConfigModalShell>
            )}

            <MigrateAssetTypeModal
                isOpen={!!typeCrud.migrateSource}
                onClose={typeCrud.closeMigrate}
                onConfirmMigrate={typeCrud.confirmMigrate}
                sourceAssetType={typeCrud.migrateSource}
                allAssetTypes={displayTypes}
                currentUser={currentUser}
            />

            <DeleteAssetTypeModal
                isOpen={!!typeCrud.deleteTarget}
                onClose={typeCrud.closeDelete}
                onConfirmDelete={typeCrud.confirmDelete}
                assetTypeToDelete={typeCrud.deleteTarget}
                allAssetTypes={displayTypes}
                currentUser={currentUser}
            />
        </div>
    );
};
AssetTypeManagement.displayName = 'AssetTypeManagement';
