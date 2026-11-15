# 05 — Implementation plan

Work in phases. Each phase ends with its checklist done, its tests green and a short note in
`CHANGELOG.md`. Each phase says which repo it touches.

Before any phase, **re-verify the inventory** in 01 against the current `qubivex` `main`:
`grep -n '\.get(\|\.post(\|\.delete(' crates/qubivex-api/src/lib.rs`.

## Phase 0: capture fixtures (both repos, ~1 h)

Run a real server and save payloads into `qubivex-ui/test/fixtures/`:

```sh
qubivex serve --model <small model> --admin-token dev-admin &
curl -s localhost:8080/v1/system        > test/fixtures/system.json
curl -s localhost:8080/v1/models        > test/fixtures/models.json
curl -s localhost:8080/metrics          > test/fixtures/metrics.txt     # after a few chats
curl -sN localhost:8080/v1/chat/completions -H 'content-type: application/json' \
  -d '{"model":"<id>","messages":[{"role":"user","content":"hi"}],"stream":true,"stream_options":{"include_usage":true},"max_tokens":16}' \
  > test/fixtures/chat-stream.txt
qubivex models list --json              > test/fixtures/cli-models-list.json
qubivex models analyse <id> --json      > test/fixtures/cli-analyse.json
qubivex system --json                   > test/fixtures/cli-system.json
```

Write `src/types/api.ts` from these, not from memory.

## Phase 1: foundation, Chat, System (qubivex-ui only): done

- [ ] `npm create vite` (react-ts). Add Tailwind, lucide-react, react-markdown, remark-gfm,
      rehype-highlight, Vitest and Testing Library. Set `base: '/ui/'` and the proxy (02 §4).
- [ ] Design tokens and base styles (02 §10).
- [ ] `services/api.ts`, `auth.ts`, `sse.ts`, `chat.ts`, `system.ts`.
- [ ] Shell: sidebar, header, collapsible drawer, path-based page switch, `/health` polling.
- [ ] Auth dialog and Settings page. Detect open vs keyed servers (02 §5).
- [ ] Chat page (04): streaming, stop, retry, markdown, copy, settings, error states.
- [ ] System page: runtime and hardware cards. The config card shows "needs admin" until Phase 3.
- [ ] Tests:
  - `api.ts`: headers, error parsing, timeout, 401 event, network error
  - `auth.ts`: storage, clear, never in a URL
  - `sse.ts`: CRLF, chunk boundaries splitting lines and UTF-8 code points, `[DONE]`
  - `chat.ts`: deltas, finish, usage, in-stream error, abort → stopped
  - Chat rendering with a mocked `fetch` stream from `chat-stream.txt`
  - System renders `Probed` unknowns as "—"

**Done when:** against a real `qubivex serve`, you can chat with streaming, stop mid-reply,
see an auth error and recover by entering the key, and see the System page with real hardware.

## Phase 2: Metrics (qubivex-ui only): done

- [ ] `utils/prometheus.ts` parser, `utils/rates.ts` (rates, window means, bucket quantiles,
      reset handling).
- [ ] `usePolling` with pause, resume and interval. Ring buffer. Reset.
- [ ] Cards and the five charts (04). Unavailable vs zero vs not-yet-computable.
- [ ] Tests:
  - parser on `metrics.txt`
  - rates with a counter reset
  - quantile from synthetic buckets
  - the polling hook with fake timers (pause stops fetches)
  - the metrics 404 panel

**Done when:** running a chat shows tokens/s and TTFT moving, and pausing freezes the charts.

## Phase 3a: Models, using existing endpoints (qubivex-ui): done

- [ ] Installed tab in fallback mode (loaded models from `/v1/system`).
- [ ] Load (long timeout plus state polling) and Unload with admin auth. Handle 401, 403 and 409.
- [ ] Capability detection (02 §9). Admin-only panels show `Unavailable` on older servers.
- [ ] Tests: inventory rendering, load→loading→loaded flow with a mocked API,
      `admin_disabled` handling.

## Phase 3b: backend additions (qubivex repo; separate PR or PRs)

Order, in small PRs:

1. **D1 refactor**: move list/summary/inspect/verify/analyse data builders out of `apps/cli`
   into a shared module. The CLI output stays byte-identical, so its existing tests
   (`apps/cli/tests/*`) must pass unchanged.
2. `/v1/system` additive fields, and `/v1/admin/config`.
3. `GET /v1/admin/models/installed[/{id}]`, `DELETE /v1/admin/models/installed/{id}`,
   `POST /v1/admin/models/analyse`.
4. `GET /v1/admin/models/search`.
5. Job manager, then pull, verify, jobs routes and SSE.
6. Docs: update `docs/serving/http-api.md` and add an ADR-013 amendment for the admin model API
   and job manager.

Test as described in 03 §5. Run `cargo test --workspace` and clippy at every PR.

## Phase 3c: Models, full (qubivex-ui)

- [ ] Installed tab on the admin inventory. Details, Verify, Analyse and Delete drawers and dialogs.
- [ ] Discover tab, Pull dialog.
- [ ] Jobs tab: SSE client for named events (extend `sse.ts` to yield `{event, data, id}`),
      reconnect with snapshot resync, cancel and retry.
- [ ] Tests:
  - pull progress rendering from a scripted SSE
  - cancel
  - retry
  - failed state
  - delete confirmation requires the typed id
  - unload vs delete separation

## Phase 4: binary integration (qubivex repo + CI)

- [ ] The `ui` feature with rust-embed, the `/ui` routes, headers and build check (03 §4).
- [ ] CI job that builds `qubivex-ui` and then `qubivex --features ui`.
- [ ] Manual test against the release binary:
  - `/ui` redirects
  - deep-link reload on `/ui/models` works
  - a missing asset → 404
  - `/v1/*` unaffected
  - no Node process running
- [ ] Add a "Web interface" section to the `qubivex` README: build with `--features ui`,
      open `http://localhost:8080/ui`, and set the keys in Settings.

## Phase 5: multimodal (blocked)

Blocked until `crates/qubivex-api/src/openai.rs` accepts non-text content parts and
`capabilities.multimodal` is true. Then extend `ContentPart` and the composer to match the
real contract. See `docs/MULTIMODAL_RUNTIME.md` in `qubivex` for the engine plan.

## End-to-end check (after Phase 4)

Script it with Playwright (optional dev dependency) or run it by hand:

1. Start `qubivex serve --api-key K --admin-token A` with a fixture model.
2. Open `/ui`, enter K, and confirm the model list loads.
3. Chat, and confirm tokens stream in. Stop mid-reply.
4. Open Metrics and confirm tokens/s is greater than 0.
5. Enter A. Unload, then load the model.
6. Pull a tiny repository (or point a fake provider via `HF_ENDPOINT` at a local mock), and
   watch the progress through to success.
7. Verify, analyse and delete it.

## Final delivery report template

When done, report under these headings. Mark each item **Fully implemented**,
**Partially implemented**, **Not implemented** or **Blocked (missing backend)**, and claim
only what was tested:

1. Summary
2. Directory structure
3. Existing endpoints reused
4. New endpoints
5. Backend changes
6. Auth
7. Embedding
8. Tests run, with results
9. Known limitations
10. Remaining tasks

## Known limitations (expected even when everything is done)

- No CPU or GPU utilisation percentages (not measured by the server). See 03 §3.9.
- Search cannot filter by architecture, family or hardware (the provider gives none of that).
- Chat streams cannot resume after a drop. Retry re-generates.
- Load is a long synchronous request. Closing the tab does not cancel it.
- Text-only chat.
