import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function POST(req: Request) {
  return proxyAuthToBackend('/heartbeat', { method: 'POST' }, req);
}
