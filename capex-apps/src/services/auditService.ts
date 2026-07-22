import { Project, User, AuditLog } from '../types';
import {
  fetchAuditLogsForEntityFromBackend,
  saveAuditLogsBatchViaBackend,
} from './auditApi';

/**
 * Compares the old and new project state and saves audit logs for any detected changes.
 * Pass `newProject = null` when a project is deleted.
 */
export const logProjectChanges = async (
  originalProject: Project,
  newProject: Project | null,
  user: User,
): Promise<void> => {
  const changes: Partial<AuditLog>[] = [];
  const now = new Date().toISOString();

  if (!newProject) {
    changes.push({
      entityId: originalProject.id,
      entityType: 'Project',
      action: 'Delete',
      fieldName: 'Project',
      oldValue: originalProject.projectName,
      newValue: null,
      changedBy: user.username,
      timestamp: now,
    });
  } else {
    const checkChange = (field: keyof Project, label: string) => {
      if (originalProject[field] !== newProject[field]) {
        changes.push({
          entityId: newProject.id,
          entityType: 'Project',
          action: 'Update',
          fieldName: label,
          oldValue: originalProject[field] as string | number,
          newValue: newProject[field] as string | number,
          changedBy: user.username,
          timestamp: now,
        });
      }
    };

    checkChange('projectName', 'Project Name');
    checkChange('budgetPlan', 'Budget Plan');
    checkChange('budgetCarryForward', 'Budget Carry Forward');
    checkChange('approvedBudget', 'Approved Budget');
    checkChange('targetStart', 'Target Start Date');
    checkChange('endDate', 'End Date');
    checkChange('budgetCategoryId', 'Budget Category');
    checkChange('priorityId', 'Priority');
    checkChange('owner', 'Owner');
  }

  const logs: AuditLog[] = changes.map((change) => ({
    id: `audit-${change.entityId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    ...change,
  })) as AuditLog[];

  if (!logs.length) return;

  const saved = await saveAuditLogsBatchViaBackend(user.id, logs);
  if (!saved) {
    console.warn('[audit] backend save failed');
  }
};

export const getProjectHistory = async (
  projectId: string,
  userId?: number,
): Promise<AuditLog[]> => {
  if (userId != null) {
    const fromBe = await fetchAuditLogsForEntityFromBackend(userId, projectId);
    if (fromBe) return fromBe;
  }
  return [];
};
