export type OfficeListDiffRow = { id: number; email: string; username: string };

export type OfficeListDiffResponse = {
  officeEmailCount: number;
  filename: string;
  notInOffice: OfficeListDiffRow[];
};

export type SyncUsersToAuthResponse = {
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  message: string;
};

import { postToCapexBe, capexBeRequestUrl, useBeBffProxy } from '../lib/capexBeClient';
import { authenticatedFetch } from '../lib/auth/authenticatedFetch';

export async function postOfficeListDiff(
  file: File,
  accessToken: string,
  appUserId: number,
): Promise<OfficeListDiffResponse> {
  const fd = new FormData();
  fd.append('userId', String(appUserId));
  fd.append('file', file, file.name);

  const bff = useBeBffProxy();
  if (!bff && !process.env.NEXT_PUBLIC_CAPEXBE_URL?.trim()) {
    throw new Error('NEXT_PUBLIC_CAPEXBE_URL is not set');
  }

  const res = await (bff ? authenticatedFetch : fetch)(capexBeRequestUrl('/user-admin/office-list-diff'), {
    method: 'POST',
    headers: bff ? undefined : { Authorization: `Bearer ${accessToken}` },
    body: fd,
    credentials: bff ? 'include' : 'same-origin',
    ...(bff ? { retryOn401: true } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as OfficeListDiffResponse;
}

export async function postBulkDeleteUsers(
  ids: number[],
  accessToken: string | null,
  appUserId: number,
): Promise<{ deleted: number }> {
  return postToCapexBe<{ deleted: number }>(
    '/user-admin/bulk-delete',
    { userId: appUserId, ids },
    accessToken,
  );
}

/** Sync public.users → Supabase Auth via capexbe (password default 123456). */
export async function postSyncUsersToAuth(appUserId: number): Promise<SyncUsersToAuthResponse> {
  return postToCapexBe<SyncUsersToAuthResponse>(
    '/user-admin/sync-to-auth',
    { userId: appUserId },
    null,
  );
}
