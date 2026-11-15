import { describe, expect, it } from 'vitest';
import { fixture } from '../../test/mockFetch';
import { histogram, labelValues, parsePrometheus, select, total } from './prometheus';

describe('parsePrometheus', () => {
  const s = parsePrometheus(fixture('metrics.txt'));

  it('reads the captured /metrics: unlabelled, labelled and histogram series', () => {
    expect(total(s, 'qubivex_generations_active')).toBe(0);
    expect(total(s, 'qubivex_generated_tokens_total')).toBeGreaterThan(0);
    expect(select(s, 'qubivex_requests_total')).toContainEqual({ labels: { endpoint: 'chat_completions', status: '200' }, value: 3 });
    expect(labelValues(s, 'model')).toEqual(['qwen2.5-0.5b-instruct']);
  });

  it('builds a histogram with sorted bounds, +Inf last', () => {
    const h = histogram(s, 'qubivex_time_to_first_token_seconds', { model: 'qwen2.5-0.5b-instruct' });
    expect(h?.count).toBe(3);
    expect(h?.sum).toBeCloseTo(0.849449083);
    expect(h?.le.at(-1)).toBe(Infinity);
    expect(h?.le).toEqual([...(h?.le ?? [])].sort((a, b) => a - b));
    expect(h?.counts.at(-1)).toBe(3);
  });

  it('tells an absent series from a zero one', () => {
    expect(total(s, 'qubivex_vram_used_bytes')).toBeUndefined();
    expect(histogram(s, 'nope_seconds')).toBeUndefined();
    expect(total(s, 'qubivex_generations_failed_total')).toBe(0);
  });

  it('handles escapes, braces and commas in label values, special values and timestamps', () => {
    const p = parsePrometheus(
      [
        '# HELP x A thing.',
        '# TYPE x gauge',
        'x{model="a\\"b",path="c\\\\d",note="1,2}"} 5 1700000000000',
        'y +Inf',
        'z NaN',
        'w{} -3.5e2',
        'garbage line {',
      ].join('\n'),
    );
    expect(select(p, 'x')).toEqual([{ labels: { model: 'a"b', path: 'c\\d', note: '1,2}' }, value: 5 }]);
    expect(total(p, 'y')).toBe(Infinity);
    expect(Number.isNaN(total(p, 'z'))).toBe(true);
    expect(total(p, 'w')).toBe(-350);
  });
});
