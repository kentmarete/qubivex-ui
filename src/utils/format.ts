import type { Probed } from '../types/api';

const UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];

/** Binary units, as the CLI shows them. */
export function formatBytes(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  let v = Math.abs(n);
  let i = 0;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i += 1;
  }
  const digits = i === 0 || v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${n < 0 ? '-' : ''}${v.toFixed(digits)} ${UNITS[i]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return '—';
  const s = Math.floor(seconds);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

export function formatNumber(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** A probed value: what the OS reported, or why it could not. */
export type Known<T> = { known: true; value: T } | { known: false; reason: string };

export function probed<T>(p: Probed<T> | undefined | null): Known<T> {
  if (!p) return { known: false, reason: 'not reported by this server' };
  if ('known' in p) return { known: true, value: p.known };
  return { known: false, reason: p.unknown };
}
