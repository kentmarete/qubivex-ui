# qubivex-ui

The web management interface for the [Qubivex](../qubivex) inference runtime. It offers
chat, live metrics, model management and system information. It is a static React app that
the `qubivex` binary embeds and serves at `http://localhost:<port>/ui`.

> Status: **Phases 1–2 done**: shell, auth, Chat (streaming), System and Metrics, against
> today's gateway. Models (Phase 3) shows a "not built yet" panel. See
> [CHANGELOG.md](CHANGELOG.md) and [the plan](docs/05-implementation-plan.md).

## Docs

| Doc | What it answers |
|---|---|
| [01 — API inventory](docs/01-api-inventory.md) | What the gateway offers today (routes, auth, SSE format, metrics), and what is EXISTING / PARTIAL / MISSING |
| [02 — Frontend architecture](docs/02-frontend-architecture.md) | Repo layout, stack, dev proxy, auth, API client, SSE reader, metrics parsing, design tokens |
| [03 — Backend changes](docs/03-backend-changes.md) | Exact specs for the new admin endpoints, the pull/verify job manager and `/ui` embedding, for the `qubivex` repo |
| [04 — Pages](docs/04-pages.md) | Each page: data sources, behaviour, empty and error states |
| [05 — Implementation plan](docs/05-implementation-plan.md) | Phases, checklists, tests, definition of done, report template |

## Key facts (details in the docs)

- The UI lives **here**, in a separate repo. `qubivex` embeds the built `dist/` at compile
  time (`QUBIVEX_UI_DIST`, feature `ui`). Production has one binary and no Node.
- Auth uses `Authorization: Bearer`, with two separate secrets: the **API key** (`/v1/*`) and
  the **admin token** (load, unload and every `/v1/admin/*` route).
- Chat streams use OpenAI-style SSE (`data:` lines, `[DONE]`). Errors can arrive inside the
  stream. To stop a generation, abort the fetch.
- `DELETE /v1/admin/models/{id}` already means **unload**. Deleting files uses a new path.
- No CPU or GPU utilisation metrics exist. Show them as unavailable, never as 0.
- The engine is text-only. Show no upload controls.

## Dev workflow

```sh
# terminal 1, in ../qubivex
cargo run -p qubivex-cli -- serve --model <id> --admin-token dev-admin
# terminal 2, here
npm install
npm run dev            # http://localhost:5173/ui/, proxies /v1, /metrics, /health to :8080
# QUBIVEX_API=http://host:port npm run dev   to target another server
npm test               # vitest, against payloads captured from a real server (test/fixtures)
npm run typecheck
npm run build          # → dist/ (static files, base /ui/)
```
