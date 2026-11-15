import { Info, KeyRound, Plus, RefreshCw, X } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { Unavailable } from '../components/common/Unavailable';
import { Button, Card, Dot, Spinner, type Tone } from '../components/common/ui';
import { InventoryTable, type RowActions } from '../components/models/InventoryTable';
import { LoadDialog, UnloadDialog } from '../components/models/ModelDialogs';
import { useCapabilities, type AdminStatus, type Caps } from '../hooks/useCapabilities';
import { dismissNotice, startLoad, startUnload, useModelOps, type Notice } from '../hooks/useModelOps';
import { usePolling } from '../hooks/usePolling';
import { useRuntime } from '../hooks/useRuntime';
import type { SecretKind } from '../services/auth';
import { getSystem } from '../services/system';
import type { SystemInfo } from '../types/api';
import { buildRows } from '../utils/inventory';

/** Poll /v1/system every second while a load runs (docs/03 §3.8), else every 5 s. */
export const POLL_MS = 5_000;
export const POLL_LOADING_MS = 1_000;

type Tab = 'installed' | 'discover' | 'jobs';
const TABS: { id: Tab; label: string }[] = [
  { id: 'installed', label: 'Installed' },
  { id: 'discover', label: 'Discover' },
  { id: 'jobs', label: 'Jobs' },
];

const ADMIN: Record<AdminStatus, { tone: Tone; text: string; reason: string | null; ask: boolean }> = {
  checking: { tone: 'muted', text: 'Checking admin access…', reason: 'Checking admin access…', ask: false },
  valid: { tone: 'ok', text: 'Admin token accepted. You can load and unload models.', reason: null, ask: false },
  missing: { tone: 'warn', text: 'Loading and unloading need the admin token (--admin-token). The API key does not grant admin access.', reason: 'Enter the admin token first', ask: true },
  invalid: { tone: 'danger', text: 'The stored admin token was rejected by the server.', reason: 'The admin token was rejected', ask: true },
  disabled: {
    tone: 'muted',
    text: 'Admin operations are disabled on this server: it was started without --admin-token.',
    reason: 'Server started without --admin-token',
    ask: false,
  },
  unknown: { tone: 'warn', text: 'Could not check admin access. Actions will report their own errors.', reason: null, ask: false },
};

function AdminBar({ status, onAsk }: { status: AdminStatus; onAsk: () => void }) {
  const a = ADMIN[status];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border bg-surface px-3 py-2 text-[13px]" data-testid="admin-status">
      {status === 'checking' ? <Spinner /> : <Dot tone={a.tone} />}
      <span className="min-w-0 flex-1">{a.text}</span>
      {a.ask && (
        <Button size="sm" onClick={onAsk}>
          <KeyRound className="h-3.5 w-3.5" /> Enter admin token
        </Button>
      )}
    </div>
  );
}

const NOTICE_STYLE: Record<Notice['tone'], string> = {
  ok: 'border-accent/40 bg-accent/10',
  warn: 'border-warn/40 bg-warn/10',
  danger: 'border-danger/40 bg-danger/10',
};

function Notices({ notices }: { notices: readonly Notice[] }) {
  return (
    <div aria-live="polite" className="space-y-2 empty:hidden">
      {notices.map((n) =>
        n.tone === 'danger' && n.error != null ? (
          <ErrorPanel
            key={n.key}
            title={n.text}
            error={n.error}
            action={
              <button type="button" aria-label="Dismiss" onClick={() => dismissNotice(n.key)} className="rounded p-0.5 text-muted hover:text-text">
                <X className="h-4 w-4" />
              </button>
            }
          />
        ) : (
          <div key={n.key} role="status" className={`flex items-start gap-3 rounded-md border p-3 text-[13px] ${NOTICE_STYLE[n.tone]}`}>
            <span className="min-w-0 flex-1">{n.text}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismissNotice(n.key)} className="rounded p-0.5 text-muted hover:text-text">
              <X className="h-4 w-4" />
            </button>
          </div>
        ),
      )}
    </div>
  );
}

