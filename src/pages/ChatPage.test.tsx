import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch, pieces, textStream, unauthorized, type Handler } from '../../test/mockFetch';
import { App } from '../App';
import { DEFAULT_GENERATION_PREFS, setGenerationPrefs } from '../hooks/useGenerationPrefs';

const sse = (b: ReadableStream<Uint8Array>) => new Response(b, { status: 200, headers: { 'content-type': 'text/event-stream' } });

function server(over: Record<string, Handler> = {}) {
  return mockFetch({
    'GET /health': () => json({ status: 'ok', models: 1 }),
    'GET /v1/models': () => new Response(fixture('models.json'), { status: 200 }),
    'GET /v1/system': () => new Response(fixture('system.json'), { status: 200 }),
    'POST /v1/chat/completions': () => sse(textStream(pieces(fixture('chat-stream.txt'), 50))),
    ...over,
  });
}

beforeEach(() => window.history.replaceState(null, '', '/ui/chat'));
afterEach(() => {
  vi.unstubAllGlobals();
  setGenerationPrefs(DEFAULT_GENERATION_PREFS);
});

async function ready() {
  render(<App />);
  const box = await screen.findByRole('textbox', { name: 'Message' });
  await waitFor(() => expect(box).toBeEnabled());
  return box;
}

describe('Chat', () => {
  it('streams a reply from the selected model and renders it as markdown', async () => {
    const { calls } = server();
    const user = userEvent.setup();
    const box = await ready();
    expect(screen.getByRole('combobox')).toHaveValue('qwen2.5-0.5b-instruct');

    await user.type(box, 'Write hello world{Enter}');
    const reply = await screen.findByRole('article');
    await waitFor(() => expect(reply).toHaveAttribute('aria-busy', 'false'));
    expect(within(reply).getByText(/Hello, World!/).closest('pre')).not.toBeNull();
    expect(within(reply).getByText(/tokens$/)).toBeInTheDocument();
    expect(within(reply).getByRole('button', { name: 'Copy response' })).toBeInTheDocument();

    const sent = calls.find((c) => c.url === '/v1/chat/completions');
    expect(sent?.body).toMatchObject({
      model: 'qwen2.5-0.5b-instruct',
      stream: true,
      messages: [{ role: 'user', content: 'Write hello world' }],
      temperature: 0.7,
      max_tokens: 512,
    });
  });

  it('asks for the default max tokens set on the Settings page', async () => {
    setGenerationPrefs({ defaultMaxTokens: 1500 });
    const { calls } = server();
    const user = userEvent.setup();
    const box = await ready();
    await user.type(box, 'Hi{Enter}');
    await waitFor(() => expect(calls.find((c) => c.url === '/v1/chat/completions')?.body).toMatchObject({ max_tokens: 1500 }));
  });

  it('stops a generation and keeps the partial text', async () => {
    server({
      'POST /v1/chat/completions': ({ signal }) =>
        sse(textStream(['data: {"choices":[{"delta":{"content":"Partial answer"},"finish_reason":null,"index":0}]}\n\n'], { hold: true, signal })),
    });
    const user = userEvent.setup();
    const box = await ready();
    await user.type(box, 'hi{Enter}');
    await screen.findByText('Partial answer');
    await user.click(screen.getByRole('button', { name: 'Stop generating' }));
    expect(await screen.findByText('Stopped')).toBeInTheDocument();
    expect(screen.getByText('Partial answer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeEnabled();
  });

  it('shows a refusal with its code and request id, and can retry', async () => {
    let n = 0;
    server({
      'POST /v1/chat/completions': () => {
        n += 1;
        return n === 1
          ? json({ error: { code: 'too_many_requests', message: 'the queue is full', param: null, type: 'rate_limit_error' } }, 429, { 'retry-after': '5' })
          : sse(textStream(pieces(fixture('chat-stream.txt'), 200)));
      },
    });
    const user = userEvent.setup();
    const box = await ready();
    await user.type(box, 'hi{Enter}');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('the queue is full');
    expect(alert).toHaveTextContent('too_many_requests · request req-test-1 · retry after 5s');
    await user.click(screen.getByRole('button', { name: /Retry/ }));
    expect(await screen.findByText(/Hello, World!/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks a reply interrupted when the connection drops', async () => {
    server({
      'POST /v1/chat/completions': () => sse(textStream(['data: {"choices":[{"delta":{"content":"Half"},"finish_reason":null,"index":0}]}\n\n'])),
    });
    const user = userEvent.setup();
    const box = await ready();
    await user.type(box, 'hi{Enter}');
    expect(await screen.findByText(/Interrupted/)).toBeInTheDocument();
  });

  it('asks for an API key on 401, then uses it', async () => {
    const authed = (h: Headers) => h.get('authorization') === 'Bearer sk-good';
    server({
      'GET /v1/models': ({ headers }) => (authed(headers) ? new Response(fixture('models.json')) : unauthorized()),
      'GET /v1/system': ({ headers }) => (authed(headers) ? new Response(fixture('system.json')) : unauthorized()),
    });
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByText('An API key is required')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'API key required' });
    await user.type(within(dialog).getByLabelText('API key'), 'sk-good');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    const box = screen.getByRole('textbox', { name: 'Message' });
    await waitFor(() => expect(box).toBeEnabled());
    expect(screen.getByText('Connected · API key')).toBeInTheDocument();
  });

  it('says when no model is loaded', async () => {
    server({ 'GET /v1/models': () => json({ object: 'list', data: [] }), 'GET /health': () => json({ status: 'ok', models: 0 }) });
    render(<App />);
    expect(await screen.findByText('No model is loaded')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled();
  });
});
