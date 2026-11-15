import { formatBytes } from '../../utils/format';
import { SERIES } from './palette';

interface Part {
  name: string;
  bytes: number | undefined;
}

/** A model's memory by owner against its plan budget, as one stacked bar. */
export function MemoryBar({ parts, budget }: { parts: Part[]; budget: number | undefined }) {
  const known = parts.filter((p): p is { name: string; bytes: number } => p.bytes !== undefined);
  const used = known.reduce((a, p) => a + p.bytes, 0);
  const scale = Math.max(budget ?? 0, used, 1);
  return (
    <div className="mt-3 space-y-2">
      <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-[4px] bg-surface-2" role="img" aria-label={`Model memory ${formatBytes(used)} of ${formatBytes(budget)} budget`}>
        {parts.map((p, i) =>
          p.bytes ? <div key={p.name} style={{ width: `${(p.bytes / scale) * 100}%`, background: SERIES[i % SERIES.length] }} title={`${p.name}: ${formatBytes(p.bytes)}`} /> : null,
        )}
      </div>
      <ul className="space-y-0.5 text-[12px]">
        {parts.map((p, i) => (
          <li key={p.name} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: SERIES[i % SERIES.length] }} aria-hidden />
            <span className="whitespace-nowrap text-muted">{p.name}</span>
            <span className="ml-auto whitespace-nowrap font-mono tabular text-text">{p.bytes === undefined ? '—' : formatBytes(p.bytes)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
