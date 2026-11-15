import { describe, expect, it } from 'vitest';
import { clearAll, clearSecret, getSecret, remembers, setRemember, setSecret, snapshot, subscribe } from './auth';

describe('auth storage', () => {
  it('keeps secrets in sessionStorage by default', () => {
    setSecret('api', '  sk-1  ');
    expect(getSecret('api')).toBe('sk-1');
    expect(sessionStorage.getItem('qubivex.apiKey')).toBe('sk-1');
    expect(localStorage.getItem('qubivex.apiKey')).toBeNull();
    expect(remembers()).toBe(false);
  });

  it('keeps the API key and admin token apart', () => {
    setSecret('api', 'a');
    setSecret('admin', 'b');
    expect(getSecret('api')).toBe('a');
    expect(getSecret('admin')).toBe('b');
    clearSecret('admin');
    expect(getSecret('admin')).toBeNull();
    expect(getSecret('api')).toBe('a');
  });

  it('moves secrets to localStorage only when asked to remember, and back', () => {
    setSecret('api', 'k');
    setRemember(true);
    expect(localStorage.getItem('qubivex.apiKey')).toBe('k');
    setRemember(false);
    expect(localStorage.getItem('qubivex.apiKey')).toBeNull();
    expect(getSecret('api')).toBe('k');
  });

  it('clears everything and notifies subscribers', () => {
    let n = 0;
    const off = subscribe(() => (n += 1));
    const before = snapshot();
    setSecret('api', 'x');
    setSecret('admin', 'y');
    clearAll();
    off();
    expect(getSecret('api')).toBeNull();
    expect(getSecret('admin')).toBeNull();
    expect(n).toBe(4);
    expect(snapshot()).toBeGreaterThan(before);
  });

  it('treats an empty value as clearing', () => {
    setSecret('api', 'x');
    setSecret('api', '   ');
    expect(getSecret('api')).toBeNull();
  });
});
