import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch, type Handler } from '../../test/mockFetch';
import { resetDownloads } from '../hooks/useDownloads';
import { DEFAULT_GENERATION_PREFS, setGenerationPrefs } from '../hooks/useGenerationPrefs';
import { resetModelOps } from '../hooks/useModelOps';
import { RuntimeProvider } from '../hooks/useRuntime';
import { setSecret } from '../services/auth';
import type { Job, SystemInfo } from '../types/api';
import { ModelsPage } from './ModelsPage';

const SYSTEM = JSON.parse(fixture('system.json')) as SystemInfo;
const WITH_DOWNLOADS: SystemInfo = { ...SYSTEM, capabilities: { admin: true, model_downloads: true } };
const REPO = 'Qwen/Qwen3-4B-Instruct-2507';
const missingModel = () => json({ error: { code: 'invalid_request', message: 'give the model id to unload', param: 'model', type: 'invalid_request_error' } }, 400);

function job(over: Partial<Job> = {}): Job {
  return {
    object: 'job',
    id: 'job-1',
    kind: 'pull',
    status: 'running',
    model: null,
    repository: REPO,
    revision: null,
    created_at: 1,
    finished_at: null,
    progress: { bytes_done: 0, bytes_total: 0, bytes_resumed: 0, rate_bps: null, eta_seconds: null, files: [], retrying: null },
    result: null,
    error: null,
    cancellable: true,
    ...over,
  };
}

function routes(sys: SystemInfo, extra: Record<string, Handler> = {}) {
  return mockFetch({
    'GET /health': () => json({ status: 'ok', models: 1 }),
    'GET /v1/models': () => new Response(fixture('models.json')),
    'GET /v1/system': () => json(sys),
    'GET /v1/admin/models/installed': () => json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'no' } }, 405),
    'POST /v1/models/unload': missingModel,
    ...extra,
  });
}

function renderPage() {
  render(
    <RuntimeProvider>
      <ModelsPage onAskKey={vi.fn()} />
    </RuntimeProvider>,
  );
}

beforeEach(() => setSecret('admin', 'adm-token'));
afterEach(() => {
  vi.unstubAllGlobals();
  resetModelOps();
  resetDownloads();
  setGenerationPrefs(DEFAULT_GENERATION_PREFS);
});