/** Discover and Jobs need the admin model API (docs/03); today they explain why they are empty. */
function NeedsModelManagement({ caps, what }: { caps: Caps; what: string }): ReactNode {
  switch (caps.modelManagement) {
    case 'checking':
      return (
        <div className="flex items-center gap-2 p-6 text-muted">
          <Spinner /> Checking what this server supports…
        </div>
      );
    case 'unavailable':
      return (
        <Unavailable title="Needs Qubivex with model management">
          {what} needs the admin model API (<code className="font-mono">/v1/admin/models/*</code>, see docs/03), which this server does not have.
        </Unavailable>
      );
    case 'available':
      return (
        <Unavailable title="Not in this version of the UI yet">
          This server supports model management. {what} arrives in a later release of the web UI.
        </Unavailable>
      );
    case 'unknown':
      return (
        <Unavailable title="Could not tell whether this server supports model management">
          The capability check failed. Reload the page to try again.
        </Unavailable>
      );
  }
}

export function ModelsPage({ onAskKey }: { onAskKey: (kind: SecretKind) => void }) {
  const rt = useRuntime();
  const caps = useCapabilities();
  const ops = useModelOps();
  const [tab, setTab] = useState<Tab>('installed');
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const [loadOpen, setLoadOpen] = useState(false);
  const [unloadId, setUnloadId] = useState<string | null>(null);

  const rows = useMemo(() => buildRows(sys, ops), [sys, ops]);
  const loading = rows.some((r) => r.state === 'loading');

  const poll = useCallback(async (signal: AbortSignal) => {
    try {
      const s = await getSystem(signal);
      setSys(s);
      setError(null);
    } catch (e) {
      if (!signal.aborted) setError(e);
    }
  }, []);
  usePolling(poll, loading ? POLL_LOADING_MS : POLL_MS, { restartKey: nonce });

  // After an action: re-read now, and let Chat and the shell see the new loaded set.
  const settled = useCallback(() => {
    setNonce((n) => n + 1);
    rt.refresh();
  }, [rt]);

  const reason = ADMIN[caps.admin].reason;
  const actions: RowActions = {
    disabledReason: reason,
    onLoad: (r) => void startLoad(r.source, r.id, settled),
    onUnload: (r) => setUnloadId(r.id),
    onClear: (r) => void startUnload(r.id, settled),
  };
  const unloadRow = rows.find((r) => r.id === unloadId) ?? null;

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 lg:p-6">
      <div role="tablist" aria-label="Models" className="flex gap-1 border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${tab === t.id ? 'border-accent text-text' : 'border-transparent text-muted hover:text-text'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <AdminBar status={caps.admin} onAsk={() => onAskKey('admin')} />
      <Notices notices={ops.notices} />

      {tab === 'installed' && (
        <div role="tabpanel" aria-label="Installed" className="space-y-4">
          <div className="flex items-start gap-2 rounded-md border border-border bg-surface-2/60 px-3 py-2 text-[13px] text-muted">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Showing loaded models only.{' '}
              {caps.modelManagement === 'available'
                ? 'This server has an on-disk inventory; it is not shown in this version of the UI yet.'
                : 'On-disk inventory needs model management.'}
            </span>
          </div>

          {error != null && <ErrorPanel title="Could not read /v1/system" error={error} />}

          <Card
            title="Models in the runtime"
            actions={
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </Button>
                <Button size="sm" variant="primary" onClick={() => setLoadOpen(true)} disabled={reason !== null} title={reason ?? undefined}>
                  <Plus className="h-3.5 w-3.5" /> Load model
                </Button>
              </div>
            }
          >
            {!sys && error == null && rows.length === 0 ? (
              <div className="flex items-center gap-2 text-muted">
                <Spinner /> Reading the runtime…
              </div>
            ) : rows.length === 0 ? (
              <p className="text-[13px] text-muted">No models are loaded. Use Load model to load one by its installed id or directory.</p>
            ) : (
              <InventoryTable rows={rows} actions={actions} />
            )}
          </Card>
        </div>
      )}
      {tab === 'discover' && (
        <div role="tabpanel" aria-label="Discover">
          <NeedsModelManagement caps={caps} what="Searching and pulling models" />
        </div>
      )}
      {tab === 'jobs' && (
        <div role="tabpanel" aria-label="Jobs">
          <NeedsModelManagement caps={caps} what="Tracking pull and verify jobs" />
        </div>
      )}

      <LoadDialog open={loadOpen} onClose={() => setLoadOpen(false)} onLoad={(m, id) => void startLoad(m, id, settled)} suggestions={ops.unloaded} />
      <UnloadDialog id={unloadId} runtime={unloadRow?.runtime ?? null} onClose={() => setUnloadId(null)} onUnload={(id) => void startUnload(id, settled)} />
    </div>
  );
}
