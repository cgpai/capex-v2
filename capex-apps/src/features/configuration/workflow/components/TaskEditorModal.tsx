'use client';

import React, { useState, useEffect } from 'react';
import { Task, SYSTEM_TRIGGER_EVENTS, SystemTriggerEvent } from '@/types';
import { NumericInput } from '@/components/atoms/NumericInput/NumericInput';
import {
  formatTaskTriggerEventLabels,
  getTaskTriggerEvents,
  prepareTaskTriggerEventsForSave,
} from '@/lib/systemTriggerEvents';

export const TaskEditorModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onSave: (task: Task) => Promise<void>;
    task: Task | null;
    allTasks: Task[];
}> = ({ isOpen, onClose, onSave, task: initialTask, allTasks }) => {
    const [task, setTask] = useState<Partial<Task> | null>(initialTask);
    const [error, setError] = useState('');

    useEffect(() => {
        if (initialTask) {
            setTask({
                ...initialTask,
                triggerEvents: getTaskTriggerEvents(initialTask),
                triggerEvent: undefined,
            });
        } else {
            setTask({
                id: '',
                name: '',
                description: '',
                slaToComplete: 0,
                isSystemTriggered: false,
                triggerEvents: [],
            });
        }
        setError('');
    }, [initialTask, isOpen]);

    if (!isOpen || !task) return null;

    const selectedTriggerEvents = getTaskTriggerEvents(task as Task);

    const toggleTriggerEvent = (value: SystemTriggerEvent, checked: boolean) => {
        const next = checked
            ? [...selectedTriggerEvents, value]
            : selectedTriggerEvents.filter((e) => e !== value);
        setTask({
            ...task,
            triggerEvents: [...new Set(next)],
            triggerEvent: undefined,
        });
    };

    const handleSave = () => {
        if (!task.name) {
            setError('Task name is required.');
            return;
        }
        if (allTasks.some(t => t.name === task.name && t.id !== task.id)) {
            setError('Task name already exists.');
            return;
        }
        if (task.isSystemTriggered && selectedTriggerEvents.length === 0) {
            setError('Pilih minimal satu trigger event.');
            return;
        }
        onSave(prepareTaskTriggerEventsForSave(task) as Task);
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-lg">
                <h3 className="text-lg font-bold mb-4">{task.id ? 'Edit Task' : 'Create New Task'}</h3>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Task Name</label>
                        <input
                            type="text"
                            value={task.name}
                            onChange={(e) => setTask({ ...task, name: e.target.value })}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Description</label>
                        <textarea
                            value={task.description}
                            onChange={(e) => setTask({ ...task, description: e.target.value })}
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-siloam-text-secondary">Default SLA to Complete (in days)</label>
                        <NumericInput
                            min={0}
                            value={task.slaToComplete ?? 0}
                            onValueChange={(val) => setTask({ ...task, slaToComplete: val })}
                            allowDecimal={false}
                            align="left"
                            className="mt-1 block w-full border border-siloam-border rounded-xl p-2 bg-siloam-surface focus:outline-none focus:ring-2 focus:ring-siloam-blue"
                        />
                    </div>
                    <div>
                        <label className="flex items-center text-sm font-medium text-siloam-text-secondary">
                            <input
                                type="checkbox"
                                checked={task.isSystemTriggered || false}
                                onChange={(e) => setTask({
                                    ...task,
                                    isSystemTriggered: e.target.checked,
                                    triggerEvents: e.target.checked ? selectedTriggerEvents : [],
                                    triggerEvent: undefined,
                                })}
                                className="h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue bg-white"
                            />
                            <span className="ml-2">Is System-Triggered Task?</span>
                        </label>
                    </div>
                    {task.isSystemTriggered && (
                        <div>
                            <label className="flex items-center text-sm font-medium text-siloam-text-secondary">
                                Trigger Events
                                <div className="relative group ml-2">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div className="absolute bottom-full mb-2 w-72 bg-gray-800 text-white text-xs rounded-lg p-2 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                                        Pilih satu atau lebih aksi aplikasi yang dapat menyelesaikan task ini secara otomatis. Salah satu event yang terjadi sudah cukup.
                                    </div>
                                </div>
                            </label>
                            <div className="mt-2 space-y-2 rounded-xl border border-siloam-border p-3 bg-siloam-bg max-h-48 overflow-y-auto">
                                {SYSTEM_TRIGGER_EVENTS.map((event) => (
                                    <label
                                        key={event.value}
                                        className="flex items-start gap-2 text-sm text-siloam-text-primary cursor-pointer"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedTriggerEvents.includes(event.value)}
                                            onChange={(e) => toggleTriggerEvent(event.value, e.target.checked)}
                                            className="mt-0.5 h-4 w-4 text-siloam-blue border-siloam-border rounded focus:ring-siloam-blue bg-white"
                                        />
                                        <span>{event.label}</span>
                                    </label>
                                ))}
                            </div>
                            {selectedTriggerEvents.length > 0 && (
                                <p className="mt-2 text-xs text-siloam-text-secondary">
                                    Terpilih: {formatTaskTriggerEventLabels(task as Task)}
                                </p>
                            )}
                        </div>
                    )}
                    {error && <p className="text-sm text-danger">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end space-x-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90">Save Task</button>
                </div>
            </div>
        </div>
    );
};
