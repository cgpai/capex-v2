'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserRole, HIERARCHY_LEVELS, PermissionLevel, HierarchyLevel, Permission } from '@/types';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import { Dropdown } from '@/components/molecules/Dropdown/Dropdown';
import {
  deleteConfigViaBeOrFallback,
  deleteConfigurationEntityViaBackend,
  saveConfigurationEntityViaBackend,
} from '@/services/configurationCrudApi';
import { RolePermissionsEditor } from '@/features/configuration/users-roles/components/RolePermissionsEditor';
import { getCurrentAppUserIdFromSession } from '@/features/configuration/shared/configSession';
import { allocateNextRoleId } from '@/features/configuration/users-roles/utils/roleIdAllocation';
import { normalizeRolesWithAllLevels } from '@/features/configuration/users-roles/utils/roleNormalization';

export const RoleManagement: React.FC<{
    roles: UserRole[];
    onRolesListPatch?: (roles: UserRole[]) => void;
}> = ({ roles, onRolesListPatch }) => {
    const { showToast } = useToast();
    const [editedRoles, setEditedRoles] = useState<UserRole[]>([]);
    const [isDirty, setIsDirty] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [selectedRoleId, setSelectedRoleId] = useState<number | null>(null);
    const [isAddingNewRole, setIsAddingNewRole] = useState(false);
    const [newRoleName, setNewRoleName] = useState('');

    const persistedRoleIds = useMemo(() => new Set(roles.map((r) => r.id)), [roles]);

    useEffect(() => {
        if (isDirty) return;

        const rolesWithAllLevels = normalizeRolesWithAllLevels(
            JSON.parse(JSON.stringify(roles)) as UserRole[],
        );

        setEditedRoles(rolesWithAllLevels);
        setIsDirty(false);

        if (selectedRoleId && !rolesWithAllLevels.some((r) => r.id === selectedRoleId)) {
            setSelectedRoleId(rolesWithAllLevels.length > 0 ? rolesWithAllLevels[0].id : null);
        } else if (!selectedRoleId && rolesWithAllLevels.length > 0) {
            setSelectedRoleId(rolesWithAllLevels[0].id);
        }
    }, [roles, selectedRoleId, isDirty]);

    const selectedRole = useMemo(
        () => editedRoles.find((r) => r.id === selectedRoleId),
        [editedRoles, selectedRoleId],
    );

    const updatePermission = (level: HierarchyLevel, newPermission: PermissionLevel) => {
        if (!selectedRoleId) return;
        const nextRoles = editedRoles.map((role) => {
            if (role.id !== selectedRoleId) return role;
            const existingPermission = role.permissions.find((p) => p.hierarchy === level);
            const nextPermissions: Permission[] = existingPermission
                ? role.permissions.map((p) =>
                      p.hierarchy === level ? { ...p, permission: newPermission } : p,
                  )
                : [...role.permissions, { hierarchy: level, permission: newPermission }];
            return { ...role, permissions: nextPermissions };
        });
        setEditedRoles(nextRoles);
        onRolesListPatch?.(nextRoles);
        setIsDirty(true);
    };

    const handleStartAddNewRole = () => {
        setIsAddingNewRole(true);
        setNewRoleName('');
    };

    const handleConfirmAddNewRole = () => {
        const trimmed = newRoleName.trim();
        if (!trimmed) {
            showToast('Nama role wajib diisi.', 'error');
            return;
        }
        if (editedRoles.some((r) => r.roleName.toLowerCase() === trimmed.toLowerCase())) {
            showToast('Nama role sudah ada.', 'error');
            return;
        }
        const newId = allocateNextRoleId([...roles, ...editedRoles]);
        const newRole: UserRole = {
            id: newId,
            roleName: trimmed,
            permissions: HIERARCHY_LEVELS.map((level) => ({ hierarchy: level, permission: 'Hide' })),
        };
        setEditedRoles([...editedRoles, newRole]);
        setSelectedRoleId(newId);
        setIsDirty(true);
        setIsAddingNewRole(false);
        setNewRoleName('');
    };

    const handleCancelAddNewRole = () => {
        setIsAddingNewRole(false);
        setNewRoleName('');
    };

    const handleDeleteRole = async (roleId: number | null) => {
        if (!roleId || isSaving) return;
        const roleToDelete = editedRoles.find((r) => r.id === roleId);
        if (!roleToDelete) return;
        if (
            !window.confirm(
                `Hapus role '${roleToDelete.roleName}'? Tindakan ini tidak dapat dibatalkan.`,
            )
        ) {
            return;
        }
        try {
            if (persistedRoleIds.has(roleId)) {
                await deleteConfigViaBeOrFallback('role', roleId);
            }
            const nextRoles = editedRoles.filter((r) => r.id !== roleId);
            setEditedRoles(nextRoles);
            setSelectedRoleId(nextRoles.length > 0 ? nextRoles[0].id : null);
            setIsDirty(false);
            onRolesListPatch?.(nextRoles);
            showToast('Role berhasil dihapus.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus role.', 'error');
        }
    };

    const handleSave = async () => {
        if (isSaving) return;
        setIsSaving(true);
        try {
            const actorId = getCurrentAppUserIdFromSession();
            if (actorId == null) {
                throw new Error('Sesi user tidak ditemukan. Silakan login ulang.');
            }
            const selectedNameBeforeSave = selectedRole?.roleName ?? '';
            const savedRoles = await Promise.all(
                editedRoles.map(async (role) => {
                    const savedFromBe = await saveConfigurationEntityViaBackend<UserRole>(
                        actorId,
                        'role',
                        role,
                        { strictBackend: true },
                    );
                    if (!savedFromBe) {
                        throw new Error(`Gagal menyimpan role '${role.roleName}'.`);
                    }
                    const savedId = Number((savedFromBe as UserRole).id);
                    return {
                        ...role,
                        id: Number.isFinite(savedId) && savedId > 0 ? savedId : role.id,
                        roleName: (savedFromBe as UserRole).roleName || role.roleName,
                    } as UserRole;
                }),
            );
            const nextSelectedId =
                savedRoles.find((r) => r.roleName === selectedNameBeforeSave)?.id ??
                savedRoles[0]?.id ??
                null;
            setEditedRoles(savedRoles);
            setSelectedRoleId(nextSelectedId);
            setIsDirty(false);
            onRolesListPatch?.(savedRoles);
            showToast('Role berhasil disimpan.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menyimpan role.', 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleCancel = () => {
        const restored = normalizeRolesWithAllLevels(
            JSON.parse(JSON.stringify(roles)) as UserRole[],
        );
        setEditedRoles(restored);
        onRolesListPatch?.(restored);
        const currentSelectedName = editedRoles.find((r) => r.id === selectedRoleId)?.roleName;
        const newSelectedId =
            restored.find((r) => r.roleName === currentSelectedName)?.id || restored[0]?.id || null;
        setSelectedRoleId(newSelectedId);
        setIsDirty(false);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-4">
                <div className="flex items-center gap-4">
                    <div className="w-64">
                        <Dropdown
                            label="Select Role to Configure"
                            options={editedRoles.map((r) => r.roleName)}
                            selectedValue={selectedRole?.roleName || ''}
                            onSelect={(roleName) => {
                                const role = editedRoles.find((r) => r.roleName === roleName);
                                if (role) setSelectedRoleId(role.id);
                            }}
                        />
                    </div>
                    {selectedRole && (
                        <button
                            type="button"
                            onClick={() => void handleDeleteRole(selectedRoleId)}
                            disabled={isSaving}
                            className="text-sm self-end mb-2 text-danger hover:underline disabled:opacity-50"
                        >
                            Delete &apos;{selectedRole.roleName}&apos;
                        </button>
                    )}
                </div>

                <div className="flex items-center space-x-2 self-end flex-wrap">
                    {isAddingNewRole ? (
                        <div className="flex items-center gap-2 bg-siloam-bg p-2 rounded-xl border border-siloam-border">
                            <input
                                type="text"
                                value={newRoleName}
                                onChange={(e) => setNewRoleName(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleConfirmAddNewRole()}
                                placeholder="New role name"
                                className="border border-siloam-border rounded-lg px-3 py-1.5 text-sm w-40 focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={handleConfirmAddNewRole}
                                className="px-3 py-1.5 rounded-lg bg-siloam-blue text-white text-sm hover:bg-siloam-blue/90"
                            >
                                Add
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelAddNewRole}
                                className="px-3 py-1.5 rounded-lg border border-siloam-border text-sm hover:bg-siloam-surface"
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={handleStartAddNewRole}
                            disabled={isSaving}
                            className="bg-siloam-blue text-white px-4 py-2 rounded-xl text-sm hover:bg-siloam-blue/90 transition shadow-soft disabled:opacity-50"
                        >
                            + New Role
                        </button>
                    )}
                    {isDirty && (
                        <>
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-xl border text-sm border-siloam-border hover:bg-siloam-bg disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={isSaving}
                                className="px-4 py-2 rounded-xl bg-siloam-green text-sm text-white hover:bg-siloam-green/90 disabled:opacity-50"
                            >
                                {isSaving ? 'Saving…' : 'Save Changes'}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {selectedRole ? (
                <RolePermissionsEditor
                    selectedRole={selectedRole}
                    onUpdatePermission={updatePermission}
                />
            ) : (
                <div className="text-center p-12 bg-siloam-bg rounded-lg">
                    <p className="text-siloam-text-secondary">
                        Please select a role to begin configuration, or create a new one.
                    </p>
                </div>
            )}
        </div>
    );
};

