// What the connected server can do (docs/02 §9). `capabilities` in /v1/system wins when a
// newer server sends it; otherwise probe, because today's gateway does not describe itself.

import { useEffect, useState, useSyncExternalStore } from 'react';
import { getSecret, snapshot, subscribe } from '../services/auth';
import { probeModelManagement, type Support } from '../services/models';
import { checkAdminToken } from '../services/system';
import { setAdminDisabled, setDownloadsAvailable, useModelOps } from './useModelOps';
import { useRuntime } from './useRuntime';

/**
 * valid: the stored admin token works. missing: none stored. invalid: rejected.
 * disabled: the server has no admin token, so admin routes are off for everyone.
 * unknown: the check itself failed (network); actions stay enabled and report their own errors.
 */
export type AdminStatus = 'checking' | 'valid' | 'missing' | 'invalid' | 'disabled' | 'unknown';

export interface Caps {
  modelManagement: Support | 'checking';
  /** Search and download through the server (`capabilities.model_downloads`). */
  downloads: Support | 'checking';
  admin: AdminStatus;
}

export function useCapabilities(): Caps {
  const { system } = useRuntime();
  const ops = useModelOps();
  const secrets = useSyncExternalStore(subscribe, snapshot);
  const declared = system?.capabilities;

  const [probed, setProbed] = useState<Support | 'checking'>('checking');
  const [admin, setAdmin] = useState<AdminStatus>('checking');

  const declaredMM = declared?.model_management;
  // Only servers that describe themselves can download; older ones never could.
  const downloads: Support | 'checking' = system == null ? 'checking' : declared?.model_downloads ? 'available' : 'unavailable';
  useEffect(() => setDownloadsAvailable(downloads === 'available'), [downloads]);
  useEffect(() => {
    if (declaredMM !== undefined) return;
    const ctrl = new AbortController();
    probeModelManagement(ctrl.signal)
      .then(setProbed)
      .catch(() => {
        if (!ctrl.signal.aborted) setProbed('unknown');
      });
    return () => ctrl.abort();
  }, [declaredMM]);

  // The token check sends no model, so it never unloads anything (services/system.ts).
  useEffect(() => {
    let live = true;
    const hasToken = getSecret('admin') !== null;
    setAdmin('checking');
    checkAdminToken()
      .then((r) => {
        if (!live) return;
        setAdminDisabled(r === 'disabled');
        setAdmin(r === 'invalid' && !hasToken ? 'missing' : r);
      })
      .catch(() => {
        if (live) setAdmin('unknown');
      });
    return () => {
      live = false;
    };
  }, [secrets]);

  return {
    modelManagement: declaredMM === undefined ? probed : declaredMM ? 'available' : 'unavailable',
    downloads,
    admin: declared?.admin === false || ops.adminDisabled ? 'disabled' : admin,
  };
}
