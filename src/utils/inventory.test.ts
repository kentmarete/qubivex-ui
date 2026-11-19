import { describe, expect, it } from 'vitest';
import type { ModelOps } from '../hooks/useModelOps';
import type { InstalledModel, SystemInfo } from '../types/api';
import { buildRows } from './inventory';

const ops = (o: Partial<ModelOps> = {}): ModelOps => ({
  loads: new Map(),
  unloading: new Set(),
  unloaded: [],
  failures: new Map(),
  sources: new Map(),
  notices: [],
  adminDisabled: false,
  downloads: false,
  ...o,
});

const sys = (states: SystemInfo['model_states']): SystemInfo => ({
  object: 'system',
  hardware: null,
  models: [],
  model_states: states,
  models_draining: 0,
  generations_active: 0,
});

describe('buildRows', () => {
  it('shows a load the server has not registered yet as loading', () => {
    const rows = buildRows(sys([]), ops({ loads: new Map([['a', { model: '/m/a', id: 'a', since: 0 }]]), sources: new Map([['a', '/m/a']]) }));
    expect(rows).toMatchObject([{ id: 'a', state: 'loading', source: '/m/a' }]);
  });

  it('lets the server state win over local state', () => {
    const rows = buildRows(sys([{ id: 'a', state: 'failed' }]), ops({ loads: new Map([['a', { model: 'a', id: 'a', since: 0 }]]), unloaded: ['a'] }));
    expect(rows.map((r) => [r.id, r.state])).toEqual([['a', 'failed']]);
  });

  it('puts server and in-flight models first, by id, then this session’s unloads, newest first', () => {
    const rows = buildRows(sys([{ id: 'c', state: 'loaded' }, { id: 'a', state: 'loading' }]), ops({ unloaded: ['z', 'b', 'c'] }));
    expect(rows.map((r) => [r.id, r.state])).toEqual([
      ['a', 'loading'],
      ['c', 'loaded'],
      ['z', 'unloaded'],
      ['b', 'unloaded'],
    ]);
  });

  it('works before /v1/system has been read', () => {
    expect(buildRows(null, ops({ unloaded: ['x'] }))).toMatchObject([{ id: 'x', state: 'unloaded' }]);
  });
  it('adds idle models on disk, keeps served ones under their serve ids, and shows a broken one by directory', () => {
    const d = (o: Partial<InstalledModel>): InstalledModel => ({ id: null, dir: '', status: 'ok', error: null, install_state: 'installed', loaded: false, serve_ids: [], ...o });
    const disk = [d({ id: 'big', dir: 'big', loaded: true, serve_ids: ['fast'] }), d({ id: 'small', dir: 'small' }), d({ dir: 'junk', status: 'error', error: 'bad' })];
    const rows = buildRows(sys([{ id: 'fast', state: 'loaded' }]), ops({ unloaded: ['small', 'gone'] }), disk);
    expect(rows.map((r) => [r.id, r.state, r.disk?.dir ?? null])).toEqual([
      ['fast', 'loaded', 'big'],
      ['junk', 'unloaded', 'junk'],
      ['small', 'unloaded', 'small'],
      ['gone', 'unloaded', null],
    ]);
  });
});
