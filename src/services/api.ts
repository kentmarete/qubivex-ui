// Every HTTP call goes through here (docs/02 §6).

import type { ApiErrorBody } from '../types/api';
import { getSecret, type SecretKind } from './auth';

/** Which secret a call carries: none, the API key, or the admin token. */
export type Auth = 'none' | SecretKind;

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly type: string | null;
  readonly param: string | null;
  readonly requestId: string | null;
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    message: string;
    code?: string | null;
    type?: string | null;
    param?: string | null;
    requestId?: string | null;
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code ?? null;
    this.type = init.type ?? null;
    this.param = init.param ?? null;
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }

  /** The body shape, for in-stream errors and display. */
  get body(): ApiErrorBody {
    return { code: this.code, message: this.message, param: this.param, type: this.type };
  }
}

export const DEFAULT_TIMEOUT_MS = 15_000;

/** Same origin by default; VITE_API_BASE points a dev build elsewhere (needs CORS). */
export function apiBase(): string {
  const b = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
  return b.replace(/\/+$/, '');
}

// ---- auth-required notifications ------------------------------------------------

type AuthListener = (kind: SecretKind, error: ApiError) => void;
const authListeners = new Set<AuthListener>();

/** Called on every 401, with the secret the call used. The shell opens the key dialog. */
export function onAuthRequired(l: AuthListener): () => void {
  authListeners.add(l);
  return () => authListeners.delete(l);
}

// ---- internals --------------------------------------------------------------------

function headers(auth: Auth, json: boolean): Headers {
  const h = new Headers({ accept: 'application/json' });
  if (json) h.set('content-type', 'application/json');
  if (auth !== 'none') {
    const secret = getSecret(auth);
    if (secret) h.set('authorization', `Bearer ${secret}`);
  }
  return h;
}

function retryAfter(res: Response): number | null {
  const v = res.headers.get('retry-after');
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Turns a non-2xx response into an ApiError, from its OpenAI-shaped body if it has one. */
export async function errorFrom(res: Response, auth: Auth, notifyAuth = true): Promise<ApiError> {
  let body: Partial<ApiErrorBody> | null = null;
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object' && 'error' in parsed) {
      body = (parsed as { error: Partial<ApiErrorBody> }).error;
    }
  } catch {
    /* not JSON (a proxy page, an empty 403 preflight) */
  }
  const err = new ApiError({
    status: res.status,
    message: body?.message || res.statusText || `HTTP ${res.status}`,
    code: body?.code ?? null,
    type: body?.type ?? null,
    param: body?.param ?? null,
    requestId: res.headers.get('x-request-id'),
    retryAfter: retryAfter(res),
  });
  if (res.status === 401 && auth !== 'none' && notifyAuth) {
    authListeners.forEach((l) => l(auth, err));
  }
  return err;
}

function networkError(e: unknown): ApiError {
  return new ApiError({
    status: 0,
    code: 'network',
    message: e instanceof Error && e.message ? `Cannot reach the server (${e.message})` : 'Cannot reach the server',
  });
}

/** An abort signal that fires on the caller's signal or after `ms`. */
function withTimeout(signal: AbortSignal | undefined, ms: number | null) {
  const ctrl = new AbortController();
  let timedOut = false;
  const onAbort = () => ctrl.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) ctrl.abort(signal.reason);
    else signal.addEventListener('abort', onAbort, { once: true });
  }
  const timer =
    ms === null
      ? undefined
      : setTimeout(() => {
          timedOut = true;
          ctrl.abort();
        }, ms);
  return {
    signal: ctrl.signal,
    timedOut: () => timedOut,
    done: () => {
      if (timer !== undefined) clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    },
  };
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  auth?: Auth;
  /** Default 15 s. `null`: no timeout. */
  timeoutMs?: number | null;
  signal?: AbortSignal;
  parse?: 'json' | 'text';
  /** Default true: a 401 asks the shell to open the key dialog. */
  notifyAuth?: boolean;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const auth = opts.auth ?? 'api';
  const hasBody = opts.body !== undefined;
  const t = withTimeout(opts.signal, opts.timeoutMs === undefined ? DEFAULT_TIMEOUT_MS : opts.timeoutMs);
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: opts.method ?? (hasBody ? 'POST' : 'GET'),
      headers: headers(auth, hasBody),
      body: hasBody ? JSON.stringify(opts.body) : undefined,
      signal: t.signal,
      credentials: 'omit',
    });
  } catch (e) {
    t.done();
    if (t.timedOut()) {
      throw new ApiError({ status: 0, code: 'timeout', message: 'The server did not answer in time' });
    }
    if (opts.signal?.aborted) throw e;
    throw networkError(e);
  }
  try {
    if (!res.ok) throw await errorFrom(res, auth, opts.notifyAuth ?? true);
    if (opts.parse === 'text') return (await res.text()) as T;
    return (await res.json()) as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if (t.timedOut()) {
      throw new ApiError({ status: 0, code: 'timeout', message: 'The server did not answer in time' });
    }
    if (opts.signal?.aborted) throw e;
    throw new ApiError({ status: res.status, code: 'bad_response', message: 'The server sent an unreadable response', requestId: res.headers.get('x-request-id') });
  } finally {
    t.done();
  }
}

/**
 * Starts a streaming POST. Errors before the stream starts are HTTP errors and throw an
 * ApiError here; the caller reads `res.body`. No timeout: only `signal` ends it.
 */
export async function stream(
  path: string,
  body: unknown,
  opts: { auth?: Auth; signal: AbortSignal },
): Promise<Response> {
  const auth = opts.auth ?? 'api';
  const h = headers(auth, true);
  h.set('accept', 'text/event-stream');
  let res: Response;
  try {
    res = await fetch(apiBase() + path, {
      method: 'POST',
      headers: h,
      body: JSON.stringify(body),
      signal: opts.signal,
      credentials: 'omit',
    });
  } catch (e) {
    if (opts.signal.aborted) throw e;
    throw networkError(e);
  }
  if (!res.ok) throw await errorFrom(res, auth);
  if (!res.body) {
    throw new ApiError({ status: res.status, code: 'bad_response', message: 'The server sent no stream' });
  }
  return res;
}

export function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError';
}
