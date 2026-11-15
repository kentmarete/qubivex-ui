import { useEffect, useState } from 'react';
import type { LoadedModel } from '../../types/api';
import { Dialog } from '../common/Dialog';
import { Button } from '../common/ui';

const INPUT = 'h-9 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-[13px] placeholder:text-muted/60';

/** Load by installed id or server-side directory, optionally under another id. */
export function LoadDialog({
  open,
  onClose,
  onLoad,
  suggestions,
}: {
  open: boolean;
  onClose: () => void;
  onLoad: (model: string, id: string | undefined) => void;
  suggestions: readonly string[];
}) {
  const [model, setModel] = useState('');
  const [id, setId] = useState('');
  useEffect(() => {
    if (open) {
      setModel('');
      setId('');
    }
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} title="Load a model">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          const m = model.trim();
          if (!m) return;
          onLoad(m, id.trim() || undefined);
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
        <p className="text-[13px] text-muted">
          Loading reads the weights from the server&apos;s disk and can take several minutes. It keeps going on the server if you close this tab.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" disabled={!model.trim()}>
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
