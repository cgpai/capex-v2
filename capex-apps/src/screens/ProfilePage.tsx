
import React, { useState, useMemo, memo } from 'react';
import { User, UserRole, HIERARCHY_LEVELS } from '../types';
import { usePermissions } from '../hooks/usePermissions';
import { updatePassword } from '../lib/authSupabase';
import { useToast } from '../contexts/ToastContext';

interface ProfilePageProps {
    currentUser: User;
    allRoles: UserRole[];
    desktopNotificationsEnabled: boolean;
    browserNotificationPermission: NotificationPermission | 'unsupported';
    onDesktopNotificationsToggle: (enabled: boolean) => void;
    onRequestDesktopPermission: () => Promise<void> | void;
}

export const ProfilePage = memo(function ProfilePage({
    currentUser,
    allRoles,
    desktopNotificationsEnabled,
    browserNotificationPermission,
    onDesktopNotificationsToggle,
    onRequestDesktopPermission,
}: ProfilePageProps) {
    const { showToast } = useToast();
    const { getPermissionFor, userScopes } = usePermissions(currentUser, allRoles);

    const [showChangePassword, setShowChangePassword] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPw, setShowCurrentPw] = useState(false);
    const [showNewPw, setShowNewPw] = useState(false);
    const [changePwLoading, setChangePwLoading] = useState(false);
    const [changePwError, setChangePwError] = useState('');

    const primaryRole = currentUser.assignments[0]?.roleName || 'No Role';

    const initials = React.useMemo(() => {
        const name = (currentUser.username || '').trim();
        if (!name) return 'U';
        const parts = name.split(/\s+/).filter(Boolean);
        const first = parts[0]?.[0] || '';
        const second = (parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1]) || '';
        return (first + second).toUpperCase() || 'U';
    }, [currentUser.username]);

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setChangePwError('');
        if (newPassword.length < 6) {
            setChangePwError('Password baru minimal 6 karakter.');
            return;
        }
        if (newPassword !== confirmPassword) {
            setChangePwError('Konfirmasi password tidak cocok.');
            return;
        }
        if (!currentPassword.trim()) {
            setChangePwError('Masukkan password saat ini.');
            return;
        }
        setChangePwLoading(true);
        try {
            const { error } = await updatePassword(newPassword, currentPassword, currentUser.id);
            if (error) {
                setChangePwError(error.message || 'Gagal mengubah password.');
            } else {
                showToast('Password berhasil diubah.', 'success');
                setCurrentPassword('');
                setNewPassword('');
                setConfirmPassword('');
                setShowChangePassword(false);
            }
        } catch {
            setChangePwError('Terjadi kesalahan. Coba lagi.');
        } finally {
            setChangePwLoading(false);
        }
    };

    const permissionRows = useMemo(
        () =>
            HIERARCHY_LEVELS
                .map((level) => ({ level, perm: getPermissionFor(level) }))
                .filter(({ perm }) => perm !== 'Hide'),
        [getPermissionFor],
    );

    const getPermissionColor = (perm: string) => {
        switch (perm) {
            case 'View, Update, Create & Delete': return 'bg-purple-100 text-purple-800';
            case 'View, Update & Create': return 'bg-green-100 text-green-800';
            case 'View & Update': return 'bg-blue-100 text-blue-800';
            case 'View Only': return 'bg-yellow-100 text-yellow-800';
            default: return 'bg-gray-100 text-gray-500';
        }
    };

    return (
        <div className="space-y-6 animate-fade-in">
            {/* Header / Identity Card */}
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border flex flex-col md:flex-row items-center gap-6">
                <div className="relative">
                    <div
                        aria-label="Profile initials"
                        className="w-24 h-24 rounded-full border-4 border-white shadow-md bg-siloam-blue/10 text-siloam-blue flex items-center justify-center font-bold text-3xl select-none"
                    >
                        {initials}
                    </div>
                    <div className="absolute bottom-0 right-0 bg-siloam-green h-6 w-6 rounded-full border-2 border-white" title="Active"></div>
                </div>
                <div className="text-center md:text-left flex-1">
                    <h2 className="text-2xl font-bold text-siloam-text-primary">{currentUser.username}</h2>
                    <p className="text-siloam-text-secondary mb-2">{currentUser.email}</p>
                    <span className="inline-block bg-siloam-blue/10 text-siloam-blue text-sm font-bold px-3 py-1 rounded-full">
                        {primaryRole}
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-center">
                    <div className="bg-siloam-bg p-3 rounded-lg min-w-[100px]">
                        <p className="text-xs text-siloam-text-secondary uppercase font-semibold">User ID</p>
                        <p className="text-lg font-mono font-bold text-siloam-text-primary">#{currentUser.id}</p>
                    </div>
                    <div className="bg-siloam-bg p-3 rounded-lg min-w-[100px]">
                        <p className="text-xs text-siloam-text-secondary uppercase font-semibold">Assignments</p>
                        <p className="text-lg font-bold text-siloam-text-primary">{currentUser.assignments.length}</p>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Access Scopes */}
                <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border h-full">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Assigned Scopes
                    </h3>
                    
                    {userScopes.all ? (
                        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <div>
                                <p className="font-bold text-green-800">Global Access</p>
                                <p className="text-sm text-green-700">You have access to all regions, networks, and hospital units.</p>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {userScopes.archetypes.size > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-siloam-text-secondary mb-2 uppercase">Networks</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(userScopes.archetypes).map(scope => (
                                            <span key={scope} className="px-3 py-1.5 bg-siloam-bg border border-siloam-border rounded-lg text-sm font-medium">
                                                {scope}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {userScopes.hus.size > 0 && (
                                <div>
                                    <p className="text-sm font-semibold text-siloam-text-secondary mb-2 uppercase">Hospital Units</p>
                                    <div className="flex flex-wrap gap-2">
                                        {Array.from(userScopes.hus).map(scope => (
                                            <span key={scope} className="px-3 py-1.5 bg-siloam-bg border border-siloam-border rounded-lg text-sm font-medium">
                                                {scope}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            {userScopes.archetypes.size === 0 && userScopes.hus.size === 0 && (
                                <p className="text-siloam-text-secondary italic">No specific scopes assigned.</p>
                            )}
                        </div>
                    )}
                    {currentUser.assignments.length > 0 && (
                        <div className="mt-5 pt-4 border-t border-siloam-border">
                            <p className="text-xs font-semibold text-siloam-text-secondary uppercase mb-2">
                                Ringkasan per peran (data tersimpan)
                            </p>
                            <ul className="space-y-2 text-sm">
                                {currentUser.assignments.map((a, i) => (
                                    <li key={`${a.roleName}-${i}`} className="rounded-lg bg-siloam-bg/80 border border-siloam-border px-3 py-2">
                                        <span className="font-semibold text-siloam-text-primary">{a.roleName || '(Role)'}</span>
                                        {a.assignedScopes?.length ? (
                                            <span className="text-siloam-text-secondary">
                                                {' '}
                                                — {a.assignedScopes.join(', ')}
                                            </span>
                                        ) : (
                                            <span className="text-siloam-text-secondary italic"> — belum ada scope</span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>

                {/* Permissions Matrix */}
                <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border h-full">
                    <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                        Access Permissions
                    </h3>
                    <div className="overflow-hidden rounded-lg border border-siloam-border">
                        <table className="w-full text-sm">
                            <thead className="bg-siloam-sidebar">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold text-siloam-text-secondary">Hierarchy Level</th>
                                    <th className="px-4 py-2 text-left font-semibold text-siloam-text-secondary">Access Level</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-siloam-border">
                                {permissionRows.map(({ level, perm }) => (
                                    <tr key={level}>
                                        <td className="px-4 py-2 font-medium text-siloam-text-primary">{level}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${getPermissionColor(perm)}`}>
                                                {perm}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Notification Preferences */}
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a1 1 0 00-2 0v.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                    Notification Preferences
                </h3>
                <div className="space-y-4">
                    <label className="flex items-center justify-between bg-siloam-bg border border-siloam-border rounded-xl p-4">
                        <div>
                            <p className="font-semibold text-siloam-text-primary">Desktop Notification</p>
                            <p className="text-sm text-siloam-text-secondary">Notifikasi browser untuk task baru, overdue, dan reminder.</p>
                        </div>
                        <input
                            type="checkbox"
                            checked={desktopNotificationsEnabled}
                            onChange={(e) => onDesktopNotificationsToggle(e.target.checked)}
                            className="h-5 w-5 rounded border-siloam-border text-siloam-blue focus:ring-siloam-blue"
                        />
                    </label>
                    <div className="flex items-center justify-between bg-siloam-bg border border-siloam-border rounded-xl p-4">
                        <div>
                            <p className="font-semibold text-siloam-text-primary">Browser Permission</p>
                            <p className="text-sm text-siloam-text-secondary">
                                Status: {browserNotificationPermission === 'unsupported'
                                    ? 'Not supported'
                                    : browserNotificationPermission}
                            </p>
                        </div>
                        {browserNotificationPermission !== 'granted' && browserNotificationPermission !== 'unsupported' && (
                            <button
                                type="button"
                                onClick={() => onRequestDesktopPermission()}
                                className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 text-sm font-semibold"
                            >
                                Request Permission
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Ubah Password */}
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft border border-siloam-border">
                <h3 className="text-lg font-bold text-siloam-text-primary mb-4 flex items-center gap-2">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-siloam-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg>
                    Ubah Password
                </h3>
                {!showChangePassword ? (
                    <button
                        onClick={() => setShowChangePassword(true)}
                        className="text-siloam-blue hover:underline font-medium text-sm"
                    >
                        Klik untuk mengubah password login Anda
                    </button>
                ) : (
                    <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-primary mb-1">Password saat ini</label>
                            <div className="relative">
                                <input
                                    type={showCurrentPw ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                />
                                <button type="button" onClick={() => setShowCurrentPw(!showCurrentPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary">
                                    {showCurrentPw ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-primary mb-1">Password baru</label>
                            <div className="relative">
                                <input
                                    type={showNewPw ? 'text' : 'password'}
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="w-full px-4 py-2 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                                    placeholder="Minimal 6 karakter"
                                    autoComplete="new-password"
                                />
                                <button type="button" onClick={() => setShowNewPw(!showNewPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-siloam-text-secondary hover:text-siloam-text-primary">
                                    {showNewPw ? <EyeOffIcon /> : <EyeIcon />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-primary mb-1">Konfirmasi password baru</label>
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-4 py-2 border border-siloam-border rounded-xl focus:ring-2 focus:ring-siloam-blue focus:outline-none"
                                placeholder="Ulangi password baru"
                                autoComplete="new-password"
                            />
                        </div>
                        {changePwError && (
                            <div className="text-sm text-danger bg-danger/10 p-3 rounded-lg flex items-center gap-2">
                                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                {changePwError}
                            </div>
                        )}
                        <div className="flex gap-2">
                            <button
                                type="submit"
                                disabled={changePwLoading}
                                className="bg-siloam-blue text-white px-4 py-2 rounded-xl hover:bg-siloam-blue/90 disabled:opacity-50 text-sm font-semibold"
                            >
                                {changePwLoading ? 'Menyimpan...' : 'Simpan'}
                            </button>
                            <button
                                type="button"
                                onClick={() => { setShowChangePassword(false); setChangePwError(''); setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); }}
                                className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary text-sm"
                            >
                                Batal
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
});

ProfilePage.displayName = 'ProfilePage';

const EyeIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
);
const EyeOffIcon = () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
);
