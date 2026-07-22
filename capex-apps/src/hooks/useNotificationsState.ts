'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import type { Notification } from '@/types';
import { queryKeys } from '@/lib/query-keys';
import * as notificationService from '@/services/notificationService';

export function useNotificationsState(userId: number | null) {
  const qc = useQueryClient();
  const enabled = userId != null;

  const query = useQuery({
    queryKey: userId != null ? queryKeys.notifications.list(userId) : ['notifications', 'idle'],
    queryFn: () => notificationService.getNotificationsForUser(userId!),
    enabled,
  });

  const markOne = useMutation({
    mutationFn: async (id: string) => {
      if (userId == null) throw new Error('Not signed in');
      await notificationService.markNotificationAsRead(userId, id);
    },
    onMutate: async (id) => {
      if (userId == null) return;
      await qc.cancelQueries({ queryKey: queryKeys.notifications.list(userId) });
      const prev = qc.getQueryData<Notification[]>(queryKeys.notifications.list(userId));
      qc.setQueryData<Notification[]>(queryKeys.notifications.list(userId), (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, isRead: true } : n)),
      );
      return { prev };
    },
    onError: (_e, _id, ctx) => {
      if (userId != null && ctx?.prev) qc.setQueryData(queryKeys.notifications.list(userId), ctx.prev);
    },
  });

  const markAll = useMutation({
    mutationFn: async () => {
      if (userId == null) throw new Error('Not signed in');
      await notificationService.markAllNotificationsAsRead(userId);
    },
    onMutate: async () => {
      if (userId == null) return;
      await qc.cancelQueries({ queryKey: queryKeys.notifications.list(userId) });
      const prev = qc.getQueryData<Notification[]>(queryKeys.notifications.list(userId));
      qc.setQueryData<Notification[]>(queryKeys.notifications.list(userId), (old) =>
        (old ?? []).map((n) => ({ ...n, isRead: true })),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (userId != null && ctx?.prev) qc.setQueryData(queryKeys.notifications.list(userId), ctx.prev);
    },
  });

  const invalidate = useCallback(async () => {
    if (userId == null) return;
    await qc.invalidateQueries({ queryKey: queryKeys.notifications.list(userId) });
  }, [qc, userId]);

  const prependNotification = useCallback(
    (n: Notification) => {
      if (userId == null) return;
      qc.setQueryData<Notification[]>(queryKeys.notifications.list(userId), (old) => [n, ...(old ?? [])].slice(0, 100));
    },
    [qc, userId],
  );

  return {
    notifications: query.data ?? [],
    markAsRead: (id: string) => markOne.mutate(id),
    markAllAsRead: () => markAll.mutate(),
    invalidate,
    prependNotification,
  };
}
