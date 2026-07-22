import { proxyAuthToBackend } from '@/lib/auth/authBff';

export async function POST(req: Request) {
  const body = await req.text();
  return proxyAuthToBackend('/forgot-password', {
    method: 'POST',
    body,
  });
}
