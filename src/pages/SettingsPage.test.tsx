import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch } from '../../test/mockFetch';
import { DEFAULT_GENERATION_PREFS, getGenerationPrefs, reloadGenerationPrefs, setGenerationPrefs } from '../hooks/useGenerationPrefs';
import { RuntimeProvider } from '../hooks/useRuntime';
import type { SystemInfo } from '../types/api';
import { SettingsPage } from './SettingsPage';

const SYSTEM = JSON.parse(fixture('system.json')) as SystemInfo;
const LIMITS = { default_max_tokens: 512, max_generation_tokens: 2048, max_prompt_tokens: null, load_context: 8192 };

function renderPage(sys: SystemInfo) {
  mockFetch({
    'GET /health': () => json({ status: 'ok', models: 1 }),
    'GET /v1/models': () => new Response(fixture('models.json')),
    'GET /v1/system': () => json(sys),
  });
  render(
    <RuntimeProvider>
      <SettingsPage />
    </RuntimeProvider>,
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
  setGenerationPrefs(DEFAULT_GENERATION_PREFS);
});

describe('Settings: generation', () => {
  it('saves the default max tokens and the load context in this browser', async () => {
    renderPage({ ...SYSTEM, limits: LIMITS });
    expect(await screen.findByText('Server max tokens cap')).toBeInTheDocument();
    expect(screen.getByText('2,048')).toBeInTheDocument();
    const max = screen.getByLabelText('Default max tokens');
    const ctx = screen.getByLabelText('Context length for loads');
    expect(ctx).toHaveAttribute('placeholder', 'server: 8192');
    await userEvent.clear(max);
    await userEvent.type(max, '1024');
    await userEvent.type(ctx, '16384');
    await userEvent.click(screen.getByRole('button', { name: 'Save defaults' }));
    expect(await screen.findByText('Saved in this browser')).toBeInTheDocument();
    expect(getGenerationPrefs()).toEqual({ defaultMaxTokens: 1024, loadContext: 16384 });
    // It survives a reload of the page.
    reloadGenerationPrefs();
    expect(getGenerationPrefs()).toEqual({ defaultMaxTokens: 1024, loadContext: 16384 });
  });

  it('refuses a default above the server cap, and an invalid context', async () => {
    renderPage({ ...SYSTEM, limits: LIMITS });
    const max = await screen.findByLabelText('Default max tokens');
    await userEvent.clear(max);
    await userEvent.type(max, '4096');
    expect(await screen.findByText(/allows at most 2,048/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
    await userEvent.clear(max);
    await userEvent.type(max, '600');
    await userEvent.type(screen.getByLabelText('Context length for loads'), '0');
    expect(screen.getByText(/or leave it empty/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save defaults' })).toBeDisabled();
    expect(getGenerationPrefs()).toEqual(DEFAULT_GENERATION_PREFS);
  });

  it('works with a server that reports no limits', async () => {
    renderPage(SYSTEM);
    const ctx = await screen.findByLabelText('Context length for loads');
    expect(ctx).toHaveAttribute('placeholder', 'the model’s own');
    expect(screen.queryByText('Server max tokens cap')).not.toBeInTheDocument();
  });
});
