import type { Notification } from '../types';
import { getAccessTokenForBackend } from '../lib/authSession';
import { isCapexBeConfigured, postToCapexBe } from '../lib/capexBeClient';
import { trackBackendFetch } from '../lib/backendFetchTelemetry';
import { resolveMyTasksAccessToken } from './myTasksApi';

async function resolveToken(): Promise<string | null> {
  return resolveMyTasksAccessToken(getAccessTokenForBackend);
}

export async function fetchNotificationsFromBackend(
  userId: number,
  accessToken?: string | null,
): Promise<Notification[] | null> {
  if (!isCapexBeConfigured()) {
    trackBackendFetch('notifications.list', 'fallback', { reason: 'missing_base_url' });
    return null;
  }
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    const data = await postToCapexBe<{ notifications?: Notification[] }>(
      '/notifications/list',
      { userId },
      token,
    );
    trackBackendFetch('notifications.list', 'success');
    return Array.isArray(data?.notifications) ? data.notifications : [];
  } catch (err) {
    trackBackendFetch('notifications.list', 'fallback', {
      reason: 'http_error',
      httpStatus: err instanceof Error && 'status' in err ? (err as { status: number }).status : undefined,
    });
    return null;
  }
}

export async function saveNotificationViaBackend(
  userId: number,
  notification: Notification,
  accessToken?: string | null,
): Promise<boolean> {
  if (!isCapexBeConfigured()) return false;
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    await postToCapexBe('/notifications/save', { userId, notification }, token);
    trackBackendFetch('notifications.save', 'success');
    return true;
  } catch {
    trackBackendFetch('notifications.save', 'fallback', { reason: 'http_error' });
    return false;
  }
}

export async function markNotificationReadViaBackend(
  userId: number,
  notificationId: string,
  accessToken?: string | null,
): Promise<boolean> {
  if (!isCapexBeConfigured()) return false;
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    await postToCapexBe('/notifications/mark-read', { userId, notificationId }, token);
    trackBackendFetch('notifications.markRead', 'success');
    return true;
  } catch {
    trackBackendFetch('notifications.markRead', 'fallback', { reason: 'http_error' });
    return false;
  }
}

export async function markAllNotificationsReadViaBackend(
  userId: number,
  accessToken?: string | null,
): Promise<boolean> {
  if (!isCapexBeConfigured()) return false;
  const token = accessToken !== undefined ? accessToken : await resolveToken();
  try {
    await postToCapexBe('/notifications/mark-all-read', { userId }, token);
    trackBackendFetch('notifications.markAllRead', 'success');
    return true;
  } catch {
    trackBackendFetch('notifications.markAllRead', 'fallback', { reason: 'http_error' });
    return false;
  }
}
