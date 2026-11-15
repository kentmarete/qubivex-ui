import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fixture, json, mockFetch } from '../../test/mockFetch';
import { MetricsPage } from './MetricsPage';

// Recharts measures its container; jsdom has no layout.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('ResizeObserver', RO);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const metrics = () => new Response(fixture('metrics.txt'), { status: 200, headers: { 'content-type': 'text/plain; version=0.0.4' } });
const card = (name: string) => screen.getByRole('region', { name });

describe('Metrics', () => {
  it('shows real values, marks unreported ones, and never shows a fabricated zero', async () => {
    mockFetch({ 'GET /metrics': metrics });
    render(<MetricsPage />);
    await screen.findByText(/^Updated /);

    expect(within(card('Active generations')).getByText('0')).toBeInTheDocument();
    expect(within(card('Process memory')).getByText(/^peak \d/)).toBeInTheDocument();
    // Since-start TTFT from the histogram: 0.849 s / 3 ≈ 283 ms.
    expect(within(card('Time to first token')).getByText('283')).toBeInTheDocument();
    expect(within(card('Time to first token')).getByText(/since server start/)).toBeInTheDocument();
    // Rates need two scrapes.
    expect(within(card('Generation throughput')).getByText('No data in this window yet')).toBeInTheDocument();
    // Not in /metrics at all.
    expect(within(card('CPU utilisation')).getByText('Not reported by this server')).toBeInTheDocument();
    expect(within(card('GPU memory')).getByText(/No discrete GPU in use/)).toBeInTheDocument();
    expect(within(card('Model memory')).getByText('Weights')).toBeInTheDocument();
  });

  it('polls on the interval, stops when paused, and resumes', async () => {
    const { fn } = mockFetch({ 'GET /metrics': metrics });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<MetricsPage />);
    await screen.findByText(/^Updated /);
    expect(fn).toHaveBeenCalledTimes(1);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(fn).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    await act(() => vi.advanceTimersByTimeAsync(10_000));
    expect(fn).toHaveBeenCalledTimes(2);

    await user.click(screen.getByRole('button', { name: 'Resume' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('computes throughput from the second scrape on', async () => {
    let n = 0;
    mockFetch({
      'GET /metrics': () => {
        n += 1;
        // The second scrape has 100 more generated tokens.
        const text = fixture('metrics.txt').replace(/^qubivex_generated_tokens_total (\d+)$/m, (_, v: string) => `qubivex_generated_tokens_total ${Number(v) + (n > 1 ? 100 : 0)}`);
        return new Response(text);
      },
    });
    render(<MetricsPage />);
    await screen.findByText(/^Updated /);
    await act(() => vi.advanceTimersByTimeAsync(2000));
    const value = within(card('Generation throughput')).getByText(/^\d+(\.\d)?$/);
    // 100 tokens over ~2 s.
    expect(Number(value.textContent)).toBeGreaterThan(40);
    expect(Number(value.textContent)).toBeLessThan(60);
  });

  it('says when the server runs with --no-metrics', async () => {
    mockFetch({ 'GET /metrics': () => json({ error: { code: 'not_found', message: 'not found', param: null, type: 'invalid_request_error' } }, 404) });
    render(<MetricsPage />);
    expect(await screen.findByText('Metrics are disabled on this server')).toBeInTheDocument();
  });

  it('keeps history and shows the error when a scrape fails', async () => {
    let fail = false;
    mockFetch({
      'GET /metrics': () => {
        if (fail) throw new TypeError('Failed to fetch');
        return metrics();
      },
    });
    render(<MetricsPage />);
    await screen.findByText(/^Updated /);
    fail = true;
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(screen.getByRole('alert')).toHaveTextContent('The last scrape of /metrics failed');
    expect(within(card('Active generations')).getByText('0')).toBeInTheDocument();
  });
});
