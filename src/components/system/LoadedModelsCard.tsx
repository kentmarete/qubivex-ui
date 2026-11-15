import type { SystemInfo } from '../../types/api';
import { formatBytes, formatNumber } from '../../utils/format';
import { Badge, Card, Dot, type Tone } from '../common/ui';

const STATE_TONE: Record<string, Tone> = { loaded: 'ok', loading: 'warn', failed: 'danger' };

export function LoadedModelsCard({ sys }: { sys: SystemInfo }) {
  const states = new Map(sys.model_states.map((s) => [s.id, s.state]));
  // Models that are loading or failed have no runtime entry yet.
  const pending = sys.model_states.filter((s) => !sys.models.some((m) => m.id === s.id));
  return (
    <Card title="Models in the runtime">
      {sys.models.length === 0 && pending.length === 0 ? (
        <p className="text-[13px] text-muted">No models are loaded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[13px]">
            <thead className="text-left text-[12px] text-muted">
              <tr>
                <th className="py-1 pr-3 font-normal">Model</th>
                <th className="py-1 pr-3 font-normal">State</th>
                <th className="py-1 pr-3 font-normal">Backend</th>
                <th className="py-1 pr-3 font-normal">Architecture</th>
                <th className="py-1 pr-3 text-right font-normal">Context</th>
                <th className="py-1 pr-3 text-right font-normal">Slots free</th>
                <th className="py-1 pr-3 text-right font-normal">Queue</th>
                <th className="py-1 text-right font-normal">Memory / plan</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {sys.models.map((m) => {
                const state = states.get(m.id) ?? 'loaded';
                const used = m.ledger_bytes.dense + m.ledger_bytes.expert_cache + m.ledger_bytes.kv;
                return (
                  <tr key={m.id} className="border-t border-border/60">
                    <td className="py-1.5 pr-3 font-mono">{m.id}</td>
                    <td className="py-1.5 pr-3">
                      <Badge tone={STATE_TONE[state] ?? 'muted'}>
                        <Dot tone={STATE_TONE[state] ?? 'muted'} />
                        {state}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-3 font-mono">{m.placement}</td>
                    <td className="py-1.5 pr-3 font-mono text-muted">{m.architecture}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">{formatNumber(m.max_context)}</td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {m.generation_slots_free}/{m.generation_slots}
                    </td>
                    <td className="py-1.5 pr-3 text-right font-mono">
                      {m.queue_depth}/{m.queue_limit}
                    </td>
                    <td
                      className="py-1.5 text-right font-mono"
                      title={`dense ${formatBytes(m.ledger_bytes.dense)} · experts ${formatBytes(m.ledger_bytes.expert_cache)} · KV ${formatBytes(m.ledger_bytes.kv)}`}
                    >
                      {formatBytes(used)} / {formatBytes(m.plan_budget_bytes)}
                    </td>
                  </tr>
                );
              })}
              {pending.map((s) => (
                <tr key={s.id} className="border-t border-border/60">
                  <td className="py-1.5 pr-3 font-mono">{s.id}</td>
                  <td className="py-1.5 pr-3" colSpan={7}>
                    <Badge tone={STATE_TONE[s.state] ?? 'muted'}>
                      <Dot tone={STATE_TONE[s.state] ?? 'muted'} />
                      {s.state}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
