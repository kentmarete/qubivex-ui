# 01 — API capability inventory

Source of truth: the `qubivex` repo at commit `345dcfa` (`crates/qubivex-api/src/lib.rs`,
`docs/serving/http-api.md`, `docs/serving/streaming.md`, `apps/cli/src/*`). Re-check
this file against the gateway's route table (`Gateway::app()` in
`crates/qubivex-api/src/lib.rs`) before starting each phase.

Status legend:

- **EXISTING**: implemented and usable by the UI as is.
- **PARTIAL**: implemented, but missing something the UI needs.
- **MISSING**: needs backend work in `qubivex` (specified in [03-backend-changes.md](03-backend-changes.md)).

## 1. HTTP routes that exist today

| Method and path | Auth | Status | UI use |
|---|---|---|---|
| `GET /health` | none | EXISTING | Connection indicator. Returns `{"status":"ok","models":<loaded count>}` |
| `GET /metrics` | none | EXISTING | Metrics page (Prometheus text, parsed client-side) |
| `GET /v1/system` | API key | PARTIAL | System page and per-model runtime state. No version, uptime, config or storage dirs (see §4) |
| `GET /v1/models` | API key | PARTIAL | Chat model selector. Lists **loaded** models only, as bare OpenAI cards `{id, object, created, owned_by}` |
| `GET /v1/models/{id}` | API key | EXISTING | Same card for one model; 404 `model_not_found` if not loaded |
| `POST /v1/chat/completions` | API key | EXISTING | Chat, `stream: true` |
| `POST /v1/completions` | API key | EXISTING | Not used by the UI |
| `POST /v1/models/load` | admin token | EXISTING | Load. Body `{"model":"<id or dir>","id"?:"<serve-as id>"}`. 201 first load, 200 already loaded, 409 if the dir is loaded under another id. **Blocks until loaded** |
| `POST /v1/models/unload` | admin token | EXISTING | Unload. Body `{"model":"<id>"}` → `{"id","object":"model","deleted":true,"draining":N}` |
| `POST /v1/admin/models` | admin token | EXISTING | Alias of load |
| `DELETE /v1/admin/models/{id}` | admin token | EXISTING | **Alias of unload. It does not delete files.** |

Anything else answers 404 `{"error":{"code":"not_found",...}}`.

> **Route conflict.** The original task proposed `DELETE /v1/admin/models/{id}` for
> deleting model files. That path already means *unload*. Changing it would break an
> existing contract. File removal therefore gets its own path (see 03, §3.7).

## 2. Authentication (EXISTING; the UI reuses it)

- Header: `Authorization: Bearer <token>`. It is the only header the gateway reads
  (`bearer()` in `lib.rs`). There are no cookies, no query-string keys and no sessions.
- **API key** (`--api-key` / `QUBIVEX_API_KEY`, or named `[[serve.client_keys]]`) is
  needed on every `/v1/*` route **except admin routes**. If no key is configured, `/v1`
  is open. The server allows that only on loopback unless started with
  `--allow-unauthenticated`.
- **Admin token** (`--admin-token` / `QUBIVEX_ADMIN_TOKEN`) is a *separate* secret, sent
  as the bearer **instead of** the API key on admin routes. The API key never grants admin
  access, and the admin token is not accepted as an API key unless it equals one.
  - No admin token configured → **403** `admin_disabled` (`permission_error`).
  - Wrong or missing admin token → **401** `invalid_api_key`.
- `/health` and `/metrics` never need a key and are never rate limited.
- CORS is off by default. Production is same-origin, so it is not needed. In development the
  Vite proxy keeps the browser same-origin.

**UI consequence:** the UI stores **two** optional secrets, the *API key* and the *admin
token*. It sends the admin token only on admin routes. See 02, §5.

## 3. Response and error shapes (EXISTING)

Errors are always OpenAI-shaped JSON and never contain file paths:

```json
{"error":{"code":"model_not_found","message":"the model \"nope\" is not loaded","param":"model","type":"invalid_request_error"}}
```

| Status | `code` | UI handling |
|---|---|---|
| 400 | `invalid_request`, `prompt_too_long` | Inline error on the form; `param` names the field |
| 401 | `invalid_api_key` | Open the key dialog (API key or admin token, depending on the route) |
| 403 | `admin_disabled` | "Admin operations are disabled on this server" (no retry) |
| 404 | `model_not_found` / `not_found` | Model gone (refresh list) / feature not available on this server version |
| 409 | `conflict` | Show the message |
| 413 | `request_too_large` | Show the message |
| 429 | `rate_limit_exceeded` (has `retry-after`), `too_many_requests` | Toast with the retry time |
| 500 | `internal_error` | Show the `x-request-id` so it can be found in server logs |
| 503 | `overloaded` | "Server busy or model unloading", retry allowed |
| 504 | `deadline_exceeded` | Show the message |

Every response carries `x-request-id`. Surface it in error details.

