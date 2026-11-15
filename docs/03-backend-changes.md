# 03 — Backend changes (in the `qubivex` repo)

Everything here is **additive**. No existing route, payload or status code changes. All new
routes live in `crates/qubivex-api` and follow its conventions:

- They are registered in `Gateway::app()`.
- They are wrapped in `st.finish(endpoint, &rid, began, r)` (request id, metrics, log).
- They return OpenAI-shaped `ApiError` values. Error **messages** never contain file paths.
- Blocking work runs in `spawn_blocking` or on dedicated threads, never on Tokio workers.
- New third-party dependencies are declared once in `[workspace.dependencies]` (ADR-001) and
  recorded as an amendment to ADR-013.

## 1. Design decisions to confirm before coding

| # | Decision | Recommendation | Why |
|---|---|---|---|
| D1 | Where CLI logic is shared | Move the data-producing parts of `apps/cli/src/models.rs` (`discover`, `summary`, file and expert verification) and `analyse.rs` (the `Report` build) into a library module, e.g. `qubivex_runtime::ops`, returning `serde::Serialize` structs. The CLI keeps only the text rendering | The task forbids duplicating CLI code. Today these functions are `pub(crate)` and return `String` |
| D2 | Removing files vs unloading | New path `DELETE /v1/admin/models/installed/{id}`. Leave `DELETE /v1/admin/models/{id}` as unload | That path is already the unload alias (01 §1) |
| D3 | Long operations | One generic **job manager** for `pull` and `verify`. Routes live under `/v1/admin/jobs` | Verifying a large model reads every file (minutes). One lifecycle, one SSE stream, one UI component |
| D4 | Paths in responses | Directory paths only on **admin** routes | The gateway promises that errors carry no paths. `/v1/system` is reachable with an ordinary key |
| D5 | Load stays synchronous | Keep `POST /v1/models/load` as is. The UI uses a long timeout and polls `/v1/system` `model_states` (`loading`) | No contract change needed |

## 2. Route table (new)

All routes under `/v1/admin` use `check_admin` (admin token). The `/v1/system` additions use `check_key`.

| Method and path | Auth | Returns |
|---|---|---|
| `GET /v1/system` (additions) | API key | `version`, `uptime_seconds`, `capabilities` |
| `GET /v1/admin/config` | admin | Non-secret serve settings, model dirs |
| `GET /v1/admin/models/installed` | admin | Installed models (on disk) |
| `GET /v1/admin/models/installed/{id}` | admin | Inspect one |
| `DELETE /v1/admin/models/installed/{id}` | admin | Delete files |
| `GET /v1/admin/models/search?q=&limit=` | admin | Hugging Face search |
| `POST /v1/admin/models/analyse` | admin | Fit / memory report |
| `POST /v1/admin/models/pull` | admin | 202 + job |
| `POST /v1/admin/models/verify` | admin | 202 + job |
| `GET /v1/admin/jobs` | admin | All jobs |
| `GET /v1/admin/jobs/{id}` | admin | One job |
| `GET /v1/admin/jobs/{id}/events` | admin | SSE progress |
| `DELETE /v1/admin/jobs/{id}` | admin | Cancel |
| `POST /v1/admin/jobs/{id}/retry` | admin | 202 + new job |

Search is admin-only because it makes the server send outbound requests, which is an operator
decision.

## 3. Endpoint specifications

### 3.1 `GET /v1/system`: additive fields

```jsonc
{
  "...existing fields...": "unchanged",
  "version": "0.1.0",                     // env!("CARGO_PKG_VERSION") of qubivex-api, or the CLI's build version passed in ServerConfig
  "uptime_seconds": 8412,                 // from Gateway creation
  "capabilities": {
    "admin": true,                        // admin_token configured
    "model_management": true,             // the routes in this document exist
    "metrics": true,                      // cfg.metrics_enabled
    "multimodal": false,                  // stays false until the engine accepts non-text parts
    "web_ui": true                        // built with the `ui` feature
  }
}
```

