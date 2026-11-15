// The two secrets the gateway knows (docs/02 §5): the API key for /v1/* and the admin
// token for load, unload and /v1/admin/*. Kept in sessionStorage unless the user opts in
// to "remember on this device" (localStorage). Never logged, never put in a URL.

export type SecretKind = 'api' | 'admin';

const KEYS: Record<SecretKind, string> = {
  api: 'qubivex.apiKey',
  admin: 'qubivex.adminToken',
};
const REMEMBER = 'qubivex.remember';

type Listener = () => void;
const listeners = new Set<Listener>();
let version = 0;

function store(kind: 'session' | 'local'): Storage | null {
  try {
    return kind === 'session' ? window.sessionStorage : window.localStorage;
  } catch {
    return null;
  }
}

function read(s: Storage | null, key: string): string | null {
  try {
    return s?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(s: Storage | null, key: string, value: string | null): void {
  try {
    if (value === null) s?.removeItem(key);
    else s?.setItem(key, value);
  } catch {
    /* storage blocked: the secret lives for this page only */
  }
}

// Fallback when storage is unavailable, so the app still works for this page load.
const memory: Partial<Record<SecretKind, string>> = {};

function changed(): void {
  version += 1;
  listeners.forEach((l) => l());
}

export function remembers(): boolean {
  return read(store('local'), REMEMBER) === '1';
}

export function getSecret(kind: SecretKind): string | null {
  const key = KEYS[kind];
  return read(store('session'), key) ?? read(store('local'), key) ?? memory[kind] ?? null;
}

export function setSecret(kind: SecretKind, value: string): void {
  const v = value.trim();
  if (!v) {
    clearSecret(kind);
    return;
  }
  const key = KEYS[kind];
  memory[kind] = v;
  write(store('session'), key, v);
  write(store('local'), key, remembers() ? v : null);
  changed();
}

export function clearSecret(kind: SecretKind): void {
  delete memory[kind];
  write(store('session'), KEYS[kind], null);
  write(store('local'), KEYS[kind], null);
  changed();
}

export function clearAll(): void {
  clearSecret('api');
  clearSecret('admin');
}

/** Moves the stored secrets between session-only and remembered. */
export function setRemember(on: boolean): void {
  write(store('local'), REMEMBER, on ? '1' : null);
  for (const kind of Object.keys(KEYS) as SecretKind[]) {
    const v = getSecret(kind);
    write(store('local'), KEYS[kind], on && v ? v : null);
  }
  changed();
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Changes on every update; for useSyncExternalStore. */
export function snapshot(): number {
  return version;
}
