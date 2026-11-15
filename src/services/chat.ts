// Chat completions over SSE, in the gateway's exact format (docs/01 §5).

import type { ApiErrorBody, ChatChunk, ChatRequest, Usage } from '../types/api';
import { stream } from './api';
import { readSse } from './sse';

export type ChatEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'finish'; reason: string }
  | { kind: 'usage'; usage: Usage }
  /** An error after the stream started: the 200 was already sent. */
  | { kind: 'error'; error: ApiErrorBody }
  /** `data: [DONE]`, always last. */
  | { kind: 'done' }
  /** The body ended without `[DONE]`: the connection dropped. */
  | { kind: 'interrupted' };

/** Turns one SSE `data` payload into events. Exported for tests. */
export function parseChunk(data: string): ChatEvent[] {
  if (data === '[DONE]') return [{ kind: 'done' }];
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  if ('error' in parsed) {
    const e = (parsed as { error: Partial<ApiErrorBody> }).error;
    return [
      {
        kind: 'error',
        error: {
          code: e.code ?? null,
          message: e.message ?? 'The generation failed',
          param: e.param ?? null,
          type: e.type ?? null,
        },
      },
    ];
  }
  const chunk = parsed as ChatChunk;
  const out: ChatEvent[] = [];
  for (const c of chunk.choices ?? []) {
    const text = c.delta?.content;
    if (text) out.push({ kind: 'delta', text });
    if (c.finish_reason) out.push({ kind: 'finish', reason: c.finish_reason });
  }
  if (chunk.usage) out.push({ kind: 'usage', usage: chunk.usage });
  return out;
}

/**
 * Streams a chat completion. HTTP errors before the stream throw ApiError. Aborting
 * `signal` closes the connection, which is how the server is told to stop generating.
 */
export async function* streamChat(req: Omit<ChatRequest, 'stream'>, signal: AbortSignal): AsyncGenerator<ChatEvent> {
  const res = await stream(
    '/v1/chat/completions',
    { ...req, stream: true, stream_options: { include_usage: true } },
    { signal },
  );
  let done = false;
  // `res.body` is checked non-null by stream().
  for await (const msg of readSse(res.body as ReadableStream<Uint8Array>)) {
    for (const ev of parseChunk(msg.data)) {
      yield ev;
      if (ev.kind === 'done') done = true;
    }
    if (done) return;
  }
  yield { kind: 'interrupted' };
}
