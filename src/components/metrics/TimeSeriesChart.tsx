import { Table2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from 'recharts';
import type { Point } from '../../utils/metrics';
import { AXIS } from './palette';

export interface Series {
  key: keyof Point;
  name: string;
  color: string;
}

/** Five evenly spaced ticks across the window, so the axis always shows its span. */
function ticks([a, b]: [number, number]): number[] {
  return b > a ? [0, 1, 2, 3, 4].map((i) => a + ((b - a) * i) / 4) : [a];
}

const clock = (t: number) => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

function ChartTooltip({ active, payload, label, series, format }: TooltipProps<number, string> & { series: Series[]; format: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as Point | undefined;
  return (
    <div className="rounded-md border border-border bg-surface-2 px-2.5 py-2 text-[12px] shadow-xl">
      <div className="mb-1 text-muted">{clock(Number(label))}</div>
      {series.map((s) => {
        const v = row?.[s.key];
        return (
          <div key={s.key} className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
            <span className="font-mono tabular text-text">{typeof v === 'number' ? format(v) : '—'}</span>
            <span className="text-muted">{s.name}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A line chart over time with one y-axis, a legend, a crosshair tooltip and a table view.
 * `continuous` series (rates) break on missing points; event series (latency of
 * generations that finished) draw a marker per observation and join them.
 */
export function TimeSeriesChart({ title, data, series, format, axisFormat, domain, continuous = true, empty, note }: {
  title: string;
  data: Point[];
  series: Series[];
  format: (n: number) => string;
  /** A shorter format for y-axis ticks; defaults to `format`. */
  axisFormat?: (n: number) => string;
  domain: [number, number];
  continuous?: boolean;
  /** Shown instead of the chart, e.g. when the server does not report the series. */
  empty?: ReactNode;
  note?: ReactNode;
}) {
  const [table, setTable] = useState(false);
  const hasData = data.some((p) => series.some((s) => typeof p[s.key] === 'number'));
  const rows = data.filter((p) => series.some((s) => typeof p[s.key] === 'number')).slice(-12).reverse();
  return (
    <section className="rounded-lg border border-border bg-surface" aria-label={title}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pt-3">
        <h3 className="text-[13px] font-medium">{title}</h3>
        {series.length > 1 && (
          <ul className="flex flex-wrap gap-x-3 text-[12px] text-muted" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key} className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-3 rounded" style={{ background: s.color }} aria-hidden />
                {s.name}
              </li>
            ))}
          </ul>
        )}
        {!empty && (
          <button
            type="button"
            onClick={() => setTable((x) => !x)}
            aria-pressed={table}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-1 text-[12px] text-muted hover:bg-surface-2 hover:text-text"
          >
            <Table2 className="h-3.5 w-3.5" /> Table
          </button>
        )}
      </header>
      <div className="px-2 pb-3 pt-2">
        {empty ? (
          <div className="flex h-[180px] items-center justify-center px-6 text-center text-[13px] text-muted">{empty}</div>
        ) : table ? (
          <div className="h-[180px] overflow-auto px-2">
            {rows.length === 0 ? (
              <p className="pt-16 text-center text-[13px] text-muted">No values in this window.</p>
            ) : (
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-surface text-left text-muted">
                  <tr>
                    <th className="py-1 pr-3 font-normal">Time</th>
                    {series.map((s) => (
                      <th key={s.key} className="py-1 pr-3 text-right font-normal">
                        {s.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="font-mono tabular">
                  {rows.map((p) => (
                    <tr key={p.t} className="border-t border-border/60">
                      <td className="py-1 pr-3 text-muted">{clock(p.t)}</td>
                      {series.map((s) => {
                        const v = p[s.key];
                        return (
                          <td key={s.key} className="py-1 pr-3 text-right">
                            {typeof v === 'number' ? format(v) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="relative h-[180px]">
            {!hasData && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[13px] text-muted">
                {continuous ? 'Waiting for the next scrape…' : 'No generations finished in this window'}
              </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 6, right: 28, bottom: 0, left: 0 }}>
                <CartesianGrid stroke={AXIS.grid} vertical={false} />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={domain}
                  tickFormatter={clock}
                  tick={{ fill: AXIS.tick, fontSize: AXIS.font }}
                  stroke={AXIS.grid}
                  ticks={ticks(domain)}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  allowDataOverflow
                />
                <YAxis tick={{ fill: AXIS.tick, fontSize: AXIS.font }} stroke={AXIS.grid} width={60} tickFormatter={axisFormat ?? format} domain={[0, 'auto']} allowDecimals />
                <Tooltip content={<ChartTooltip series={series} format={format} />} cursor={{ stroke: AXIS.tick, strokeDasharray: '3 3' }} isAnimationActive={false} />
                {series.map((s) => (
                  <Line
                    key={s.key}
                    dataKey={(p: Point) => (typeof p[s.key] === 'number' ? p[s.key] : null)}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={continuous ? false : { r: 3, strokeWidth: 2, fill: s.color, stroke: '#121514' }}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: '#121514' }}
                    connectNulls={!continuous}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
        {note && <p className="px-2 pt-1 text-[12px] text-muted">{note}</p>}
      </div>
    </section>
  );
}
