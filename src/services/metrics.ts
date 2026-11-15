import { request } from './api';

/** GET /metrics: Prometheus text. Never needs a key. A 404 means --no-metrics. */
export function getMetricsText(signal?: AbortSignal): Promise<string> {
  return request<string>('/metrics', { auth: 'none', parse: 'text', signal, timeoutMs: 10_000 });
}
