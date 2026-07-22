import type { Notification } from '../types';
import {
  fetchNotificationsFromBackend,
  markAllNotificationsReadViaBackend,
  markNotificationReadViaBackend,
  saveNotificationViaBackend,
} from './notificationsApi';

const SAVE_CONCURRENCY = 2;
let activeSaves = 0;
const saveQueue: Array<() => Promise<void>> = [];

function drainNotificationSaveQueue(): void {
  while (activeSaves < SAVE_CONCURRENCY && saveQueue.length > 0) {
    const job = saveQueue.shift();
    if (!job) break;
    activeSaves += 1;
    void job().finally(() => {
      activeSaves -= 1;
      drainNotificationSaveQueue();
    });
  }
}

/** Stable id for upsert — avoids duplicate rows when the same reminder is retried. */
export function buildNotificationId(userId: number, dedupeKey: string): string {
  const safe = dedupeKey.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120);
  return `notif-${userId}-${safe}`;
}

export const createNotification = (notification: Notification): Promise<void> =>
  new Promise((resolve, reject) => {
    saveQueue.push(async () => {
      try {
        const saved = await saveNotificationViaBackend(notification.userId, notification);
        if (!saved) {
          throw new Error('Backend notification save failed');
        }
        resolve();
      } catch (error) {
        reject(error);
      }
    });
    drainNotificationSaveQueue();
  });

export const getNotificationsForUser = async (userId: number): Promise<Notification[]> => {
  const fromBe = await fetchNotificationsFromBackend(userId);
  if (fromBe) {
    return fromBe.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }
  return [];
};

export const markNotificationAsRead = async (
  userId: number,
  notificationId: string,
): Promise<void> => {
  const ok = await markNotificationReadViaBackend(userId, notificationId);
  if (!ok) {
    throw new Error('Backend mark-read failed');
  }
};

export const markAllNotificationsAsRead = async (userId: number): Promise<void> => {
  const ok = await markAllNotificationsReadViaBackend(userId);
  if (!ok) {
    throw new Error('Backend mark-all-read failed');
  }
};
