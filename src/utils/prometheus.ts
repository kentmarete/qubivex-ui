// A parser for the Prometheus text format (0.0.4), as /metrics serves it.

export interface Sample {
  labels: Record<string, string>;
  value: number;
}

/** Samples by series name (histograms keep their _bucket, _sum and _count names). */
export type Scrape = Map<string, Sample[]>;

function parseValue(s: string): number {
  if (s === '+Inf' || s === 'Inf') return Infinity;
  if (s === '-Inf') return -Infinity;
  if (s === 'NaN') return NaN;
  const n = Number(s);
  return Number.isNaN(n) ? NaN : n;
}

/** Parses `{a="x",b="y\"z"}` starting at `i` (the `{`); returns labels and the index after `}`. */
function parseLabels(line: string, i: number): [Record<string, string>, number] | null {
  const labels: Record<string, string> = {};
  i += 1;
  for (;;) {
    while (line[i] === ' ' || line[i] === ',') i += 1;
    if (line[i] === '}') return [labels, i + 1];
    const eq = line.indexOf('=', i);
    if (eq < 0 || line[eq + 1] !== '"') return null;
    const name = line.slice(i, eq).trim();
    let j = eq + 2;
    let value = '';
    for (;;) {
      const c = line[j];
      if (c === undefined) return null;
      if (c === '\\') {
        const n = line[j + 1];
        value += n === 'n' ? '\n' : (n ?? '');
        j += 2;
        continue;
      }
      if (c === '"') break;
      value += c;
      j += 1;
    }
    labels[name] = value;
    i = j + 1;
  }
}

export function parsePrometheus(text: string): Scrape {
  const out: Scrape = new Map();
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^[a-zA-Z_:][a-zA-Z0-9_:]*/.exec(line);
    if (!m) continue;
    const name = m[0];
    let rest = line.slice(name.length);
    let labels: Record<string, string> = {};
    if (rest.startsWith('{')) {
      const parsed = parseLabels(rest, 0);
      if (!parsed) continue;
      labels = parsed[0];
      rest = rest.slice(parsed[1]);
    }
    const value = rest.trim().split(/\s+/)[0];
    if (value === undefined || value === '') continue;
    const list = out.get(name) ?? [];
    list.push({ labels, value: parseValue(value) });
    out.set(name, list);
  }
  return out;
}

function matches(labels: Record<string, string>, filter?: Record<string, string>): boolean {
  if (!filter) return true;
  return Object.entries(filter).every(([k, v]) => labels[k] === v);
}

/** The samples of `name` whose labels include `filter`. */
export function select(s: Scrape, name: string, filter?: Record<string, string>): Sample[] {
  return (s.get(name) ?? []).filter((x) => matches(x.labels, filter));
}

/** The sum of matching samples; undefined when the series is absent. */
export function total(s: Scrape, name: string, filter?: Record<string, string>): number | undefined {
  const xs = select(s, name, filter);
  return xs.length ? xs.reduce((a, x) => a + x.value, 0) : undefined;
}

/** A cumulative histogram: counts[i] observations were <= le[i]. */
export interface Hist {
  le: number[];
  counts: number[];
  sum: number;
  count: number;
}

/** The histogram `base`, summed over every label set that matches `filter`. */
export function histogram(s: Scrape, base: string, filter?: Record<string, string>): Hist | undefined {
  const counts = select(s, `${base}_count`, filter);
  if (!counts.length) return undefined;
  const byLe = new Map<number, number>();
  for (const b of select(s, `${base}_bucket`, filter)) {
    const le = parseValue(b.labels.le ?? '');
    if (Number.isNaN(le)) continue;
    byLe.set(le, (byLe.get(le) ?? 0) + b.value);
  }
  const le = [...byLe.keys()].sort((a, b) => a - b);
  return {
    le,
    counts: le.map((x) => byLe.get(x) ?? 0),
    sum: total(s, `${base}_sum`, filter) ?? 0,
    count: counts.reduce((a, x) => a + x.value, 0),
  };
}

/** Values of label `label` that appear on any sample. */
export function labelValues(s: Scrape, label: string): string[] {
  const seen = new Set<string>();
  for (const list of s.values()) for (const x of list) if (x.labels[label] !== undefined) seen.add(x.labels[label]);
  return [...seen].sort();
}
