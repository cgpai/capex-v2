'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { User, UserRole, ArchetypeConfig, HospitalUnitConfig } from '@/types';
import { useToast } from '@/contexts/ToastContext';

export const UserEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (user: User) => void | Promise<void>;
    isSaving?: boolean;
    user: Partial<User> | null;
    roles: UserRole[];
    archetypes: ArchetypeConfig[];
    hospitalUnits: HospitalUnitConfig[];
}> = ({ isOpen, onClose, onSave, isSaving = false, user: initialUser, roles, archetypes, hospitalUnits }) => {
    const { showToast } = useToast();
    const [user, setUser] = useState<Partial<User> | null>(initialUser);
    const isNew = useMemo(() => !initialUser?.id, [initialUser]);

    useEffect(() => {
        if (!initialUser) {
            setUser(initialUser);
            return;
        }

        // Normalize legacy scopes (stored as names) to IDs used by DB layer.
        // DB persists scope_id values (e.g. 'All', 'ARCH-..', 'HU-..').
        const archetypeNameToId = new Map(archetypes.map(a => [a.name, a.id]));
        const huNameToId = new Map(hospitalUnits.map(hu => [hu.name, hu.id]));

        const normalizedAssignments = (initialUser.assignments || []).map(a => {
            const nextScopes = (a.assignedScopes || [])
                .map(s => {
                    if (!s) return s;
                    if (s === 'All') return 'All';
                    if (s.startsWith('ARCH-') || s.startsWith('HU-')) return s;
                    return archetypeNameToId.get(s) || huNameToId.get(s) || s;
                })
                .filter(Boolean);
            return { ...a, assignedScopes: Array.from(new Set(nextScopes)) };
        });

        setUser({ ...initialUser, assignments: normalizedAssignments });
    }, [initialUser, archetypes, hospitalUnits]);

    if (!isOpen || !user) return null;

    const handleSave = async () => {
        if (!user.username?.trim()) {
            showToast('Username wajib diisi.', 'error');
            return;
        }
        if (!user.email?.trim()) {
            showToast('Email wajib diisi.', 'error');
            return;
        }
        if (!roles.length && (user.assignments?.length ?? 0) > 0) {
            showToast('Belum ada role di sistem. Tambahkan role di tab Role Management dulu.', 'error');
            return;
        }
        const badAssignment = (user.assignments || []).some(a => !a.roleName?.trim());
        if (badAssignment) {
            showToast('Setiap assignment harus memilih role.', 'error');
            return;
        }
        try {
            await Promise.resolve(onSave(user as User));
        } catch (e) {
            showToast(e instanceof Error ? e.message : 'Gagal menyimpan user.', 'error');
        }
    };

    const handleAssignmentChange = (index: number, roleName: string) => {
        if (!user.assignments) return;
        const newAssignments = [...user.assignments];
        newAssignments[index] = { ...newAssignments[index], roleName };
        setUser({ ...user, assignments: newAssignments });
    };

    const handleScopeChange = (index: number, scope: string) => {
        if (!user.assignments) return;
        const newAssignments = [...user.assignments];
        const currentScopes = newAssignments[index].assignedScopes || [];
        let newScopes: string[];
        if (scope === 'All') {
            newScopes = currentScopes.includes('All') ? [] : ['All'];
        } else {
            const withoutAll = currentScopes.filter(s => s !== 'All');
            newScopes = withoutAll.includes(scope)
                ? withoutAll.filter(s => s !== scope)
                : [...withoutAll, scope];
        }
        newAssignments[index].assignedScopes = newScopes;
        setUser({ ...user, assignments: newAssignments });
    };

    const addAssignment = () => {
        const newAssignment = { roleName: roles[0]?.roleName || '', assignedScopes: [] };
        setUser({ ...user, assignments: [...(user.assignments || []), newAssignment] });
    };
    
    const removeAssignment = (index: number) => {
        if (!user.assignments) return;
        const newAssignments = user.assignments.filter((_, i) => i !== index);
        setUser({ ...user, assignments: newAssignments });
    }

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-3xl max-h-[90vh] flex flex-col">
                <h3 className="text-lg font-bold mb-4 text-siloam-text-primary">{isNew ? 'Create New User' : `Edit User: ${user.username}`}</h3>
                <div className="overflow-y-auto pr-2 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary">Username</label>
                            <input 
                                type="text" 
                                value={user.username || ''} 
                                onChange={e => setUser({...user, username: e.target.value})} 
                                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" 
                                disabled={!isNew}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary">Email</label>
                            <input 
                                type="email" 
                                value={user.email || ''} 
                                onChange={e => setUser({...user, email: e.target.value})} 
                                className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue" 
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Phone Number (WhatsApp)</label>
                        <div className="mt-1 flex rounded-xl shadow-sm">
                            <span className="inline-flex items-center px-3 rounded-l-xl border border-r-0 border-siloam-border bg-siloam-bg text-gray-500 text-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" className="bi bi-whatsapp mr-1" viewBox="0 0 16 16">
                                    <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                                </svg>
                            </span>
                            <input
                                type="tel"
                                value={user.phoneNumber || ''}
                                onChange={e => setUser({...user, phoneNumber: e.target.value})}
                                placeholder="e.g. 62812345678"
                                className="flex-1 block w-full rounded-none rounded-r-xl border border-siloam-border p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                        </div>
                    </div>
                    <p className="text-sm text-siloam-text-secondary">Login menggunakan Supabase Auth (email + password di Auth). Setelah simpan, gunakan &quot;Sync ke Auth&quot; agar user bisa login (password default: 123456).</p>
                    <h4 className="text-md font-semibold mt-2">Role Assignments</h4>
                    {user.assignments?.map((assignment, index) => (
                        <div key={index} className="bg-siloam-bg p-4 rounded-lg border border-siloam-border relative">
                             <button 
                                onClick={() => removeAssignment(index)}
                                className="absolute top-2 right-2 text-siloam-text-secondary hover:text-danger"
                                aria-label="Remove assignment"
                            >
                               &#x2715;
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-siloam-text-secondary">Role</label>
                                    <select
                                        value={assignment.roleName}
                                        onChange={(e) => handleAssignmentChange(index, e.target.value)}
                                        className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                    >
                                        {roles.map(r => <option key={r.id} value={r.roleName}>{r.roleName}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <p className="block text-sm font-medium text-siloam-text-secondary mb-1">Data Scope (All / Network / HU)</p>
                                    <div className="mt-1 max-h-40 overflow-y-auto border border-siloam-border rounded-xl p-3 bg-siloam-surface space-y-3">
                                        <div className="flex items-center">
                                            <input
                                                type="checkbox"
                                                id={`scope-${index}-All`}
                                                checked={assignment.assignedScopes.includes('All')}
                                                onChange={() => handleScopeChange(index, 'All')}
                                                className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue"
                                            />
                                            <label htmlFor={`scope-${index}-All`} className="ml-2 text-sm font-medium text-siloam-text-primary">All (seluruh data Siloam)</label>
                                        </div>
                                        {archetypes.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-siloam-text-secondary uppercase mb-1">Network</p>
                                                <div className="space-y-1 pl-2">
                                                    {archetypes.map(a => (
                                                        <div key={a.id} className="flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                id={`scope-${index}-${a.id}`}
                                                                checked={assignment.assignedScopes.includes(a.id) || assignment.assignedScopes.includes(a.name)}
                                                                onChange={() => handleScopeChange(index, a.id)}
                                                                className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue"
                                                            />
                                                            <label htmlFor={`scope-${index}-${a.id}`} className="ml-2 text-sm text-siloam-text-primary">{a.name}</label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        {hospitalUnits.length > 0 && (
                                            <div>
                                                <p className="text-xs font-semibold text-siloam-text-secondary uppercase mb-1">Hospital Unit</p>
                                                <div className="space-y-1 pl-2">
                                                    {hospitalUnits.map(hu => (
                                                        <div key={hu.id} className="flex items-center">
                                                            <input
                                                                type="checkbox"
                                                                id={`scope-${index}-${hu.id}`}
                                                                checked={assignment.assignedScopes.includes(hu.id) || assignment.assignedScopes.includes(hu.name)}
                                                                onChange={() => handleScopeChange(index, hu.id)}
                                                                className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue"
                                                            />
                                                            <label htmlFor={`scope-${index}-${hu.id}`} className="ml-2 text-sm text-siloam-text-primary">
                                                                {hu.code ? `${hu.code} - ${hu.name}` : hu.name}
                                                            </label>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                    <button onClick={addAssignment} className="text-sm text-siloam-blue hover:underline">+ Add another role</button>
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </div>
        </div>
    );
};
