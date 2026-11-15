# Changelog

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
