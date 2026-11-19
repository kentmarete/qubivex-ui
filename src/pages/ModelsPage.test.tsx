import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch, unauthorized, type Handler } from '../../test/mockFetch';
import { resetModelOps } from '../hooks/useModelOps';
import { DEFAULT_GENERATION_PREFS, setGenerationPrefs } from '../hooks/useGenerationPrefs';
import { RuntimeProvider } from '../hooks/useRuntime';
import { clearSecret, setSecret } from '../services/auth';
import type { LoadedModel, SystemInfo } from '../types/api';
import { ModelsPage } from './ModelsPage';

const SYSTEM = JSON.parse(fixture('system.json')) as SystemInfo;
const QWEN = 'qwen2.5-0.5b-instruct';

/** What today's gateway answers to GET /v1/admin/models/installed (captured from qubivex serve). */
const methodNotAllowed = () => json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'The route does not support this HTTP method' } }, 405);
const adminDisabled = () =>
  json({ error: { code: 'admin_disabled', message: 'admin operations are disabled', param: null, type: 'permission_error' } }, 403);
/** The admin token check posts an unload with no model: a valid token gets this 400. */
const missingModel = () => json({ error: { code: 'invalid_request', message: 'give the model id to unload', param: 'model', type: 'invalid_request_error' } }, 400);

function system(models: LoadedModel[], states: SystemInfo['model_states']): SystemInfo {
  return { ...SYSTEM, models, model_states: states };
}

/** Routes the page needs; `unload` handles real unloads (the token check is answered here). */
function routes(opts: { sys: () => SystemInfo; unload?: Handler; tokenCheck?: Handler; extra?: Record<string, Handler> }) {
  const { sys, unload, tokenCheck, extra } = opts;
  return mockFetch({
    'GET /health': () => json({ status: 'ok', models: 1 }),
    'GET /v1/models': () => new Response(fixture('models.json')),
    'GET /v1/system': () => json(sys()),
    'GET /v1/admin/models/installed': methodNotAllowed,
    'POST /v1/models/unload': (req) => {
      const body = req.body as { model?: string };
      if (body.model === undefined) return (tokenCheck ?? missingModel)(req);
      return unload ? unload(req) : json({ id: body.model, object: 'model', deleted: true, draining: 0 });
    },
    ...extra,
  });
}

function renderPage(onAskKey = vi.fn()) {
  render(
    <RuntimeProvider>
      <ModelsPage onAskKey={onAskKey} />
    </RuntimeProvider>,
  );
  return onAskKey;
}

const row = (id: string) => screen.findByTestId(`model-row-${id}`);

beforeEach(() => setSecret('admin', 'adm-token'));
afterEach(() => {
  vi.unstubAllGlobals();
  resetModelOps();
  setGenerationPrefs(DEFAULT_GENERATION_PREFS);
});

describe('Models: installed (fallback from /v1/system)', () => {
  it('lists loaded models from the captured /v1/system, with the loaded-only banner', async () => {
    routes({ sys: () => SYSTEM });
    renderPage();
    const r = await row(QWEN);
    expect(within(r).getByText('loaded')).toBeInTheDocument();
    expect(within(r).getByText('cpu')).toBeInTheDocument();
    expect(within(r).getByText('4/4')).toBeInTheDocument();
    expect(within(r).getByText('948 MiB / 3.48 GiB')).toBeInTheDocument();
    expect(screen.getByText(/Showing loaded models only\./)).toHaveTextContent('On-disk inventory needs model management.');
    expect(await screen.findByText('Admin token accepted. You can load and unload models.')).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: `Unload ${QWEN}` })).toBeEnabled();
  });

  it('shows Discover and Jobs as unavailable when the server has no model management API', async () => {
    const { calls } = routes({ sys: () => SYSTEM });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    expect(await screen.findByText('Needs Qubivex with model management')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    expect(screen.getByText('Needs Qubivex with model management')).toBeInTheDocument();
    expect(calls.some((c) => c.url.endsWith('/v1/admin/models/installed'))).toBe(true);
  });

  it('trusts declared capabilities over the probe', async () => {
    // The probe (405 here) may run before /v1/system arrives; the declaration still wins.
    routes({ sys: () => ({ ...SYSTEM, capabilities: { model_management: true, admin: true } }) });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    expect(await screen.findByText('Not in this version of the UI yet')).toBeInTheDocument();
  });
});

