// Download jobs, kept outside React like model loads (useModelOps): a pull runs for
// minutes on the server and must keep its state when the user leaves the Models page.
// The server owns the jobs; this polls them while any is running and remembers which
// ones the user asked to load when they finish.

import { useSyncExternalStore } from 'react';
import { ApiError } from '../services/api';
import { cancelJob, listJobs, pullModel, retryJob } from '../services/downloads';
import type { Job, PullSpec } from '../types/api';
import { notify, startLoad } from './useModelOps';

export const JOB_POLL_MS = 1_000;

export interface Downloads {
  /** Newest first, as the server lists them. */
  jobs: readonly Job[];
  /** The last failure to read the job list. */
  error: unknown;
}

const EMPTY: Downloads = { jobs: [], error: null };

let state: Downloads = EMPTY;
const listeners = new Set<() => void>();
/** Jobs to load when they succeed, with the context to load at. */
const loadWhenDone = new Map<string, { context?: number | null }>();
/** Jobs already seen finished, so each is announced once. */
const announced = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;
let onLoaded: (() => void) | null = null;

function set(patch: Partial<Downloads>): void {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

const running = (j: Job) => j.status === 'running' || j.status === 'validating';

/** What a finished job means for the user, said once. */
function settle(j: Job): void {
  if (running(j) || announced.has(j.id)) return;
  announced.add(j.id);
  const want = loadWhenDone.get(j.id);
  loadWhenDone.delete(j.id);
  if (!want) return;
  if (j.status === 'succeeded' && j.result) {
    notify('ok', `Downloaded ${j.repository} as ${j.result.id}. Loading it now.`);
    void startLoad(j.result.id, undefined, onLoaded ?? undefined, want.context);
  } else if (j.status === 'failed') {
    notify('danger', `Could not download ${j.repository}.`, new ApiError({ status: 0, code: j.error?.code ?? 'failed', message: j.error?.message ?? 'The download failed' }));
  }
}

/** Reads the job list now, and keeps reading every second while a job runs. */
export async function refreshJobs(): Promise<void> {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  try {
    const { data } = await listJobs();
    data.forEach(settle);
    set({ jobs: data, error: null });
  } catch (e) {
    set({ error: e });
  }
  if (state.jobs.some(running) && listeners.size + loadWhenDone.size > 0) {
    timer = setTimeout(() => void refreshJobs(), JOB_POLL_MS);
  }
}

function upsert(j: Job): void {
  set({ jobs: [j, ...state.jobs.filter((x) => x.id !== j.id)] });
}

export interface PullChoice {
  /** Load the model when the download finishes. */
  load?: boolean;
  /** The context to load it at; null lets the server decide. */
  context?: number | null;
}

/** Starts a pull on the server. Resolves with the job, or null if it was refused. */
export async function startPull(spec: PullSpec, choice: PullChoice = {}): Promise<Job | null> {
  try {
    const job = await pullModel(spec);
    if (choice.load) loadWhenDone.set(job.id, { context: choice.context });
    upsert(job);
    notify('ok', `Downloading ${spec.repository} on the server. Follow it in the Jobs tab.`);
    void refreshJobs();
    return job;
  } catch (e) {
    const busy = e instanceof ApiError && (e.status === 409 || e.status === 429);
    notify(busy ? 'warn' : 'danger', busy ? `Not started: ${e.message}` : `Could not start downloading ${spec.repository}.`, busy ? undefined : e);
    return null;
  }
}

export async function stopJob(id: string): Promise<void> {
  try {
    upsert(await cancelJob(id));
    void refreshJobs();
  } catch (e) {
    notify('danger', `Could not cancel ${id}.`, e);
  }
}

/** Retries a failed or cancelled job; the new job continues from what arrived. */
export async function restartJob(job: Job, choice: PullChoice = {}): Promise<void> {
  try {
    const j = await retryJob(job.id);
    if (choice.load) loadWhenDone.set(j.id, { context: choice.context });
    upsert(j);
    void refreshJobs();
  } catch (e) {
    notify('danger', `Could not retry ${job.repository}.`, e);
  }
}

/** Whether `id` will be loaded when it finishes. */
export function loadsWhenDone(id: string): boolean {
  return loadWhenDone.has(id);
}

/** What to run after a download's load settles (the page refreshes its runtime view). */
export function setOnLoaded(f: (() => void) | null): void {
  onLoaded = f;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDownloads(): Downloads {
  return useSyncExternalStore(subscribe, () => state);
}

/** Tests only. */
export function resetDownloads(): void {
  if (timer !== null) clearTimeout(timer);
  timer = null;
  loadWhenDone.clear();
  announced.clear();
  onLoaded = null;
  state = EMPTY;
  listeners.forEach((l) => l());
}
