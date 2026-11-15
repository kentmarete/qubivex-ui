import { useEffect, useState } from 'react';
import type { InventoryRow, RuntimeState } from '../../utils/inventory';
import { usedBytes } from '../../utils/inventory';
import { formatBytes, formatDuration, formatNumber } from '../../utils/format';
import { Badge, Button, Dot, Spinner, type Tone } from '../common/ui';

const TONE: Record<RuntimeState, Tone> = { loaded: 'ok', loading: 'warn', failed: 'danger', unloaded: 'muted' };

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <span className="font-mono text-muted">{formatDuration((now - since) / 1000)}</span>;
}

export interface RowActions {
  /** Why admin actions are off, or null when allowed. */
  disabledReason: string | null;
  onLoad: (row: InventoryRow) => void;
  onUnload: (row: InventoryRow) => void;
  /** Clears a failed entry (an unload of it). */
  onClear: (row: InventoryRow) => void;
}

function Actions({ row, a }: { row: InventoryRow; a: RowActions }) {
  const off = a.disabledReason !== null;
  const title = a.disabledReason ?? undefined;
  switch (row.state) {
    case 'loading':
      return (
        <span className="inline-flex items-center gap-2 text-[12px] text-muted" title="A loading model cannot be unloaded">
          <Spinner /> Loading {row.pending && <Elapsed since={row.pending.since} />}
        </span>
      );
    case 'loaded':
      return (
        <Button size="sm" onClick={() => a.onUnload(row)} disabled={off || row.unloading} title={title} aria-label={`Unload ${row.id}`}>
          {row.unloading ? <Spinner /> : null} Unload
        </Button>
      );
    case 'failed':
      return (
        <span className="inline-flex gap-1.5">
          <Button size="sm" onClick={() => a.onLoad(row)} disabled={off} title={title} aria-label={`Retry loading ${row.id}`}>
            Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => a.onClear(row)} disabled={off || row.unloading} title={title ?? 'Remove the failed entry from the server'} aria-label={`Clear ${row.id}`}>
            Clear
          </Button>
        </span>
      );
    case 'unloaded':
      return (
        <Button size="sm" onClick={() => a.onLoad(row)} disabled={off} title={title} aria-label={`Load ${row.id}`}>
          Load
        </Button>
      );
  }
}

/** Loaded models from /v1/system, with load and unload (docs/04 Installed, fallback mode). */
export function InventoryTable({ rows, actions }: { rows: InventoryRow[]; actions: RowActions }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-[13px]">
        <thead className="text-left text-[12px] text-muted">
          <tr>
            <th className="py-1 pr-3 font-normal">Model</th>
            <th className="py-1 pr-3 font-normal">State</th>
            <th className="py-1 pr-3 font-normal">Backend</th>
            <th className="py-1 pr-3 font-normal">Architecture</th>
            <th className="py-1 pr-3 text-right font-normal">Context</th>
            <th className="py-1 pr-3 text-right font-normal">Slots free</th>
            <th className="py-1 pr-3 text-right font-normal">Queue</th>
            <th className="py-1 pr-3 text-right font-normal">Memory / plan</th>
            <th className="py-1 text-right font-normal">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((r) => {
            const m = r.runtime;
            const why = r.state === 'loaded' ? 'Not reported' : `Not available while ${r.state}`;
            const dash = <span className="text-muted" title={why}>—</span>;
            const errorText = r.error instanceof Error ? r.error.message : null;
            return (
              <tr key={r.id} data-testid={`model-row-${r.id}`} className="border-t border-border/60 align-top">
                <td className="py-1.5 pr-3 font-mono">
                  {r.id}
                  {r.state === 'failed' && (
                    <div className="mt-0.5 max-w-[360px] whitespace-normal font-sans text-[12px] text-danger">
                      {errorText ?? 'The load failed on the server. Its logs have the reason.'}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pr-3">
                  <Badge tone={TONE[r.state]}>
                    <Dot tone={TONE[r.state]} />
                    {r.unloading ? 'unloading' : r.state}
                  </Badge>
                </td>
                <td className="py-1.5 pr-3 font-mono">{m ? m.placement : dash}</td>
                <td className="py-1.5 pr-3 font-mono text-muted">{m ? m.architecture : dash}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{m ? formatNumber(m.max_context) : dash}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{m ? `${m.generation_slots_free}/${m.generation_slots}` : dash}</td>
                <td className="py-1.5 pr-3 text-right font-mono">{m ? `${m.queue_depth}/${m.queue_limit}` : dash}</td>
                <td
                  className="py-1.5 pr-3 text-right font-mono"
                  title={m ? `dense ${formatBytes(m.ledger_bytes.dense)} · experts ${formatBytes(m.ledger_bytes.expert_cache)} · KV ${formatBytes(m.ledger_bytes.kv)}` : undefined}
                >
                  {m ? (m.plan_budget_bytes === null ? formatBytes(usedBytes(m)) : `${formatBytes(usedBytes(m))} / ${formatBytes(m.plan_budget_bytes)}`) : dash}
                </td>
                <td className="py-1 text-right">
                  <Actions row={r} a={actions} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
