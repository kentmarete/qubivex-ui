# 04 — Page specifications

Each page lists its **data sources**, using the inventory in [01](01-api-inventory.md).
A feature whose source is MISSING on the connected server is shown as an `Unavailable`
panel ("Needs Qubivex with model management, see docs/03"). Never use placeholder data.

General rules:

- Every value has three states: **known**, **unknown/not reported** (show "—" plus a
  tooltip explaining why), and **loading** (skeleton). Zero is a known value.
- Bytes are shown in binary units (GiB/MiB), matching the CLI's `Bytes` display.
- Every error panel shows the message, the `code` and the `x-request-id`.

## Shell

**Sidebar**

- Logo and "Qubivex".
- Runtime status dot:
  - green: `/health` ok.
  - amber: ok but 0 models, or a model `failed`.
  - red: unreachable.
- Navigation: Chat, Metrics, Models, System, Settings.
- Footer:
  - API connection: "Connected · open", "Connected · key", or "Disconnected".
  - Version, if `/v1/system.version` is present.
  - Active model, the one selected in Chat.

**Header**

- Page title.
- Connection badge.
- On Chat, the model selector.
- Key button, which opens the Auth dialog.
- Theme toggle, only if light mode ships.

**Polling**

- `/health` every 5 s. On failure, back off: 5 → 10 → 30 s.

## Chat (`/ui/chat`)

Sources: `GET /v1/models` (selector), `POST /v1/chat/completions` with `stream:true`.

- **Model selector**: loaded models only. If none are loaded, show an empty state. When an
  admin token is configured, it links to Models with "Load a model".
- **Settings popover**:
  - temperature (0–2, step 0.05, default 0.7)
  - max tokens (1 to server cap, default 512)
  - top_p
  - top_k
  - seed
  - system prompt (optional)
  - Persist these per model in localStorage, inside try/catch.
- **Transcript**: user messages right-aligned and plain. Assistant messages are full-width
  markdown with code highlighting and a copy button on each code block. Every assistant
  message also has "Copy response". A `<think>…</think>` block renders as a collapsed
  "Reasoning" disclosure.
- **Composer**: Enter sends, Shift+Enter adds a newline. While streaming, the Send button
  becomes **Stop**, which aborts the fetch.
- **Message footer** (after the stream ends):
  - finish reason ("stopped: length" in amber)
  - completion tokens
  - tokens/s, computed client-side from the first delta to the end; label it "client-measured"
  - TTFT, the time from send to the first delta
  - cached tokens, if > 0
- **Toolbar**:
  - New conversation, which starts fresh and keeps the old one in memory.
  - Clear conversation, which asks for confirmation.
  - Conversations live in memory only. sessionStorage persistence is optional.
- **Errors**:
  - pre-stream HTTP error → an error bubble with a Retry button
  - in-stream error event → the partial text plus an error footer
  - dropped connection → "interrupted" plus a Retry button
  - 429 → show `retry-after`
- **Attachments**: hidden. Render the attachment button only when
  `capabilities.multimodal === true`.

## Metrics (`/ui/metrics`)

Sources: `GET /metrics` (Prometheus), `GET /v1/system` (host RAM, GPU names, placement).

Controls:

- interval: 1, 2, 5, 10 or 30 s (default 2 s)
- Pause/Resume
- Reset history
- "Last updated hh:mm:ss"; amber if it is older than 3× the interval
- Model filter: all models, or one `model` label

**Stat cards**

- Tokens/s (aggregate)
- TTFT (window mean / p95)
- Decode latency (inter-token mean / p95)
- Prompt tokens/s
- Active generations
- Queue depth / free slots
- Requests total
- Failed / cancelled / timed-out generations
- Process RSS / peak
- Per model: memory dense, expert cache, KV and activations, against the budget, as a stacked bar
- VRAM used/capacity: only when `qubivex_vram_*` series exist, otherwise the card is absent
- CPU utilisation: **"Not reported by this server"**
- GPU utilisation: **"Not reported by this server"**

**Charts (Recharts, 5-minute window by default)**

1. Tokens/s over time: aggregate, plus per-model lines from the
   `generation_tokens_per_second` window means.
2. Decode latency (inter-token mean and p95) and TTFT.
3. Memory: process RSS, and per-model ledger bytes against the budget. CPU % is shown only if
   `qubivex_process_cpu_seconds_total` exists (03 §3.9).
4. GPU memory: VRAM used against capacity, only when present.
5. Request throughput: requests/s by status class (2xx/4xx/5xx), from
   `qubivex_requests_total`.

