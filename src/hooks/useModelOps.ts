// Load and unload requests, kept outside React: a load can take minutes and must keep its
// state when the user leaves the Models page and comes back. The server stays the source
// of truth for runtime state (/v1/system `model_states`); this only remembers what the UI
// asked for and how each request ended.

import { useSyncExternalStore } from 'react';
import { ApiError } from '../services/api';
import { isRepository } from '../services/downloads';
import { loadModel, unloadModel } from '../services/models';
import { getGenerationPrefs } from './useGenerationPrefs';

export interface PendingLoad {
  /** What was sent as `model`: an installed id or a directory on the server. */
  model: string;
  /** The id the model will be served as. */
  id: string;
  since: number;
}

export type NoticeTone = 'ok' | 'warn' | 'danger';

export interface Notice {
  key: number;
  tone: NoticeTone;
  text: string;
  error?: unknown;
  /** A repository the notice offers to download (a load that found no such model). */
  download?: string;
}

export interface ModelOps {
  loads: ReadonlyMap<string, PendingLoad>;
  unloading: ReadonlySet<string>;
  /** Unloaded in this browser session, newest first: offered for one-click reload. */
  unloaded: readonly string[];
  /** The last failed load request per id. */
  failures: ReadonlyMap<string, unknown>;
  /** What each id was last loaded from through this UI, so a retry sends the same `model`. */
  sources: ReadonlyMap<string, string>;
  notices: readonly Notice[];
  /** A 403 `admin_disabled` was seen: the server has no admin token. */
  adminDisabled: boolean;
  /** The server can download models (`capabilities.model_downloads`). */
  downloads: boolean;
}

const EMPTY: ModelOps = {
  loads: new Map(),
  unloading: new Set(),
  unloaded: [],
  failures: new Map(),
  sources: new Map(),
  notices: [],
  adminDisabled: false,
  downloads: false,
};

let state: ModelOps = EMPTY;
let noticeKey = 0;
const listeners = new Set<() => void>();
const OK_NOTICE_MS = 8_000;

function set(patch: Partial<ModelOps>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function without<K, V>(m: ReadonlyMap<K, V>, k: K): Map<K, V> {
  const n = new Map(m);
  n.delete(k);
  return n;
}

export function notify(tone: NoticeTone, text: string, error?: unknown, download?: string): void {
  noticeKey += 1;
  const key = noticeKey;
  set({ notices: [...state.notices, { key, tone, text, error, download }] });
  if (tone === 'ok') setTimeout(() => dismissNotice(key), OK_NOTICE_MS);
}

export function dismissNotice(key: number): void {
  if (state.notices.some((n) => n.key === key)) set({ notices: state.notices.filter((n) => n.key !== key) });
}

/** Handles the admin-route errors every action shares. True if it was one of them. */
function adminError(e: unknown, what: string): boolean {
  if (!(e instanceof ApiError)) return false;
  if (e.status === 403 && e.code === 'admin_disabled') {
    set({ adminDisabled: true });
    notify('danger', `Cannot ${what}: admin operations are disabled on this server (started without --admin-token).`, e);
    return true;
  }
  if (e.status === 401) {
    // api.ts has already asked the shell to open the admin token dialog.
    notify('warn', `Cannot ${what}: the admin token is missing or wrong. Enter it and try again.`, e);
    return true;
  }
  return false;
}

/**
 * Starts loading `model` (as `id`, if given). Resolves when the request ends, however it
 * ends; `onSettled` runs then too, to refresh what depends on the loaded set. `context`
 * defaults to the Settings page's load context; null sends none (the server decides).
 */
export async function startLoad(
  model: string,
  id?: string,
  onSettled?: () => void,
  context: number | null = getGenerationPrefs().loadContext,
): Promise<void> {
  const target = id?.trim() || model;
  if (state.loads.has(target)) return;
  set({
    loads: new Map(state.loads).set(target, { model, id: target, since: Date.now() }),
    failures: without(state.failures, target),
    sources: new Map(state.sources).set(target, model),
  });
  try {
    const card = await loadModel(model, { id: target, context });
    set({ unloaded: state.unloaded.filter((u) => u !== card.id) });
    notify('ok', `Loaded ${card.id}.`);
  } catch (e) {
    if (adminError(e, `load ${target}`)) {
      // nothing to remember against the model
    } else if (e instanceof ApiError && (e.code === 'timeout' || e.code === 'network')) {
      // The load belongs to the server, not to this request (docs/03 §3.8).
      notify('warn', `The load request for ${target} ended early (${e.message}). The load may still be running on the server; the table shows its state.`, e);
    } else {
      set({ failures: new Map(state.failures).set(target, e) });
      notify('danger', `Could not load ${target}.${notFoundHint(model, e)}`, e, offerDownload(model, e));
    }
  } finally {
    set({ loads: without(state.loads, target) });
    onSettled?.();
  }
}

function notFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404 && e.code === 'model_not_found';
}

/** A load that found nothing on disk: the hub repository to offer, when it names one. */
function offerDownload(model: string, e: unknown): string | undefined {
  return state.downloads && notFound(e) && isRepository(model) ? model.trim() : undefined;
}

/** Says what a not-found load means: the name is looked up on the server's disk. */
function notFoundHint(model: string, e: unknown): string {
  if (!notFound(e)) return '';
  if (!state.downloads) return ' No installed model has that name in the server\'s model directories.';
  return isRepository(model)
    ? ' It is not installed on the server. Download it from the hub, then it loads.'
    : ' No installed model has that name. Use Discover to find and download one.';
}

/** Learned from the capabilities: the server can download models. */
export function setDownloadsAvailable(on: boolean): void {
  if (state.downloads !== on) set({ downloads: on });
}

/** Unloads `id`. For a `failed` entry this clears it; nothing is deleted from disk. */
export async function startUnload(id: string, onSettled?: () => void): Promise<void> {
  if (state.unloading.has(id)) return;
  set({ unloading: new Set(state.unloading).add(id) });
  try {
    const r = await unloadModel(id);
    set({ unloaded: [id, ...state.unloaded.filter((u) => u !== id)], failures: without(state.failures, id) });
    notify(
      'ok',
      r.draining > 0
        ? `Unloaded ${id}. ${r.draining} running request${r.draining === 1 ? '' : 's'} will finish first; the memory is freed when ${r.draining === 1 ? 'it ends' : 'they end'}.`
        : `Unloaded ${id}. Its memory is freed; the files stay on disk.`,
    );
  } catch (e) {
    if (adminError(e, `unload ${id}`)) {
      // handled
    } else if (e instanceof ApiError && e.status === 404) {
      notify('warn', `${id} was not loaded (it may have been unloaded elsewhere).`, e);
    } else {
      notify('danger', `Could not unload ${id}.`, e);
    }
  } finally {
    const unloading = new Set(state.unloading);
    unloading.delete(id);
    set({ unloading });
    onSettled?.();
  }
}

/** Learned elsewhere (the admin token check): the server has no admin token. */
export function setAdminDisabled(on: boolean): void {
  if (state.adminDisabled !== on) set({ adminDisabled: on });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useModelOps(): ModelOps {
  return useSyncExternalStore(subscribe, () => state);
}

/** Tests only. */
export function resetModelOps(): void {
  state = EMPTY;
  listeners.forEach((l) => l());
}
