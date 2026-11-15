# Changelog

## Phase 2: Metrics (2026-11-15)

Reads `GET /metrics` (Prometheus text) only. No backend changes.

- Prometheus text parser (labels with escapes, `+Inf`/`NaN`, histograms) and a compact
  per-scrape snapshot. Up to 900 scrapes are kept, which is 30 minutes at 2 s.
- Derived values keep three states apart: not reported by the server (`undefined`), not
  computable yet (`null`: first scrape, no new observations, or a counter reset) and a real
  number, which may be 0.
- Rates come from counter deltas. Latency means and p95 come from histogram deltas, with
  p95 interpolated like Prometheus' `histogram_quantile`. A counter that goes down is
  treated as a restart, never as a negative rate.
- Stat cards (last 60 s, else a value labelled "since server start"):
  - generation and prompt throughput
  - TTFT
  - decode latency
  - per-generation decode speed
  - active generations and queue
  - requests
  - failed, cancelled and timed out
  - process memory
  - model memory by owner against the plan budget
  - CPU and GPU, shown as "not reported by this server"
- Charts (Recharts, one y-axis each, legend, crosshair tooltip, table view):
  - tokens/s
  - request throughput by status class
  - decode latency
  - TTFT
  - memory
  - GPU memory, shown only when the server reports VRAM
- Controls:
  - model filter (or all models merged)
  - poll interval 1–30 s (default 2 s)
  - window 1–30 min
  - pause/resume
  - reset history
  - last update, amber when stale
  - a `--no-metrics` (404) panel
  - a failed scrape keeps its history
- Series colors: four dark-mode categorical slots, checked with a palette validator
  against the chart surface.
- The Metrics page is lazy-loaded, so Recharts (116 KB gzipped) is only fetched there.
- Tests: 58 in all, 18 of them new.

## Phase 1: foundation, Chat, System (2026-11-15)

Uses only endpoints that exist in today's gateway (`/health`, `/v1/models`, `/v1/system`,
`/v1/chat/completions`, and `/v1/models/unload` as a side-effect-free admin token check).

- Vite + React + TypeScript (strict) + Tailwind. Base path `/ui/`. The dev proxy forwards `/v1`,
  `/metrics` and `/health` to `QUBIVEX_API` (default `http://127.0.0.1:8080`).
- App shell: a sidebar that collapses to a drawer below 1024px, the header, runtime health
  polling with backoff, and path-based navigation (`/ui/chat`, `/ui/system`, …).
- Auth: an API key and an admin token, stored separately in sessionStorage, with an opt-in
  localStorage "remember" setting. Sent only as `Authorization: Bearer`. A 401 opens the
  matching key dialog. Settings can test each one.
- Chat: SSE streaming over fetch, stop (aborting the fetch cancels the generation on the
  server), retry, interrupted and in-stream error states, markdown with highlighted code,
  copy, collapsible `<think>` blocks, per-model generation settings, and conversation
  history in memory.
- System: runtime, CPU, memory, accelerators (CUDA, Vulkan, Metal), storage, OS, and loaded
  models with their memory against the plan. `Probed` unknowns show as "—" with the reason.
  Version, uptime and configuration are marked unavailable, because the gateway does not
  report them yet.
- Tests: 40 (Vitest + Testing Library), using fixtures captured from `qubivex serve` with
  qwen2.5-0.5b-instruct.
