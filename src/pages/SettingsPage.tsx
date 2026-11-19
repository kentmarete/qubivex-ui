import { useEffect, useState } from 'react';
import { parseTokens } from '../components/models/ModelDialogs';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { SecretInput } from '../components/common/SecretInput';
import { Badge, Button, Card, Dot, Spinner, type Tone } from '../components/common/ui';
import { useAuth } from '../hooks/useAuth';
import { setGenerationPrefs, useGenerationPrefs } from '../hooks/useGenerationPrefs';
import { useRuntime } from '../hooks/useRuntime';
import { ApiError } from '../services/api';
import { clearSecret, setRemember, setSecret, type SecretKind } from '../services/auth';
import { checkAdminToken, listModels } from '../services/system';
import type { SystemInfo } from '../types/api';
import { formatNumber } from '../utils/format';

type Result = { tone: Tone; text: string } | { error: unknown };

async function testSecret(kind: SecretKind): Promise<Result> {
  try {
    if (kind === 'api') {
      const ids = await listModels(undefined, false);
      return { tone: 'ok', text: `Accepted · ${ids.length} model${ids.length === 1 ? '' : 's'} loaded` };
    }
    const r = await checkAdminToken();
    if (r === 'valid') return { tone: 'ok', text: 'Accepted' };
    if (r === 'disabled') return { tone: 'warn', text: 'Admin operations are disabled on this server (no --admin-token)' };
    return { tone: 'danger', text: 'Rejected: wrong admin token' };
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return { tone: 'danger', text: 'Rejected: missing or wrong API key' };
    return { error: e };
  }
}

function SecretCard({ kind, title, help, isSet }: { kind: SecretKind; title: string; help: React.ReactNode; isSet: boolean }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const id = `secret-${kind}`;
  return (
    <Card
      title={title}
      actions={
        <Badge tone={isSet ? 'ok' : 'muted'}>
          <Dot tone={isSet ? 'ok' : 'muted'} />
          {isSet ? 'Set' : 'Not set'}
        </Badge>
      }
    >
      <div className="space-y-3">
        <p className="text-[13px] text-muted">{help}</p>
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!value.trim()) return;
            setSecret(kind, value);
            setValue('');
            setResult(null);
          }}
        >
          <div className="flex-1">
            <label htmlFor={id} className="sr-only">
              {title}
            </label>
            <SecretInput id={id} value={value} onChange={setValue} placeholder={isSet ? 'Replace the stored value' : 'Paste it here'} />
          </div>
          <Button type="submit" variant="primary" disabled={!value.trim()}>
            Save
          </Button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            onClick={async () => {
              setBusy(true);
              setResult(await testSecret(kind));
              setBusy(false);
            }}
            disabled={busy}
          >
            {busy ? <Spinner /> : null} Test
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!isSet}
            onClick={() => {
              clearSecret(kind);
              setResult(null);
            }}
          >
            Clear
          </Button>
          {result && 'tone' in result && (
            <Badge tone={result.tone}>
              <Dot tone={result.tone} />
              {result.text}
            </Badge>
          )}
        </div>
        {result && 'error' in result && <ErrorPanel error={result.error} />}
      </div>
    </Card>
  );
}

const FIELD = 'h-8 w-full rounded-md border border-border bg-surface-2 px-2 font-mono text-[13px] placeholder:text-muted/60';

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}

