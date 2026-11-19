// Model downloads through the server (qubivex docs/serving/http-api.md "Model downloads").
// Admin routes: the admin token is sent, never the API key. The server talks to the hub
// with its own token; the browser never sends one.

import type { Job, PullSpec, SearchHit } from '../types/api';
import { request } from './api';

/** Hub searches can be slow: give them longer than the default. */
const SEARCH_TIMEOUT_MS = 60_000;

export function searchModels(q: string, limit = 20, signal?: AbortSignal): Promise<{ data: SearchHit[] }> {
  const qs = new URLSearchParams({ q, limit: String(limit) });
  return request(`/v1/admin/models/search?${qs}`, { auth: 'admin', timeoutMs: SEARCH_TIMEOUT_MS, signal });
}

/** Starts a pull. The server answers at once (202) with the job; the download runs there. */
export function pullModel(spec: PullSpec, signal?: AbortSignal): Promise<Job> {
  return request<Job>('/v1/admin/models/pull', { body: spec, auth: 'admin', signal });
}

export function listJobs(signal?: AbortSignal): Promise<{ data: Job[] }> {
  return request('/v1/admin/jobs', { auth: 'admin', notifyAuth: false, signal });
}

export function cancelJob(id: string): Promise<Job> {
  return request<Job>(`/v1/admin/jobs/${encodeURIComponent(id)}`, { method: 'DELETE', auth: 'admin' });
}

export function retryJob(id: string): Promise<Job> {
  return request<Job>(`/v1/admin/jobs/${encodeURIComponent(id)}/retry`, { method: 'POST', auth: 'admin' });
}

/** `owner/name`: what a pull takes, and what a hub name looks like. */
export function isRepository(s: string): boolean {
  return /^[A-Za-z0-9][\w.-]*\/[\w.-]+$/.test(s.trim());
}
