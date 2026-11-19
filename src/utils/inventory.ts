// The Installed tab's rows (docs/04 Models): the server's runtime state from /v1/system,
// the models on disk from /v1/admin/models/installed when the server has it, and what this
// UI has in flight or unloaded this session.

import type { ModelOps, PendingLoad } from '../hooks/useModelOps';
import type { InstalledModel, LoadedModel, SystemInfo } from '../types/api';

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
  /** The model on disk, when the server lists installed models. */
  disk: InstalledModel | null;
}

const byId = (a: { id: string }, b: { id: string }) => a.id.localeCompare(b.id);

export function buildRows(sys: SystemInfo | null, ops: ModelOps, installed: readonly InstalledModel[] | null = null): InventoryRow[] {
  const server = new Map<string, RuntimeState>();
  for (const s of sys?.model_states ?? []) server.set(s.id, s.state);
  for (const m of sys?.models ?? []) if (!server.has(m.id)) server.set(m.id, 'loaded');
  const runtime = new Map((sys?.models ?? []).map((m) => [m.id, m]));
  // A served id finds its disk entry by the ids serving it, else by its own id.
  const disk = new Map<string, InstalledModel>();
  for (const d of installed ?? []) if (d.id !== null) disk.set(d.id, d);
  for (const d of installed ?? []) for (const sid of d.serve_ids) disk.set(sid, d);

  const row = (id: string, state: RuntimeState, onDisk: InstalledModel | null = disk.get(id) ?? null): InventoryRow => ({
    id,
    state,
    runtime: runtime.get(id) ?? null,
    pending: ops.loads.get(id) ?? null,
    unloading: ops.unloading.has(id),
    error: ops.failures.get(id),
    source: ops.sources.get(id) ?? id,
    disk: onDisk,
  });

  // The server is the source of truth; a load it has not registered yet shows as loading.
  const active: InventoryRow[] = [...server].map(([id, state]) => row(id, state));
  for (const id of ops.loads.keys()) if (!server.has(id)) active.push(row(id, 'loading'));
  active.sort(byId);

  const shown = new Set(active.map((r) => r.id));
  // On disk and not serving: loadable by id. One without an id (a broken manifest) shows by directory.
  const idle = (installed ?? [])
    .filter((d) => d.serve_ids.length === 0 && !shown.has(d.id ?? d.dir))
    .map((d) => row(d.id ?? d.dir, 'unloaded', d))
    .sort(byId);
  for (const r of idle) shown.add(r.id);

  const unloaded = ops.unloaded.filter((id) => !shown.has(id)).map((id) => row(id, 'unloaded'));
  return [...active, ...idle, ...unloaded];
}

/** Bytes the model holds now (dense weights, expert cache, KV). */
export function usedBytes(m: LoadedModel): number {
  return m.ledger_bytes.dense + m.ledger_bytes.expert_cache + m.ledger_bytes.kv;
}
