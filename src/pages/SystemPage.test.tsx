import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch } from '../../test/mockFetch';
import { RuntimeProvider } from '../hooks/useRuntime';
import { SystemPage } from './SystemPage';

afterEach(() => vi.unstubAllGlobals());

describe('System', () => {
  it('renders the captured /v1/system, with unknown values as dashes, not zeros', async () => {
    mockFetch({
      'GET /health': () => json({ status: 'ok', models: 1 }),
      'GET /v1/models': () => new Response(fixture('models.json')),
      'GET /v1/system': () => new Response(fixture('system.json')),
    });
    render(
      <RuntimeProvider>
        <SystemPage />
      </RuntimeProvider>,
    );
    const cpu = (await screen.findByRole('heading', { name: 'CPU' })).closest('section') as HTMLElement;
    expect(within(cpu).getByText('Apple M3 Pro')).toBeInTheDocument();
    expect(within(cpu).getByText('11 physical · 11 logical')).toBeInTheDocument();
    expect(within(cpu).getByText('5 performance · 6 efficiency')).toBeInTheDocument();

    const runtime = screen.getByRole('heading', { name: 'Runtime' }).closest('section') as HTMLElement;
    // Today's gateway reports no version or uptime: shown as unavailable.
    expect(within(runtime).getByTitle('This server does not report its version')).toHaveTextContent('—');
    expect(within(runtime).getByText('cpu')).toBeInTheDocument();

    expect(screen.getByText('18.0 GiB')).toBeInTheDocument();
    expect(screen.getByText('CUDA is not supported on macOS')).toBeInTheDocument();
    expect(screen.getAllByText(/memory — · compute units 14/)).toHaveLength(1);
    expect(screen.getByText('qwen2.5-0.5b-instruct')).toBeInTheDocument();
    expect(screen.getByText('Not available from this server')).toBeInTheDocument();
  });

  it('shows the error with its request id when /v1/system fails', async () => {
    mockFetch({
      'GET /health': () => json({ status: 'ok', models: 1 }),
      'GET /v1/models': () => new Response(fixture('models.json')),
      'GET /v1/system': () => json({ error: { code: 'internal_error', message: 'request req-x failed', param: null, type: 'server_error' } }, 500),
    });
    render(
      <RuntimeProvider>
        <SystemPage />
      </RuntimeProvider>,
    );
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Could not read /v1/system');
    expect(alert).toHaveTextContent('HTTP 500 · internal_error · request req-test-1');
  });
});
