'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { User, UserRole, ArchetypeConfig, HospitalUnitConfig } from '@/types';
import * as configService from '@/services/configService';
import { useToast } from '@/contexts/ToastContext';
import { getAccessTokenForBackend } from '@/lib/authSession';
import { useBackendSession } from '@/lib/auth/authConstants';
import { resolveMyTasksAccessToken } from '@/services/myTasksApi';
import * as userAdminApi from '@/services/userAdminApi';
import type { OfficeListDiffRow } from '@/services/userAdminApi';
import { fetchConfigurationSlicesFromBackend } from '@/services/configurationApi';
import { deleteConfigViaBeOrFallback, saveConfigurationEntityViaBackend } from '@/services/configurationCrudApi';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { getCurrentAppUserIdFromSession } from '@/features/configuration/shared/configSession';
import { USER_TABLE_PAGE_SIZE, USER_TABLE_SCROLL_THRESHOLD_PX, MAX_OFFICE_UPLOAD_SIZE_BYTES } from '@/features/configuration/shared/configConstants';
import { UserEditorModal } from './UserEditorModal';
import { UserTableRow } from './UserTableRow';

export const UserManagement: React.FC<{
    users: User[];
    roles: UserRole[];
    archetypes: ArchetypeConfig[];
    hospitalUnits: HospitalUnitConfig[];
    currentUserId: number;
    /** Setelah simpan user: refresh slice users lewat BE lalu notifikasi app. */
    onUsersChange: () => void | Promise<void>;
    /** Hanya mengganti daftar user di state lokal + sidebar global, tanpa fetch seluruh tab konfigurasi. */
    patchUsersList: (nextUsers: User[]) => void;
}> = ({ users, roles, archetypes, hospitalUnits, currentUserId, onUsersChange, patchUsersList }) => {
    const { showToast } = useToast();
    const [effectiveUsers, setEffectiveUsers] = useState<User[]>(users);
    const [effectiveRoles, setEffectiveRoles] = useState<UserRole[]>(roles);
    const [selectedUser, setSelectedUser] = useState<Partial<User> | null>(null);
    const [isSavingUser, setIsSavingUser] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebouncedValue(searchTerm, 280);
    const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('');
    const [visibleUserCount, setVisibleUserCount] = useState(USER_TABLE_PAGE_SIZE);
    const [syncingAuth, setSyncingAuth] = useState(false);
    const officeFileInputRef = useRef<HTMLInputElement>(null);
    const [officeDiffLoading, setOfficeDiffLoading] = useState(false);
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [officeDiff, setOfficeDiff] = useState<null | {
        filename: string;
        officeEmailCount: number;
        notInOffice: OfficeListDiffRow[];
    }>(null);
    const [selectedMismatchIds, setSelectedMismatchIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        if (users.length > 0) setEffectiveUsers(users);
    }, [users]);

    useEffect(() => {
        if (roles.length > 0) setEffectiveRoles(roles);
    }, [roles]);

    useEffect(() => {
        let cancelled = false;
        const hydrateUsersAndRoles = async () => {
            if (users.length > 0 && roles.length > 0) return;
            try {
                const token = await resolveMyTasksAccessToken(getAccessTokenForBackend);
                if (!useBackendSession() && !token) return;
                const fromBackend = await fetchConfigurationSlicesFromBackend(
                    token,
                    currentUserId,
                    ['users', 'roles'],
                );
                if (cancelled || !fromBackend) return;
                if (Array.isArray(fromBackend.users)) {
                    setEffectiveUsers(fromBackend.users);
                }
                if (Array.isArray(fromBackend.roles)) {
                    setEffectiveRoles(fromBackend.roles);
                }
            } catch {
                // keep whatever currently available
            }
        };
        void hydrateUsersAndRoles();
        return () => {
            cancelled = true;
        };
    }, [users, roles, currentUserId]);

    const selectableMismatch = useMemo(
        () => (officeDiff?.notInOffice ?? []).filter((r) => r.id !== currentUserId),
        [officeDiff, currentUserId],
    );

    const allSelectableSelected =
        selectableMismatch.length > 0 && selectableMismatch.every((r) => selectedMismatchIds.has(r.id));

    const toggleSelectAllMismatch = () => {
        if (allSelectableSelected) {
            setSelectedMismatchIds(new Set());
        } else {
            setSelectedMismatchIds(new Set(selectableMismatch.map((r) => r.id)));
        }
    };

    const toggleMismatchRow = (id: number) => {
        if (id === currentUserId) return;
        setSelectedMismatchIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSaveUser = async (user: User | Partial<User>) => {
        if (isSavingUser) return;
        const MAX_APP_USER_ID = 2147483647;
        setIsSavingUser(true);
        try {
            const rawId = user.id;
            const nextUserId =
                effectiveUsers.reduce((max, u) => (u.id > max ? u.id : max), 0) + 1;
            const stableId =
                typeof rawId === 'number' &&
                rawId > 0 &&
                rawId <= MAX_APP_USER_ID
                    ? rawId
                    : nextUserId;
            const archetypeNameToId = new Map(archetypes.map((a) => [a.name, a.id]));
            const huNameToId = new Map(hospitalUnits.map((hu) => [hu.name, hu.id]));
            const roleNameToId = new Map(effectiveRoles.map((r) => [r.roleName, r.id]));
            const normalizedAssignments = (user.assignments || []).map((a) => {
                const normalizedScopes = Array.from(
                    new Set(
                        (a.assignedScopes || [])
                            .map((s) => {
                                if (!s) return s;
                                if (s === 'All') return 'All';
                                if (s.startsWith('ARCH-') || s.startsWith('HU-')) return s;
                                return archetypeNameToId.get(s) || huNameToId.get(s) || s;
                            })
                            .filter(Boolean),
                    ),
                );
                return {
                    ...a,
                    roleId: roleNameToId.get(a.roleName),
                    assignedScopes: normalizedScopes,
                };
            });
            const userToSave = {
                ...user,
                id: stableId,
                assignments: normalizedAssignments,
            };
            const actorId = getCurrentAppUserIdFromSession();
            if (actorId == null) {
                throw new Error('Sesi user tidak ditemukan. Silakan login ulang.');
            }
            const savedFromBe = await saveConfigurationEntityViaBackend<User>(
                actorId,
                'user',
                userToSave as User,
                { strictBackend: true },
            );
            if (!savedFromBe) {
                throw new Error('Gagal menyimpan user ke backend.');
            }
            setSelectedUser(null);
            const savedUser: User = {
                ...(userToSave as User),
                ...(savedFromBe as User),
                assignments: Array.isArray((savedFromBe as User).assignments)
                    ? (savedFromBe as User).assignments
                    : normalizedAssignments,
            };
            const nextUsers = (() => {
                const idx = effectiveUsers.findIndex((u) => u.id === savedUser.id);
                if (idx >= 0) {
                    const next = [...effectiveUsers];
                    next[idx] = savedUser;
                    return next;
                }
                return [...effectiveUsers, savedUser];
            })();
            setEffectiveUsers(nextUsers);
            patchUsersList(nextUsers);
            await Promise.resolve(onUsersChange());
            showToast('User dan scope berhasil disimpan.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menyimpan user.', 'error');
        } finally {
            setIsSavingUser(false);
        }
    };

    const handleNewUser = () => {
        setSelectedUser({ username: '', email: '', phoneNumber: '', assignments: [] });
    };

    const handleDeleteUser = async (id: number) => {
        if (!window.confirm('Are you sure you want to delete this user?')) return;
        try {
            await deleteConfigViaBeOrFallback('user', id);
            const nextUsers = effectiveUsers.filter((u) => u.id !== id);
            setEffectiveUsers(nextUsers);
            patchUsersList(nextUsers);
            setOfficeDiff((prev) =>
                prev ? { ...prev, notInOffice: prev.notInOffice.filter((r) => r.id !== id) } : null,
            );
            setSelectedMismatchIds((prev) => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
            showToast('User berhasil dihapus.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus user.', 'error');
        }
    };

    const getSessionToken = async (): Promise<string | null> => {
        if (useBackendSession()) return null;
        return resolveMyTasksAccessToken(getAccessTokenForBackend);
    };

    const runBulkDeleteViaBe = async (ids: number[]) => {
        const token = await getSessionToken();
        if (!useBackendSession() && !token) {
            showToast('Sesi login tidak ditemukan.', 'error');
            return;
        }
        const filtered = [...new Set(ids.map(Number))].filter((n) => Number.isFinite(n) && n > 0 && n !== currentUserId);
        if (!filtered.length) {
            showToast('Tidak ada user yang dapat dihapus (akun Anda tidak dipilih).', 'error');
            return;
        }
        await userAdminApi.postBulkDeleteUsers(filtered, token, currentUserId);
        const removed = new Set(filtered);
        patchUsersList(users.filter((u) => !removed.has(u.id)));
        setOfficeDiff((prev) =>
            prev ? { ...prev, notInOffice: prev.notInOffice.filter((r) => !removed.has(r.id)) } : null,
        );
        setSelectedMismatchIds((prev) => {
            const next = new Set(prev);
            filtered.forEach((i) => next.delete(i));
            return next;
        });
    };

    const handleSyncToAuth = async () => {
        if (
            !window.confirm(
                'Sinkronkan semua user dari tabel users ke Supabase Auth? ' +
                    'User baru dibuat dengan password 123456. User yang sudah ada di Auth akan di-reset password ke 123456.',
            )
        ) {
            return;
        }
        setSyncingAuth(true);
        try {
            const result = await configService.syncUsersToAuth(currentUserId);
            const msg =
                `Auth sync: ${result.created} dibuat, ${result.updated ?? 0} di-update, ${result.skipped} dilewati. ` +
                `${result.errors.length ? `Error: ${result.errors.join('; ')}` : 'Password default: 123456.'}`;
            showToast(msg.trim(), result.errors.length ? 'error' : 'success');
        } catch (e) {
            showToast((e instanceof Error ? e.message : 'Sync gagal') + '', 'error');
        } finally {
            setSyncingAuth(false);
        }
    };

    const handleOfficeListFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        const lowerName = file.name.toLowerCase();
        const allowedExt = lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls') || lowerName.endsWith('.csv');
        if (!allowedExt) {
            showToast('Format file tidak valid. Gunakan .xlsx, .xls, atau .csv.', 'error');
            return;
        }
        if (file.size > MAX_OFFICE_UPLOAD_SIZE_BYTES) {
            showToast('Ukuran file maksimal 5MB untuk proses cepat dan aman.', 'error');
            return;
        }
        const base = (process.env.NEXT_PUBLIC_CAPEXBE_URL || '').replace(/\/$/, '').trim();
        if (!base) {
            showToast('NEXT_PUBLIC_CAPEXBE_URL belum diset — pemrosesan lewat server tidak tersedia.', 'error');
            return;
        }
        const token = await getSessionToken();
        if (!token) {
            showToast('Sesi login tidak ditemukan.', 'error');
            return;
        }
        setOfficeDiffLoading(true);
        try {
            const res = await userAdminApi.postOfficeListDiff(file, token, currentUserId);
            setOfficeDiff({
                filename: res.filename,
                officeEmailCount: res.officeEmailCount,
                notInOffice: res.notInOffice,
            });
            setSelectedMismatchIds(new Set(res.notInOffice.filter((r) => r.id !== currentUserId).map((r) => r.id)));
            showToast(
                `Server: ${res.officeEmailCount} email di berkas · ${res.notInOffice.length} user tidak ada di daftar kantor.`,
                'success',
            );
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Gagal memproses berkas lewat server.', 'error');
        } finally {
            setOfficeDiffLoading(false);
        }
    };

    const clearOfficeDiff = () => {
        setOfficeDiff(null);
        setSelectedMismatchIds(new Set());
    };

    const handleDeleteSelectedMismatch = async () => {
        const ids = Array.from(selectedMismatchIds).filter((id) => id !== currentUserId);
        if (!ids.length) {
            showToast('Centang minimal satu user (selain akun Anda).', 'error');
            return;
        }
        if (!window.confirm(`Hapus ${ids.length} user terpilih dari database? Tindakan ini tidak dapat dibatalkan.`)) return;
        setBulkDeleting(true);
        try {
            await runBulkDeleteViaBe(ids);
            showToast(`${ids.length} user dihapus.`, 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus user.', 'error');
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleDeleteAllMismatch = async () => {
        const ids = selectableMismatch.map((r) => r.id);
        if (!ids.length) return;
        if (!window.confirm(`Hapus ${ids.length} user (semua yang tidak di daftar kantor, kecuali akun Anda)?`)) return;
        setBulkDeleting(true);
        try {
            await runBulkDeleteViaBe(ids);
            showToast(`${ids.length} user dihapus.`, 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus user.', 'error');
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleDeleteMismatchRow = async (id: number) => {
        if (id === currentUserId) {
            showToast('Akun Anda tidak dapat dihapus dari sini.', 'error');
            return;
        }
        if (!window.confirm('Hapus user ini dari database?')) return;
        setBulkDeleting(true);
        try {
            await runBulkDeleteViaBe([id]);
            showToast('User dihapus.', 'success');
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menghapus user.', 'error');
        } finally {
            setBulkDeleting(false);
        }
    };

    useEffect(() => {
        setVisibleUserCount(USER_TABLE_PAGE_SIZE);
    }, [debouncedSearch, selectedRoleFilter, users.length]);

    const indexedUsers = useMemo(
        () =>
            effectiveUsers.map((user) => ({
                user,
                usernameLower: user.username.toLowerCase(),
                emailLower: user.email.toLowerCase(),
            })),
        [effectiveUsers],
    );

    const filteredUsers = useMemo(() => {
        const q = debouncedSearch.trim().toLowerCase();
        const bySearchAndRole = indexedUsers
            .filter(({ user, usernameLower, emailLower }) => {
            const matchesSearch =
                !q ||
                    usernameLower.includes(q) ||
                    emailLower.includes(q);

            const matchesRole = selectedRoleFilter
                ? (user.assignments || []).some((a) => a.roleName === selectedRoleFilter)
                : true;

            return matchesSearch && matchesRole;
            })
            .map(({ user }) => user);
        // UX fallback: when no search keyword is used, never hide the entire user list
        // just because a stale role filter yields zero rows.
        if (!q && bySearchAndRole.length === 0 && effectiveUsers.length > 0) {
            return effectiveUsers;
        }
        return bySearchAndRole;
    }, [effectiveUsers, indexedUsers, debouncedSearch, selectedRoleFilter]);

    useEffect(() => {
        if (!selectedRoleFilter) return;
        if (effectiveRoles.some((r) => r.roleName === selectedRoleFilter)) return;
        setSelectedRoleFilter('');
    }, [effectiveRoles, selectedRoleFilter]);

    const visibleUsers = useMemo(
        () => filteredUsers.slice(0, visibleUserCount),
        [filteredUsers, visibleUserCount],
    );

    const hasMoreUsers = visibleUserCount < filteredUsers.length;
    const handleUsersTableScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        if (!hasMoreUsers) return;
        const el = e.currentTarget;
        const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (remaining <= USER_TABLE_SCROLL_THRESHOLD_PX) {
            setVisibleUserCount((prev) => Math.min(prev + USER_TABLE_PAGE_SIZE, filteredUsers.length));
        }
    }, [filteredUsers.length, hasMoreUsers]);

    const scopeLabelMap = useMemo(() => {
        const m = new Map<string, string>();
        m.set('All', 'All');
        archetypes.forEach(a => {
            m.set(a.id, `Network: ${a.name}`);
            m.set(a.name, `Network: ${a.name}`);
        });
        hospitalUnits.forEach(hu => {
            const label = hu.code ? `Unit: ${hu.code} - ${hu.name}` : `Unit: ${hu.name}`;
            m.set(hu.id, label);
            m.set(hu.name, label);
        });
        return m;
    }, [archetypes, hospitalUnits]);

    const formatScopes = useCallback((scopes: string[]) => {
        if (!scopes?.length) return '';
        return scopes
            .map(s => scopeLabelMap.get(s) || s)
            .join(', ');
    }, [scopeLabelMap]);

    return (
        <div className="bg-siloam-surface p-6 rounded-xl shadow-soft">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <div className="flex items-center gap-4 flex-1 w-full">
                    {/* Search Input */}
                    <div className="relative flex-1 max-w-md">
                        <input
                            type="text"
                            placeholder="Search users by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-siloam-border rounded-xl focus:outline-none focus:ring-2 focus:ring-siloam-blue text-sm"
                        />
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-text-secondary absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>

                    {/* Role Filter */}
                    <select
                        value={selectedRoleFilter}
                        onChange={(e) => setSelectedRoleFilter(e.target.value)}
                        className="px-4 py-2 border border-siloam-border rounded-xl focus:outline-none focus:ring-2 focus:ring-siloam-blue text-sm bg-white"
                    >
                        <option value="">All Roles</option>
                        {effectiveRoles.map(role => (
                            <option key={role.id} value={role.roleName}>{role.roleName}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSyncToAuth}
                        disabled={syncingAuth || effectiveUsers.length === 0}
                        className="bg-siloam-green text-white px-4 py-2 rounded-xl hover:bg-siloam-green/90 transition shadow-soft text-sm font-semibold whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Sinkronkan semua user ke Supabase Auth agar bisa login email/password"
                    >
                        {syncingAuth ? 'Syncing...' : 'Sync ke Auth'}
                    </button>
                    <button onClick={handleNewUser} className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 transition shadow-soft text-sm font-semibold whitespace-nowrap">
                        + New User
                    </button>
                </div>
            </div>

            <div className="mb-6 p-4 border border-dashed border-siloam-border rounded-xl bg-siloam-bg/40">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                    <div>
                        <h4 className="text-sm font-semibold text-siloam-text-primary">Cek email vs daftar kantor (Excel / CSV)</h4>
                        <p className="text-xs text-siloam-text-secondary mt-1 max-w-2xl">
                            Unggah file Excel (.xlsx, .xls) atau CSV (.csv). Pembandingan dan daftar user dilakukan di server (
                            <span className="font-medium">capexbe</span>) agar ringan. Centang baris lalu hapus terpilih, atau hapus
                            semua yang tampil — tanpa memuat ulang seluruh data konfigurasi.
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <input
                            ref={officeFileInputRef}
                            type="file"
                            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                            className="hidden"
                            onChange={handleOfficeListFile}
                        />
                        <button
                            type="button"
                            disabled={officeDiffLoading}
                            onClick={() => officeFileInputRef.current?.click()}
                            className="bg-white border border-siloam-border text-siloam-text-primary px-3 py-2 rounded-xl text-sm font-semibold hover:bg-siloam-bg/80 transition disabled:opacity-50"
                        >
                            {officeDiffLoading ? 'Memproses…' : 'Unggah Excel / CSV'}
                        </button>
                        {officeDiff && (
                            <button
                                type="button"
                                onClick={clearOfficeDiff}
                                className="text-siloam-text-secondary px-3 py-2 rounded-xl text-sm font-medium hover:bg-siloam-border/30 transition"
                            >
                                Hapus pembanding
                            </button>
                        )}
                    </div>
                </div>
                {officeDiff && (
                    <div className="mt-4 space-y-3">
                        <p className="text-xs text-siloam-text-secondary">
                            Berkas: <span className="font-medium text-siloam-text-primary">{officeDiff.filename}</span>
                            {' · '}
                            {officeDiff.officeEmailCount} email unik di berkas (server)
                        </p>
                        {officeDiff.notInOffice.length === 0 ? (
                            <p className="text-sm text-siloam-green font-medium">
                                Semua user aplikasi cocok dengan daftar kantor (termasuk penanganan email kosong).
                            </p>
                        ) : (
                            <>
                                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2 flex-wrap">
                                    <p className="text-sm text-siloam-text-primary">
                                        <span className="font-bold text-amber-700">{officeDiff.notInOffice.length}</span> user tidak
                                        ada di daftar kantor. Akun login Anda tidak dapat dipilih untuk dihapus.
                                    </p>
                                    <div className="flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            disabled={bulkDeleting || selectedMismatchIds.size === 0}
                                            onClick={handleDeleteSelectedMismatch}
                                            className="text-xs font-semibold text-danger bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition disabled:opacity-50"
                                        >
                                            Hapus terpilih ({selectedMismatchIds.size})
                                        </button>
                                        {selectableMismatch.length > 1 && (
                                            <button
                                                type="button"
                                                disabled={bulkDeleting}
                                                onClick={handleDeleteAllMismatch}
                                                className="text-xs font-semibold text-danger border border-danger/30 px-3 py-1.5 rounded-lg hover:bg-red-50 transition disabled:opacity-50"
                                            >
                                                Hapus semua ({selectableMismatch.length})
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="border border-siloam-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                                    <table className="w-full text-left text-xs">
                                        <thead className="bg-siloam-sidebar text-siloam-text-secondary uppercase sticky top-0">
                                            <tr>
                                                <th className="px-2 py-2 w-10">
                                                    <input
                                                        type="checkbox"
                                                        className="rounded border-siloam-border"
                                                        checked={allSelectableSelected}
                                                        onChange={toggleSelectAllMismatch}
                                                        disabled={!selectableMismatch.length || bulkDeleting}
                                                        title="Pilih / batalkan semua (kecuali akun Anda)"
                                                    />
                                                </th>
                                                <th className="px-3 py-2 font-semibold">Email</th>
                                                <th className="px-3 py-2 font-semibold">Username</th>
                                                <th className="px-3 py-2 font-semibold text-right">Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-siloam-border bg-white">
                                            {officeDiff.notInOffice.map((u) => {
                                                const isSelf = u.id === currentUserId;
                                                const checked = selectedMismatchIds.has(u.id);
                                                return (
                                                    <tr key={u.id} className={isSelf ? 'bg-siloam-bg/60' : 'hover:bg-siloam-bg/50'}>
                                                        <td className="px-2 py-2 align-middle">
                                                            <input
                                                                type="checkbox"
                                                                className="rounded border-siloam-border"
                                                                checked={checked}
                                                                disabled={isSelf || bulkDeleting}
                                                                onChange={() => toggleMismatchRow(u.id)}
                                                            />
                                                        </td>
                                                        <td className="px-3 py-2 text-siloam-text-primary break-all">
                                                            {u.email?.trim() ? (
                                                                u.email
                                                            ) : (
                                                                <span className="italic text-amber-700">(tanpa email)</span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-siloam-text-secondary">
                                                            {u.username}
                                                            {isSelf && (
                                                                <span className="block text-[10px] text-siloam-text-secondary">
                                                                    (Anda)
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2 text-right">
                                                            <button
                                                                type="button"
                                                                disabled={isSelf || bulkDeleting}
                                                                onClick={() => handleDeleteMismatchRow(u.id)}
                                                                className="text-danger hover:text-red-700 font-medium bg-red-50 px-2 py-1 rounded-md hover:bg-red-100 transition-colors disabled:opacity-40"
                                                            >
                                                                Hapus
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            <div className="border border-siloam-border rounded-xl overflow-hidden">
                <div className="max-h-[600px] overflow-y-auto" onScroll={handleUsersTableScroll}>
                    <table className="w-full text-left text-sm">
                        <thead className="text-xs text-siloam-text-secondary uppercase bg-siloam-sidebar sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="px-6 py-3 font-semibold">User Details</th>
                                <th className="px-6 py-3 font-semibold">Phone / WA</th>
                                <th className="px-6 py-3 font-semibold">Roles & Scopes</th>
                                <th className="px-6 py-3 font-semibold text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-siloam-border">
                            {visibleUsers.length > 0 ? (
                                visibleUsers.map(user => (
                                    <UserTableRow
                                        key={user.id}
                                        user={user}
                                        formatScopes={formatScopes}
                                        onEdit={setSelectedUser}
                                        onDelete={handleDeleteUser}
                                    />
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-siloam-text-secondary">
                                        No users found matching your filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="mt-4 text-xs text-siloam-text-secondary flex flex-wrap justify-between items-center gap-2">
                <span>
                    Showing {visibleUsers.length} of {filteredUsers.length} filtered ({effectiveUsers.length} total)
                </span>
                {hasMoreUsers && (
                    <button
                        type="button"
                        onClick={() => setVisibleUserCount((n) => n + USER_TABLE_PAGE_SIZE)}
                        className="text-siloam-blue font-semibold hover:underline"
                    >
                        Load more ({filteredUsers.length - visibleUserCount} remaining)
                    </button>
                )}
            </div>

            <UserEditorModal
                isOpen={!!selectedUser}
                onClose={() => setSelectedUser(null)}
                onSave={handleSaveUser}
                isSaving={isSavingUser}
                user={selectedUser}
                roles={effectiveRoles}
                archetypes={archetypes}
                hospitalUnits={hospitalUnits}
            />
        </div>
    );
};
