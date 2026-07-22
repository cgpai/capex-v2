import * as https from 'node:https';
import { URL } from 'node:url';

/**
 * fetch() for Supabase using Node https (honours win-ca / NODE_EXTRA_CA_CERTS on Windows).
 * Supabase JS defaults to undici, which may not use the same trust store as https.request.
 */
export function supabaseHttpsFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === 'string'
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL((input as Request).url);

  const method = (init?.method ?? 'GET').toUpperCase();
  const headerInit = init?.headers;
  const headers: Record<string, string> = {};
  if (headerInit instanceof Headers) {
    headerInit.forEach((v, k) => {
      headers[k] = v;
    });
  } else if (Array.isArray(headerInit)) {
    for (const [k, v] of headerInit) headers[k] = v;
  } else if (headerInit && typeof headerInit === 'object') {
    Object.assign(headers, headerInit as Record<string, string>);
  }

  let body: string | Buffer | undefined;
  if (init?.body != null) {
    if (typeof init.body === 'string') {
      body = init.body;
    } else if (Buffer.isBuffer(init.body)) {
      body = init.body;
    } else if (init.body instanceof Uint8Array) {
      body = Buffer.from(init.body);
    } else {
      body = String(init.body);
    }
  }

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        method,
        headers,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => {
          const responseBody = Buffer.concat(chunks);
          const status = res.statusCode ?? 500;
          const outHeaders = new Headers();
          for (const [key, value] of Object.entries(res.headers)) {
            if (value == null) continue;
            if (Array.isArray(value)) {
              for (const v of value) outHeaders.append(key, v);
            } else {
              outHeaders.set(key, value);
            }
          }
          const init: ResponseInit = {
            status,
            statusText: res.statusMessage,
            headers: outHeaders,
          };
          // Node fetch rejects Response( body, { status: 204 } ) — must use null body.
          const noBody = status === 204 || status === 205 || status === 304;
          resolve(
            noBody || responseBody.length === 0
              ? new Response(null, init)
              : new Response(responseBody, init),
          );
        });
      },
    );
    req.on('error', reject);
    if (body != null) req.write(body);
    req.end();
  });
}