describe('Models: load', () => {
  it('goes loading → loaded, polling /v1/system, with the admin token', async () => {
    let server: SystemInfo = system([], []);
    let finish: (r: Response) => void = () => {};
    const { calls } = routes({
      sys: () => server,
      extra: { 'POST /v1/models/load': () => new Promise<Response>((res) => (finish = res)) },
    });
    renderPage();
    expect(await screen.findByText(/No models are loaded/)).toBeInTheDocument();
    await screen.findByText('Admin token accepted. You can load and unload models.');

    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), QWEN);
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));

    // Shown as loading before the server lists it.
    expect(within(await row(QWEN)).getByText('loading')).toBeInTheDocument();
    const load = calls.find((c) => c.url.endsWith('/v1/models/load'));
    expect(load?.body).toEqual({ model: QWEN });
    expect(load?.headers.get('authorization')).toBe('Bearer adm-token');

    // The server reports it loading; then the load finishes.
    server = system([], [{ id: QWEN, state: 'loading' }]);
    await waitFor(() => expect(calls.filter((c) => c.url.endsWith('/v1/system')).length).toBeGreaterThan(2), { timeout: 3000 });
    expect(within(await row(QWEN)).getByText('loading')).toBeInTheDocument();
    expect(within(await row(QWEN)).queryByRole('button', { name: `Unload ${QWEN}` })).toBeNull();

    server = SYSTEM;
    finish(json({ id: QWEN, object: 'model', created: 1, owned_by: 'qubivex' }, 201));
    expect(await screen.findByText(`Loaded ${QWEN}.`)).toBeInTheDocument();
    await waitFor(async () => expect(within(await row(QWEN)).getByText('loaded')).toBeInTheDocument());
    expect(within(await row(QWEN)).getByRole('button', { name: `Unload ${QWEN}` })).toBeEnabled();
  });

  it('sends a different serve-as id only when given', async () => {
    const { calls } = routes({
      sys: () => system([], []),
      extra: { 'POST /v1/models/load': () => json({ id: 'small', object: 'model', created: 1, owned_by: 'qubivex' }, 201) },
    });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), '/models/qwen');
    await userEvent.type(screen.getByLabelText(/Serve as/), 'small');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/models/load'))?.body).toEqual({ model: '/models/qwen', id: 'small' }));
  });

  it('sends the context length, prefilled from Settings', async () => {
    setGenerationPrefs({ loadContext: 4096 });
    const { calls } = routes({
      sys: () => system([], []),
      extra: { 'POST /v1/models/load': () => json({ id: QWEN, object: 'model', created: 1, owned_by: 'qubivex' }, 201) },
    });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    const ctx = screen.getByLabelText(/Context length/);
    expect(ctx).toHaveValue('4096');
    await userEvent.type(screen.getByLabelText('Model'), QWEN);
    await userEvent.clear(ctx);
    await userEvent.type(ctx, '12k');
    expect(screen.getByRole('button', { name: 'Load' })).toBeDisabled();
    await userEvent.clear(ctx);
    await userEvent.type(ctx, '8192');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/models/load'))?.body).toEqual({ model: QWEN, context: 8192 }));
  });

  it('shows a 409 conflict with its code and request id', async () => {
    routes({
      sys: () => SYSTEM,
      extra: {
        'POST /v1/models/load': () =>
          json({ error: { code: 'conflict', message: 'this model is already loaded as "qwen"', param: null, type: 'invalid_request_error' } }, 409),
      },
    });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), 'other');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not load other.');
    expect(alert).toHaveTextContent('this model is already loaded as "qwen"');
    expect(alert).toHaveTextContent('HTTP 409 · conflict · request req-test-1');
  });

  it('a 401 asks for the admin token', async () => {
    routes({ sys: () => SYSTEM, extra: { 'POST /v1/models/load': unauthorized } });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    expect(await screen.findByText('Cannot load x: the admin token is missing or wrong. Enter it and try again.')).toBeInTheDocument();
  });

  it('shows a failed load with Retry and Clear', async () => {
    let server = system([], [{ id: 'broken', state: 'failed' }]);
    const { calls } = routes({ sys: () => server });
    renderPage();
    const r = await row('broken');
    expect(within(r).getByText('failed')).toBeInTheDocument();
    expect(within(r).getByText(/The load failed on the server/)).toBeInTheDocument();
    await waitFor(() => expect(within(r).getByRole('button', { name: 'Clear broken' })).toBeEnabled());
    server = system([], []);
    await userEvent.click(within(r).getByRole('button', { name: 'Clear broken' }));
    await waitFor(() => expect(calls.some((c) => (c.body as { model?: string } | undefined)?.model === 'broken')).toBe(true));
    // Cleared entries can be loaded again from the same session.
    expect(within(await row('broken')).getByRole('button', { name: 'Load broken' })).toBeInTheDocument();
  });
});

