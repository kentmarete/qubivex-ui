# Changelog

## Models: download from the hub through the server (2026-11-19)

Needs the qubivex server change that adds `/v1/admin/models/search`, `/v1/admin/models/pull`,
`/v1/admin/jobs` and `capabilities.model_downloads` (qubivex ADR-013 amendment 8), and a
server started with an admin token. Older servers keep the "not built yet" panels.

- Discover searches Hugging Face through the server and shows downloads, likes, formats,
  gated repositories and what is already installed (with Load). Download opens a dialog for
  the weight file (for multi-GGUF repositories), the id, config values the checkpoint lacks,
  and whether to load the model when it finishes, at which context.
- Jobs lists the server's downloads with a progress bar, size, speed and time left, retry
  notices, the failure message, and Cancel, Retry and Load. It polls every second while a
  job runs.
- A load that fails because the model is not on the server now says so. For an
  `owner/name` (a hub repository) the notice offers Download, which downloads and then loads
  it; for any other name it points at Discover.

## Generation settings: max tokens and context length (2026-11-19)

Needs the qubivex server change that adds `context` to `POST /v1/models/load` and `limits`
to `/v1/system`. Older servers ignore `context` and report no limits; the page still works.

- Settings has a Generation card: the default max tokens a chat starts with, and the context
  length sent when loading a model. Both are kept in this browser. It shows the server's
  limits (`--default-max-tokens`, `--max-generation-tokens`, `--max-prompt-tokens`,
  `--context`) and each loaded model's context, and refuses a default above the server cap.
- The Load dialog has a Context length field, prefilled from Settings; empty leaves it to
  the server. Retry and Load from the inventory use the Settings value.
- Chat settings cap max tokens at the smaller of the model's context and the server cap,
  and Reset returns to the Settings defaults.

## Chat: Monaco code blocks (2026-11-19)

No backend changes.

- Fenced code blocks in a completed reply render as read-only Monaco editors: line numbers,
  folding, find, multi-cursor, bracket matching. Each block has a header with its language
  and a Copy button.
- While a reply streams, blocks stay as highlight.js text; they switch to Monaco when the
  reply completes, at the same height, so the layout does not jump.
- Editors size to their content up to 600px, then scroll; the page keeps scrolling when a
  block has nothing to scroll.
- Monaco (`monaco-editor` 0.57.0) is bundled locally, not loaded from a CDN, and lazy-loaded
  in its own chunk (~3.4 MB, ~874 KB gzip) on the first completed code block. Only the core
  editor, a few features and the Monarch grammars are included; the TypeScript, CSS and
  HTML language services are not. JSON diagnostics are off.
- Fence tags are mapped to Monaco languages (`py`, `ts`, `sh`, `yml`, ...); unknown or
  missing tags show as plain text. If Monaco fails to load, the block falls back to the
  highlighted text.

## Phase 3a: Models with load and unload (2026-11-15)

Uses only existing routes: `/v1/system`, `POST /v1/models/load`, `POST /v1/models/unload`.
No backend changes. Checked against `qubivex serve` (qwen2.5-0.5b-instruct, qwen3-0.6b).

- Models page with Installed, Discover and Jobs tabs.
- Installed, in fallback mode: the runtime's models from `/v1/system` (state, backend,
  architecture, context, slots, queue, memory against the plan), with the banner "Showing
  loaded models only".
- Load (by installed id or server directory, optional serve-as id) with a 10-minute
  timeout. The row shows *loading* at once with elapsed time, and `/v1/system` is polled
  every second until the server reports `loaded` or `failed` (5 s otherwise). A load that
  times out or loses the connection is reported as possibly still running on the server.
- Unload behind a confirm dialog that says what happens to running and waiting requests and
  that files stay on disk. The notice reports the `draining` count. Models unloaded this
  session stay listed with a one-click Load.
- Failed loads show Retry (re-sends the original `model`) and Clear (unloads the entry).
- Load and unload state lives outside React, so leaving the page during a long load loses
  nothing. Chat's model list refreshes after each action.
- Admin access is checked up front (the side-effect-free unload probe from Phase 1):
  accepted, missing, rejected, or disabled on the server. Actions are disabled with the
  reason unless the token is accepted; a 401 opens the admin token dialog; a 403
  `admin_disabled` from any action disables the rest. 409 and other errors show message,
  code and request id.
- Capability detection: `capabilities` from `/v1/system` when present, else a probe of
  `GET /v1/admin/models/installed`. Today's gateway answers that with **405** (the path
  matches `DELETE /v1/admin/models/{id}`), not the 404 docs/02 assumed; both now mean
  "unavailable". Discover and Jobs show an `Unavailable` panel.
- Tests: 74 in all, 16 of them new.

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
