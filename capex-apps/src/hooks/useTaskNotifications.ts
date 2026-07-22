'use client';

import { useEffect, useMemo, useRef } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { AdhocTaskStatus, Page, TaskCurrentStatus, type User, type UserTask } from '@/types';
import * as taskService from '@/services/taskService';
import { MY_TASKS_STALE_MS, resolveMyTasksForUser } from '@/hooks/queries/fetchMyTasksPage';
import { queryKeys } from '@/lib/query-keys';
import { filterMyTasksByUserScope } from '@/screens/MyTask/listUtils';
import type { UserScopesShape } from '@/lib/scopedFilterOptions';

const MAX_PERSISTED_OPEN_TASK_IDS = 3000;
const MAX_PERSISTED_REMINDER_KEYS = 6000;

function trimSetToNewest(set: Set<string>, maxSize: number): Set<string> {
  if (set.size <= maxSize) return set;
  const arr = Array.from(set);
  return new Set(arr.slice(Math.max(0, arr.length - maxSize)));
}

function safeParseStringArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === 'string');
  } catch {
    return [];
  }
}

function safeWriteStorageArray(key: string, values: string[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(values));
    return true;
  } catch {
    return false;
  }
}

type UseTaskNotificationsOptions = {
  currentUser: User | null;
  userScopes: UserScopesShape;
  selectedPeriodName: string;
  queryClient: QueryClient;
  desktopNotificationsEnabled: boolean;
  setDesktopNotificationsEnabled: (v: boolean) => void;
  setBrowserNotificationPermission: (p: NotificationPermission | 'unsupported') => void;
  pushNotification: (message: string, dedupeKey?: string) => void;
  refreshNotifications: () => Promise<void>;
};