## 4. `GET /v1/system`: actual shape

```jsonc
{
  "object": "system",
  "hardware": { /* qubivex_hardware::HardwareProfile, same as `qubivex system --json` */
    "cpu": {...}, "memory": {...}, "gpus": [...], "storage": {...}, "os": {...}
  },
  "models": [{
    "id": "olmoe-tiny", "architecture": "transformer_moe", "max_context": 4096,
    "generation_slots": 4, "generation_slots_free": 4, "queue_depth": 0, "queue_limit": 32,
    "kv_reserved_positions": 0,
    "prefix_cache": {"entries":1,"positions":256,"lookups":3,"hits":0,"tokens_reused":0,"evicted":0},
    "expert_cache_bytes": 196608, "plan_budget_bytes": 2827358622,
    "ledger_bytes": {"dense":134272,"expert_cache":196608,"kv":524288},
    "placement": "cpu"            // execution backend: cpu | metal | vulkan | sim
  }],
  "model_states": [{"id":"olmoe-tiny","state":"loaded"}],   // loading | loaded | failed
  "models_draining": 0,
  "generations_active": 0
}
```

Hardware values are `Probed<T>`, which serializes as `{"known": ...}` or `{"unknown": "<reason>"}`.
The UI must show unknown values as *unavailable*, never as 0. Capture a real payload with
`qubivex system --json` and commit it as a test fixture before writing the System page.

**Missing for the UI:** `version`, `uptime_seconds`, model directories, and the effective
serve configuration (non-secret parts). See 03, §3.1.

## 5. Chat streaming (EXISTING): exact SSE format

`POST /v1/chat/completions` with `"stream": true` returns `text/event-stream`. Each event
is a single `data:` line; there are no `event:` names and no `id:` fields.

```
data: {"id":"chatcmpl-req-…","object":"chat.completion.chunk","created":…,"model":"m","choices":[{"index":0,"delta":{"role":"assistant","content":""},"logprobs":null,"finish_reason":null}]}
data: {"…":"…","choices":[{"index":0,"delta":{"content":"Hello"},"logprobs":null,"finish_reason":null}]}
data: {"…":"…","choices":[{"index":0,"delta":{},"logprobs":null,"finish_reason":"stop"}]}      // or "length"
data: {"…":"…","choices":[],"usage":{"prompt_tokens":15,"completion_tokens":12,"total_tokens":27,"prompt_tokens_details":{"cached_tokens":0}}}   // only with stream_options.include_usage
data: [DONE]
```

Rules the client must follow:

1. **Errors before the stream starts** (auth, validation, queue full, memory) are normal HTTP
   errors with a JSON body. Check `response.ok` before reading the body as a stream.
2. **Errors after the stream starts** arrive as a `data:` event holding `{"error":{…}}`,
   followed by `data: [DONE]`. The parser must check every event for an `error` key.
3. `[DONE]` is always last, even after an error.
4. **Cancellation:** the server has no cancel endpoint. Aborting the fetch (`AbortController`)
   closes the connection, and the server stops generating within one token or prefill chunk.
   This is the supported way to stop a generation.
5. `finish_reason: "length"` also covers request timeout, context limit and server
   `--request-timeout`.
6. The reply is the model's raw text, including any `<think>…</think>` block. The UI may
   render a think block as collapsible, but must not strip it silently.
7. **No reconnection.** A dropped stream cannot be resumed (no event ids). Show the partial
   reply as *interrupted* and offer "Retry", which re-sends the same request.

Request fields the UI uses: `model`, `messages`, `stream: true`,
`stream_options: {include_usage: true}`, `temperature` (0–2), `top_p`, `top_k`,
`max_tokens` (server cap: `--max-generation-tokens`; above it is a 400), `seed`, `stop`.

**Multimodal: not supported.** `messages[].content` may be a string or a list of parts,
but any part whose `type` is not `"text"` is a 400 (`openai.rs`). The UI must **not** show
image or audio upload controls. Keep the message model extensible (02, §7).

## 6. `/metrics`: what exists

Prometheus text 0.0.4. Histograms have `_bucket{le=…}`, `_sum` and `_count`. Per-model
series carry `model="<id>"`. Full list: `crates/qubivex-api/src/metrics.rs` and
`docs/serving/http-api.md#get-metrics`.

