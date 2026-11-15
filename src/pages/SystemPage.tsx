import { RefreshCw } from 'lucide-react';
import { useCallback, useState } from 'react';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { Unavailable } from '../components/common/Unavailable';
import { Button, Card, Field, Spinner } from '../components/common/ui';
import { healthLabel } from '../components/layout/status';
import { CpuCard, GpuCard, MemoryCard, OsCard, StorageCard } from '../components/system/HardwareCards';
import { LoadedModelsCard } from '../components/system/LoadedModelsCard';
import { usePolling } from '../hooks/usePolling';
import { useRuntime } from '../hooks/useRuntime';
import { getSystem } from '../services/system';
import type { SystemInfo } from '../types/api';
import { formatDuration } from '../utils/format';

const REFRESH_MS = 10_000;

export function SystemPage() {
  const rt = useRuntime();
  const [sys, setSys] = useState<SystemInfo | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [updated, setUpdated] = useState<Date | null>(null);
  const [nonce, setNonce] = useState(0);

  const load = useCallback(async (signal: AbortSignal) => {
    try {
      const s = await getSystem(signal);
      setSys(s);
      setError(null);
      setUpdated(new Date());
    } catch (e) {
      if (!signal.aborted) setError(e);
    }
  }, []);

  usePolling(load, REFRESH_MS, { restartKey: nonce });

  const backends = sys ? [...new Set(sys.models.map((m) => m.placement))] : [];

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 lg:p-6">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] text-muted">
          {updated ? `Updated ${updated.toLocaleTimeString()}` : 'Loading…'} · refreshes every {REFRESH_MS / 1000}s
        </p>
        <Button size="sm" variant="ghost" onClick={() => setNonce((n) => n + 1)}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      {error != null && <ErrorPanel title="Could not read /v1/system" error={error} />}
      {!sys && error == null && (
        <div className="flex items-center gap-2 text-muted">
          <Spinner /> Reading system information…
        </div>
      )}

      {sys && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card title="Runtime">
              <dl className="divide-y divide-border/60">
                <Field label="API" value={healthLabel(rt.health)} />
                <Field label="Version" value={sys.version ?? null} why="This server does not report its version" mono />
                <Field label="Uptime" value={sys.uptime_seconds !== undefined ? formatDuration(sys.uptime_seconds) : null} why="This server does not report its uptime" mono />
                <Field label="Execution backend" value={backends.length ? backends.join(', ') : null} why="No model is loaded" mono />
                <Field label="Models loaded" value={String(sys.models.length)} mono />
                <Field label="Models draining" value={String(sys.models_draining)} mono />
                <Field label="Generations active" value={String(sys.generations_active)} mono />
              </dl>
            </Card>
            {sys.hardware ? (
              <>
                <CpuCard hw={sys.hardware} />
                <MemoryCard hw={sys.hardware} />
              </>
            ) : (
              <Unavailable title="Hardware profile unavailable">The server could not probe its hardware.</Unavailable>
            )}
          </div>

          <LoadedModelsCard sys={sys} />

          {sys.hardware && (
            <div className="grid gap-4 lg:grid-cols-2">
              <GpuCard hw={sys.hardware} />
              <div className="space-y-4">
                <OsCard hw={sys.hardware} />
                <StorageCard hw={sys.hardware} />
              </div>
            </div>
          )}

          <Card title="Configuration">
            <Unavailable title="Not available from this server">
              Model directories and serve settings need the admin configuration endpoint (<code className="font-mono">GET /v1/admin/config</code>, docs/03 §3.2),
              which this server does not provide yet.
            </Unavailable>
          </Card>
        </>
      )}
    </div>
  );
}
