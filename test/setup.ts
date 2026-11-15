import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Node 26 defines a global `localStorage` that is undefined unless --localstorage-file is
// given, and it shadows jsdom's. Tests get an in-memory Storage instead.
class MemoryStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
}
for (const name of ['localStorage', 'sessionStorage'] as const) {
  let ok = false;
  try {
    ok = typeof globalThis[name]?.getItem === 'function';
  } catch {
    ok = false;
  }
  if (!ok) Object.defineProperty(globalThis, name, { value: new MemoryStorage(), configurable: true, writable: true });
}

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});
