// What the Metrics page shows, derived from /metrics scrapes (docs/01 §6).
//
// Values have three states, and the UI keeps them apart:
//   undefined: the server does not report this series at all;
//   null:      reported, but not computable yet (first scrape, no new observations,
//              or a counter reset between scrapes);
//   number:    a value, which may be zero.

import { histogram, labelValues, total, type Hist, type Scrape } from './prometheus';

export type Val = number | null | undefined;

interface Memory {
  dense?: number;
  expert?: number;
  kv?: number;
  activations?: number;
  budget?: number;
}

export interface ModelSnap {
  ttft?: Hist;
  itl?: Hist;
  genTps?: Hist;
  promptTps?: Hist;
  queueWait?: Hist;
  memory: Memory;
  vramUsed?: number;
  vramCapacity?: number;
  queueDepth?: number;
  slotsFree?: number;
}

/** The parts of one scrape the page uses, small enough to keep hundreds of. */
export interface Snap {
  t: number;
  generated?: number;
  prompt?: number;
  active?: number;
  failed?: number;
  cancelled?: number;
  timedOut?: number;
  rss?: number;
  peakRss?: number;
  /** Not served by today's gateway; used if it appears (docs/03 §3.9). */
  cpuSeconds?: number;
  requests?: { ok: number; client: number; server: number };
  models: Record<string, ModelSnap>;
}

function requests(s: Scrape): Snap['requests'] {
  const xs = s.get('qubivex_requests_total');
  if (!xs) return undefined;
  const r = { ok: 0, client: 0, server: 0 };
  for (const x of xs) {
    const code = Number(x.labels.status);
    if (code >= 500) r.server += x.value;
    else if (code >= 400) r.client += x.value;
    else r.ok += x.value;
  }
  return r;
}

export function snapshot(s: Scrape, t: number): Snap {
  const models: Record<string, ModelSnap> = {};
  for (const id of labelValues(s, 'model')) {
    const f = { model: id };
    models[id] = {
      ttft: histogram(s, 'qubivex_time_to_first_token_seconds', f),
      itl: histogram(s, 'qubivex_inter_token_seconds', f),
      genTps: histogram(s, 'qubivex_generation_tokens_per_second', f),
      promptTps: histogram(s, 'qubivex_prompt_tokens_per_second', f),
      queueWait: histogram(s, 'qubivex_queue_wait_seconds', f),
      memory: {
        dense: total(s, 'qubivex_memory_dense_bytes', f),
        expert: total(s, 'qubivex_memory_expert_cache_bytes', f),
        kv: total(s, 'qubivex_memory_kv_bytes', f),
        activations: total(s, 'qubivex_memory_activations_bytes', f),
        budget: total(s, 'qubivex_memory_budget_bytes', f),
      },
      vramUsed: total(s, 'qubivex_vram_used_bytes', f),
      vramCapacity: total(s, 'qubivex_vram_capacity_bytes', f),
      queueDepth: total(s, 'qubivex_queue_depth', f),
      slotsFree: total(s, 'qubivex_generation_slots_free', f),
    };
  }
  return {
    t,
    generated: total(s, 'qubivex_generated_tokens_total'),
    prompt: total(s, 'qubivex_prompt_tokens_total'),
    active: total(s, 'qubivex_generations_active'),
    failed: total(s, 'qubivex_generations_failed_total'),
    cancelled: total(s, 'qubivex_generations_cancelled_total'),
    timedOut: total(s, 'qubivex_generations_timed_out_total'),
    rss: total(s, 'qubivex_process_resident_bytes'),
    peakRss: total(s, 'qubivex_process_peak_resident_bytes'),
    cpuSeconds: total(s, 'qubivex_process_cpu_seconds_total') ?? total(s, 'process_cpu_seconds_total'),
    requests: requests(s),
    models,
  };
}

// ---- histogram arithmetic ----------------------------------------------------------

