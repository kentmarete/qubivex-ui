import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { vi } from 'vitest';

export const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

/** A stream that emits `chunks` (strings), then closes, or stays open if `hold`. */
export function textStream(chunks: string[], opts: { hold?: boolean; signal?: AbortSignal | null } = {}) {
  const enc = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      opts.signal?.addEventListener('abort', () => {
        try {
          ctrl.error(new DOMException('The operation was aborted.', 'AbortError'));
        } catch {
          /* closed */
        }
      });
      for (const c of chunks) {
        if (opts.signal?.aborted) return;
        ctrl.enqueue(enc.encode(c));
        await new Promise((r) => setTimeout(r, 0));
      }
      if (!opts.hold) ctrl.close();
    },
  });
}

/** Splits text into pieces of `n` bytes, so SSE lines cross chunk boundaries. */
export function pieces(text: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += n) out.push(text.slice(i, i + n));
  return out;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-test-1', ...headers },
  });
}

export const unauthorized = () =>
  json({ error: { code: 'invalid_api_key', message: 'missing or invalid bearer token', param: null, type: 'authentication_error' } }, 401);

export type Handler = (req: { url: string; method: string; headers: Headers; body: unknown; signal: AbortSignal | null }) => Response | Promise<Response>;

export interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: unknown;
}

/** Installs a fetch mock routed by "METHOD /path". Unrouted requests reject. */
export function mockFetch(routes: Record<string, Handler>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init.method ?? 'GET').toUpperCase();
    const headers = new Headers(init.headers);
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
    calls.push({ url, method, headers, body });
    if (init.signal?.aborted) throw new DOMException('The operation was aborted.', 'AbortError');
    const path = url.replace(/^https?:\/\/[^/]+/, '').split('?')[0] ?? url;
    const h = routes[`${method} ${path}`];
    if (!h) throw new TypeError(`Failed to fetch (no mock for ${method} ${path})`);
    return h({ url, method, headers, body, signal: init.signal ?? null });
  });
  vi.stubGlobal('fetch', fn);
  return { fn, calls };
}
