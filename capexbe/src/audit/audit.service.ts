import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthContextService } from '../auth/auth-context.service';
import { AuthZService } from '../auth/auth-z.service';
import { getUserById } from '../project-list/master-data.loader';
import { toCamelCase } from '../project-list/supabase-helpers';
import { assertAnyHierarchyPermission } from '../shared/authz-helpers.util';

const AUDIT_LOG_COLUMNS =
  'id,entity_id,entity_type,action,field_name,old_value,new_value,changed_by,timestamp';
const MAX_AUDIT_BATCH = 100;

type AuditLogInput = {
  id: string;
  entityId: string;
  entityType: string;
  action: string;
  fieldName: string;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  changedBy: string;
  timestamp: string;
};

function auditLogToRow(log: AuditLogInput) {
  return {
    id: log.id,
    entity_id: log.entityId,
    entity_type: log.entityType,
    action: log.action,
    field_name: log.fieldName,
    old_value: log.oldValue ?? null,
    new_value: log.newValue ?? null,
    changed_by: log.changedBy,
    timestamp: log.timestamp,
  };
}

@Injectable()
export class AuditService {
  constructor(
    private readonly authContext: AuthContextService,
    private readonly authZ: AuthZService,
  ) {}

  private parseUserId(body: unknown): number {
    const userId = Number((body as Record<string, unknown>)?.userId);
    if (!Number.isFinite(userId)) throw new BadRequestException('Invalid userId');
    return userId;
  }

  private async assertAuditRead(accessToken: string, userId: number): Promise<void> {
    await assertAnyHierarchyPermission(this.authZ, accessToken, userId, [
      { hierarchy: 'Budget HU', level: 'view' },
      { hierarchy: 'Capex Project List', level: 'view' },
    ]);
  }

  private async assertAuditWrite(accessToken: string, userId: number): Promise<void> {
    await assertAnyHierarchyPermission(this.authZ, accessToken, userId, [
      { hierarchy: 'Budget HU', level: 'update' },
      { hierarchy: 'Capex Project List', level: 'update' },
    ]);
  }

  async listForEntity(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; entityId?: string };
    const userId = this.parseUserId(b);
    const entityId = String(b.entityId ?? '').trim();
    if (!entityId) throw new BadRequestException('entityId is required');

    await this.assertAuditRead(accessToken, userId);
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const { data, error } = await client
      .from('audit_logs')
      .select(AUDIT_LOG_COLUMNS)
      .eq('entity_id', entityId);
    if (error) throw new BadRequestException(error.message);
    const logs = (data ?? []).map((row) => toCamelCase(row));
    logs.sort(
      (a, b) =>
        new Date(String(b.timestamp ?? '')).getTime() - new Date(String(a.timestamp ?? '')).getTime(),
    );
    return { logs };
  }

  async saveBatch(accessToken: string, body: unknown) {
    const b = (body ?? {}) as { userId?: number; logs?: AuditLogInput[] };
    const userId = this.parseUserId(b);
    const logs = Array.isArray(b.logs) ? b.logs : [];
    if (!logs.length) return { saved: 0 };
    if (logs.length > MAX_AUDIT_BATCH) {
      throw new BadRequestException(`Maximum ${MAX_AUDIT_BATCH} audit logs per batch`);
    }

    await this.assertAuditWrite(accessToken, userId);
    const { client } = await this.authContext.getRlsClient(accessToken, userId);
    const actor = await getUserById(client, userId);
    const actorUsername = String(actor?.username ?? '').trim();
    if (!actorUsername) {
      throw new BadRequestException('Authenticated user not found');
    }

    for (const log of logs) {
      const changedBy = String(log.changedBy ?? '').trim();
      if (changedBy !== actorUsername) {
        throw new BadRequestException('changedBy must match the authenticated user');
      }
    }

    const rows = logs.map(auditLogToRow);
    const { error } = await client.from('audit_logs').upsert(rows);
    if (error) throw new BadRequestException(error.message);
    return { saved: rows.length };
  }
}
