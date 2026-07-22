import { proxyAuthToBackend, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/authBff';
import { CSRF_COOKIE } from '@/lib/auth/authConstants';

export async function POST(req: Request) {
  const res = await proxyAuthToBackend('/refresh', { method: 'POST' }, req);
  if (res.status === 401 || res.status === 403) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    res.cookies.delete(CSRF_COOKIE);
  }
  return res;
}