/** Default max tokens for chats, the context length for model loads, and the server's limits. */
function GenerationCard({ system }: { system: SystemInfo | null }) {
  const prefs = useGenerationPrefs();
  const [maxTokens, setMaxTokens] = useState(String(prefs.defaultMaxTokens));
  const [context, setContext] = useState(prefs.loadContext?.toString() ?? '');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setMaxTokens(String(prefs.defaultMaxTokens));
    setContext(prefs.loadContext?.toString() ?? '');
  }, [prefs]);

  const limits = system?.limits;
  const contexts = (system?.models ?? []).map((m) => m.max_context);
  const smallest = contexts.length ? Math.min(...contexts) : null;
  const max = parseTokens(maxTokens);
  const ctx = parseTokens(context);
  const maxError = max === null ? 'Enter a whole number of tokens above 0.' : limits?.max_generation_tokens && max > limits.max_generation_tokens ? `The server allows at most ${formatNumber(limits.max_generation_tokens)} (--max-generation-tokens).` : null;
  const ctxError = context.trim() !== '' && ctx === null ? 'Enter a whole number of tokens above 0, or leave it empty.' : null;
  const maxWarn = !maxError && max !== null && smallest !== null && max >= smallest ? `A loaded model has a context of ${formatNumber(smallest)} tokens; a reply stops when the context is full.` : null;
  const dirty = max !== prefs.defaultMaxTokens || ctx !== prefs.loadContext;

  return (
    <Card title="Generation">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (maxError || ctxError || max === null) return;
          setGenerationPrefs({ defaultMaxTokens: max, loadContext: ctx });
          setSaved(true);
        }}
        onChange={() => setSaved(false)}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="gen-max-tokens" className="text-[13px]">
              Default max tokens
            </label>
            <input id="gen-max-tokens" className={FIELD} value={maxTokens} onChange={(e) => setMaxTokens(e.target.value)} inputMode="numeric" autoComplete="off" aria-invalid={maxError !== null} />
            <p className={maxError ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}>{maxError ?? 'Longest reply a chat asks for, until you change it in that model’s chat settings.'}</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="gen-context" className="text-[13px]">
              Context length for loads
            </label>
            <input
              id="gen-context"
              className={FIELD}
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder={limits?.load_context ? `server: ${limits.load_context}` : 'the model’s own'}
              inputMode="numeric"
              autoComplete="off"
              aria-invalid={ctxError !== null}
            />
            <p className={ctxError ? 'text-[12px] text-danger' : 'text-[12px] text-muted'}>
              {ctxError ?? 'Tokens per conversation for models loaded from the Models page; capped by the model. Loaded models keep theirs until unloaded.'}
            </p>
          </div>
        </div>
        {maxWarn && <p className="rounded-md border border-warn/40 bg-warn/10 p-2 text-[13px] text-warn">{maxWarn}</p>}
        <div className="flex items-center gap-2">
          <Button type="submit" variant="primary" size="sm" disabled={!dirty || maxError !== null || ctxError !== null}>
            Save defaults
          </Button>
          {saved && !dirty && (
            <Badge tone="ok">
              <Dot tone="ok" />
              Saved in this browser
            </Badge>
          )}
        </div>
        {limits && (
          <dl className="space-y-1 border-t border-border pt-3 text-[13px]">
            <Limit label="Server default max tokens" value={formatNumber(limits.default_max_tokens)} />
            <Limit label="Server max tokens cap" value={limits.max_generation_tokens ? formatNumber(limits.max_generation_tokens) : 'the context'} />
            <Limit label="Server prompt cap" value={limits.max_prompt_tokens ? formatNumber(limits.max_prompt_tokens) : 'the context'} />
            <Limit label="Server load context" value={limits.load_context ? formatNumber(limits.load_context) : 'the model’s'} />
            {system?.models.map((m) => (
              <Limit key={m.id} label={`${m.id} context`} value={formatNumber(m.max_context)} />
            ))}
          </dl>
        )}
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const auth = useAuth();
  const rt = useRuntime();
  return (
    <div className="mx-auto max-w-[760px] space-y-4 p-4 lg:p-6">
      <SecretCard
        kind="api"
        title="API key"
        isSet={auth.hasApiKey}
        help={
          rt.access === 'open' && !auth.hasApiKey
            ? 'This server does not require an API key (/v1 is open on loopback). Set one only if the server was started with --api-key.'
            : 'Sent as Authorization: Bearer on every /v1 request. Use the server’s --api-key or a named client key.'
        }
      />
      <SecretCard
        kind="admin"
        title="Admin token"
        isSet={auth.hasAdminToken}
        help="Needed to load and unload models, and for model management. It is a separate secret (--admin-token); the API key never grants admin access."
      />
      <GenerationCard system={rt.system} />
      <Card title="Storage">
        <label className="flex items-start gap-3 text-[13px]">
          <input type="checkbox" checked={auth.remember} onChange={(e) => setRemember(e.target.checked)} className="mt-0.5 accent-[rgb(var(--accent))]" />
          <span>
            Remember on this device
            <span className="block text-muted">Off: secrets are kept for this browser session only (sessionStorage). On: they persist in localStorage until cleared.</span>
          </span>
        </label>
      </Card>
    </div>
  );
}
