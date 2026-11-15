import { describe, expect, it } from 'vitest';
import { formatBytes, formatDuration, probed } from './format';
import { pageFromPath } from './routes';
import { splitThink } from './think';

describe('format', () => {
  it('formats bytes in binary units and unknowns as a dash', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1536)).toBe('1.50 KiB');
    expect(formatBytes(19327352832)).toBe('18.0 GiB');
    expect(formatBytes(null)).toBe('—');
  });

  it('formats durations', () => {
    expect(formatDuration(42)).toBe('42s');
    expect(formatDuration(3700)).toBe('1h 1m');
    expect(formatDuration(90061)).toBe('1d 1h');
    expect(formatDuration(undefined)).toBe('—');
  });

  it('distinguishes probed unknowns from known zero', () => {
    expect(probed({ known: 0 })).toEqual({ known: true, value: 0 });
    expect(probed({ unknown: 'no heap sizes' })).toEqual({ known: false, reason: 'no heap sizes' });
    expect(probed(undefined)).toMatchObject({ known: false });
  });
});

describe('splitThink', () => {
  it('separates a closed think block', () => {
    expect(splitThink('<think>\nhmm\n</think>\n\nParis.')).toEqual({ reasoning: 'hmm', thinking: false, answer: 'Paris.' });
  });
  it('reports an open think block while streaming', () => {
    expect(splitThink('<think>working')).toEqual({ reasoning: 'working', thinking: true, answer: '' });
  });
  it('leaves other text alone', () => {
    expect(splitThink('Hello <think> not a block')).toEqual({ reasoning: null, thinking: false, answer: 'Hello <think> not a block' });
  });
});

describe('routes', () => {
  it('maps /ui paths to pages', () => {
    expect(pageFromPath('/ui/chat')).toBe('chat');
    expect(pageFromPath('/ui/system/')).toBe('system');
    expect(pageFromPath('/ui/')).toBeNull();
    expect(pageFromPath('/ui/nope')).toBeNull();
    expect(pageFromPath('/elsewhere')).toBeNull();
  });
});
