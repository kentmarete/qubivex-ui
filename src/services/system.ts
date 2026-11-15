import type { Health, ModelList, SystemInfo } from '../types/api';
import { request } from './api';

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return request<Health>('/health', { auth: 'none', signal, timeoutMs: 5_000 });
}

export function getSystem(signal?: AbortSignal): Promise<SystemInfo> {
  // Probing hardware can take a moment on some hosts.
  return request<SystemInfo>('/v1/system', { signal, timeoutMs: 30_000 });
}

/** The loaded models (GET /v1/models). */
export async function listModels(signal?: AbortSignal, notifyAuth = true): Promise<string[]> {
  const list = await request<ModelList>('/v1/models', { signal, notifyAuth });
  return list.data.map((m) => m.id).sort();
}

/**
 * Checks the admin token without side effects. Today's gateway has no admin read
 * endpoint, so this posts an unload with no model: the token check runs first, and a
 * valid token then fails validation with a 400 naming `model`. Nothing is unloaded.
 *   400 → valid, 401 → wrong token, 403 admin_disabled → no admin token on the server.
 */
export async function checkAdminToken(): Promise<'valid' | 'invalid' | 'disabled'> {
  try {
    await request('/v1/models/unload', { body: {}, auth: 'admin', notifyAuth: false });
    return 'valid';
  } catch (e) {
    const err = e as { status?: number; code?: string | null };
    if (err.status === 400) return 'valid';
    if (err.status === 403 && err.code === 'admin_disabled') return 'disabled';
    if (err.status === 401) return 'invalid';
    throw e;
  }
}
