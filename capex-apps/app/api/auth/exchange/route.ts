import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function POST(req: Request) {
  const auth = req.headers.get('authorization');
  return proxyAuthToBackend('/exchange', {
    method: 'POST',
    headers: auth ? { Authorization: auth } : undefined,
  });
}
