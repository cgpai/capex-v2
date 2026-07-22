import React from 'react';
import { ChangeSummary } from '../../../types';

interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => Promise<void>;
  onDiscard: () => void;
  changeSummary: ChangeSummary | null;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({ isOpen, onClose, onSave, onDiscard, changeSummary }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 animate-fade-in">
            <div className="bg-siloam-surface p-6 rounded-xl shadow-soft w-full max-w-2xl">
                <h3 className="text-xl font-bold mb-2 text-siloam-text-primary">Unsaved Changes</h3>
                <p className="text-sm text-siloam-text-secondary mb-4">You have unsaved changes. Do you want to save them before navigating away?</p>

                {changeSummary && (
                    <div className="bg-siloam-bg p-4 rounded-lg border border-siloam-border max-h-60 overflow-y-auto mb-4">
                        <h4 className="font-semibold text-siloam-text-primary mb-2">{changeSummary.title}</h4>
                        <table className="w-full text-sm">
                            <thead className="text-left text-xs text-siloam-text-secondary">
                                <tr>
                                    <th className="py-1 pr-2 font-medium">Item</th>
                                    <th className="py-1 px-2 font-medium">Before</th>
                                    <th className="py-1 pl-2 font-medium">After</th>
                                </tr>
                            </thead>
                            <tbody>
                                {changeSummary.changes.map((change, index) => (
                                    <tr key={index} className="border-t border-siloam-border">
                                        <td className="py-2 pr-2">{change.item}</td>
                                        <td className="py-2 px-2 font-mono text-siloam-text-secondary">{change.before}</td>
                                        <td className="py-2 pl-2 font-mono font-semibold text-siloam-blue">{change.after}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
                
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-siloam-border hover:bg-siloam-bg text-siloam-text-primary transition-colors">
                        Cancel Navigation
                    </button>
                    <button onClick={onDiscard} className="px-4 py-2 rounded-xl bg-siloam-sidebar text-danger hover:bg-danger/10 border border-transparent hover:border-danger transition-colors">
                        Discard & Continue
                    </button>
                    <button onClick={onSave} className="px-4 py-2 rounded-xl bg-siloam-blue text-white hover:bg-siloam-blue/90 transition-colors">
                        Save & Continue
                    </button>
                </div>
            </div>
        </div>
    );
};