describe('Models: downloads', () => {
  it('without the capability, Discover explains why it is empty', async () => {
    routes(SYSTEM);
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    expect(await screen.findByText('Needs Qubivex with model management')).toBeInTheDocument();
    expect(screen.queryByRole('search')).toBeNull();
  });

  it('searches, downloads with options, follows the job and loads the model when done', async () => {
    let jobs: Job[] = [];
    const { calls } = routes(WITH_DOWNLOADS, {
      'GET /v1/admin/models/search': () =>
        json({
          object: 'list',
          query: 'qwen3-4b',
          data: [
            { repository: REPO, downloads: 2736684, likes: 1060, formats: ['safetensors'], gated: false, installed_as: [] },
            { repository: 'Qwen/Qwen3-0.6B', downloads: 10, likes: 1, formats: ['safetensors'], gated: false, installed_as: ['qwen3-0.6b'] },
          ],
        }),
      'POST /v1/admin/models/pull': () => {
        jobs = [job({ progress: { ...job().progress, bytes_done: 500, bytes_total: 1000, rate_bps: 100, eta_seconds: 5 } })];
        return json(jobs[0], 202);
      },
      'GET /v1/admin/jobs': () => json({ object: 'list', data: jobs }),
      'POST /v1/models/load': () => json({ id: 'qwen3-4b-instruct-2507', object: 'model', created: 1, owned_by: 'qubivex' }, 201),
    });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Discover' }));
    await userEvent.type(await screen.findByLabelText('Search models'), 'qwen3-4b');
    await userEvent.click(screen.getByRole('button', { name: /Search/ }));
    const installed = await screen.findByTestId('hit-Qwen/Qwen3-0.6B');
    expect(installed).toHaveTextContent('installed as qwen3-0.6b');

    await userEvent.click(screen.getByRole('button', { name: `Download ${REPO}` }));
    const ctx = screen.getByLabelText(/Load context/);
    await userEvent.clear(ctx);
    await userEvent.type(ctx, '32768');
    await userEvent.type(screen.getByLabelText(/Config values/), '{{"x": 1}');
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/admin/models/pull'))?.body).toEqual({ repository: REPO, set: { x: 1 } }));
    expect(await screen.findByText(/Follow it in the Jobs tab/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    const row = await screen.findByTestId('job-job-1');
    expect(row).toHaveTextContent('downloading');
    expect(row).toHaveTextContent('50.0%');
    expect(row).toHaveTextContent('loads when done');

    jobs = [job({ status: 'succeeded', model: 'qwen3-4b-instruct-2507', cancellable: false, result: { id: 'qwen3-4b-instruct-2507', warnings: [], files: ['model.safetensors'] } })];
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/models/load'))?.body).toEqual({ model: 'qwen3-4b-instruct-2507', context: 32768 }), { timeout: 3000 });
    expect(await screen.findByText(/Downloaded .* as qwen3-4b-instruct-2507/)).toBeInTheDocument();
  });

  it('a load of a hub name that is not installed offers to download it', async () => {
    const { calls } = routes(WITH_DOWNLOADS, {
      'POST /v1/models/load': () =>
        json({ error: { code: 'model_not_found', message: 'the model "allenai/OLMoE-1B-7B-0924" is not loaded', param: 'model', type: 'invalid_request_error' } }, 404),
      'POST /v1/admin/models/pull': () => json(job({ repository: 'allenai/OLMoE-1B-7B-0924' }), 202),
      'GET /v1/admin/jobs': () => json({ object: 'list', data: [] }),
    });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), 'allenai/OLMoE-1B-7B-0924');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('It is not installed on the server.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Download allenai/OLMoE-1B-7B-0924' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: /Download/ }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/v1/admin/models/pull'))?.body).toEqual({ repository: 'allenai/OLMoE-1B-7B-0924' }));
  });

  it('a plain name that is not installed points at Discover instead', async () => {
    routes(WITH_DOWNLOADS, {
      'POST /v1/models/load': () => json({ error: { code: 'model_not_found', message: 'the model "nope" is not loaded', param: 'model', type: 'invalid_request_error' } }, 404),
    });
    renderPage();
    await screen.findByText('Admin token accepted. You can load and unload models.');
    await userEvent.click(screen.getByRole('button', { name: /Load model/ }));
    await userEvent.type(screen.getByLabelText('Model'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: 'Load' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Use Discover to find and download one.');
    expect(within(alert).queryByRole('button', { name: /Download/ })).toBeNull();
  });

  it('a failed job shows why and can be retried', async () => {
    let jobs: Job[] = [job({ status: 'failed', cancellable: false, error: { code: 'invalid_request', message: 'owner/m has several weight files; pick one in files: a.gguf, b.gguf' } })];
    const { calls } = routes(WITH_DOWNLOADS, {
      'GET /v1/admin/jobs': () => json({ object: 'list', data: jobs }),
      'POST /v1/admin/jobs/job-1/retry': () => {
        jobs = [job({ id: 'job-2' }), ...jobs];
        return json(jobs[0], 202);
      },
    });
    renderPage();
    await userEvent.click(screen.getByRole('tab', { name: 'Jobs' }));
    const row = await screen.findByTestId('job-job-1');
    expect(row).toHaveTextContent('pick one in files: a.gguf, b.gguf');
    await userEvent.click(within(row).getByRole('button', { name: `Retry ${REPO}` }));
    expect(await screen.findByTestId('job-job-2')).toHaveTextContent('downloading');
    expect(calls.some((c) => c.method === 'POST' && c.url.endsWith('/v1/admin/jobs/job-1/retry'))).toBe(true);
  });
});