describe('Models: unload', () => {
  it('confirms, unloads, reports draining requests and offers Load again', async () => {
    let server = SYSTEM;
    const { calls } = routes({
      sys: () => server,
      unload: () => {
        server = system([], []);
        return json({ id: QWEN, object: 'model', deleted: true, draining: 2 });
      },
    });
    renderPage();
    const r = await row(QWEN);
    await waitFor(() => expect(within(r).getByRole('button', { name: `Unload ${QWEN}` })).toBeEnabled());
    await userEvent.click(within(r).getByRole('button', { name: `Unload ${QWEN}` }));

    const dialog = screen.getByRole('dialog', { name: `Unload ${QWEN}?`, hidden: true });
    expect(dialog).toHaveTextContent('The files stay on disk');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Unload', hidden: true }));

    expect(await screen.findByText(`Unloaded ${QWEN}. 2 running requests will finish first; the memory is freed when they end.`)).toBeInTheDocument();
    const unload = calls.find((c) => (c.body as { model?: string } | undefined)?.model === QWEN);
    expect(unload?.headers.get('authorization')).toBe('Bearer adm-token');
    await waitFor(async () => expect(within(await row(QWEN)).getByText('unloaded')).toBeInTheDocument());
    expect(within(await row(QWEN)).getByRole('button', { name: `Load ${QWEN}` })).toBeEnabled();
  });
});

describe('Models: admin access', () => {
  it('admin_disabled disables load and unload with the reason', async () => {
    routes({ sys: () => SYSTEM, tokenCheck: adminDisabled });
    const ask = renderPage();
    expect(await screen.findByText(/Admin operations are disabled on this server/)).toBeInTheDocument();
    const unload = within(await row(QWEN)).getByRole('button', { name: `Unload ${QWEN}` });
    expect(unload).toBeDisabled();
    expect(unload).toHaveAttribute('title', 'Server started without --admin-token');
    expect(screen.getByRole('button', { name: /Load model/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Enter admin token/ })).toBeNull();
    expect(ask).not.toHaveBeenCalled();
  });

  it('admin_disabled from an action also disables the rest', async () => {
    routes({ sys: () => SYSTEM, unload: adminDisabled });
    renderPage();
    const r = await row(QWEN);
    await waitFor(() => expect(within(r).getByRole('button', { name: `Unload ${QWEN}` })).toBeEnabled());
    await userEvent.click(within(r).getByRole('button', { name: `Unload ${QWEN}` }));
    await userEvent.click(within(screen.getByRole('dialog', { name: `Unload ${QWEN}?`, hidden: true })).getByRole('button', { name: 'Unload', hidden: true }));
    expect(await screen.findByText(/Cannot unload .*admin operations are disabled/)).toBeInTheDocument();
    expect(within(r).getByRole('button', { name: `Unload ${QWEN}` })).toBeDisabled();
  });

  it('without an admin token, actions are off and the token can be entered', async () => {
    clearSecret('admin');
    const { calls } = routes({ sys: () => SYSTEM, tokenCheck: unauthorized });
    const ask = renderPage();
    await userEvent.click(await screen.findByRole('button', { name: /Enter admin token/ }));
    expect(ask).toHaveBeenCalledWith('admin');
    expect(within(await row(QWEN)).getByRole('button', { name: `Unload ${QWEN}` })).toHaveAttribute('title', 'Enter the admin token first');
    // The check never sends the API key in place of the admin token.
    const check = calls.find((c) => c.url.endsWith('/v1/models/unload'));
    expect(check?.headers.get('authorization')).toBeNull();
  });
});
