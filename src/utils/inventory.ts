// The Installed tab's fallback rows (docs/04 Models): the server's runtime state from
// /v1/system, plus what this UI has in flight or unloaded this session.

import type { ModelOps, PendingLoad } from '../hooks/useModelOps';
import type { LoadedModel, SystemInfo } from '../types/api';

export type RuntimeState = 'unloaded' | 'loading' | 'loaded' | 'failed';

export interface InventoryRow {
  id: string;
  state: RuntimeState;
  /** Runtime details, present once the model serves. */
  runtime: LoadedModel | null;
  pending: PendingLoad | null;
  unloading: boolean;
  /** Why this UI's last load of it failed, if it did. */
  error: unknown;
  /** What to send as `model` to load it again. */
  source: string;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export function buildRows(sys: SystemInfo | null, ops: ModelOps): InventoryRow[] {
  const server = new Map<string, RuntimeState>();
  for (const s of sys?.model_states ?? []) server.set(s.id, s.state);
  for (const m of sys?.models ?? []) if (!server.has(m.id)) server.set(m.id, 'loaded');
  const runtime = new Map((sys?.models ?? []).map((m) => [m.id, m]));

  const row = (id: string, state: RuntimeState): InventoryRow => ({
    id,
    state,
    runtime: runtime.get(id) ?? null,
    pending: ops.loads.get(id) ?? null,
    unloading: ops.unloading.has(id),
    error: ops.failures.get(id),
    source: ops.sources.get(id) ?? id,
  });

  // The server is the source of truth; a load it has not registered yet shows as loading.
  const active: InventoryRow[] = [...server].map(([id, state]) => row(id, state));
  for (const id of ops.loads.keys()) if (!server.has(id)) active.push(row(id, 'loading'));
  active.sort(byId);

  const unloaded = ops.unloaded.filter((id) => !server.has(id) && !ops.loads.has(id)).map((id) => row(id, 'unloaded'));
  return [...active, ...unloaded];
}

/** Bytes the model holds now (dense weights, expert cache, KV). */
export function usedBytes(m: LoadedModel): number {
  return m.ledger_bytes.dense + m.ledger_bytes.expert_cache + m.ledger_bytes.kv;
}