function sumOpt(xs: (number | undefined)[]): number | undefined {
  const known = xs.filter((x): x is number => x !== undefined);
  return known.length ? known.reduce((a, b) => a + b, 0) : undefined;
}

function mergeHist(xs: (Hist | undefined)[]): Hist | undefined {
  const known = xs.filter((x): x is Hist => x !== undefined);
  if (!known.length) return undefined;
  const byLe = new Map<number, number>();
  for (const h of known) h.le.forEach((le, i) => byLe.set(le, (byLe.get(le) ?? 0) + (h.counts[i] ?? 0)));
  const le = [...byLe.keys()].sort((a, b) => a - b);
  return {
    le,
    counts: le.map((x) => byLe.get(x) ?? 0),
    sum: known.reduce((a, h) => a + h.sum, 0),
    count: known.reduce((a, h) => a + h.count, 0),
  };
}

/** One model's view, or every model merged when `model` is null. */
export function modelView(s: Snap, model: string | null): ModelSnap | undefined {
  if (model !== null) return s.models[model];
  const all = Object.values(s.models);
  if (!all.length) return undefined;
  return {
    ttft: mergeHist(all.map((m) => m.ttft)),
    itl: mergeHist(all.map((m) => m.itl)),
    genTps: mergeHist(all.map((m) => m.genTps)),
    promptTps: mergeHist(all.map((m) => m.promptTps)),
    queueWait: mergeHist(all.map((m) => m.queueWait)),
    memory: {
      dense: sumOpt(all.map((m) => m.memory.dense)),
      expert: sumOpt(all.map((m) => m.memory.expert)),
      kv: sumOpt(all.map((m) => m.memory.kv)),
      activations: sumOpt(all.map((m) => m.memory.activations)),
      budget: sumOpt(all.map((m) => m.memory.budget)),
    },
    vramUsed: sumOpt(all.map((m) => m.vramUsed)),
    vramCapacity: sumOpt(all.map((m) => m.vramCapacity)),
    queueDepth: sumOpt(all.map((m) => m.queueDepth)),
    slotsFree: sumOpt(all.map((m) => m.slotsFree)),
  };
}

/** Observations between two scrapes; null if none, or if the counter reset. */
export function histDelta(a: Hist | undefined, b: Hist | undefined): Hist | null | undefined {
  if (!b) return undefined;
  if (!a) return null;
  if (b.count < a.count || a.le.length !== b.le.length || a.le.some((x, i) => x !== b.le[i])) return null;
  const count = b.count - a.count;
  if (count <= 0) return null;
  return { le: b.le, counts: b.counts.map((c, i) => c - (a.counts[i] ?? 0)), sum: b.sum - a.sum, count };
}

export function histMean(h: Hist | null | undefined): Val {
  if (h === undefined) return undefined;
  if (h === null || h.count <= 0) return null;
  return h.sum / h.count;
}

/**
 * Prometheus' histogram_quantile: linear interpolation inside the bucket that holds the
 * rank. A rank in the +Inf bucket returns the highest finite bound.
 */
export function histQuantile(h: Hist | null | undefined, q: number): Val {
  if (h === undefined) return undefined;
  if (h === null || h.count <= 0 || !h.le.length) return null;
  const rank = q * h.count;
  for (let i = 0; i < h.le.length; i += 1) {
    const c = h.counts[i] ?? 0;
    if (c < rank) continue;
    const upper = h.le[i] as number;
    const lower = i === 0 ? 0 : (h.le[i - 1] as number);
    if (upper === Infinity) return i === 0 ? null : lower;
    const below = i === 0 ? 0 : (h.counts[i - 1] ?? 0);
    const inBucket = c - below;
    return inBucket > 0 ? lower + ((upper - lower) * (rank - below)) / inBucket : upper;
  }
  return null;
}

/** Per-second rate of a counter; null on the first scrape or after a reset. */
export function rate(a: number | undefined, b: number | undefined, seconds: number): Val {
  if (b === undefined) return undefined;
  if (a === undefined || seconds <= 0 || b < a) return null;
  return (b - a) / seconds;
}

