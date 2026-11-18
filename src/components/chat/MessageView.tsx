import { AlertTriangle, ChevronRight, RotateCcw } from 'lucide-react';
import type { ChatMessage } from '../../hooks/useChat';
import { formatNumber } from '../../utils/format';
import { splitThink } from '../../utils/think';
import { CopyButton } from '../common/CopyButton';
import { Button, Spinner } from '../common/ui';
import { Markdown } from './Markdown';

export function MessageView({ m, onRetry, canRetry }: { m: ChatMessage; onRetry: () => void; canRetry: boolean }) {
  if (m.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-surface-2 px-3.5 py-2 text-[14px] leading-6">{m.text}</div>
      </div>
    );
  }
  const streaming = m.status === 'streaming';
  const { reasoning, thinking, answer } = splitThink(m.text);
  return (
    <article className="group space-y-2" aria-busy={streaming}>
      {reasoning !== null && (
        <details className="rounded-md border border-border bg-surface/60 text-[13px]" open={thinking}>
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-1.5 text-muted">
            <ChevronRight className="h-3.5 w-3.5" />
            {thinking ? 'Reasoning…' : 'Reasoning'}
          </summary>
          <div className="whitespace-pre-wrap border-t border-border px-3 py-2 text-muted">{reasoning || '—'}</div>
        </details>
      )}
      {answer ? (
        <div>
          <Markdown text={answer} streaming={streaming} />
        </div>
      ) : streaming && !thinking ? (
        <div className="flex items-center gap-2 text-[13px] text-muted">
          <Spinner /> Waiting for the first token…
        </div>
      ) : null}
      {streaming && answer && <span className="caret" aria-hidden />}
      {m.status === 'error' && m.error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-[13px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
          <div className="min-w-0">
            <div>{m.error.message}</div>
            <div className="font-mono text-[12px] text-muted">
              {m.error.code ?? 'error'}
              {m.error.requestId ? ` · request ${m.error.requestId}` : ''}
              {m.error.retryAfter ? ` · retry after ${m.error.retryAfter}s` : ''}
            </div>
          </div>
        </div>
      )}
      {!streaming && (
        <footer className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-muted">
          {m.status === 'stopped' && <span className="text-warn">Stopped</span>}
          {m.status === 'interrupted' && <span className="text-warn">Interrupted: the connection closed before the reply finished</span>}
          {m.finish === 'length' && <span className="text-warn" title="max_tokens, the context, or a time limit was reached">Stopped: length</span>}
          {m.usage && <span className="tabular">{formatNumber(m.usage.completion_tokens)} tokens</span>}
          {m.timing?.tokensPerSecond != null && (
            <span className="tabular" title="Measured in the browser, from the first token to the last">
              {formatNumber(m.timing.tokensPerSecond, 1)} tok/s
            </span>
          )}
          {m.timing?.ttftMs != null && (
            <span className="tabular" title="Measured in the browser: from sending to the first token">
              TTFT {formatNumber(m.timing.ttftMs)} ms
            </span>
          )}
          {!!m.usage?.prompt_tokens_details?.cached_tokens && (
            <span className="tabular">{formatNumber(m.usage.prompt_tokens_details.cached_tokens)} cached</span>
          )}
          {m.model && <span className="font-mono">{m.model}</span>}
          <span className="ml-auto flex items-center gap-1">
            {m.text && <CopyButton text={m.text} label="Copy response" />}
            {(m.status === 'error' || m.status === 'interrupted' || m.status === 'stopped') && (
              <Button size="sm" variant="ghost" onClick={onRetry} disabled={!canRetry}>
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            )}
          </span>
        </footer>
      )}
    </article>
  );
}
