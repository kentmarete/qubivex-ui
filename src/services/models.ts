// Load and unload (EXISTING admin routes, docs/01 §1) and the model-management probe
// (docs/02 §9). The admin token is sent on these calls, never the API key.

import type { ModelCard, UnloadResult } from '../types/api';
import { ApiError, request } from './api';

/** Load blocks until the model is ready (docs/03 §3.8): allow it ten minutes. */
export const LOAD_TIMEOUT_MS = 10 * 60_000;

export interface LoadOptions {
  /** Serve it under another name. */
  id?: string;
  /** Context limit in tokens for this load; the model's own limit still caps it. */
  context?: number | null;
  signal?: AbortSignal;
}

/**
 * POST /v1/models/load. `model` is an installed id or a directory on the server; `id`
 * serves it under another name. 201 first load, 200 already loaded, 409 if the directory is
 * loaded under another id or with another context.
 */
export function loadModel(model: string, { id, context, signal }: LoadOptions = {}): Promise<ModelCard> {
  const body: { model: string; id?: string; context?: number } = { model };
  if (id && id !== model) body.id = id;
  if (context) body.context = context;
  return request<ModelCard>('/v1/models/load', { body, auth: 'admin', timeoutMs: LOAD_TIMEOUT_MS, signal });
}

/** POST /v1/models/unload. Running requests finish (`draining`); waiting ones end now. */
export function unloadModel(id: string, signal?: AbortSignal): Promise<UnloadResult> {
  return request<UnloadResult>('/v1/models/unload', { body: { model: id }, auth: 'admin', signal });
}

export type Support = 'available' | 'unavailable' | 'unknown';

/**
 * Whether the server has the admin model API (docs/03 §3.3). No token is needed to tell:
 * today's gateway answers before checking auth, with 405 (the path matches
 * `DELETE /v1/admin/models/{id}` with id "installed") or, on older builds, 404. A server
 * with the route answers 200, 401 or 403.
 */
export async function probeModelManagement(signal?: AbortSignal): Promise<Support> {
  try {
    await request('/v1/admin/models/installed', { auth: 'admin', notifyAuth: false, signal, timeoutMs: 10_000 });
    return 'available';
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    if (e.status === 404 || e.status === 405) return 'unavailable';
    if (e.status === 401 || e.status === 403) return 'available';
    return 'unknown';
  }
}
