import type { ChatSettings } from '../../hooks/useChat';
import { DEFAULT_SETTINGS } from '../../hooks/useChat';
import { Button } from '../common/ui';

function Row({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between">
        <label htmlFor={htmlFor} className="text-[13px]">
          {label}
        </label>
        {hint && <span className="font-mono text-[12px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

const input = 'h-8 w-full rounded-md border border-border bg-surface-2 px-2 font-mono text-[13px]';

export function ChatSettingsPanel({
  value,
  onChange,
  maxContext,
  maxTokensCap = null,
  defaults = DEFAULT_SETTINGS,
}: {
  value: ChatSettings;
  onChange: (s: ChatSettings) => void;
  maxContext: number | null;
  /** The server's --max-generation-tokens. */
  maxTokensCap?: number | null;
  /** What Reset restores: the Settings page's defaults. */
  defaults?: ChatSettings;
}) {
  const caps = [maxContext, maxTokensCap].filter((c): c is number => c !== null);
  const maxTokens = caps.length ? Math.min(...caps) : null;
  const set = <K extends keyof ChatSettings>(k: K, v: ChatSettings[K]) => onChange({ ...value, [k]: v });
  const num = (s: string, fallback: number) => {
    const n = Number(s);
    return s.trim() === '' || !Number.isFinite(n) ? fallback : n;
  };
  return (
    <div className="space-y-4">
      <Row label="Temperature" htmlFor="s-temp" hint={value.temperature.toFixed(2)}>
        <input id="s-temp" type="range" min={0} max={2} step={0.05} value={value.temperature} onChange={(e) => set('temperature', Number(e.target.value))} className="w-full accent-[rgb(var(--accent))]" />
      </Row>
      <Row label="Max tokens" htmlFor="s-max" hint={[maxContext ? `context ${maxContext}` : null, maxTokensCap ? `cap ${maxTokensCap}` : null].filter(Boolean).join(' · ') || undefined}>
        <input
          id="s-max"
          type="number"
          min={1}
          max={maxTokens ?? undefined}
          value={value.maxTokens}
          onChange={(e) => set('maxTokens', Math.max(1, Math.round(num(e.target.value, defaults.maxTokens))))}
          className={input}
        />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <Row label="Top p" htmlFor="s-topp">
          <input id="s-topp" type="number" min={0.01} max={1} step={0.05} value={value.topP} onChange={(e) => set('topP', Math.min(1, Math.max(0.01, num(e.target.value, 1))))} className={input} />
        </Row>
        <Row label="Top k" htmlFor="s-topk" hint="0 = off">
          <input id="s-topk" type="number" min={0} step={1} value={value.topK} onChange={(e) => set('topK', Math.max(0, Math.round(num(e.target.value, 0))))} className={input} />
        </Row>
      </div>
      <Row label="Seed" htmlFor="s-seed" hint="empty = server default">
        <input
          id="s-seed"
          type="number"
          min={0}
          step={1}
          value={value.seed ?? ''}
          onChange={(e) => set('seed', e.target.value.trim() === '' ? null : Math.max(0, Math.round(num(e.target.value, 0))))}
          className={input}
        />
      </Row>
      <Row label="System prompt" htmlFor="s-system">
        <textarea id="s-system" rows={3} value={value.systemPrompt} onChange={(e) => set('systemPrompt', e.target.value)} className="w-full resize-y rounded-md border border-border bg-surface-2 px-2 py-1.5 text-[13px]" />
      </Row>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => onChange(defaults)}>
          Reset to defaults
        </Button>
      </div>
    </div>
  );
}
