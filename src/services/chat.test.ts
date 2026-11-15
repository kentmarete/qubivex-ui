import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch, pieces, textStream } from '../../test/mockFetch';
import { ApiError } from './api';
import { parseChunk, streamChat, type ChatEvent } from './chat';

afterEach(() => vi.unstubAllGlobals());

const sse = (body: ReadableStream<Uint8Array>) => new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });

async function collect(gen: AsyncGenerator<ChatEvent>): Promise<ChatEvent[]> {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const req = { model: 'qwen2.5-0.5b-instruct', messages: [{ role: 'user' as const, content: 'hi' }] };

describe('parseChunk', () => {
  it('reads deltas, finish and usage', () => {
    expect(parseChunk('{"choices":[{"delta":{"content":"Hi"},"finish_reason":null,"index":0}]}')).toEqual([{ kind: 'delta', text: 'Hi' }]);
    expect(parseChunk('{"choices":[{"delta":{},"finish_reason":"length","index":0}]}')).toEqual([{ kind: 'finish', reason: 'length' }]);
    const u = parseChunk('{"choices":[],"usage":{"prompt_tokens":3,"completion_tokens":2,"total_tokens":5}}');
    expect(u).toEqual([{ kind: 'usage', usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }]);
  });

  it('ignores the empty role chunk and reads an in-stream error', () => {
    expect(parseChunk('{"choices":[{"delta":{"content":"","role":"assistant"},"finish_reason":null,"index":0}]}')).toEqual([]);
    expect(parseChunk('{"error":{"code":"overloaded","message":"the server is shutting down","param":null,"type":"server_error"}}')).toEqual([
      { kind: 'error', error: { code: 'overloaded', message: 'the server is shutting down', param: null, type: 'server_error' } },
    ]);
    expect(parseChunk('[DONE]')).toEqual([{ kind: 'done' }]);
  });
});

describe('streamChat', () => {
  it('replays the captured stream into text, finish, usage and done', async () => {
    const { calls } = mockFetch({ 'POST /v1/chat/completions': () => sse(textStream(pieces(fixture('chat-stream.txt'), 37))) });
    const events = await collect(streamChat(req, new AbortController().signal));
    const text = events.flatMap((e) => (e.kind === 'delta' ? [e.text] : [])).join('');
    expect(text).toContain('```python');
    expect(text).toContain('print("Hello, World!")');
    expect(events.filter((e) => e.kind === 'finish')).toEqual([{ kind: 'finish', reason: 'stop' }]);
    expect(events.find((e) => e.kind === 'usage')).toMatchObject({ usage: { completion_tokens: expect.any(Number) } });
    expect(events.at(-1)).toEqual({ kind: 'done' });
    expect(calls[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true }, model: req.model });
  });

  it('reports an error after the stream started, then done', async () => {
    const body = 'data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null,"index":0}]}\n\ndata: {"error":{"code":"overloaded","message":"the server is shutting down","param":null,"type":"server_error"}}\n\ndata: [DONE]\n\n';
    mockFetch({ 'POST /v1/chat/completions': () => sse(textStream([body])) });
    const kinds = (await collect(streamChat(req, new AbortController().signal))).map((e) => e.kind);
    expect(kinds).toEqual(['delta', 'error', 'done']);
  });

  it('reports an interruption when the body ends without [DONE]', async () => {
    mockFetch({ 'POST /v1/chat/completions': () => sse(textStream(['data: {"choices":[{"delta":{"content":"Hel"},"finish_reason":null,"index":0}]}\n\n'])) });
    const kinds = (await collect(streamChat(req, new AbortController().signal))).map((e) => e.kind);
    expect(kinds).toEqual(['delta', 'interrupted']);
  });

  it('throws the HTTP error when the request is refused before streaming', async () => {
    mockFetch({
      'POST /v1/chat/completions': () =>
        json({ error: { code: 'too_many_requests', message: 'queue full', param: null, type: 'rate_limit_error' } }, 429, { 'retry-after': '3' }),
    });
    const err = await collect(streamChat(req, new AbortController().signal)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 429, code: 'too_many_requests', retryAfter: 3, requestId: 'req-test-1' });
  });

  it('stops when aborted mid-stream', async () => {
    const ctrl = new AbortController();
    mockFetch({
      'POST /v1/chat/completions': ({ signal }) =>
        sse(textStream(['data: {"choices":[{"delta":{"content":"a"},"finish_reason":null,"index":0}]}\n\n'], { hold: true, signal })),
    });
    const seen: ChatEvent[] = [];
    const run = (async () => {
      for await (const e of streamChat(req, ctrl.signal)) {
        seen.push(e);
        ctrl.abort();
      }
    })();
    await expect(run).rejects.toMatchObject({ name: 'AbortError' });
    expect(seen).toEqual([{ kind: 'delta', text: 'a' }]);
  });
});
