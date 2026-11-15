import { AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import { ApiError } from '../../services/api';

/** Shows an error's message, code and request id (never request headers or secrets). */
export function ErrorPanel({ error, title, action }: { error: unknown; title?: string; action?: ReactNode }) {
  const e = error instanceof ApiError ? error : null;
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div role="alert" className="flex items-start gap-3 rounded-md border border-danger/40 bg-danger/10 p-3 text-[13px]">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
      <div className="min-w-0 flex-1">
        {title && <div className="font-medium text-text">{title}</div>}
        <div className="text-text/90">{message}</div>
        {e && (e.code || e.requestId) && (
          <div className="mt-1 font-mono text-[12px] text-muted">
            {e.status ? `HTTP ${e.status}` : null}
            {e.code ? ` · ${e.code}` : null}
            {e.requestId ? ` · request ${e.requestId}` : null}
          </div>
        )}
      </div>
      {action}
    </div>
  );
}