| UI metric | Source | Derivation |
|---|---|---|
| Tokens/s (aggregate) | `qubivex_generated_tokens_total` | Δcounter / Δt between scrapes |
| Decode speed per generation | `qubivex_generation_tokens_per_second{model}` (histogram) | Δsum / Δcount over the window |
| Prompt throughput | `qubivex_prompt_tokens_per_second{model}` (hist), `qubivex_prompt_tokens_total` | Δsum/Δcount; Δcounter/Δt |
| Time to first token | `qubivex_time_to_first_token_seconds{model}` (hist) | window mean = Δsum/Δcount; p50/p95 from bucket deltas |
| Decode latency | `qubivex_inter_token_seconds{model}` (hist) | same |
| Queue wait | `qubivex_queue_wait_seconds{model}` (hist) | same |
| Total requests | `qubivex_requests_total{endpoint,status}` | sum; Δ/Δt for throughput |
| Active generations | `qubivex_generations_active` | gauge |
| Failed / cancelled / timed out | `qubivex_generations_{failed,cancelled,timed_out}_total` | counters |
| Queue | `qubivex_queue_depth`, `qubivex_generation_slots_free`, `qubivex_queue_{granted,rejected}_total` | gauges/counters |
| Model memory | `qubivex_memory_{dense,expert_cache,kv,activations,budget}_bytes{model}` | gauges |
| Process memory | `qubivex_process_resident_bytes`, `qubivex_process_peak_resident_bytes` | gauges; **absent** if the OS cannot say |
| GPU memory | `qubivex_vram_{used,peak,capacity,budget,dense,expert_cache}_bytes{model}` | **present only with a discrete device backend** (vulkan, sim) |
| Device transfers | `qubivex_device_*_total` | counters |
| Prefix / expert cache | `qubivex_prefix_cache_*`, `qubivex_expert_cache_*` | counters/gauges |

**Not exposed anywhere. Show "Not reported by this server", never 0:**

- CPU utilisation (%)
- GPU utilisation (%)
- System RAM used (the process RSS exists; host totals are in `/v1/system` `hardware.memory`)
- Vulkan device details (device names are in `/v1/system` `hardware.gpus`, not in `/metrics`)

Counters reset when the server restarts. If a counter goes down between two scrapes, treat it
as a reset: drop that delta and do not plot a negative rate.

`--no-metrics` makes `/metrics` a 404. Show "Metrics disabled on this server".

## 7. Model management: CLI vs HTTP

The CLI's implementations live in `apps/cli/src/{models,pull,analyse,plan}.rs` as
`pub(crate)` functions that **return formatted text**. The API cannot call them as they
are. The libraries underneath them are reusable.

| Capability | CLI | Library it uses | HTTP | Status |
|---|---|---|---|---|
| List loaded models | — | gateway state | `GET /v1/models`, `/v1/system` | EXISTING |
| List **installed** (on-disk) models with arch, quant, format, size | `models list --json` | `models::discover` + `summary` (CLI-private) | — | **MISSING** |
| Inspect a model | `models inspect --json` | `ModelMetadata::load` | — | **MISSING** |
| Load / unload | (serve `--model`) | gateway | `POST /v1/models/{load,unload}` | EXISTING (load blocks; see 03 §3.8) |
| Search Hugging Face | `models search --json` | `qubivex_model_download::search` → `SearchHit{repository,downloads,likes,formats,gated}` | — | **MISSING** |
| Pull | `models pull` | `qubivex_model_download::pull(registry, provider, req, opts, arch, &cancel, &progress)`: blocking, has cancel flag and `Progress` callback | — | **MISSING** (needs async job manager) |
| Verify | `models verify` | file checks + `ExpertSums` (CLI-private glue) | — | **MISSING** |
| Analyse / fit | `models analyse --json` | memory planner + `Assessment`, `ModelFootprint`, GPU backends (CLI-private `Report`) | — | **MISSING** |
| Remove files | `models remove --yes` | `Registry::remove(id)`: holds the install lock, moves to `.trash`, refuses during install | — | **MISSING** |
| Architectures | `models architectures` | `ArchitectureRegistry` | — | not needed by UI |

Search returns only `repository, downloads, likes, formats, gated`. "Search by
architecture/family" and "hardware compatibility" for **remote** models are not available.
Compatibility can only be computed for **installed** models (analyse). The UI search filters
by text only and links to *Analyse* after install.

Pull progress events (`qubivex_model_download::Progress`):
`Planned{revision, files:[(name,size)]}`, `File{file, done, total}` (`done` can go down after a
restart), `Retrying{file, attempt, delay, reason}`, `Validating`. Speed and ETA are derived,
as `apps/cli/src/pull.rs::Meter` does it: exclude resumed bytes from the rate.

## 8. Static asset serving

**None exists.** There is no `rust-embed`, `include_dir` or static file route in the
gateway. The gateway's fallback returns a JSON 404. See 03, §4.

## 9. Summary

| Area | Status |
|---|---|
| Chat (streaming, cancel) | EXISTING |
| Auth (API key + admin token) | EXISTING |
| Metrics | EXISTING (no CPU%/GPU%) |
| System info | PARTIAL (no version/uptime/config) |
| Loaded models, load/unload | EXISTING (load is synchronous) |
| Installed-model inventory, inspect | MISSING |
| Search, pull + progress + cancel | MISSING |
| Verify, analyse/fit, remove files | MISSING |
| Serving the UI from the binary | MISSING |
| Multimodal input | Not supported by the engine. Do not build it |
