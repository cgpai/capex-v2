import { proxyAuthRedirectToBackend } from '@/lib/auth/authBff';

export async function GET(req: Request) {
  const url = new URL(req.url);
  return proxyAuthRedirectToBackend(`/azure/callback${url.search}`, req);
}