Implementation: add `started: Instant` and `version: String` to `AppState`, and add
`version: Option<String>` to `ServerConfig`. The CLI sets it from its build info
(`apps/cli/build.rs`).

### 3.2 `GET /v1/admin/config`

```json
{
  "object": "config",
  "listen": "127.0.0.1:8080",
  "model_dirs": ["/home/u/.qubivex/models"],
  "auth": { "api_key": true, "client_keys": 2, "admin": true, "allow_unauthenticated_remote": false },
  "limits": { "max_body_bytes": 4194304, "max_prompt_tokens": null, "max_generation_tokens": null,
              "default_max_tokens": 512, "max_concurrent": 4, "max_queue": 32,
              "queue_timeout_s": 30, "request_timeout_s": 600, "stall_timeout_s": 30 },
  "memory_policy": "queue",
  "rate_limit": null,
  "cors_origins": [],
  "engine": { "backend": "cpu", "profile": "performance", "threads": 8, "prefix_cache_mb": 0 }
}
```

The response **must not** contain `api_key`, `admin_token`, key hashes or client names. Add a
test that serializes a config holding secrets and asserts that none of them appear.

### 3.3 `GET /v1/admin/models/installed`

Built from `Registry::list()`/`reconcile()` over every `cfg.model_dirs` entry, plus
`ModelMetadata::load` (the CLI's `summary`), joined with the gateway's loaded set.

```jsonc
{
  "object": "list",
  "data": [{
    "id": "qwen3-0.6b",
    "name": "Qwen3 0.6B",
    "status": "ok",                         // ok | error
    "error": null,                          // message when status=error (no path)
    "install_state": "installed",           // registry InstallState.kind: downloading|validating|installed|download_failed|validation_failed
    "loaded": true,                         // also "loading" / "failed" from model_states
    "serve_ids": ["qwen3-0.6b"],            // ids it is served under
    "architecture": "transformer_dense 1.1",
    "format": "safetensors",                // manifest.weights.format
    "quantization": "q4_k" ,                // or null
    "layers": 28, "hidden": 1024, "vocab": 151936, "experts": 0, "experts_per_token": 0,
    "max_context": 40960,
    "bytes": { "total": 1503238553, "dense": 1503238553, "routed_experts": 0 },
    "source": { "kind": "huggingface", "repository": "Qwen/Qwen3-0.6B", "revision": "…" },
    "dir": "/home/u/.qubivex/models/qwen3-0.6b",
    "updated_at": 1794294609
  }]
}
```

`GET /v1/admin/models/installed/{id}` returns the same object plus `files: [{name, bytes}]`
and an optional `tensors` summary (`?tensors=true`), the equivalent of `models inspect --json`.
404 `model_not_found` if absent.

### 3.4 `GET /v1/admin/models/search?q=qwen&limit=20`

Calls `qubivex_model_download::search` in `spawn_blocking`, with a provider built as in
`apps/cli/src/pull.rs::provider()` (HF_ENDPOINT and HF_TOKEN from the **server's**
environment). Move `provider()` into the download crate or the shared ops module so both
sides use it.

```json
{ "object": "list", "query": "qwen", "data": [
  { "repository": "Qwen/Qwen3-0.6B", "downloads": 1234567, "likes": 512,
    "formats": ["safetensors"], "gated": false,
    "installed_as": ["qwen3-0.6b"] }
]}
```

`limit` is 1..=100, default 20. `q` is required and non-empty → otherwise 400 `invalid_request`
with `param: "q"`. A provider failure → 502 `upstream_error`, a new `ApiError` constructor
of type `server_error`, with a message that holds no URL or token. `installed_as` comes from
matching registry `source.repository`.

### 3.5 `POST /v1/admin/models/analyse`

Body (every field except `model` is optional; mirrors `models analyse`):
`{"model":"<installed id>","profile":"performance|balanced|saver","ram_fraction":0.8,"ram_budget":"8GiB","context":8192,"sequences":1}`

Response: the CLI's `Report`, serialized by the shared ops module (D1):

```jsonc
{
  "object": "analysis",
  "model": "qwen3-0.6b",
  "disk_bytes": 1503238553,
  "ram_total_bytes": 34359738368,           // null if unknown
  "ram_available_bytes": 21474836480,       // null if unknown
  "backends": [ { "name": "cpu", "device": null, "state": "available (the default)" },
                { "name": "vulkan", "device": "AMD Radeon …", "state": "whole layers, with --backend vulkan" } ],
  "assessment": { /* qubivex_memory Assessment: fits / reason / plan */ },
  "footprint":  { /* ModelFootprint */ }
}
```

Planning is CPU-only and fast, so this is synchronous, in `spawn_blocking`. Capture a real
`qubivex models analyse <id> --json` output into `qubivex-ui/test/fixtures/analyse.json`,
and pin the UI types to it.

### 3.6 Jobs: pull and verify

#### Create

`POST /v1/admin/models/pull`, with a body that mirrors `PullRequest`:
`{"repository":"Qwen/Qwen3-0.6B","files":[],"revision":null,"id":null,"name":null,"set":{}}`

`POST /v1/admin/models/verify`: `{"model":"qwen3-0.6b","record":false}`

Both answer **202 Accepted** with `location: /v1/admin/jobs/{id}` and the job object.

| Condition | Status, code |
|---|---|
| No model dirs configured | 409 `conflict` "the server has no models directory" |
| A pull for the same repository or target id is already running | 409 `conflict` (with `job_id` in the message) |
| `Registry::begin_install` → `InstallInProgress` (another process, e.g. the CLI) | 409 `conflict` |
| `AlreadyInstalled` | 409 `conflict`, "already installed; remove it first" |
| Max concurrent jobs (default 2) reached | 429 `too_many_requests` |
| Verify on an unknown id | 404 `model_not_found` |

#### Job object

```jsonc
{
  "object": "job",
  "id": "job-6af2c4c5-3",                  // same scheme as request ids
  "kind": "pull",                          // pull | verify
  "status": "running",                     // queued | running | validating | succeeded | failed | cancelled
  "model": "qwen3-0.6b",                   // target id when known
  "repository": "Qwen/Qwen3-0.6B",         // pull only
  "revision": "c1899de…",                  // after Planned
  "created_at": 1794294609, "started_at": 1794294609, "finished_at": null,
  "progress": {
    "bytes_done": 734003200, "bytes_total": 1503238553,
    "bytes_resumed": 0,                    // present at the start; excluded from the rate
    "rate_bps": 31457280,                  // smoothed over ~5 s; null until known
    "eta_seconds": 24,                     // null when rate is null or total unknown
    "files": [ { "name": "model.safetensors", "done": 734003200, "total": 1503238553 } ],
    "retrying": null                       // { file, attempt, delay_s, reason } while backing off
  },
  "result": null,                          // pull: { record, warnings, files }; verify: { ok, checked_files, checked_experts, mismatches:[{layer,expert,detail}], recorded: bool }
  "error": null,                           // { code, message } when failed
  "cancellable": true                      // verify: false unless the ops function takes a cancel flag
}
```

#### Events: `GET /v1/admin/jobs/{id}/events` (SSE)

- The first event is always `event: snapshot` with the full job object, so a client that
  connects late or reconnects is up to date at once.
- After that come named events, each with `data:` holding JSON and `id:` holding a
  per-job sequence number:
  `started`, `planned` (`{revision, files}`), `progress` (the `progress` object, **throttled to
  ≤ 4/s**), `retrying`, `validating`, `succeeded` (`{result}`), `failed` (`{error}`),
  `cancelled`.
- A terminal event closes the stream. A job that is already terminal sends `snapshot` and
  closes.
- A `: keep-alive` comment every 15 s.
- If the broadcast channel lags (`RecvError::Lagged`), send a fresh `snapshot` instead of the
  missed events.
- Reconnecting is safe and cheap. Because there is a snapshot, `Last-Event-ID` can be ignored.

The UI may also simply poll `GET /v1/admin/jobs/{id}` every second. SSE is the primary path.

#### Cancel / retry

- `DELETE /v1/admin/jobs/{id}` sets the job's `cancel: Arc<AtomicBool>`. The download crate
  checks it between chunks and retries. It answers 202 with the job, whose status becomes
  `cancelled` when the worker returns. Cancelling a terminal job → 409. Staged files are
  **kept** (the registry keeps them for a retry from the same source).
- `POST /v1/admin/jobs/{id}/retry` is only valid for `failed` or `cancelled` jobs. It creates
  a new job from the stored request. `pull` resumes from staging.

#### Job manager implementation

```rust
// crates/qubivex-api/src/jobs.rs
pub(crate) struct Jobs {
    inner: Mutex<BTreeMap<String, Arc<JobEntry>>>,   // never held across .await
    max_running: usize,                               // default 2
    retain: Duration,                                 // default 1 h for finished jobs; also cap 64 entries
}
struct JobEntry {
    snapshot: Mutex<JobView>,                         // serializable job object
    cancel: Arc<AtomicBool>,
    events: tokio::sync::broadcast::Sender<JobEvent>, // capacity 64
    request: JobRequest,                              // for retry
}
```

- **Threads:** run each job on `std::thread::Builder::new().name("qubivex-job-…")`.
  `qubivex_model_download` is blocking by design ("transfers run on plain threads"), so
  never put it on a Tokio worker.
- **Pull:** `Registry::open(cfg.model_dirs[0])` →
  `pull(&registry, &provider, &req, &opts, &arch, &cancel, &|p| entry.on_progress(p))`.
  `on_progress` updates the snapshot under its mutex, computes the rate the same way as
  `apps/cli/src/pull.rs::Meter` (share that code through D1 instead of copying it), and
  broadcasts at most 4 events per second. Terminal events are never throttled.
- **Safety against corruption:** the registry already guarantees it. `begin_install` takes a
  per-id file lock (`InstallInProgress`), files land in staging as `.part`, and `commit`
  validates and moves atomically. The manager's own same-id check only gives a nicer 409.
  Never write into a model dir directly.
- **After a successful pull:** run `reconcile` and (for MoE models) record the expert sums
  as the CLI does (`record_sums`). Do **not** auto-load.
- **Shutdown:** in `begin_shutdown`, set `cancel` on every running job.
- **Cleanup:** prune finished jobs older than `retain` whenever a job is created or listed.
- **Logs and metrics:** log `job_started`/`job_finished` with `job_id`, `kind`, `model` and
  `status`. Never log tokens or redirect URLs (the download crate already strips them). Optional:
  `qubivex_jobs_running` gauge and `qubivex_jobs_total{kind,status}` counter.

### 3.7 `DELETE /v1/admin/models/installed/{id}`

1. Is the model loaded under any serve id? → **409** `conflict`, "unload it first". The UI
   offers "Unload and delete" as two sequential calls. Never delete weights a running engine
   has mapped.
2. Find the registry that holds `id` across `cfg.model_dirs` (as CLI `models remove` does).
   Absent → 404 `model_not_found`.
3. `Registry::remove(id)` in `spawn_blocking`. It holds the install lock and refuses
   during an install (`InstallInProgress` → 409) and refuses symlinks (`Refused` → 409).
4. 200 `{"id","object":"model","files_deleted":true,"bytes_freed":N}`.

### 3.8 Load: no change

`POST /v1/models/load` blocks until the model is loaded. That is acceptable: it is bounded by
local disk reads, and concurrent loads of one model share one load. The UI:
sends it with a 10-minute timeout, shows the row as *loading*, and polls `/v1/system` every
second until `model_states[id]` is `loaded` or `failed`. If the browser tab closes, the
load continues on the server.

### 3.9 Optional, not required for the UI

- `qubivex_process_cpu_seconds_total` (standard Prometheus) would let the UI derive process
  CPU %. Today there is no CPU figure. Add it only if `qubivex-hardware` can read it safely on
  every OS.
- `qubivex_build_info{version}` gauge = 1.

## 4. Serving the UI from the binary

### 4.1 Mechanism

- Add `rust-embed` (features `interpolate-folder-path`, `mime-guess`) to
  `[workspace.dependencies]` and use it **only** in `qubivex-api` behind a cargo feature `ui`
  (off by default). Turn it on from `apps/cli` with a matching `ui` feature.
- `#[derive(RustEmbed)] #[folder = "$QUBIVEX_UI_DIST"] struct UiAssets;`
  `QUBIVEX_UI_DIST` is the absolute path to `qubivex-ui/dist` at **compile** time. In debug
  builds rust-embed reads from disk, which is handy for development. Release builds embed
  the files.
- If the feature is on but the variable is unset or the folder lacks `index.html`, a
  `build.rs` check fails the build with a clear message.

### 4.2 Routes

Add them in `Gateway::app()` when `cfg!(feature = "ui")`:

| Path | Behaviour |
|---|---|
| `GET /ui` | 308 → `/ui/` |
| `GET /ui/` | `index.html` |
| `GET /ui/{*path}` | The embedded file if it exists. Else if the last segment has an extension (`.js`, `.css`, `.png` …) → **404** (plain text, so a broken asset is never answered with HTML). Else → `index.html` (SPA fallback for `/ui/chat` etc.) |
| `GET /` | Unchanged (404). Optionally 307 → `/ui/`, as a separate decision |

Headers:

- `content-type` from mime-guess.
- `assets/*` (hashed names): `cache-control: public, max-age=31536000, immutable`.
- `index.html`: `cache-control: no-cache`.
- On every `/ui` response:
  `content-security-policy: default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'`,
  `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.

`/ui` needs **no** auth, because the files contain no secrets and the API calls they make are
authenticated. It is not counted against the `/v1` rate limit. Without the `ui` feature,
`/ui` keeps answering the normal JSON 404.

### 4.3 Build and release

```sh
# in qubivex-ui
npm ci && npm run build            # → dist/
# in qubivex
QUBIVEX_UI_DIST=$PWD/../qubivex-ui/dist cargo build --release -p qubivex-cli --features ui
```

Release CI checks out both repos (or downloads a `qubivex-ui` release tarball pinned by
tag), builds `dist/`, then builds the binary. The binary never needs Node.

## 5. Backend tests (in `crates/qubivex-api/tests/`)

Use the existing harness in `tests/common/mod.rs` (fixture models) and a **fake
`ModelProvider`** for pulls. Never hit Hugging Face in tests.

- Admin auth: every new admin route → 403 `admin_disabled` without a token, 401 with the API
  key, 200/202 with the admin token.
- `/v1/system` has `version`, `uptime_seconds`, `capabilities`. `/v1/admin/config` contains no
  secret (assert on a config holding `api_key`, `admin_token` and client keys).
- Installed list shows fixture models, with `loaded` matching the gateway.
- Pull: create → 202 → events `snapshot, started, planned, progress…, validating,
  succeeded`. The model then appears in the installed list.
- Pull cancel mid-transfer → `cancelled`. The model is absent, staging is kept, and a
  retry resumes (`bytes_resumed > 0`).
- Pull failure (provider error) → `failed` with a path-free message.
- Concurrency: two pulls of the same id → the second gets 409. Pulls of different ids both
  succeed. A third pull above `max_running` → 429.
- Verify: an intact fixture → `ok: true`. Flip a byte in an expert → `mismatches` non-empty.
- Remove: loaded → 409. Unloaded → files gone, registry record gone. Unknown → 404.
- UI serving (feature `ui`, with a tiny test `dist/`): `/ui/chat` → index.html, a missing
  `/ui/assets/x.js` → 404, `/ui` → 308, `/v1/models` unaffected.
- Run the full existing suite: `cargo test --workspace`, and `cargo clippy --workspace --all-features -- -D warnings`.
