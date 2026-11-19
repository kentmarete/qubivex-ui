import { useEffect, useState } from 'react';
import { getGenerationPrefs } from '../../hooks/useGenerationPrefs';
import type { LoadedModel } from '../../types/api';
import { Dialog } from '../common/Dialog';
import { Button } from '../common/ui';

const INPUT = 'h-9 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-[13px] placeholder:text-muted/60';

/** A positive whole number from a text field; null when empty or not one. */
export function parseTokens(s: string): number | null {
  const t = s.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Load by installed id or server-side directory, optionally under another id and context. */
export function LoadDialog({
  open,
  onClose,
  onLoad,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (model: string, id: string | undefined, context: number | null) => void;
  suggestions: readonly string[];
}) {
  const [model, setModel] = useState('');
  const [id, setId] = useState('');
  const [context, setContext] = useState('');
  useEffect(() => {
    if (open) {
      setModel('');
      setId('');
      setContext(getGenerationPrefs().loadContext?.toString() ?? '');
    }
  }, [open]);
  const contextBad = context.trim() !== '' && parseTokens(context) === null;

  return (
    <Dialog open={open} onClose={onClose} title="Load a model">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const m = model.trim();
          if (!m || contextBad) return;
          onLoad(m, id.trim() || undefined, parseTokens(context));
          onClose();
        }}
      >
        <div className="space-y-1.5">
          <label htmlFor="load-model" className="text-[13px]">
            Model
          </label>
          <input
            id="load-model"
            className={INPUT}
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="installed id, or a directory on the server"
            list="load-model-suggestions"
            autoComplete="off"
            spellCheck={false}
            required
          />
          <datalist id="load-model-suggestions">
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="load-id" className="text-[13px]">
            Serve as <span className="text-muted">(optional)</span>
          </label>
          <input id="load-id" className={INPUT} value={id} onChange={(e) => setId(e.target.value)} placeholder="defaults to the model" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="load-context" className="text-[13px]">
            Context length <span className="text-muted">(tokens, optional)</span>
          </label>
          <input
            id="load-context"
            className={INPUT}
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="the server's --context, else the model's"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={contextBad}
            aria-describedby="load-context-help"
          />
          <p id="load-context-help" className={contextBad ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}>
            {contextBad ? 'Enter a whole number of tokens above 0, or leave it empty.' : 'Capped by the model’s own limit. A longer context reserves more memory per conversation. The default is set in Settings.'}
          </p>
        </div>
        <p className="text-[13px] text-muted">
          Loading reads the weights from the server&apos;s disk and can take several minutes. It keeps going on the server if you close this tab.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!model.trim() || contextBad}>
            Load
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Unload frees memory only. Says what happens to requests in flight. */
export function UnloadDialog({
  id,
  runtime,
  onClose,
  onUnload,
}: {
  id: string | null;
  runtime: LoadedModel | null;
  onClose: () => void;
  onUnload: (id: string) => void;
}) {
  const running = runtime ? runtime.generation_slots - runtime.generation_slots_free : 0;
  const waiting = runtime?.queue_depth ?? 0;
  return (
    <Dialog open={id !== null} onClose={onClose} title={`Unload ${id ?? ''}?`}>
      <div className="space-y-4 text-[13px]">
        <p>
          Unloading frees the model&apos;s memory and stops serving it. Requests already running finish first; requests still waiting in the queue end now. The files stay on
          disk, and you can load it again.
        </p>
        {(running > 0 || waiting > 0) && (
          <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-warn">
            Right now: {running} running, {waiting} waiting.
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              if (id) onUnload(id);
              onClose();
            }}
          >
            Unload
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
