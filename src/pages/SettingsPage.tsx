import { useState } from 'react';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { SecretInput } from '../components/common/SecretInput';
import { Badge, Button, Card, Dot, Spinner, type Tone } from '../components/common/ui';
import { useAuth } from '../hooks/useAuth';
import { useRuntime } from '../hooks/useRuntime';
import { ApiError } from '../services/api';
import { clearSecret, setRemember, setSecret, type SecretKind } from '../services/auth';
import { checkAdminToken, listModels } from '../services/system';

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
