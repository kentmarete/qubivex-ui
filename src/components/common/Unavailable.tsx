import { CircleSlash } from 'lucide-react';
import type { ReactNode } from 'react';

/** A feature the connected server does not provide (or not yet built): never fake data. */
export function Unavailable({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
      <CircleSlash className="h-5 w-5 text-muted" />
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-md text-[13px] text-muted">{children}</div>}
    </div>
  );
}
