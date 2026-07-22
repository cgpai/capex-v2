import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function GET() {
  return proxyAuthToBackend('/me', { method: 'GET' });
}
