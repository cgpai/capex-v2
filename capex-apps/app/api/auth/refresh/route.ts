import { cookies } from 'next/headers';
import { proxyAuthToBackend, ACCESS_COOKIE, REFRESH_COOKIE } from '@/lib/auth/authBff';
import { CSRF_COOKIE } from '@/lib/auth/authConstants';

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const hadRefresh = Boolean(cookieStore.get(REFRESH_COOKIE)?.value?.trim());
  const res = await proxyAuthToBackend('/refresh', { method: 'POST' }, req);
  if (hadRefresh && (res.status === 401 || res.status === 403)) {
    res.cookies.delete(ACCESS_COOKIE);
    res.cookies.delete(REFRESH_COOKIE);
    res.cookies.delete(CSRF_COOKIE);
  }
  return res;
}
