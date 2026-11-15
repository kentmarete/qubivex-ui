import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, isAbort } from '../services/api';
import { streamChat } from '../services/chat';
import type { ApiErrorBody, ChatRequestMessage, Usage } from '../types/api';

export interface ChatSettings {
  temperature: number;
  maxTokens: number;
  topP: number;
  /** 0: off. */
  topK: number;
  /** null: the server's default. */
  seed: number | null;
  systemPrompt: string;
}

export const DEFAULT_SETTINGS: ChatSettings = {
  temperature: 0.7,
  maxTokens: 512,
  topP: 1,
  topK: 0,
  seed: null,
  systemPrompt: '',
};

export type MessageStatus = 'streaming' | 'done' | 'stopped' | 'interrupted' | 'error';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  model?: string;
  status?: MessageStatus;
  finish?: string;
  usage?: Usage;
  error?: ApiErrorBody & { requestId?: string | null; retryAfter?: number | null };
  /** Measured in the browser: from send to first token, and decode speed after it. */
  timing?: { ttftMs: number | null; tokensPerSecond: number | null };
}

export interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
}

let seq = 0;
const newId = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const emptyConversation = (): Conversation => ({ id: newId('c'), title: 'New conversation', messages: [] });

/** The request history: every user turn and every assistant turn that has text. */
export function toRequestMessages(messages: ChatMessage[], systemPrompt: string): ChatRequestMessage[] {
  const out: ChatRequestMessage[] = [];
  if (systemPrompt.trim()) out.push({ role: 'system', content: systemPrompt.trim() });
  for (const m of messages) {
    if (m.role === 'assistant' && (!m.text || m.status === 'error')) continue;
    out.push({ role: m.role, content: m.text });
  }
  return out;
}

const FLUSH_MS = 40;

export function useChat() {
  const [current, setCurrent] = useState<Conversation>(emptyConversation);
  const [history, setHistory] = useState<Conversation[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const streaming = current.messages.some((m) => m.status === 'streaming');

  useEffect(() => () => abortRef.current?.abort(), []);

  const patch = useCallback((id: string, f: (m: ChatMessage) => ChatMessage) => {
    setCurrent((c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? f(m) : m)) }));
  }, []);

  /** Streams a reply to `prior` (which ends with a user message) into message `id`. */
  const run = useCallback(
    async (id: string, prior: ChatMessage[], model: string, s: ChatSettings) => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const sent = performance.now();
      let first: number | null = null;
      let pending = '';
      let timer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        timer = null;
        if (!pending) return;
        const add = pending;
        pending = '';
        patch(id, (m) => ({ ...m, text: m.text + add }));
      };
      let finish: string | undefined;
      let usage: Usage | undefined;
      let status: MessageStatus = 'done';
      let error: ChatMessage['error'];
      try {
        const events = streamChat(
          {
            model,
            messages: toRequestMessages(prior, s.systemPrompt),
            temperature: s.temperature,
            top_p: s.topP,
            ...(s.topK > 0 ? { top_k: s.topK } : {}),
            max_tokens: s.maxTokens,
            ...(s.seed !== null ? { seed: s.seed } : {}),
          },
          ctrl.signal,
        );
        for await (const ev of events) {
          if (ev.kind === 'delta') {
            if (first === null) first = performance.now();
            pending += ev.text;
            if (timer === null) timer = setTimeout(flush, FLUSH_MS);
          } else if (ev.kind === 'finish') finish = ev.reason;
          else if (ev.kind === 'usage') usage = ev.usage;
          else if (ev.kind === 'error') {
            status = 'error';
            error = ev.error;
          } else if (ev.kind === 'interrupted') status = 'interrupted';
        }
      } catch (e) {
        if (ctrl.signal.aborted || isAbort(e)) status = 'stopped';
        else if (e instanceof ApiError && first === null) {
          // Refused before the stream started: auth, validation, queue, memory, network.
          status = 'error';
          error = { ...e.body, requestId: e.requestId, retryAfter: e.retryAfter };
        } else status = 'interrupted';
      } finally {
        if (timer !== null) clearTimeout(timer);
        flush();
        if (abortRef.current === ctrl) abortRef.current = null;
      }
      const end = performance.now();
      const n = usage?.completion_tokens ?? null;
      const decodeSecs = first !== null ? (end - first) / 1000 : 0;
      patch(id, (m) => ({
        ...m,
        status,
        finish,
        usage,
        error,
        timing: {
          ttftMs: first !== null ? first - sent : null,
          tokensPerSecond: n !== null && n > 1 && decodeSecs > 0 ? (n - 1) / decodeSecs : null,
        },
      }));
    },
    [patch],
  );

  const send = useCallback(
    (text: string, model: string, s: ChatSettings) => {
      const body = text.trim();
      if (!body || streaming) return;
      const user: ChatMessage = { id: newId('u'), role: 'user', text: body };
      const reply: ChatMessage = { id: newId('a'), role: 'assistant', text: '', model, status: 'streaming' };
      const prior = [...current.messages, user];
      setCurrent((c) => ({
        ...c,
        title: c.messages.length === 0 ? body.slice(0, 60) : c.title,
        messages: [...c.messages, user, reply],
      }));
      void run(reply.id, prior, model, s);
    },
    [current.messages, run, streaming],
  );

  /** Generates again for an assistant message, from the turns before it. */
  const retry = useCallback(
    (assistantId: string, model: string, s: ChatSettings) => {
      if (streaming) return;
      const i = current.messages.findIndex((m) => m.id === assistantId);
      if (i < 0) return;
      const prior = current.messages.slice(0, i);
      const reply: ChatMessage = { id: newId('a'), role: 'assistant', text: '', model, status: 'streaming' };
      setCurrent((c) => ({ ...c, messages: [...prior, reply] }));
      void run(reply.id, prior, model, s);
    },
    [current.messages, run, streaming],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setCurrent((c) => ({ ...c, title: 'New conversation', messages: [] }));
  }, []);

  const newConversation = useCallback(() => {
    abortRef.current?.abort();
    setCurrent((c) => {
      if (c.messages.length) setHistory((h) => [c, ...h.filter((x) => x.id !== c.id)].slice(0, 20));
      return emptyConversation();
    });
  }, []);

  const open = useCallback(
    (id: string) => {
      if (streaming) return;
      const found = history.find((c) => c.id === id);
      if (!found) return;
      setHistory((h) => {
        const rest = h.filter((c) => c.id !== id);
        return current.messages.length ? [current, ...rest].slice(0, 20) : rest;
      });
      setCurrent(found);
    },
    [current, history, streaming],
  );

  return { conversation: current, history, streaming, send, retry, stop, clear, newConversation, open };
}
