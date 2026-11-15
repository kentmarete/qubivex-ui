import { describe, expect, it } from 'vitest';
import { fixture, pieces } from '../../test/mockFetch';
import { readSse, type SseMessage } from './sse';

/** Each chunk arrives as its own read, so lines and events cross read boundaries. */
function chunked(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const s of chunks) c.enqueue(enc.encode(s));
      c.close();
    },
  });
}

async function all(chunks: string[]): Promise<SseMessage[]> {
  const out: SseMessage[] = [];
  for await (const m of readSse(chunked(chunks))) out.push(m);
  return out;
}

describe('readSse', () => {
  it('reads the captured chat stream, whatever the chunk size', async () => {
    const text = fixture('chat-stream.txt');
    const whole = await all([text]);
    expect(whole.at(-1)?.data).toBe('[DONE]');
    expect(whole.every((m) => m.event === 'message')).toBe(true);
    for (const n of [1, 3, 7, 64]) {
      expect(await all(pieces(text, n))).toEqual(whole);
    }
  });

  it('handles CRLF, multi-line data, comments, named events and ids', async () => {
    const msgs = await all(['data: a\r\n', 'data: b\r', '\n\r\n: keep-alive\n\nevent: progress\nid: 7\ndata: {"x":1}\n\n']);
    expect(msgs).toEqual([
      { event: 'message', data: 'a\nb' },
      { event: 'progress', data: '{"x":1}', id: '7' },
    ]);
  });

  it('decodes UTF-8 split across chunks', async () => {
    const bytes = new TextEncoder().encode('data: héllo 🚀\n\n');
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const b of bytes) c.enqueue(new Uint8Array([b]));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const m of readSse(stream)) out.push(m.data);
    expect(out).toEqual(['héllo 🚀']);
  });

  it('yields a final event without a trailing blank line', async () => {
    expect(await all(['data: [DONE]'])).toEqual([{ event: 'message', data: '[DONE]' }]);
  });
});
