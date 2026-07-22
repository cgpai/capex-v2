import { proxyBePost } from '@/lib/auth/beProxy';
import { CSRF_HEADER } from '@/lib/auth/authConstants';

type Params = { params: Promise<{ path: string[] }> };

export async function POST(req: Request, ctx: Params) {
  const { path } = await ctx.params;
  const segment = path.join('/');
  const bePath = `/${segment}`;
  const csrfHeader = req.headers.get(CSRF_HEADER);
  const contentType = req.headers.get('content-type');

  if (contentType?.includes('multipart/form-data')) {
    const body = await req.arrayBuffer();
    return proxyBePost(bePath, body, csrfHeader, contentType);
  }

  const body = await req.text();
  return proxyBePost(bePath, body, csrfHeader, contentType);
}
