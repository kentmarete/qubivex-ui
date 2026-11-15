import { afterEach, describe, expect, it, vi } from 'vitest';
import { json, mockFetch, unauthorized } from '../../test/mockFetch';
import { ApiError, onAuthRequired, request } from './api';
import { setSecret } from './auth';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('request', () => {
  it('sends the API key as a bearer token on /v1 calls, and nothing in the URL', async () => {
    setSecret('api', 'sk-secret');
    const { calls } = mockFetch({ 'GET /v1/models': () => json({ object: 'list', data: [] }) });
    await request('/v1/models');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer sk-secret');
    expect(calls[0]?.url).toBe('/v1/models');
    expect(calls[0]?.url).not.toContain('sk-secret');
  });

  it('sends the admin token, not the API key, on admin calls', async () => {
    setSecret('api', 'sk-api');
    setSecret('admin', 'adm');
    const { calls } = mockFetch({ 'POST /v1/models/unload': () => json({ deleted: true }) });
    await request('/v1/models/unload', { body: { model: 'm' }, auth: 'admin' });
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer adm');
    expect(calls[0]?.headers.get('content-type')).toBe('application/json');
  });

  it('sends no authorization when no secret is stored, or for auth none', async () => {
    setSecret('api', 'sk');
    const { calls } = mockFetch({ 'GET /health': () => json({ status: 'ok', models: 1 }), 'GET /v1/models': () => json({ data: [] }) });
    await request('/health', { auth: 'none' });
    expect(calls[0]?.headers.has('authorization')).toBe(false);
  });

  it('parses OpenAI-shaped errors with request id and retry-after', async () => {
    mockFetch({
      'GET /v1/models/x': () =>
        json({ error: { code: 'model_not_found', message: 'the model "x" is not loaded', param: 'model', type: 'invalid_request_error' } }, 404),
    });
    const e = await request('/v1/models/x').catch((x: unknown) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e).toMatchObject({ status: 404, code: 'model_not_found', param: 'model', requestId: 'req-test-1', message: 'the model "x" is not loaded' });
  });

  it('copes with a non-JSON error body', async () => {
    mockFetch({ 'GET /v1/system': () => new Response('<html>bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }) });
    await expect(request('/v1/system')).rejects.toMatchObject({ status: 502, code: null, message: 'Bad Gateway' });
  });

  it('notifies on 401 with the secret kind, unless told not to', async () => {
    mockFetch({ 'GET /v1/models': unauthorized, 'POST /v1/models/load': unauthorized });
    const seen: string[] = [];
    const off = onAuthRequired((k) => seen.push(k));
    await request('/v1/models').catch(() => undefined);
    await request('/v1/models/load', { body: {}, auth: 'admin' }).catch(() => undefined);
    await request('/v1/models', { notifyAuth: false }).catch(() => undefined);
    off();
    expect(seen).toEqual(['api', 'admin']);
  });

  it('turns a network failure into a status-0 network error', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(request('/health', { auth: 'none' })).rejects.toMatchObject({ status: 0, code: 'network' });
  });

  it('times out', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    );
    const p = request('/v1/system', { timeoutMs: 1000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(1001);
    expect(await p).toMatchObject({ code: 'timeout', status: 0 });
  });

  it('passes a caller abort through as an AbortError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_: string, init: RequestInit) =>
          new Promise((_r, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))),
      ),
    );
    const ctrl = new AbortController();
    const p = request('/v1/system', { signal: ctrl.signal }).catch((e: unknown) => e);
    ctrl.abort();
    expect(await p).toMatchObject({ name: 'AbortError' });
  });
});
