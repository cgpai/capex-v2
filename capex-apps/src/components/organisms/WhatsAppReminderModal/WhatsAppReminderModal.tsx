import React, { useState, useMemo } from 'react';
import { User, EnrichedAsset, Project, Task, UserRole } from '../../../types';
import { useToast } from '../../../contexts/ToastContext';

interface WhatsAppReminderModalProps {
    isOpen: boolean;
    onClose: () => void;
    asset: EnrichedAsset | null;
    project: Project | null;
    task: Task | null;
    taskName?: string;
    currentUser: User;
    allUsers: User[];
    allRoles: UserRole[];
    hospitalUnitName?: string;
}

const WhatsAppIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.77.966-.94 1.164-.17.199-.34.223-.63.075-.29-.15-1.223-.451-2.33-1.437-.861-.765-1.443-1.709-1.612-1.998-.17-.29-.018-.448.13-.596.134-.134.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
);

export const WhatsAppReminderModal: React.FC<WhatsAppReminderModalProps> = ({
    isOpen,
    onClose,
    asset,
    project,
    task,
    taskName,
    currentUser,
    allUsers,
    allRoles,
    hospitalUnitName
}) => {
    const { showToast } = useToast();
    const [selectedRecipientType, setSelectedRecipientType] = useState<'bic' | 'role' | 'manual'>('bic');
    const [selectedRoleId, setSelectedRoleId] = useState<string>('');
    const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
    const [manualPhoneNumber, setManualPhoneNumber] = useState('');
    const [customMessage, setCustomMessage] = useState('');

    // Find BIC users for the hospital unit
    const bicUsers = useMemo(() => {
        if (!hospitalUnitName) return [];
        return allUsers.filter(user => {
            return user.assignments.some(assignment => {
                const role = allRoles.find(r => r.roleName === assignment.roleName);
                // Assuming BIC role name contains "BIC" or similar
                return assignment.roleName.toLowerCase().includes('bic') &&
                       (assignment.assignedScopes.includes('All') || 
                        assignment.assignedScopes.some(scope => scope === hospitalUnitName));
            });
        });
    }, [allUsers, allRoles, hospitalUnitName]);

    // Get users by role for the hospital unit
    const usersByRole = useMemo(() => {
        if (!selectedRoleId || !hospitalUnitName) return [];
        const role = allRoles.find(
            r => r.id === Number(selectedRoleId) || String(r.id) === selectedRoleId
        );
        if (!role) return [];
        
        return allUsers.filter(user => {
            return user.assignments.some(assignment => {
                return assignment.roleName === role.roleName &&
                       (assignment.assignedScopes.includes('All') || 
                        assignment.assignedScopes.some(scope => scope === hospitalUnitName));
            });
        });
    }, [selectedRoleId, allUsers, allRoles, hospitalUnitName]);

    const assetCodeDisplay = useMemo(() => {
        const fromAsset = asset?.assetCode?.trim();
        const fromProject = project?.assetCode?.trim();
        return fromAsset || fromProject || '-';
    }, [asset?.assetCode, project?.assetCode]);

    // Generate default message template
    const defaultMessage = useMemo(() => {
        const parts: string[] = [];
        parts.push(`*Reminder: Task Execution Required*`);
        parts.push('');
        
        if (project) {
            parts.push(`📋 *Project:* ${project.projectName}`);
            parts.push(`   Code Project: ${project.projectCode || '-'}`);
        }
        
        if (asset) {
            parts.push(`🏥 *Asset:* ${asset.assetName}`);
            parts.push(`   Kode Asset: ${assetCodeDisplay}`);
            if (asset.huName) {
                parts.push(`   Hospital Unit: ${asset.huName}`);
            }
        }
        
        if (task || taskName) {
            parts.push(`✅ *Task:* ${task?.name || taskName || 'Task'}`);
            if (task?.description) {
                parts.push(`   ${task.description}`);
            }
        }
        
        parts.push('');
        parts.push(`⏰ *Action Required:* Please complete this task as soon as possible.`);
        parts.push('');
        parts.push(`Sent by: ${currentUser.username}`);
        parts.push(`Date: ${new Date().toLocaleDateString('id-ID')}`);
        
        return parts.join('\n');
    }, [project, asset, task, taskName, currentUser, assetCodeDisplay]);

    const finalMessage = customMessage || defaultMessage;

    // Get recipient phone number
    const recipientPhone = useMemo(() => {
        if (selectedRecipientType === 'manual') {
            return manualPhoneNumber.replace(/[^0-9]/g, ''); // Remove non-digits
        } else if (selectedRecipientType === 'bic' && selectedUserId) {
            const user = bicUsers.find(u => u.id === selectedUserId);
            // In real implementation, you'd get phone from user profile
            return user?.email || ''; // Placeholder
        } else if (selectedRecipientType === 'role' && selectedUserId) {
            const user = usersByRole.find(u => u.id === selectedUserId);
            return user?.email || ''; // Placeholder
        }
        return '';
    }, [selectedRecipientType, selectedUserId, manualPhoneNumber, bicUsers, usersByRole]);

    const handleSend = () => {
        if (!recipientPhone) {
            showToast('Pilih atau masukkan nomor telepon penerima.', 'error');
            return;
        }

        // Generate WhatsApp URL
        const encodedMessage = encodeURIComponent(finalMessage);
        const whatsappUrl = `https://wa.me/${recipientPhone}?text=${encodedMessage}`;
        
        // Open WhatsApp in new tab
        window.open(whatsappUrl, '_blank');
        
        // Optionally close modal after sending
        // onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-siloam-text-primary flex items-center gap-2">
                        <WhatsAppIcon />
                        WhatsApp Reminder
                    </h3>
                    <button onClick={onClose} className="text-siloam-text-secondary hover:text-siloam-text-primary">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Project & Asset Info */}
                {(asset || project) && (
                    <div className="mb-4 p-3 bg-siloam-bg rounded-lg border border-siloam-border">
                        <p className="text-xs text-siloam-text-secondary mb-1">Project & Asset Information</p>
                        <div className="space-y-1 text-sm">
                            {project && (
                                <p className="font-semibold text-siloam-text-primary">
                                    Project: <span className="font-normal">{project.projectName} ({project.projectCode})</span>
                                </p>
                            )}
                            {asset && (
                                <>
                                    <p className="font-semibold text-siloam-text-primary">
                                        Asset: <span className="font-normal">{asset.assetName}</span>
                                    </p>
                                    <p className="font-semibold text-siloam-text-primary">
                                        Kode Asset: <span className="font-normal">{assetCodeDisplay}</span>
                                    </p>
                                </>
                            )}
                            {task && (
                                <p className="font-semibold text-siloam-text-primary">
                                    Task: <span className="font-normal">{task.name}</span>
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {/* Recipient Selection */}
                <div className="space-y-4 mb-4">
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                            Recipient Type
                        </label>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setSelectedRecipientType('bic')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                    selectedRecipientType === 'bic'
                                        ? 'bg-siloam-blue text-white'
                                        : 'bg-siloam-bg text-siloam-text-primary border border-siloam-border'
                                }`}
                            >
                                BIC (Default)
                            </button>
                            <button
                                onClick={() => setSelectedRecipientType('role')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                    selectedRecipientType === 'role'
                                        ? 'bg-siloam-blue text-white'
                                        : 'bg-siloam-bg text-siloam-text-primary border border-siloam-border'
                                }`}
                            >
                                By Role
                            </button>
                            <button
                                onClick={() => setSelectedRecipientType('manual')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                                    selectedRecipientType === 'manual'
                                        ? 'bg-siloam-blue text-white'
                                        : 'bg-siloam-bg text-siloam-text-primary border border-siloam-border'
                                }`}
                            >
                                Manual Input
                            </button>
                        </div>
                    </div>

                    {/* BIC Selection */}
                    {selectedRecipientType === 'bic' && (
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                                Select BIC
                            </label>
                            <select
                                value={selectedUserId || ''}
                                onChange={(e) => setSelectedUserId(parseInt(e.target.value) || null)}
                                className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            >
                                <option value="">-- Select BIC --</option>
                                {bicUsers.map(user => (
                                    <option key={user.id} value={user.id}>
                                        {user.username} ({user.email})
                                    </option>
                                ))}
                            </select>
                            {bicUsers.length === 0 && (
                                <p className="text-xs text-siloam-text-secondary mt-1">
                                    No BIC users found for this hospital unit.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Role Selection */}
                    {selectedRecipientType === 'role' && (
                        <>
                            <div>
                                <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                                    Select Role
                                </label>
                                <select
                                    value={selectedRoleId}
                                    onChange={(e) => {
                                        setSelectedRoleId(e.target.value);
                                        setSelectedUserId(null);
                                    }}
                                    className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                >
                                    <option value="">-- Select Role --</option>
                                    {allRoles.map(role => (
                                        <option key={role.id} value={role.id}>
                                            {role.roleName}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            {selectedRoleId && (
                                <div>
                                    <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                                        Select User
                                    </label>
                                    <select
                                        value={selectedUserId || ''}
                                        onChange={(e) => setSelectedUserId(parseInt(e.target.value) || null)}
                                        className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                                    >
                                        <option value="">-- Select User --</option>
                                        {usersByRole.map(user => (
                                            <option key={user.id} value={user.id}>
                                                {user.username} ({user.email})
                                            </option>
                                        ))}
                                    </select>
                                    {usersByRole.length === 0 && (
                                        <p className="text-xs text-siloam-text-secondary mt-1">
                                            No users found with this role for this hospital unit.
                                        </p>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Manual Input */}
                    {selectedRecipientType === 'manual' && (
                        <div>
                            <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                                WhatsApp Number <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={manualPhoneNumber}
                                onChange={(e) => setManualPhoneNumber(e.target.value)}
                                placeholder="e.g., 6281234567890 (with country code)"
                                className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                            />
                            <p className="text-xs text-siloam-text-secondary mt-1">
                                Enter phone number with country code (e.g., 62 for Indonesia)
                            </p>
                        </div>
                    )}
                </div>

                {/* Message Template */}
                <div className="mb-4">
                    <label className="block text-sm font-medium text-siloam-text-secondary mb-2">
                        Message Template
                    </label>
                    <textarea
                        value={finalMessage}
                        onChange={(e) => setCustomMessage(e.target.value)}
                        className="w-full px-3 py-2 border border-siloam-border rounded-lg bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue font-mono text-sm"
                        rows={12}
                    />
                    <p className="text-xs text-siloam-text-secondary mt-1">
                        You can customize the message above. The template is automatically generated based on project, asset, and task information.
                    </p>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-lg border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!recipientPhone || !finalMessage.trim()}
                        className="px-4 py-2 rounded-lg bg-[#25D366] hover:bg-[#128C7E] text-white disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        <WhatsAppIcon />
                        Open WhatsApp
                    </button>
                </div>
            </div>
        </div>
    );
};

