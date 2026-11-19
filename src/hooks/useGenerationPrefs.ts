// Generation preferences set on the Settings page, kept in this browser (localStorage):
// the max tokens a chat starts with, and the context length sent when loading a model.
// Both are per-viewer conveniences; the server's limits still apply.

import { useSyncExternalStore } from 'react';
import { loadJson, saveJson } from '../utils/storage';

export interface GenerationPrefs {
  /** max_tokens for a model's chat until its own chat settings change it. */
  defaultMaxTokens: number;
  /** `context` sent with a model load. null: the server's --context, else the model's. */
  loadContext: number | null;
}

export const DEFAULT_GENERATION_PREFS: GenerationPrefs = { defaultMaxTokens: 512, loadContext: null };

const KEY = 'qubivex.generation';
const listeners = new Set<() => void>();
let prefs: GenerationPrefs = read();

function positive(n: unknown): number | null {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : null;
}

function read(): GenerationPrefs {
  const raw = loadJson<GenerationPrefs>(KEY, DEFAULT_GENERATION_PREFS);
  return {
    defaultMaxTokens: positive(raw.defaultMaxTokens) ?? DEFAULT_GENERATION_PREFS.defaultMaxTokens,
    loadContext: positive(raw.loadContext),
  };
}

export function getGenerationPrefs(): GenerationPrefs {
  return prefs;
}

export function setGenerationPrefs(patch: Partial<GenerationPrefs>): void {
  prefs = { ...prefs, ...patch };
  saveJson(KEY, prefs);
  listeners.forEach((l) => l());
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useGenerationPrefs(): GenerationPrefs {
  return useSyncExternalStore(subscribe, () => prefs);
}

/** Tests only. */
export function reloadGenerationPrefs(): void {
  prefs = read();
  listeners.forEach((l) => l());
}
