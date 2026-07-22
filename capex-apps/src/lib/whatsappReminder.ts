import type { EnrichedAsset, Project, User } from '../types';

export interface WhatsAppReminderPayload {
  taskId: string;
  taskName: string;
  assignedRoleNames: string[];
}

export function normalizeWhatsAppPhone(phone?: string | null): string {
  if (!phone?.trim()) return '';
  let digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `62${digits.slice(1)}`;
  return digits.length >= 10 ? digits : '';
}

export function userMatchesRoleAndScope(
  user: User,
  roleNames: string[],
  hospitalUnitName?: string,
): boolean {
  if (!roleNames.length) return false;
  return user.assignments.some((assignment) => {
    if (!roleNames.includes(assignment.roleName)) return false;
    if (assignment.assignedScopes.includes('All')) return true;
    if (!hospitalUnitName) return false;
    return assignment.assignedScopes.some((scope) => scope === hospitalUnitName);
  });
}

export function resolveWhatsAppRecipients(
  allUsers: User[],
  assignedRoleNames: string[],
  hospitalUnitName?: string,
): User[] {
  const seen = new Set<number>();
  return allUsers.filter((user) => {
    if (seen.has(user.id)) return false;
    if (!userMatchesRoleAndScope(user, assignedRoleNames, hospitalUnitName)) return false;
    seen.add(user.id);
    return true;
  });
}

export function resolveAssetCodeDisplay(
  asset?: EnrichedAsset | null,
  project?: Project | null,
): string {
  return asset?.assetCode?.trim() || project?.assetCode?.trim() || '-';
}

export function buildWhatsAppReminderMessage(params: {
  taskName: string;
  taskDescription?: string;
  project?: Project | null;
  asset?: EnrichedAsset | null;
  currentUser: User;
}): string {
  const { taskName, taskDescription, project, asset, currentUser } = params;
  const assetCodeDisplay = resolveAssetCodeDisplay(asset, project);
  const parts: string[] = [];

  parts.push('*Reminder: Task Execution Required*');
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

  parts.push(`✅ *Task:* ${taskName}`);
  if (taskDescription?.trim()) {
    parts.push(`   ${taskDescription.trim()}`);
  }

  parts.push('');
  parts.push('⏰ *Action Required:* Please complete this task as soon as possible.');
  parts.push('');
  parts.push(`Sent by: ${currentUser.username}`);
  parts.push(`Date: ${new Date().toLocaleDateString('id-ID')}`);

  return parts.join('\n');
}

export type WhatsAppOpenMode = 'direct' | 'picker';

export function openWhatsAppWithMessage(message: string, phone?: string): WhatsAppOpenMode {
  const encoded = encodeURIComponent(message);
  const normalized = phone ? normalizeWhatsAppPhone(phone) : '';

  if (normalized) {
    window.open(`https://wa.me/${normalized}?text=${encoded}`, '_blank');
    return 'direct';
  }

  window.open(`https://wa.me/?text=${encoded}`, '_blank');
  return 'picker';
}

export function openWhatsAppReminder(params: {
  message: string;
  recipients: User[];
}): { mode: WhatsAppOpenMode; recipient?: User } {
  const { message, recipients } = params;
  const withPhone = recipients
    .map((user) => ({ user, phone: normalizeWhatsAppPhone(user.phoneNumber) }))
    .filter((entry) => entry.phone);

  if (withPhone.length === 1) {
    openWhatsAppWithMessage(message, withPhone[0].phone);
    return { mode: 'direct', recipient: withPhone[0].user };
  }

  openWhatsAppWithMessage(message);
  return { mode: 'picker' };
}