// ---- points -----------------------------------------------------------------------

export interface Point {
  t: number;
  /** Server-wide tokens generated per second. */
  tokensPerSec: Val;
  promptTokensPerSec: Val;
  /** Mean of each finished generation's own decode speed (tokens/s). */
  decodeSpeed: Val;
  ttftMeanMs: Val;
  ttftP95Ms: Val;
  itlMeanMs: Val;
  itlP95Ms: Val;
  queueWaitMeanMs: Val;
  reqOkPerSec: Val;
  reqClientPerSec: Val;
  reqServerPerSec: Val;
  cpuPercent: Val;
  rss: Val;
  modelMemory: Val;
  memoryBudget: Val;
  vramUsed: Val;
  vramCapacity: Val;
  active: Val;
  queueDepth: Val;
  slotsFree: Val;
}

const ms = (v: Val): Val => (typeof v === 'number' ? v * 1000 : v);

function memorySum(m: Memory | undefined): Val {
  if (!m) return undefined;
  return sumOpt([m.dense, m.expert, m.kv, m.activations]);
}

/** What happened between scrapes `a` (older, may be absent) and `b`, for `model`. */
export function derive(a: Snap | undefined, b: Snap, model: string | null): Point {
  const dt = a ? (b.t - a.t) / 1000 : 0;
  const ma = a ? modelView(a, model) : undefined;
  const mb = modelView(b, model);
  const ttft = histDelta(ma?.ttft, mb?.ttft);
  const itl = histDelta(ma?.itl, mb?.itl);
  const cpu = rate(a?.cpuSeconds, b.cpuSeconds, dt);
  return {
    t: b.t,
    tokensPerSec: rate(a?.generated, b.generated, dt),
    promptTokensPerSec: rate(a?.prompt, b.prompt, dt),
    decodeSpeed: histMean(histDelta(ma?.genTps, mb?.genTps)),
    ttftMeanMs: ms(histMean(ttft)),
    ttftP95Ms: ms(histQuantile(ttft, 0.95)),
    itlMeanMs: ms(histMean(itl)),
    itlP95Ms: ms(histQuantile(itl, 0.95)),
    queueWaitMeanMs: ms(histMean(histDelta(ma?.queueWait, mb?.queueWait))),
    reqOkPerSec: rate(a?.requests?.ok, b.requests?.ok, dt),
    reqClientPerSec: rate(a?.requests?.client, b.requests?.client, dt),
    reqServerPerSec: rate(a?.requests?.server, b.requests?.server, dt),
    cpuPercent: typeof cpu === 'number' ? cpu * 100 : cpu,
    rss: b.rss,
    modelMemory: memorySum(mb?.memory),
    memoryBudget: mb?.memory.budget,
    vramUsed: mb?.vramUsed,
    vramCapacity: mb?.vramCapacity,
    active: b.active,
    queueDepth: mb?.queueDepth,
    slotsFree: mb?.slotsFree,
  };
}

/** Means over everything since the server started (for when a window saw nothing). */
export function lifetime(b: Snap, model: string | null) {
  const m = modelView(b, model);
  return {
    ttftMeanMs: ms(histMean(m?.ttft)),
    ttftP95Ms: ms(histQuantile(m?.ttft, 0.95)),
    itlMeanMs: ms(histMean(m?.itl)),
    itlP95Ms: ms(histQuantile(m?.itl, 0.95)),
    decodeSpeed: histMean(m?.genTps),
    promptSpeed: histMean(m?.promptTps),
    memory: m?.memory,
  };
}

/** The oldest snapshot no older than `windowMs` before `b` (at least the one before b). */
export function windowStart(snaps: Snap[], b: Snap, windowMs: number): Snap | undefined {
  const i = snaps.indexOf(b);
  if (i <= 0) return undefined;
  for (let j = 0; j < i; j += 1) {
    const s = snaps[j] as Snap;
    if (b.t - s.t <= windowMs) return s;
  }
  return snaps[i - 1];
}