Gaps (`null`) are drawn as breaks, never interpolated to 0. A `/metrics` 404 → a full-page
"Metrics are disabled on this server (--no-metrics)" panel.

## Models (`/ui/models`)

Tabs: **Installed** · **Discover** · **Jobs**. Admin actions are disabled, with an
explanation, when no admin token is set or the server reports `admin_disabled`.

### Installed

Sources:

- The admin `GET /v1/admin/models/installed` if available.
- Otherwise, a fallback table of **loaded** models from `/v1/system.models` (architecture,
  placement, context, memory), with a banner: "Showing loaded models only. On-disk inventory
  needs model management."

Columns:

- name/id
- architecture
- format
- quantization
- size
- memory estimate (from analyse, loaded lazily per row)
- install state
- runtime state: unloaded, loading, loaded or failed
- location (admin only)

Row actions:

| Action | Call | Notes |
|---|---|---|
| Load | `POST /v1/models/load {model}` | 10-min timeout; poll `/v1/system` until loaded or failed |
| Unload | `POST /v1/models/unload {model}` | Toast shows `draining` count |
| Details | `GET /v1/admin/models/installed/{id}` | Drawer: metadata, files, source |
| Verify | `POST /v1/admin/models/verify` → job | Result in drawer: ok / mismatches list |
| Analyse | `POST /v1/admin/models/analyse` | Drawer: RAM/VRAM available vs needed, backends, fits?, recommended backend; profile/context/sequences inputs |
| Delete files | `DELETE /v1/admin/models/installed/{id}` | Red. Confirm dialog requires typing the model id. Copy: "This deletes N GiB from disk. Unloading only frees memory." If the model is loaded, offer "Unload, then delete" |

Keep **Unload** (neutral, memory) and **Delete files** (danger, disk) visually and spatially
separate. Delete lives in an overflow menu.

### Discover

Source: `GET /v1/admin/models/search?q=`.

- Debounced search box (400 ms).
- Results show repository, downloads, likes, formats and a gated badge. An "Installed" badge
  appears when `installed_as` is non-empty.
- Architecture, family and hardware filters are **not** offered, because the API does not
  provide that data (01 §7). Show the note: "Compatibility is checked after download (Analyse)."
- Pull dialog fields:
  - repository (prefilled)
  - optional revision
  - files (needed for multi-GGUF repos; on 400, show the server's message, which names the
    candidates)
  - id
  - name
  - `set` key=value pairs (advanced)
  - Submitting switches to Jobs.

### Jobs

Sources: `GET /v1/admin/jobs`, plus `GET /v1/admin/jobs/{id}/events` for each running job.

Each job card shows:

- kind
- model/repo
- status badge: running (green), validating (green), retrying (amber), failed (red),
  cancelled (muted), succeeded (green check)
- progress bar
- done/total
- speed
- ETA, shown only when `eta_seconds` is not null
- a per-file breakdown, collapsible

Actions:

- Cancel (running pull)
- Retry (failed/cancelled)
- "Load now" (succeeded pull)

If the SSE stream drops, reconnect with backoff (1, 2, 5, 10 s). The first `snapshot` event
resyncs the card. Stop when the job is terminal. This reconnection is safe, unlike chat.

## System (`/ui/system`)

Sources: `GET /v1/system` and, with admin, `GET /v1/admin/config`. Read-only. Refresh every
10 s plus a manual refresh button.

- **Runtime**:
  - version
  - uptime
  - API status
  - generations active
  - models loaded / draining
  - per-model placement (the execution backend) and model states
- **Hardware** (`hardware`, `Probed` aware):
  - CPU model, cores (performance/efficiency)
  - RAM total/available, cgroup limit
  - GPUs: per backend, availability or the reason it is unavailable, and devices with memory.
    This is where Vulkan availability comes from.
  - storage
  - OS
- **Configuration** (admin only):
  - model dirs, limits, engine backend/profile, memory policy, CORS origins, auth mode
  - Secrets are never present in the payload, and the UI does not ask for them.
- Without an admin token, the configuration card reads: "Provide an admin token to view
  server configuration."

## Settings (`/ui/settings`)

- API key: set, clear, and a "Test" button (`GET /v1/models`). Mask it; reveal only while
  the eye icon is pressed.
- Admin token: set, clear, and Test (`GET /v1/admin/jobs` → 200; 401 → wrong; 403 → disabled).
- Remember on this device (localStorage), off by default.
- API base (dev only, hidden in production builds).
- Metrics default interval.
