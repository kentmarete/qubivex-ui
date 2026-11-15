import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ApiError } from '../services/api';
import { getSecret, subscribe } from '../services/auth';
import { getHealth, getSystem, listModels } from '../services/system';
import type { SystemInfo } from '../types/api';
import { loadJson, saveJson } from '../utils/storage';
import { usePolling } from './usePolling';

export type HealthState = 'checking' | 'ok' | 'degraded' | 'down';
/** open: /v1 needs no key. key: the stored key works. required: a key is needed. */
export type ApiAccess = 'unknown' | 'open' | 'key' | 'required';

interface Runtime {
  health: HealthState;
  healthError: string | null;
  loadedCount: number | null;
  access: ApiAccess;
  models: string[];
  modelsError: ApiError | null;
  selectedModel: string | null;
  setSelectedModel: (id: string) => void;
  /** Latest /v1/system, for version and capabilities. Null until read or if not allowed. */
  system: SystemInfo | null;
  refresh: () => void;
}

const RuntimeContext = createContext<Runtime | null>(null);

const HEALTH_MS = 5_000;
const BACKOFF_MS = [5_000, 10_000, 30_000];
const SELECTED_KEY = 'qubivex.chat.model';

export function RuntimeProvider({ children }: { children: ReactNode }) {
  const [health, setHealth] = useState<HealthState>('checking');
  const [healthError, setHealthError] = useState<string | null>(null);
  const [loadedCount, setLoadedCount] = useState<number | null>(null);
  const [access, setAccess] = useState<ApiAccess>('unknown');
  const [models, setModels] = useState<string[]>([]);
  const [modelsError, setModelsError] = useState<ApiError | null>(null);
  const [system, setSystem] = useState<SystemInfo | null>(null);
  const [selected, setSelected] = useState<string | null>(() => loadJson(SELECTED_KEY, { id: null as string | null }).id);
  const [epoch, setEpoch] = useState(0);
  const failures = useRef(0);
  const wasDown = useRef(false);

  const refresh = useCallback(() => setEpoch((e) => e + 1), []);

  // Re-check access whenever a secret changes.
  useEffect(() => subscribe(refresh), [refresh]);

  usePolling(async (signal) => {
    try {
      const h = await getHealth(signal);
      failures.current = 0;
      setHealthError(null);
      setLoadedCount(h.models);
      setHealth(h.models > 0 ? 'ok' : 'degraded');
      if (wasDown.current) {
        wasDown.current = false;
        refresh();
      }
      return HEALTH_MS;
    } catch (e) {
      if (signal.aborted) return;
      wasDown.current = true;
      setHealth('down');
      setHealthError(e instanceof Error ? e.message : String(e));
      const delay = BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length - 1)] ?? HEALTH_MS;
      failures.current += 1;
      return delay;
    }
  }, HEALTH_MS);

  // Models and access: on start, on refresh and when secrets change.
  useEffect(() => {
    const ctrl = new AbortController();
    const hasKey = getSecret('api') !== null;
    listModels(ctrl.signal)
      .then((ids) => {
        setModels(ids);
        setModelsError(null);
        setAccess(hasKey ? 'key' : 'open');
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        if (e instanceof ApiError) {
          setModelsError(e);
          if (e.status === 401) setAccess('required');
        }
      });
    getSystem(ctrl.signal)
      .then(setSystem)
      .catch(() => {
        if (!ctrl.signal.aborted) setSystem(null);
      });
    return () => ctrl.abort();
  }, [epoch]);

  // Keep the selection on a loaded model.
  useEffect(() => {
    if (models.length === 0) return;
    if (!selected || !models.includes(selected)) setSelected(models[0] ?? null);
  }, [models, selected]);

  const setSelectedModel = useCallback((id: string) => {
    setSelected(id);
    saveJson(SELECTED_KEY, { id });
  }, []);

  const value = useMemo<Runtime>(
    () => ({
      health,
      healthError,
      loadedCount,
      access,
      models,
      modelsError,
      selectedModel: selected && models.includes(selected) ? selected : null,
      setSelectedModel,
      system,
      refresh,
    }),
    [health, healthError, loadedCount, access, models, modelsError, selected, setSelectedModel, system, refresh],
  );

  return <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>;
}

export function useRuntime(): Runtime {
  const r = useContext(RuntimeContext);
  if (!r) throw new Error('useRuntime outside RuntimeProvider');
  return r;
}
