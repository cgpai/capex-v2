import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { toCamelCase } from '../project-list/supabase-helpers';

const NOTIFICATION_COLUMNS =
  'id,user_id,message,type,is_read,created_at,link_to_page';

type NotificationInput = {
  id: string;
  userId: number;
  message: string;
  type?: string;
  isRead?: boolean;
  createdAt?: string;
  linkToPage?: string | null;
};

function notificationToRow(n: NotificationInput) {
  return {
    id: n.id,
    user_id: n.userId,
    message: n.message,
    type: n.type ?? 'task',
    is_read: n.isRead ?? false,
    created_at: n.createdAt ?? new Date().toISOString(),
    link_to_page: n.linkToPage ?? null,
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private parseUserId(body: unknown): number {
    const userId = Number((body as Record<string, unknown>)?.userId);
    if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
    return userId;
  }

  async list(accessToken: string, body: unknown) {
    const userId = this.parseUserId(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    const notifications = (data ?? []).map((row) => toCamelCase(row));
    return { notifications };
  }

  async save(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; notification?: NotificationInput };
    const userId = this.parseUserId(b);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'update');
    const notification = b.notification;
    if (!notification?.id?.trim()) throw new BadRequestException('notification.id is required');
    if (Number(notification.userId) !== userId) {
      throw new BadRequestException('notification.userId must match authenticated user');
    }

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const row = notificationToRow({ ...notification, userId });
    const { data, error } = await client
      .from('notifications')
      .upsert(row)
      .select(NOTIFICATION_COLUMNS)
      .single();
    if (error) throw new BadRequestException(error.message);
    return { notification: toCamelCase(data) };
  }

  async markRead(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; notificationId?: string };
    const userId = this.parseUserId(b);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const notificationId = String(b.notificationId ?? '').trim();
    if (!notificationId) throw new BadRequestException('notificationId is required');

    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  async markAllRead(accessToken: string, body: unknown) {
    const userId = this.parseUserId(body);
    await this.authZ.assertHierarchyPermission(accessToken, userId, 'My Task', 'view');
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const { error } = await client
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }
}
