import { proxyAuthRedirectToBackend } from '@/lib/auth/authBff';
import { sanitizeOAuthReturnTo } from '@/lib/auth/oauthReturnTo';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const returnTo = sanitizeOAuthReturnTo(url.searchParams.get('returnTo'));
  const qs = new URLSearchParams({ returnTo });
  return proxyAuthRedirectToBackend(`/azure/start?${qs.toString()}`, req);
}
