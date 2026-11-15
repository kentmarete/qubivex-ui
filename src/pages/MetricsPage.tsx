import { Pause, Play, RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { ErrorPanel } from '../components/common/ErrorPanel';
import { Unavailable } from '../components/common/Unavailable';
import { Button, Dot } from '../components/common/ui';
import { MemoryBar } from '../components/metrics/MemoryBar';
import { SERIES } from '../components/metrics/palette';
import { StatCard } from '../components/metrics/StatCard';
import { TimeSeriesChart } from '../components/metrics/TimeSeriesChart';
import { useMetrics } from '../hooks/useMetrics';
import { formatBytes, formatNumber } from '../utils/format';
import { derive, lifetime, modelView, windowStart, type Point, type Val } from '../utils/metrics';
import { loadJson, saveJson } from '../utils/storage';

const INTERVALS = [1000, 2000, 5000, 10000, 30000];
const WINDOWS = [
  { ms: 60_000, label: '1 min' },
  { ms: 300_000, label: '5 min' },
  { ms: 900_000, label: '15 min' },
  { ms: 1_800_000, label: '30 min' },
];
/** Stat cards summarise this much recent history. */
const CARD_WINDOW_MS = 60_000;
const PREFS_KEY = 'qubivex.metrics.prefs';

const tps = (n: number) => formatNumber(n, n < 10 ? 1 : 0);
const msFmt = (n: number) => formatNumber(n, n < 10 ? 1 : 0);
const perSec = (n: number) => formatNumber(n, n < 1 ? 2 : 1);
const pct = (n: number) => formatNumber(n, 0);
/** Compact byte ticks for an axis: one decimal at most ("5.6 GiB"). */
function bytesAxis(n: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i += 1;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}`;
}

/** The window's value, else the since-start value marked as such. */
function orLifetime(win: Val, life: Val): { value: Val; scope: string } {
  if (typeof win === 'number') return { value: win, scope: 'last 60 s' };
  if (typeof life === 'number') return { value: life, scope: 'since server start' };
  return { value: win === undefined ? life : win, scope: '' };
}

const selectCls = 'h-8 rounded-md border border-border bg-surface-2 px-2 text-[13px]';

export function MetricsPage() {
  const [prefs, setPrefs] = useState(() => loadJson(PREFS_KEY, { intervalMs: 2000, windowMs: 300_000 }));
  const [paused, setPaused] = useState(false);
  const [model, setModel] = useState<string | null>(null);
  const [, tick] = useState(0);
  const m = useMetrics(prefs.intervalMs, paused);

  useEffect(() => saveJson(PREFS_KEY, prefs), [prefs]);
  // Re-render once a second so "updated … ago" and staleness stay current.
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const latest = m.snaps.at(-1);
  const models = latest ? Object.keys(latest.models) : [];
  useEffect(() => {
    if (model !== null && latest && !(model in latest.models)) setModel(null);
  }, [latest, model]);

  const points = useMemo<Point[]>(() => {
    if (!latest) return [];
    const from = latest.t - prefs.windowMs;
    const out: Point[] = [];
    m.snaps.forEach((s, i) => {
      if (s.t >= from) out.push(derive(m.snaps[i - 1], s, model));
    });
    return out;
  }, [m.snaps, latest, model, prefs.windowMs]);

  const card = latest ? derive(windowStart(m.snaps, latest, CARD_WINDOW_MS), latest, model) : undefined;
  const life = latest ? lifetime(latest, model) : undefined;
  const mv = latest ? modelView(latest, model) : undefined;
  const domain: [number, number] = latest ? [latest.t - prefs.windowMs, latest.t] : [0, 1];

  const stale = m.lastOk !== null && Date.now() - m.lastOk > prefs.intervalMs * 3;
  const ago = m.lastOk !== null ? Math.max(0, Math.round((Date.now() - m.lastOk) / 1000)) : null;

  if (m.disabled) {
    return (
      <div className="mx-auto max-w-[1280px] p-4 lg:p-6">
        <Unavailable title="Metrics are disabled on this server">
          <code className="font-mono">GET /metrics</code> answers 404: the server was started with <code className="font-mono">--no-metrics</code>.
        </Unavailable>
      </div>
    );
  }

  const ttft = orLifetime(card?.ttftMeanMs, life?.ttftMeanMs);
  const ttftP95 = typeof card?.ttftMeanMs === 'number' ? card.ttftP95Ms : life?.ttftP95Ms;
  const itl = orLifetime(card?.itlMeanMs, life?.itlMeanMs);
  const itlP95 = typeof card?.itlMeanMs === 'number' ? card.itlP95Ms : life?.itlP95Ms;
  const speed = orLifetime(card?.decodeSpeed, life?.decodeSpeed);
  const req = latest?.requests;
  const reqTotal = req ? req.ok + req.client + req.server : undefined;
  const reqRate = card && typeof card.reqOkPerSec === 'number' ? card.reqOkPerSec + (card.reqClientPerSec ?? 0) + (card.reqServerPerSec ?? 0) : null;
  const scopeNote = model ? `model ${model}` : models.length > 1 ? 'all models' : '';

  return (
    <div className="mx-auto max-w-[1280px] space-y-4 p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Model
          <select className={`${selectCls} max-w-[220px] font-mono text-text`} value={model ?? ''} onChange={(e) => setModel(e.target.value || null)}>
            <option value="">All models</option>
            {models.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Every
          <select className={`${selectCls} text-text`} value={prefs.intervalMs} onChange={(e) => setPrefs((p) => ({ ...p, intervalMs: Number(e.target.value) }))}>
            {INTERVALS.map((ms) => (
              <option key={ms} value={ms}>
                {ms / 1000} s
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Window
          <select className={`${selectCls} text-text`} value={prefs.windowMs} onChange={(e) => setPrefs((p) => ({ ...p, windowMs: Number(e.target.value) }))}>
            {WINDOWS.map((w) => (
              <option key={w.ms} value={w.ms}>
                {w.label}
              </option>
            ))}
          </select>
        </label>
        <Button size="sm" onClick={() => setPaused((p) => !p)} aria-pressed={paused}>
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          {paused ? 'Resume' : 'Pause'}
        </Button>
        <Button size="sm" variant="ghost" onClick={m.reset}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset history
        </Button>
        <span className={`ml-auto flex items-center gap-1.5 text-[12px] ${stale ? 'text-warn' : 'text-muted'}`} role="status">
          <Dot tone={paused ? 'muted' : stale ? 'warn' : m.lastOk ? 'ok' : 'muted'} />
          {paused
            ? 'Paused'
            : m.lastOk === null
              ? 'Waiting for the first scrape…'
              : `Updated ${new Date(m.lastOk).toLocaleTimeString()}${stale ? ` (${ago} s ago)` : ''}`}
        </span>
      </div>

      {m.error != null && <ErrorPanel title="The last scrape of /metrics failed; showing earlier data" error={m.error} />}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Generation throughput" value={card?.tokensPerSec} format={tps} unit="tok/s" sub="server-wide · last 60 s" />
        <StatCard label="Prompt throughput" value={card?.promptTokensPerSec} format={tps} unit="tok/s" sub="server-wide · last 60 s" />
        <StatCard
          label="Time to first token"
          value={ttft.value}
          format={msFmt}
          unit="ms mean"
          sub={`p95 ${typeof ttftP95 === 'number' ? msFmt(ttftP95) : '—'} ms · ${ttft.scope}`}
          pending="No generations yet"
        />
        <StatCard
          label="Decode latency"
          value={itl.value}
          format={msFmt}
          unit="ms / token"
          sub={`p95 ${typeof itlP95 === 'number' ? msFmt(itlP95) : '—'} ms · ${itl.scope}`}
          pending="No generations yet"
        />
        <StatCard label="Decode speed per generation" value={speed.value} format={tps} unit="tok/s" sub={`mean · ${speed.scope}`} pending="No generations yet" />
        <StatCard
          label="Active generations"
          value={latest?.active}
          format={(n) => formatNumber(n)}
          sub={`queue ${mv?.queueDepth ?? '—'} · free slots ${mv?.slotsFree ?? '—'}`}
          pending="Waiting for the first scrape"
        />
        <StatCard
          label="Requests answered"
          value={reqTotal}
          format={(n) => formatNumber(n)}
          sub={`${reqRate === null ? '—' : perSec(reqRate)} /s · ${req ? `${formatNumber(req.client)} 4xx · ${formatNumber(req.server)} 5xx` : ''} · since start`}
        />
        <StatCard
          label="Failed generations"
          value={latest?.failed}
          format={(n) => formatNumber(n)}
          sub={`${latest?.cancelled ?? '—'} cancelled · ${latest?.timedOut ?? '—'} timed out · since start`}
        />
        <StatCard label="Process memory" value={latest?.rss} format={formatBytes} sub={`peak ${formatBytes(latest?.peakRss)}`} unavailable="The OS does not report this process's memory" />
        <StatCard label="Model memory" value={card?.modelMemory} format={formatBytes} sub={`plan budget ${formatBytes(mv?.memory.budget)}${scopeNote ? ` · ${scopeNote}` : ''}`} unavailable="No model is loaded">
          {mv && (
            <MemoryBar
              budget={mv.memory.budget}
              parts={[
                { name: 'Weights', bytes: mv.memory.dense },
                { name: 'Expert cache', bytes: mv.memory.expert },
                { name: 'KV cache', bytes: mv.memory.kv },
                { name: 'Activations', bytes: mv.memory.activations },
              ]}
            />
          )}
        </StatCard>
        <StatCard label="CPU utilisation" value={card?.cpuPercent} format={pct} unit="% of one core" sub="this process" />
        <StatCard
          label="GPU memory"
          value={card?.vramUsed}
          format={formatBytes}
          sub={`of ${formatBytes(card?.vramCapacity)} · GPU utilisation is not reported`}
          unavailable="No discrete GPU in use (reported with --backend vulkan or sim)"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <TimeSeriesChart
          title="Tokens per second"
          data={points}
          domain={domain}
          format={tps}
          series={[
            { key: 'tokensPerSec', name: 'Generated', color: SERIES[0] },
            { key: 'promptTokensPerSec', name: 'Prompt', color: SERIES[1] },
          ]}
          note="Server-wide, from token counters between scrapes."
        />
        <TimeSeriesChart
          title="Request throughput (per second)"
          data={points}
          domain={domain}
          format={perSec}
          series={[
            { key: 'reqOkPerSec', name: '2xx', color: SERIES[0] },
            { key: 'reqClientPerSec', name: '4xx', color: SERIES[1] },
            { key: 'reqServerPerSec', name: '5xx', color: SERIES[2] },
          ]}
        />
        <TimeSeriesChart
          title="Decode latency (ms per token)"
          data={points}
          domain={domain}
          format={msFmt}
          continuous={false}
          series={[
            { key: 'itlMeanMs', name: 'Mean', color: SERIES[0] },
            { key: 'itlP95Ms', name: 'p95', color: SERIES[1] },
          ]}
          note="One point per scrape in which generations produced tokens."
        />
        <TimeSeriesChart
          title="Time to first token (ms)"
          data={points}
          domain={domain}
          format={msFmt}
          continuous={false}
          series={[
            { key: 'ttftMeanMs', name: 'Mean', color: SERIES[0] },
            { key: 'ttftP95Ms', name: 'p95', color: SERIES[1] },
          ]}
          note="p95 is interpolated from histogram buckets, as Prometheus does."
        />
        <TimeSeriesChart
          title="Memory over time"
          data={points}
          domain={domain}
          format={formatBytes} axisFormat={bytesAxis}
          series={[
            { key: 'rss', name: 'Process resident', color: SERIES[0] },
            { key: 'modelMemory', name: 'Model allocations', color: SERIES[1] },
            { key: 'memoryBudget', name: 'Plan budget', color: SERIES[2] },
          ]}
          empty={latest && latest.rss === undefined && card?.modelMemory === undefined ? 'This server reports no memory figures.' : undefined}
          note="CPU utilisation is not reported by this server, so it is not charted."
        />
        <TimeSeriesChart
          title="GPU memory over time"
          data={points}
          domain={domain}
          format={formatBytes} axisFormat={bytesAxis}
          series={[
            { key: 'vramUsed', name: 'Used', color: SERIES[0] },
            { key: 'vramCapacity', name: 'Capacity', color: SERIES[1] },
          ]}
          empty={
            !latest
              ? 'Waiting for the first scrape…'
              : card?.vramUsed === undefined
                ? 'No discrete GPU in use. VRAM is reported when a model runs with --backend vulkan or sim. GPU utilisation is not reported by this server.'
                : undefined
          }
        />
      </div>
    </div>
  );
}
