'use server';

import { proxyAuthToBackend } from '@/lib/auth/authBff';
import { proxyBePost } from '@/lib/auth/beProxy';

async function resolveServerUserId(): Promise<number | null> {
  const meRes = await proxyAuthToBackend('/me', { method: 'GET' });
  if (!meRes.ok) return null;
  const me = (await meRes.json()) as { authenticated?: boolean; user?: { id?: number } };
  if (!me.authenticated || me.user?.id == null) return null;
  const userId = Number(me.user.id);
  return Number.isFinite(userId) ? userId : null;
}

/** @deprecated Prefer notificationService.markNotificationAsRead via BFF. */
export async function markNotificationReadAction(
  notificationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await resolveServerUserId();
  if (userId == null) return { ok: false, error: 'Unauthorized' };

  const res = await proxyBePost(
    '/notifications/mark-read',
    JSON.stringify({ userId, notificationId }),
    null,
  );
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || 'Failed to mark notification read' };
  }
  return { ok: true };
}

/** @deprecated Prefer notificationService.markAllNotificationsAsRead via BFF. */
export async function markAllNotificationsReadAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  const userId = await resolveServerUserId();
  if (userId == null) return { ok: false, error: 'Unauthorized' };

  const res = await proxyBePost('/notifications/mark-all-read', JSON.stringify({ userId }), null);
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, error: text || 'Failed to mark all notifications read' };
  }
  return { ok: true };
}
