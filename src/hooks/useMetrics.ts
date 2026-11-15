import { useCallback, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import { getMetricsText } from '../services/metrics';
import { snapshot, type Snap } from '../utils/metrics';
import { parsePrometheus } from '../utils/prometheus';
import { usePolling } from './usePolling';

/** At 2 s, 30 minutes of history. */
export const MAX_SNAPS = 900;

export interface MetricsState {
  snaps: Snap[];
  /** The last scrape's error, if it failed; history is kept. */
  error: unknown;
  /** /metrics answered 404: the server runs with --no-metrics. */
  disabled: boolean;
  lastOk: number | null;
  reset: () => void;
}

export function useMetrics(intervalMs: number, paused: boolean): MetricsState {
  const [snaps, setSnaps] = useState<Snap[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [disabled, setDisabled] = useState(false);
  const [lastOk, setLastOk] = useState<number | null>(null);
  // A scrape that started before a reset must not land after it.
  const epoch = useRef(0);

  usePolling(
    async (signal) => {
      const mine = epoch.current;
      try {
        const text = await getMetricsText(signal);
        if (signal.aborted || mine !== epoch.current) return;
        const now = Date.now();
        const snap = snapshot(parsePrometheus(text), now);
        setSnaps((s) => (s.length >= MAX_SNAPS ? [...s.slice(s.length - MAX_SNAPS + 1), snap] : [...s, snap]));
        setLastOk(now);
        setError(null);
        setDisabled(false);
      } catch (e) {
        if (signal.aborted) return;
        if (e instanceof ApiError && e.status === 404) setDisabled(true);
        setError(e);
      }
    },
    intervalMs,
    { paused },
  );

  const reset = useCallback(() => {
    epoch.current += 1;
    setSnaps([]);
  }, []);

  return { snaps, error, disabled, lastOk, reset };
}
