
import React, { useState, useEffect, useMemo } from 'react';
import { Project, BudgetCategoryConfig } from '../../../types';
import { SpreadsheetTable, SpreadsheetColumn } from '../SpreadsheetTable/SpreadsheetTable';

interface MassEditProjectsModalProps {
    isOpen: boolean;
    onClose: () => void;
    projects: Project[];
    onSave: (updatedProjects: Project[]) => void;
    allCategories: BudgetCategoryConfig[];
}

export const MassEditProjectsModal: React.FC<MassEditProjectsModalProps> = ({ isOpen, onClose, projects, onSave, allCategories }) => {
    const [editedProjects, setEditedProjects] = useState<Project[]>([]);

    useEffect(() => {
        if (isOpen) {
            setEditedProjects(JSON.parse(JSON.stringify(projects)));
        }
    }, [isOpen, projects]);

    const handleSave = () => {
        onSave(editedProjects);
        onClose();
    };

    const columns: SpreadsheetColumn<Project>[] = useMemo(() => [
        { header: 'Project Code', accessor: 'projectCode', isEditable: false },
        { header: 'Project Name', accessor: 'projectName', isEditable: true },
        {
            header: 'Budget Category',
            accessor: 'budgetCategoryId',
            isEditable: true,
            editorType: 'select',
            selectOptions: allCategories.filter(c => c.isActive).map(c => ({ value: c.id, label: c.name })),
        },
        { header: 'Budget Plan', accessor: 'budgetPlan', isNumeric: true, isEditable: true },
        { header: 'Budget Carry Forward', accessor: 'budgetCarryForward', isNumeric: true, isEditable: true },
        { header: 'Approved Budget', accessor: 'approvedBudget', isNumeric: true, isEditable: true },
    ], [allCategories]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 animate-fade-in">
            <div className="bg-siloam-surface rounded-xl shadow-lg w-full max-w-6xl max-h-[90vh] flex flex-col">
                <div className="p-4 border-b border-siloam-border">
                    <h3 className="text-lg font-bold text-siloam-text-primary">Mass Edit Strategic Projects</h3>
                    <p className="text-sm text-siloam-text-secondary">You can copy and paste data from an Excel sheet into this table.</p>
                </div>
                
                <div className="flex-1 overflow-y-auto p-4">
                    <SpreadsheetTable
                        columns={columns}
                        data={editedProjects}
                        onDataChange={setEditedProjects}
                        rowHeaderAccessor="projectName"
                    />
                </div>
                
                <div className="p-4 border-t border-siloam-border flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 rounded-md border border-siloam-border">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 rounded-md bg-siloam-blue text-white">Save Changes</button>
                </div>
            </div>
        </div>
    );
};
