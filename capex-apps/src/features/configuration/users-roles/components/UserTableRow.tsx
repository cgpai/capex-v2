'use client';

import React, { memo } from 'react';
import { User } from '@/types';

export const UserTableRow = memo(function UserTableRow({
    user,
    formatScopes,
    onEdit,
    onDelete,
}: {
    user: User;
    formatScopes: (scopes: string[]) => string;
    onEdit: (user: User) => void;
    onDelete: (id: number) => void;
}) {
    return (
        <tr className="bg-white hover:bg-siloam-bg/50 transition-colors">
            <td className="px-6 py-4 align-top">
                <div className="flex items-center">
                    <div className="h-10 w-10 rounded-full bg-siloam-blue/10 flex items-center justify-center text-siloam-blue font-bold mr-3 flex-shrink-0">
                        {user.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div className="truncate">
                        <div className="font-semibold text-siloam-text-primary truncate" title={user.username}>{user.username}</div>
                        <div className="text-siloam-text-secondary text-xs truncate" title={user.email}>{user.email}</div>
                    </div>
                </div>
            </td>
            <td className="px-6 py-4 align-top">
                {user.phoneNumber ? (
                    <div className="flex items-center gap-2 text-siloam-text-primary text-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" className="bi bi-whatsapp text-siloam-green" viewBox="0 0 16 16">
                            <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z"/>
                        </svg>
                        {user.phoneNumber}
                    </div>
                ) : (
                    <span className="text-siloam-text-secondary italic text-xs">-</span>
                )}
            </td>
            <td className="px-6 py-4 align-top">
                <div className="space-y-2">
                    {user.assignments.map((a, i) => (
                        <div key={i} className="flex flex-col text-xs">
                            <div className="flex items-center gap-2">
                                <span className="font-bold bg-siloam-blue/10 text-siloam-blue px-2 py-0.5 rounded-full border border-siloam-blue/20">
                                    {a.roleName}
                                </span>
                                <span className="text-siloam-text-secondary">
                                    in
                                </span>
                            </div>
                            <div className="mt-1 pl-2 border-l-2 border-siloam-border ml-1 text-siloam-text-primary leading-relaxed">
                                {formatScopes(a.assignedScopes)}
                            </div>
                        </div>
                    ))}
                    {user.assignments.length === 0 && <span className="text-siloam-text-secondary italic">No roles assigned</span>}
                </div>
            </td>
            <td className="px-6 py-4 text-right align-top">
                <div className="flex items-center justify-end gap-3">
                    <button
                        onClick={() => onEdit(user)}
                        className="text-siloam-blue hover:text-siloam-blue/80 font-medium text-xs bg-siloam-blue/5 px-3 py-1.5 rounded-lg hover:bg-siloam-blue/10 transition-colors"
                    >
                        Edit
                    </button>
                    <button
                        onClick={() => onDelete(user.id)}
                        className="text-danger hover:text-red-700 font-medium text-xs bg-red-50 px-3 py-1.5 rounded-lg hover:bg-red-100 transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    );
});
