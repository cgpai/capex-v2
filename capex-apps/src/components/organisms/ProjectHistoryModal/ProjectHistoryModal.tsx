
import React, { useState, useEffect } from 'react';
import { AuditLog } from '../../../types';
import * as auditService from '../../../services/auditService';
import { formatCurrency } from '../../../lib/formatter';

interface ProjectHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
    projectName: string;
    userId?: number;
}

export const ProjectHistoryModal: React.FC<ProjectHistoryModalProps> = ({ isOpen, onClose, projectId, projectName, userId }) => {
    const [logs, setLogs] = useState<AuditLog[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (isOpen && projectId) {
            const fetchLogs = async () => {
                setLoading(true);
                try {
                    const history = await auditService.getProjectHistory(projectId, userId);
                    setLogs(history);
                } catch (e) {
                    console.error("Failed to fetch history", e);
                } finally {
                    setLoading(false);
                }
            };
            fetchLogs();
        }
    }, [isOpen, projectId, userId]);

    if (!isOpen) return null;

    const formatValue = (fieldName: string, value: string | number | null | undefined) => {
        if (value === null || value === undefined) return '-';
        if (fieldName.toLowerCase().includes('budget') || fieldName.toLowerCase().includes('price')) {
            return formatCurrency(Number(value));
        }
        // Handle dates if strings are ISO dates? For now simpler is better.
        return value.toString();
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[80] p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-4xl max-h-[85vh] flex flex-col">
                <div className="p-6 border-b border-siloam-border flex justify-between items-center">
                    <div>
                        <h3 className="text-xl font-bold text-siloam-text-primary">Change History</h3>
                        <p className="text-sm text-siloam-text-secondary">Audit Trail for {projectName}</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border transition">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="flex-1 overflow-y-auto p-0">
                    {loading ? (
                        <div className="p-8 text-center text-siloam-text-secondary">Loading history...</div>
                    ) : logs.length === 0 ? (
                        <div className="p-8 text-center text-siloam-text-secondary">No changes recorded for this project yet.</div>
                    ) : (
                        <table className="w-full text-left text-sm border-collapse">
                            <thead className="bg-siloam-sidebar text-xs text-siloam-text-secondary uppercase font-bold sticky top-0 z-10">
                                <tr>
                                    <th className="px-6 py-4 border-b border-siloam-border w-40">Date & Time</th>
                                    <th className="px-6 py-4 border-b border-siloam-border w-32">User</th>
                                    <th className="px-6 py-4 border-b border-siloam-border w-40">Field</th>
                                    <th className="px-6 py-4 border-b border-siloam-border">Old Value</th>
                                    <th className="px-6 py-4 border-b border-siloam-border">New Value</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-siloam-border">
                                {logs.map((log) => (
                                    <tr key={log.id} className="hover:bg-siloam-bg/50 transition-colors">
                                        <td className="px-6 py-3 font-mono text-xs text-siloam-text-secondary">
                                            {new Date(log.timestamp).toLocaleString()}
                                        </td>
                                        <td className="px-6 py-3 font-medium text-siloam-text-primary">
                                            {log.changedBy}
                                        </td>
                                        <td className="px-6 py-3 font-semibold text-siloam-blue">
                                            {log.fieldName}
                                        </td>
                                        <td className="px-6 py-3 text-danger line-through opacity-75">
                                            {formatValue(log.fieldName, log.oldValue)}
                                        </td>
                                        <td className="px-6 py-3 text-siloam-green font-medium">
                                            {formatValue(log.fieldName, log.newValue)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};
