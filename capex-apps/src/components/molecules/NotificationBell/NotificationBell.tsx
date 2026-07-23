import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Page } from '../../../types';
import type { Notification } from '../../../types';

const BellIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-5-5.917V5a1 1 0 00-2 0v.083A6 6 0 006 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
    </svg>
);

const TaskIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
);

const BudgetIcon: React.FC = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
);

const ApprovalIcon: React.FC = () => (
     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const getNotificationIcon = (type: Notification['type']) => {
    switch(type) {
        case 'task': return <TaskIcon />;
        case 'budget': return <BudgetIcon />;
        case 'approval': return <ApprovalIcon />;
        default: return <TaskIcon />;
    }
};

const timeSince = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    return Math.floor(seconds) + "s ago";
};

interface NotificationBellProps {
    notifications: Notification[];
    onMarkAsRead: (id: string) => void;
    onMarkAllAsRead: () => void;
    onNavigate: (page: Page) => void;
}

type NotificationCategory = 'all' | 'new-task' | 'overdue' | 'reminder' | 'summary';

const getNotificationCategory = (notification: Notification): Exclude<NotificationCategory, 'all'> => {
    const message = (notification.message || '').toLowerCase();
    if (message.startsWith('task baru:')) return 'new-task';
    if (message.startsWith('task terlambat:')) return 'overdue';
    if (message.startsWith('info reminder harian:')) return 'summary';
    return 'reminder';
};

export const NotificationBell: React.FC<NotificationBellProps> = ({ notifications, onMarkAsRead, onMarkAllAsRead, onNavigate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [activeCategory, setActiveCategory] = useState<NotificationCategory>('all');
    const dropdownRef = useRef<HTMLDivElement>(null);
    
    const unreadCount = useMemo(() => notifications.filter(n => !n.isRead).length, [notifications]);
    const filteredNotifications = useMemo(() => {
        if (activeCategory === 'all') return notifications;
        return notifications.filter(notification => getNotificationCategory(notification) === activeCategory);
    }, [notifications, activeCategory]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);
    
    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            onMarkAsRead(notification.id);
        }
        if (notification.linkToPage) {
            onNavigate(notification.linkToPage);
        }
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="relative p-2 rounded-full text-siloam-text-secondary hover:bg-siloam-border hover:text-siloam-text-primary transition-colors"
                aria-label={`Notifications (${unreadCount} unread)`}
            >
                <BellIcon />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 block h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-siloam-surface"></span>
                )}
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 md:w-96 bg-siloam-surface rounded-xl shadow-lg border border-siloam-border z-50 animate-fade-in">
                    <div className="px-4 py-3 border-b border-siloam-border flex justify-between items-center">
                        <h3 className="font-bold text-siloam-text-primary">Notifications</h3>
                        {unreadCount > 0 && (
                            <button onClick={onMarkAllAsRead} className="text-xs text-siloam-blue hover:underline">
                                Mark all as read
                            </button>
                        )}
                    </div>
                    <div className="px-3 py-2 border-b border-siloam-border flex flex-wrap gap-2">
                        {[
                            { key: 'all', label: 'Semua' },
                            { key: 'new-task', label: 'Task Baru' },
                            { key: 'overdue', label: 'Overdue' },
                            { key: 'reminder', label: 'Reminder' },
                            { key: 'summary', label: 'Ringkasan' },
                        ].map(item => (
                            <button
                                key={item.key}
                                type="button"
                                onClick={() => setActiveCategory(item.key as NotificationCategory)}
                                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                                    activeCategory === item.key
                                        ? 'bg-siloam-blue text-white border-siloam-blue'
                                        : 'bg-siloam-bg text-siloam-text-secondary border-siloam-border hover:text-siloam-text-primary'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>
                    <ul className="max-h-96 overflow-y-auto">
                        {filteredNotifications.length > 0 ? filteredNotifications.map(notification => (
                            <li key={notification.id}>
                                <button
                                    type="button"
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`flex w-full items-start gap-3 p-4 text-left hover:bg-siloam-bg transition-colors border-b border-siloam-border last:border-b-0 ${!notification.isRead ? 'bg-siloam-blue/5' : ''}`}
                                >
                                    {!notification.isRead && (
                                        <div className="w-2 h-2 mt-2 rounded-full bg-siloam-blue flex-shrink-0" aria-hidden />
                                    )}
                                    <div className={`flex-shrink-0 ${notification.isRead ? 'ml-4' : ''}`}>
                                        {getNotificationIcon(notification.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-siloam-text-primary">{notification.message}</p>
                                        <p className="text-xs text-siloam-text-secondary mt-1">{timeSince(new Date(notification.createdAt))}</p>
                                    </div>
                                </button>
                            </li>
                        )) : (
                            <li className="p-8 text-center text-sm text-siloam-text-secondary">
                                Tidak ada notifikasi pada kategori ini.
                            </li>
                        )}
                    </ul>
                </div>
            )}
        </div>
    );
};
NotificationBell.displayName = "NotificationBell";