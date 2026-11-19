// Discover (search the hub through the server, then download) and Jobs (the server's
// downloads). See qubivex docs/serving/http-api.md "Model downloads".

import { Download, RefreshCw, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getGenerationPrefs } from '../../hooks/useGenerationPrefs';
import { loadsWhenDone, refreshJobs, restartJob, startPull, stopJob, useDownloads } from '../../hooks/useDownloads';
import { startLoad } from '../../hooks/useModelOps';
import { searchModels } from '../../services/downloads';
import type { Job, JobStatus, PullSpec, SearchHit } from '../../types/api';
import { formatBytes, formatDuration, formatNumber } from '../../utils/format';
import { Dialog } from '../common/Dialog';
import { ErrorPanel } from '../common/ErrorPanel';
import { Badge, Button, Card, Spinner, type Tone } from '../common/ui';
import { parseTokens } from './ModelDialogs';

const INPUT = 'h-9 w-full rounded-md border border-border bg-surface-2 px-3 font-mono text-[13px] placeholder:text-muted/60';

/** Download options: which file, which id, extra config values, and whether to load it after. */
export function PullDialog({
  repository,
  onClose,
  disabledReason,
}: {
  repository: string | null;
  onClose: () => void;
  disabledReason: string | null;
}) {
  const [file, setFile] = useState('');
  const [id, setId] = useState('');
  const [set, setSet] = useState('');
  const [load, setLoad] = useState(true);
  const [context, setContext] = useState('');
  useEffect(() => {
    if (repository !== null) {
      setFile('');
      setId('');
      setSet('');
      setLoad(true);
      setContext(getGenerationPrefs().loadContext?.toString() ?? '');
    }
  }, [repository]);

  let setValue: Record<string, unknown> | null = null;
  let setBad = false;
  if (set.trim()) {
    try {
      const v: unknown = JSON.parse(set);
      if (v && typeof v === 'object' && !Array.isArray(v)) setValue = v as Record<string, unknown>;
      else setBad = true;
    } catch {
      setBad = true;
    }
  }
  const contextBad = load && context.trim() !== '' && parseTokens(context) === null;

  return (
    <Dialog open={repository !== null} onClose={onClose} title={`Download ${repository ?? ''}`}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (repository === null || setBad || contextBad) return;
          const spec: PullSpec = { repository };
          if (file.trim()) spec.files = [file.trim()];
          if (id.trim()) spec.id = id.trim();
          if (setValue) spec.set = setValue;
          void startPull(spec, { load, context: parseTokens(context) });
          onClose();
        }}
      >
        <p className="text-[13px] text-muted">
          The server downloads the model into its models directory and checks every file. It keeps going if you close this page.
        </p>
        <div className="space-y-1.5">
          <label htmlFor="pull-file" className="text-[13px]">
            File <span className="text-muted">(optional; needed when the repository has several weight files, such as GGUF quantisations)</span>
          </label>
          <input id="pull-file" className={INPUT} value={file} onChange={(e) => setFile(e.target.value)} placeholder="Model-Q4_K_M.gguf" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pull-id" className="text-[13px]">
            Install as <span className="text-muted">(optional)</span>
          </label>
          <input id="pull-id" className={INPUT} value={id} onChange={(e) => setId(e.target.value)} placeholder="derived from the repository" autoComplete="off" spellCheck={false} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="pull-set" className="text-[13px]">
            Config values <span className="text-muted">(optional JSON, for values the checkpoint does not record)</span>
          </label>
          <input id="pull-set" className={INPUT} value={set} onChange={(e) => setSet(e.target.value)} placeholder='{"norm_topk_prob": false}' autoComplete="off" spellCheck={false} aria-invalid={setBad} />
          {setBad && <p className="text-[12px] text-danger">Give a JSON object, such as {'{"norm_topk_prob": false}'}.</p>}
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={load} onChange={(e) => setLoad(e.target.checked)} /> Load it when the download finishes
        </label>
        {load && (
          <div className="space-y-1.5">
            <label htmlFor="pull-context" className="text-[13px]">
              Load context <span className="text-muted">(optional, tokens)</span>
            </label>
            <input id="pull-context" className={INPUT} value={context} onChange={(e) => setContext(e.target.value)} placeholder="the server's default" inputMode="numeric" autoComplete="off" aria-invalid={contextBad} />
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={disabledReason !== null || setBad || contextBad} title={disabledReason ?? undefined}>
            <Download className="h-3.5 w-3.5" /> Download
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

export function DiscoverPanel({ disabledReason, onPull, loaded }: { disabledReason: string | null; onPull: (repository: string) => void; loaded: ReadonlySet<string> }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    setError(null);
    try {
      setHits((await searchModels(q.trim())).data);
    } catch (err) {
      setError(err);
      setHits(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void search(e)} className="flex gap-2" role="search">
        <input
          aria-label="Search models"
          className={INPUT}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search Hugging Face, e.g. Qwen3-4B-Instruct or owner/name"
          autoComplete="off"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" disabled={busy || !q.trim() || disabledReason !== null} title={disabledReason ?? undefined}>
          {busy ? <Spinner /> : <Search className="h-3.5 w-3.5" />} Search
        </Button>
      </form>
      <p className="text-[12px] text-muted">
        The server runs the search and the download. Check the context length, size and format before downloading: Qubivex runs OLMoE, Qwen3, Qwen3-MoE, Qwen2/2.5 and
        Llama-style models, as SafeTensors or GGUF.
      </p>
      {error != null && <ErrorPanel title="Search failed" error={error} />}
      {hits !== null && (
        <Card title={`${hits.length} result${hits.length === 1 ? '' : 's'}`}>
          {hits.length === 0 ? (
            <p className="text-[13px] text-muted">Nothing found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead className="text-left text-muted">
                  <tr>
                    <th className="py-1.5 pr-3 font-normal">Repository</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Downloads</th>
                    <th className="py-1.5 pr-3 text-right font-normal">Likes</th>
                    <th className="py-1.5 pr-3 font-normal">Format</th>
                    <th className="py-1.5 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {hits.map((h) => (
                    <tr key={h.repository} className="border-t border-border" data-testid={`hit-${h.repository}`}>
                      <td className="py-2 pr-3 font-mono">
                        {h.repository}
                        {h.gated && (
                          <span className="ml-2" title="Needs an access token in the server's environment (HF_TOKEN)">
                            <Badge tone="warn">gated</Badge>
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-right font-mono">{formatNumber(h.downloads)}</td>
                      <td className="py-2 pr-3 text-right font-mono">{formatNumber(h.likes)}</td>
                      <td className="py-2 pr-3">{h.formats.join(', ') || '—'}</td>
                      <td className="py-2 text-right">
                        {h.installed_as.length > 0 ? (
                          <span className="inline-flex items-center gap-2">
                            <Badge tone="ok">installed as {h.installed_as.join(', ')}</Badge>
                            {!h.installed_as.some((id) => loaded.has(id)) && (
                              <Button size="sm" onClick={() => void startLoad(h.installed_as[0] ?? '')} disabled={disabledReason !== null} title={disabledReason ?? undefined}>
                                Load
                              </Button>
                            )}
                          </span>
                        ) : (
                          <Button size="sm" onClick={() => onPull(h.repository)} disabled={disabledReason !== null} title={disabledReason ?? undefined} aria-label={`Download ${h.repository}`}>
                            <Download className="h-3.5 w-3.5" /> Download
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

const STATUS: Record<JobStatus, { tone: Tone; text: string }> = {
  running: { tone: 'warn', text: 'downloading' },
  validating: { tone: 'warn', text: 'checking' },
  succeeded: { tone: 'ok', text: 'done' },
  failed: { tone: 'danger', text: 'failed' },
  cancelled: { tone: 'muted', text: 'cancelled' },
};

function JobRow({ job, disabledReason, loaded }: { job: Job; disabledReason: string | null; loaded: ReadonlySet<string> }) {
  const p = job.progress;
  const pct = p.bytes_total > 0 ? Math.min(100, (p.bytes_done / p.bytes_total) * 100) : 0;
  const st = STATUS[job.status];
  const off = disabledReason !== null;
  const title = disabledReason ?? undefined;
  return (
    <li className="space-y-2 border-t border-border py-3 first:border-t-0" data-testid={`job-${job.id}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-mono text-[13px]">{job.repository}</span>
        <Badge tone={st.tone}>{st.text}</Badge>
        {job.model && <span className="text-[12px] text-muted">as {job.model}</span>}
        {loadsWhenDone(job.id) && job.status === 'running' && <span className="text-[12px] text-muted">loads when done</span>}
        <span className="flex-1" />
        {job.cancellable && (
          <Button size="sm" variant="ghost" onClick={() => void stopJob(job.id)} disabled={off} title={title} aria-label={`Cancel ${job.repository}`}>
            Cancel
          </Button>
        )}
        {(job.status === 'failed' || job.status === 'cancelled') && (
          <Button size="sm" onClick={() => void restartJob(job, { load: true, context: getGenerationPrefs().loadContext })} disabled={off} title={title ?? 'Starts again from what already arrived'} aria-label={`Retry ${job.repository}`}>
            Retry
          </Button>
        )}
        {job.status === 'succeeded' && job.result && !loaded.has(job.result.id) && (
          <Button size="sm" onClick={() => void startLoad(job.result?.id ?? '')} disabled={off} title={title} aria-label={`Load ${job.result.id}`}>
            Load
          </Button>
        )}
      </div>
      {(job.status === 'running' || job.status === 'validating') && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded bg-surface-2" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${job.repository} progress`}>
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="font-mono text-[12px] text-muted">
            {job.status === 'validating'
              ? 'Every file arrived; checking the model…'
              : p.bytes_total > 0
                ? `${pct.toFixed(1)}% · ${formatBytes(p.bytes_done)} of ${formatBytes(p.bytes_total)}${p.rate_bps ? ` · ${formatBytes(p.rate_bps)}/s` : ''}${p.eta_seconds != null ? ` · ${formatDuration(p.eta_seconds)} left` : ''}`
                : 'Finding the files…'}
          </div>
          {p.retrying && (
            <div className="text-[12px] text-warn">
              {p.retrying.file}: attempt {p.retrying.attempt} failed ({p.retrying.reason}); retrying in {p.retrying.delay_s.toFixed(1)} s
            </div>
          )}
        </div>
      )}
      {job.error && job.status === 'failed' && <div className="text-[12px] text-danger">{job.error.message}</div>}
      {job.result && job.result.warnings.length > 0 && (
        <ul className="list-disc pl-5 text-[12px] text-warn">
          {job.result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </li>
  );
}

export function JobsPanel({ disabledReason, loaded }: { disabledReason: string | null; loaded: ReadonlySet<string> }) {
  const { jobs, error } = useDownloads();
  useEffect(() => {
    void refreshJobs();
  }, []);
  return (
    <Card
      title="Downloads on the server"
      actions={
        <Button size="sm" variant="ghost" onClick={() => void refreshJobs()}>
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </Button>
      }
    >
      {error != null && <ErrorPanel title="Could not read the jobs" error={error} />}
      {jobs.length === 0 ? (
        <p className="text-[13px] text-muted">No downloads yet. Finished ones are kept for an hour.</p>
      ) : (
        <ul>
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} disabledReason={disabledReason} loaded={loaded} />
          ))}
        </ul>
      )}
    </Card>
  );
}
