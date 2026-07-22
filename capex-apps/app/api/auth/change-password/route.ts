import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function POST(req: Request) {
  return proxyAuthToBackend('/change-password', { method: 'POST' }, req);
}
