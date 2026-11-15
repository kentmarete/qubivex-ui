import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-[#06120c] hover:bg-accent/90 font-medium',
  secondary: 'bg-surface-2 text-text border border-border hover:border-muted/50',
  ghost: 'text-muted hover:text-text hover:bg-surface-2',
  danger: 'bg-danger/15 text-danger border border-danger/40 hover:bg-danger/25',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }
>(function Button({ variant = 'secondary', size = 'md', className = '', type = 'button', ...rest }, ref) {
  const sz = size === 'sm' ? 'h-7 px-2 text-[13px] gap-1.5' : 'h-8 px-3 gap-2';
  return (
    <button
      ref={ref}
      type={type}
      className={`inline-flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
});

export type Tone = 'ok' | 'warn' | 'danger' | 'muted';

const DOT: Record<Tone, string> = {
  ok: 'bg-accent',
  warn: 'bg-warn',
  danger: 'bg-danger',
  muted: 'bg-muted',
};
const TEXT: Record<Tone, string> = {
  ok: 'text-accent',
  warn: 'text-warn',
  danger: 'text-danger',
  muted: 'text-muted',
};

export function Dot({ tone }: { tone: Tone }) {
  return <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full ${DOT[tone]}`} />;
}

export function Badge({ tone = 'muted', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[12px] ${TEXT[tone]}`}>
      {children}
    </span>
  );
}

export function Card({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-border bg-surface ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
          <h2 className="text-[13px] font-medium uppercase tracking-wide text-muted">{title}</h2>
          {actions}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/** A label and a value; `value` null shows an em dash with `why` as its tooltip. */
export function Field({ label, value, why, mono = false }: { label: string; value: ReactNode | null; why?: string; mono?: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-4 py-1.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`min-w-0 truncate text-right ${mono ? 'font-mono tabular text-[13px]' : ''}`} title={value === null ? why : undefined}>
        {value === null ? <span className="text-muted">—{why ? <span className="sr-only"> ({why})</span> : null}</span> : value}
      </dd>
    </div>
  );
}

export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted/40 border-t-accent ${className}`}
    />
  );
}
