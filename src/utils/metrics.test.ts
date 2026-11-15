import { describe, expect, it } from 'vitest';
import { fixture } from '../../test/mockFetch';
import { derive, histDelta, histQuantile, lifetime, modelView, rate, snapshot, windowStart, type Snap } from './metrics';
import { parsePrometheus, type Hist } from './prometheus';

const M = 'qwen2.5-0.5b-instruct';
const base = snapshot(parsePrometheus(fixture('metrics.txt')), 0);

/** A later scrape: `extra` generated tokens and one more TTFT observation of 0.3 s. */
function later(t: number, extra: number): Snap {
  const m = base.models[M]!;
  const ttft = m.ttft!;
  const i = ttft.le.findIndex((x) => x >= 0.3);
  return {
    ...base,
    t,
    generated: (base.generated ?? 0) + extra,
    models: {
      [M]: { ...m, ttft: { ...ttft, sum: ttft.sum + 0.3, count: ttft.count + 1, counts: ttft.counts.map((c, j) => (j >= i ? c + 1 : c)) } },
    },
  };
}

describe('rates', () => {
  it('computes a counter rate, and refuses the first scrape and resets', () => {
    expect(rate(100, 160, 2)).toBe(30);
    expect(rate(undefined, 160, 2)).toBeNull();
    expect(rate(160, 10, 2)).toBeNull();
    expect(rate(1, undefined, 2)).toBeUndefined();
  });

  it('derives tokens/s and the window TTFT from two scrapes', () => {
    const p = derive(base, later(2000, 120), M);
    expect(p.tokensPerSec).toBe(60);
    expect(p.ttftMeanMs).toBeCloseTo(300);
    expect(p.ttftP95Ms).toBeGreaterThan(250);
    expect(p.ttftP95Ms).toBeLessThanOrEqual(500);
  });

  it('keeps unavailable, not-yet and zero apart', () => {
    const first = derive(undefined, base, M);
    expect(first.tokensPerSec).toBeNull();
    expect(first.vramUsed).toBeUndefined();
    expect(first.cpuPercent).toBeUndefined();
    expect(first.active).toBe(0);
    // No new generations between two identical scrapes: no TTFT to show.
    expect(derive(base, { ...base, t: 2000 }, M).ttftMeanMs).toBeNull();
    expect(derive(base, { ...base, t: 2000 }, M).tokensPerSec).toBe(0);
  });

  it('treats a counter that went down as a restart, not a negative rate', () => {
    const restarted = { ...later(2000, 0), generated: 5 };
    expect(derive(base, restarted, M).tokensPerSec).toBeNull();
  });

  it('reads process CPU only when the server reports it', () => {
    const a = { ...base, cpuSeconds: 10 };
    const b = { ...base, t: 2000, cpuSeconds: 11 };
    expect(derive(a, b, M).cpuPercent).toBe(50);
  });
});

describe('histograms', () => {
  const h: Hist = { le: [0.1, 0.5, 1, Infinity], counts: [10, 60, 90, 100], sum: 40, count: 100 };

  it('interpolates quantiles like histogram_quantile', () => {
    expect(histQuantile(h, 0.5)).toBeCloseTo(0.1 + 0.4 * (40 / 50));
    expect(histQuantile(h, 0.95)).toBe(1);
    expect(histQuantile({ ...h, counts: [0, 0, 0, 0], count: 0 }, 0.5)).toBeNull();
  });

  it('subtracts scrapes, and gives null for no change or a reset', () => {
    const later2: Hist = { ...h, counts: [11, 62, 92, 102], sum: 41, count: 102 };
    expect(histDelta(h, later2)).toEqual({ le: h.le, counts: [1, 2, 2, 2], sum: 1, count: 2 });
    expect(histDelta(h, h)).toBeNull();
    expect(histDelta(later2, h)).toBeNull();
    expect(histDelta(undefined, h)).toBeNull();
    expect(histDelta(h, undefined)).toBeUndefined();
  });

  it('merges models for the all-models view', () => {
    const two: Snap = { ...base, models: { a: base.models[M]!, b: base.models[M]! } };
    const all = modelView(two, null)!;
    expect(all.ttft?.count).toBe(6);
    expect(all.memory.dense).toBe(2 * (base.models[M]!.memory.dense ?? 0));
    expect(lifetime(two, null).ttftMeanMs).toBeCloseTo(lifetime(base, M).ttftMeanMs as number);
  });
});

describe('windowStart', () => {
  it('finds the oldest scrape inside the window, or the previous one', () => {
    const snaps = [0, 2000, 4000, 62000, 64000].map((t) => ({ ...base, t }));
    expect(windowStart(snaps, snaps[4]!, 60_000)?.t).toBe(4000);
    expect(windowStart(snaps, snaps[4]!, 1000)?.t).toBe(62000);
    expect(windowStart(snaps, snaps[0]!, 60_000)).toBeUndefined();
  });
});
