import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'crypto';
import { AuthZService } from '../auth/auth-z.service';
import { fetchAllRecords } from '../project-list/supabase-helpers';
import { USER_DIRECTORY_COLUMNS } from '../shared/response-sanitize.util';
import {
  createSupabaseClient,
  getSupabaseServiceKey,
} from '../shared/supabase-client.factory';
import { collectEmailsFromWorkbook, readWorkbookFromUpload } from './office-email-parse';

export type OfficeDiffUserRow = { id: number; email: string; username: string };

function randomInitialPassword(): string {
  return randomBytes(24).toString('base64url');
}

export type SyncUsersToAuthResult = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
};

@Injectable()
export class UserAdminService {
  constructor(private readonly authZ: AuthZService) {}

  private async adminClient(accessToken: string, appUserId: number): Promise<SupabaseClient> {
    const ctx = await this.authZ.assertAnyRole(accessToken, appUserId, ['super_admin']);
    return ctx.client;
  }

  private async pmoOrAdminClient(accessToken: string, appUserId: number): Promise<SupabaseClient> {
    const ctx = await this.authZ.assertAnyRole(accessToken, appUserId, ['super_admin', 'pmo']);
    return ctx.client;
  }

  async compareOfficeList(
    accessToken: string,
    appUserId: number,
    file: { buffer: Buffer; originalname: string },
  ): Promise<{ officeEmailCount: number; filename: string; notInOffice: OfficeDiffUserRow[] }> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Missing or empty file');
    }
    const wb = readWorkbookFromUpload(file.buffer, file.originalname || 'upload');
    const officeEmails = collectEmailsFromWorkbook(wb);
    if (officeEmails.size === 0) {
      throw new BadRequestException('No email addresses found in the uploaded file');
    }

    const client = await this.pmoOrAdminClient(accessToken, appUserId);
    const rows = await fetchAllRecords(client, 'users', USER_DIRECTORY_COLUMNS);
    const notInOffice: OfficeDiffUserRow[] = rows
      .map((u: { id?: unknown; email?: unknown; username?: unknown }) => ({
        id: Number(u.id),
        email: String(u.email ?? ''),
        username: String(u.username ?? ''),
      }))
      .filter((u) => Number.isFinite(u.id))
      .filter((u) => {
        const e = u.email.trim().toLowerCase();
        if (!e) return true;
        return !officeEmails.has(e);
      });

    return {
      officeEmailCount: officeEmails.size,
      filename: file.originalname || 'upload',
      notInOffice,
    };
  }

  async bulkDeleteUsers(accessToken: string, appUserId: number, ids: number[]): Promise<{ deleted: number }> {
    const unique = [...new Set(ids.map((x) => Number(x)))].filter((n) => Number.isFinite(n) && n > 0);
    if (!unique.length) {
      throw new BadRequestException('No valid user ids to delete');
    }
    if (unique.includes(Number(appUserId))) {
      throw new BadRequestException('Cannot delete your own user account');
    }

    const client = await this.adminClient(accessToken, appUserId);
    const { error } = await client.from('users').delete().in('id', unique);
    if (error) {
      throw new BadRequestException(error.message);
    }
    return { deleted: unique.length };
  }

  async syncUsersToAuth(
    accessToken: string,
    appUserId: number,
  ): Promise<SyncUsersToAuthResult> {
    await this.adminClient(accessToken, appUserId);

    const serviceKey = getSupabaseServiceKey();
    if (!serviceKey) {
      throw new BadRequestException('SUPABASE_SERVICE_ROLE_KEY not configured');
    }

    const admin = createSupabaseClient(serviceKey);
    const { data: appUsers, error: fetchError } = await admin
      .from('users')
      .select('id, username, email, auth_id');

    if (fetchError) {
      throw new BadRequestException(fetchError.message);
    }

    if (!appUsers?.length) {
      return {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: [],
        message: 'No users in public.users',
      };
    }

    const results: SyncUsersToAuthResult = {
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
      message: '',
    };

    for (const u of appUsers) {
      const email = String(u.email ?? '')
        .trim()
        .toLowerCase();
      if (!email) {
        results.errors.push(`User id=${u.id} has no email, skipped`);
        continue;
      }

      const opts = {
        email,
        password: randomInitialPassword(),
        email_confirm: true as const,
        user_metadata: { username: u.username, public_user_id: u.id },
      };

      const { data: authUser, error } = await admin.auth.admin.createUser(opts);

      if (error) {
        const alreadyExists =
          error.message?.includes('already') || error.message?.includes('registered');
        if (!alreadyExists) {
          results.errors.push(`${email}: ${error.message}`);
          continue;
        }

        const existingAuthId = await this.findAuthUserIdByEmail(admin, email);
        if (!existingAuthId) {
          results.skipped++;
          results.errors.push(`${email}: already in auth but user id not found`);
          continue;
        }

        const { error: updateErr } = await admin.auth.admin.updateUserById(existingAuthId, {
          email_confirm: true,
        });
        if (updateErr) {
          results.errors.push(`${email}: ${updateErr.message}`);
          continue;
        }

        await admin.from('users').update({ auth_id: existingAuthId }).eq('id', u.id);
        results.updated++;
        continue;
      }

      results.created++;
      if (authUser?.user?.id) {
        await admin.from('users').update({ auth_id: authUser.user.id }).eq('id', u.id);
      }
    }

    results.message = `Created ${results.created}, linked ${results.updated}, skipped ${results.skipped}. ${results.errors.length} error(s). New accounts require password reset before login.`;
    return results;
  }

  private async findAuthUserIdByEmail(
    admin: SupabaseClient,
    email: string,
  ): Promise<string | null> {
    const target = email.trim().toLowerCase();
    let page = 1;
    const perPage = 200;

    while (page <= 50) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
      if (error) {
        throw new BadRequestException(error.message);
      }
      const users = data?.users ?? [];
      const match = users.find((row) => row.email?.trim().toLowerCase() === target);
      if (match?.id) return match.id;
      if (users.length < perPage) break;
      page += 1;
    }

    return null;
  }
}
