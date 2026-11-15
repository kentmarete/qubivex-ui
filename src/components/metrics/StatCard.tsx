import type { ReactNode } from 'react';
import type { Val } from '../../utils/metrics';

/**
 * A headline number. `value` undefined: the server does not report it. null: nothing to
 * show yet. Both render as a dash with the reason; zero renders as zero.
 */
export function StatCard({ label, value, format, unit, sub, unavailable = 'Not reported by this server', pending = 'No data in this window yet', children }: {
  label: string;
  value: Val;
  format: (n: number) => string;
  unit?: string;
  sub?: ReactNode;
  unavailable?: string;
  pending?: string;
  children?: ReactNode;
}) {
  const known = typeof value === 'number' && Number.isFinite(value);
  const why = value === undefined ? unavailable : value === null ? pending : undefined;
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4" aria-label={label}>
      <h3 className="text-[12px] text-muted">{label}</h3>
      <div className="mt-1.5 flex items-baseline gap-1.5" title={why}>
        {known ? (
          <>
            <span className="font-mono text-[22px] font-medium leading-7 tabular text-text">{format(value)}</span>
            {unit && <span className="text-[12px] text-muted">{unit}</span>}
          </>
        ) : (
          <span className="font-mono text-[22px] leading-7 text-muted">—</span>
        )}
      </div>
      <div className="mt-1 min-h-[16px] text-[12px] text-muted">{known ? sub : why}</div>
      {children}
    </section>
  );
}
