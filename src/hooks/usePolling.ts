import { useEffect, useRef } from 'react';

/**
 * Runs `fn` now and then every `intervalMs` (after the previous run finishes), until
 * unmounted or paused. `fn` gets an AbortSignal that fires on unmount. Returning a number
 * from `fn` overrides the next delay (for backoff).
 */
export function usePolling(
  fn: (signal: AbortSignal) => Promise<number | void>,
  intervalMs: number,
  opts: { paused?: boolean; /** Changing it restarts polling with an immediate run. */ restartKey?: unknown } = {},
): void {
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    if (opts.paused) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      let next = intervalMs;
      try {
        const r = await fnRef.current(ctrl.signal);
        if (typeof r === 'number') next = r;
      } catch {
        /* the callback reports its own errors */
      }
      if (!ctrl.signal.aborted) timer = setTimeout(tick, next);
    };
    void tick();
    return () => {
      ctrl.abort();
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [intervalMs, opts.paused, opts.restartKey]);
}
