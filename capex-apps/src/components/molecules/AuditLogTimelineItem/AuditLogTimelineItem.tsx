
import React from 'react';
import { AuditLog } from '../../../types';
import { formatCurrency } from '../../../lib/formatter';

interface AuditLogTimelineItemProps {
    log: AuditLog;
}

const formatValue = (fieldName: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined) return 'Empty';
    if (fieldName.toLowerCase().includes('budget') || fieldName.toLowerCase().includes('price')) {
        return formatCurrency(Number(value));
    }
    return value.toString();
};

export const AuditLogTimelineItem: React.FC<AuditLogTimelineItemProps> = ({ log }) => {
    return (
        <div className="relative flex items-start pl-16 animate-fade-in">
            <div className="absolute left-5 top-5 w-11 border-t-2 border-dashed border-gray-300"></div>
            <div className="flex-shrink-0 z-10 w-10 h-10 rounded-full flex items-center justify-center bg-gray-100 border border-gray-300 text-gray-500">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" />
                </svg>
            </div>
            <div className="ml-6 flex-1 pt-1">
                <div className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <div className="flex justify-between items-start">
                        <p className="text-sm font-semibold text-gray-700">Project Update: {log.fieldName}</p>
                        <p className="text-xs text-gray-500">{new Date(log.timestamp).toLocaleString()}</p>
                    </div>
                    <p className="text-xs text-gray-600 mt-1">
                        Changed by <span className="font-bold">{log.changedBy}</span>
                    </p>
                    <div className="mt-2 flex items-center gap-2 text-sm">
                        <span className="line-through text-red-400">{formatValue(log.fieldName, log.oldValue)}</span>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                        </svg>
                        <span className="font-bold text-green-600">{formatValue(log.fieldName, log.newValue)}</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
