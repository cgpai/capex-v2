import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function POST(req: Request) {
  const body = await req.text();
  return proxyAuthToBackend('/login', {
    method: 'POST',
    body,
  });
}