export function useTaskNotifications({
  currentUser,
  userScopes,
  selectedPeriodName,
  queryClient,
  desktopNotificationsEnabled,
  setDesktopNotificationsEnabled,
  setBrowserNotificationPermission,
  pushNotification,
  refreshNotifications,
}: UseTaskNotificationsOptions) {
  const knownOpenTaskIdsRef = useRef<Set<string>>(new Set());
  const notifiedReminderTaskIdsRef = useRef<Set<string>>(new Set());
  const hasTaskBaselineRef = useRef(false);
  const taskNotificationCheckInFlightRef = useRef(false);
  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  const knownOpenTaskStorageKey = useMemo(
    () => (currentUser ? `known-open-task-ids-${currentUser.id}` : ''),
    [currentUser],
  );
  const notifiedReminderStorageKey = useMemo(
    () => (currentUser ? `notified-reminder-task-ids-${currentUser.id}` : ''),
    [currentUser],
  );
  const desktopNotificationSettingKey = useMemo(
    () => (currentUser ? `desktop-notification-enabled-${currentUser.id}` : ''),
    [currentUser],
  );
  const dailySummaryStorageKey = useMemo(
    () => (currentUser ? `daily-reminder-summary-date-${currentUser.id}` : ''),
    [currentUser],
  );

  useEffect(() => {
    if (!currentUser) return;

    if (typeof window !== 'undefined' && 'Notification' in window) {
      setBrowserNotificationPermission(Notification.permission);
    } else {
      setBrowserNotificationPermission('unsupported');
    }

    const savedDesktopSetting = localStorage.getItem(desktopNotificationSettingKey);
    if (savedDesktopSetting === null) {
      setDesktopNotificationsEnabled(true);
    } else {
      setDesktopNotificationsEnabled(savedDesktopSetting === 'true');
    }

    const savedOpenTaskIds = safeParseStringArray(localStorage.getItem(knownOpenTaskStorageKey));
    knownOpenTaskIdsRef.current = trimSetToNewest(new Set(savedOpenTaskIds), MAX_PERSISTED_OPEN_TASK_IDS);
    hasTaskBaselineRef.current = savedOpenTaskIds.length > 0;

    const savedReminderIds = safeParseStringArray(localStorage.getItem(notifiedReminderStorageKey));
    notifiedReminderTaskIdsRef.current = trimSetToNewest(
      new Set(savedReminderIds),
      MAX_PERSISTED_REMINDER_KEYS,
    );
  }, [
    currentUser,
    desktopNotificationSettingKey,
    knownOpenTaskStorageKey,
    notifiedReminderStorageKey,
    setBrowserNotificationPermission,
    setDesktopNotificationsEnabled,
  ]);

  useEffect(() => {
    if (!currentUser || !desktopNotificationsEnabled) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return;
    Notification.requestPermission()
      .then((permission) => setBrowserNotificationPermission(permission))
      .catch(() => {});
  }, [currentUser, desktopNotificationsEnabled, setBrowserNotificationPermission]);

  useEffect(() => {
    if (!currentUser) return;
    localStorage.setItem(desktopNotificationSettingKey, String(desktopNotificationsEnabled));
  }, [currentUser, desktopNotificationSettingKey, desktopNotificationsEnabled]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    refreshNotifications().catch((error) => {
      if (!cancelled) console.error('Failed to load notifications:', error);
    });
    return () => {
      cancelled = true;
    };
  }, [currentUser, refreshNotifications]);

  useEffect(() => {
    if (!currentUser) return;

    let cancelled = false;
    const MAX_PUSHES_PER_POLL = 20;

    const isTaskDone = (task: UserTask) =>
      task.status === TaskCurrentStatus.Done || task.status === AdhocTaskStatus.Done;

    const persistTaskNotificationState = () => {
      knownOpenTaskIdsRef.current = trimSetToNewest(
        knownOpenTaskIdsRef.current,
        MAX_PERSISTED_OPEN_TASK_IDS,
      );
      notifiedReminderTaskIdsRef.current = trimSetToNewest(
        notifiedReminderTaskIdsRef.current,
        MAX_PERSISTED_REMINDER_KEYS,
      );

      const openIds = Array.from(knownOpenTaskIdsRef.current);
      const reminderIds = Array.from(notifiedReminderTaskIdsRef.current);

      if (!safeWriteStorageArray(knownOpenTaskStorageKey, openIds)) {
        safeWriteStorageArray(knownOpenTaskStorageKey, openIds.slice(Math.max(0, openIds.length - 1000)));
      }
      if (!safeWriteStorageArray(notifiedReminderStorageKey, reminderIds)) {
        safeWriteStorageArray(
          notifiedReminderStorageKey,
          reminderIds.slice(Math.max(0, reminderIds.length - 2000)),
        );
      }
    };

    const checkTaskNotifications = async () => {
      if (taskNotificationCheckInFlightRef.current) return;
      taskNotificationCheckInFlightRef.current = true;

      try {
        let tasks: UserTask[];
        try {
          const { isCapexBeConfigured } = await import('@/services/myTasksApi');
          const period = selectedPeriodName || undefined;
          const taskQueryKey = queryKeys.myTasks.page(currentUser.id, period);
          const cachedBundle = queryClientRef.current.getQueryData<{ tasks: UserTask[] }>(taskQueryKey);
          const queryState = queryClientRef.current.getQueryState(taskQueryKey);
          const cacheFresh =
            cachedBundle?.tasks &&
            queryState?.dataUpdatedAt != null &&
            Date.now() - queryState.dataUpdatedAt < MY_TASKS_STALE_MS;

          if (cacheFresh && cachedBundle.tasks) {
            tasks = cachedBundle.tasks;
          } else if (isCapexBeConfigured()) {
            tasks = await resolveMyTasksForUser(
              queryClientRef.current,
              currentUser,
              period,
            );
          } else {
            tasks = await taskService.getTasksForUser(currentUser);
          }
        } catch (pollErr) {
          const benign =
            cancelled ||
            (pollErr != null &&
              typeof pollErr === 'object' &&
              ((pollErr as { name?: string }).name === 'CancelledError' ||
                (pollErr as { name?: string }).name === 'AbortError'));
          if (!benign) console.warn('Task notification poll failed:', pollErr);
          const snapshot = await import('@/lib/myTasksDiskCache').then((m) =>
            m.readMyTasksCacheAnyAge(currentUser.id, selectedPeriodName || undefined),
          );
          if (snapshot?.tasks?.length) tasks = snapshot.tasks;
          else return;
        }
        if (cancelled) return;

        const scopedTasks = filterMyTasksByUserScope(tasks, userScopes);
        const openTasks = scopedTasks.filter((task) => !isTaskDone(task));
        const currentOpenTaskIds = new Set(openTasks.map((task) => task.id));
        const previousOpenTaskIds = knownOpenTaskIdsRef.current;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (!hasTaskBaselineRef.current) {
          openTasks.forEach((task) => {
            if (!task.targetEndDate) return;
            const dueDate = new Date(task.targetEndDate);
            if (Number.isNaN(dueDate.getTime())) return;
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            if (diffDays < 0) notifiedReminderTaskIdsRef.current.add(`${task.id}-overdue`);
            else if (diffDays <= 1) notifiedReminderTaskIdsRef.current.add(`${task.id}-${diffDays}`);
          });
          knownOpenTaskIdsRef.current = currentOpenTaskIds;
          hasTaskBaselineRef.current = true;
          persistTaskNotificationState();
          return;
        }

        let pushesThisPoll = 0;
        let notifiedStateDirty = false;
        const activeReminderPrefixes = new Set(openTasks.map((task) => `${task.id}-`));
        const activeReminderKeys = new Set<string>([`daily-summary-${today.toISOString().split('T')[0]}`]);
        for (const prefix of activeReminderPrefixes) {
          activeReminderKeys.add(`${prefix}overdue`);
          activeReminderKeys.add(`${prefix}0`);
          activeReminderKeys.add(`${prefix}1`);
        }
        for (const existing of Array.from(notifiedReminderTaskIdsRef.current)) {
          if (existing.startsWith('daily-summary-')) continue;
          if (activeReminderKeys.has(existing)) continue;
          notifiedReminderTaskIdsRef.current.delete(existing);
          notifiedStateDirty = true;
        }
        const markReminderSeen = (reminderKey: string) => {
          if (notifiedReminderTaskIdsRef.current.has(reminderKey)) return false;
          notifiedReminderTaskIdsRef.current.add(reminderKey);
          notifiedStateDirty = true;
          return true;
        };
        const tryPush = (message: string, dedupeKey: string) => {
          if (pushesThisPoll >= MAX_PUSHES_PER_POLL) return false;
          if (!markReminderSeen(dedupeKey)) return false;
          pushesThisPoll += 1;
          pushNotification(message, dedupeKey);
          return true;
        };

        for (const task of openTasks.filter((t) => !previousOpenTaskIds.has(t.id))) {
          if (pushesThisPoll >= MAX_PUSHES_PER_POLL) break;
          tryPush(
            `Task baru: ${task.taskName} (${task.assetCode} - ${task.projectName})`,
            `new-task-${task.id}`,
          );
        }

        for (const task of openTasks) {
          if (pushesThisPoll >= MAX_PUSHES_PER_POLL) break;
          if (!task.targetEndDate) continue;
          const dueDate = new Date(task.targetEndDate);
          if (Number.isNaN(dueDate.getTime())) continue;
          const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays < 0) {
            tryPush(`Task terlambat: ${task.taskName} (${task.assetCode})`, `${task.id}-overdue`);
            continue;
          }
          if (diffDays <= 1) {
            tryPush(
              `Reminder: ${task.taskName} jatuh tempo ${diffDays === 0 ? 'hari ini' : 'besok'}`,
              `${task.id}-${diffDays}`,
            );
          }
        }

        const todayKey = new Date().toISOString().split('T')[0];
        const lastSummaryDate = localStorage.getItem(dailySummaryStorageKey);
        const summaryKey = `daily-summary-${todayKey}`;
        if (
          openTasks.length > 0 &&
          lastSummaryDate !== todayKey &&
          pushesThisPoll < MAX_PUSHES_PER_POLL &&
          !notifiedReminderTaskIdsRef.current.has(summaryKey)
        ) {
          const overdueCount = openTasks.filter((task) => {
            const dueDate = new Date(task.targetEndDate);
            return !Number.isNaN(dueDate.getTime()) && dueDate.getTime() < today.getTime();
          }).length;
          const dueSoonCount = openTasks.filter((task) => {
            const dueDate = new Date(task.targetEndDate);
            if (Number.isNaN(dueDate.getTime())) return false;
            const diffDays = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return diffDays >= 0 && diffDays <= 1;
          }).length;

          if (
            tryPush(
              `Info reminder harian: ${openTasks.length} task aktif, ${overdueCount} terlambat, ${dueSoonCount} due hari ini/besok.`,
              summaryKey,
            )
          ) {
            localStorage.setItem(dailySummaryStorageKey, todayKey);
          }
        }

        if (notifiedStateDirty) persistTaskNotificationState();
        knownOpenTaskIdsRef.current = currentOpenTaskIds;
        persistTaskNotificationState();
      } catch (error) {
        console.error('Failed to check task notifications:', error);
      } finally {
        taskNotificationCheckInFlightRef.current = false;
      }
    };

    checkTaskNotifications();
    const intervalId = window.setInterval(checkTaskNotifications, MY_TASKS_STALE_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    currentUser,
    userScopes,
    selectedPeriodName,
    knownOpenTaskStorageKey,
    notifiedReminderStorageKey,
    dailySummaryStorageKey,
    pushNotification,
  ]);

  return {
    resetTaskNotificationState: () => {
      taskNotificationCheckInFlightRef.current = false;
      knownOpenTaskIdsRef.current.clear();
      notifiedReminderTaskIdsRef.current.clear();
      hasTaskBaselineRef.current = false;
    },
  };
}
