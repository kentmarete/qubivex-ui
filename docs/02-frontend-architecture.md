# 02 — Frontend architecture

## 1. Repository split

The UI lives in its **own repository**, `qubivex-ui`, not under `apps/web` in `qubivex`.

| Repo | Contains |
|---|---|
| `qubivex-ui` (this repo) | React app, its tests, these docs. Produces `dist/`, a folder of static files |
| `qubivex` | Gateway endpoints, the pull job manager, and embedding `dist/` into the binary behind a cargo feature (03, §4) |

The two repos are coupled by:

1. **The HTTP API.** `qubivex-ui` targets a gateway version. Record the minimum one in
   `src/version.ts` (`MIN_API = "0.1.0"`) once `/v1/system` reports `version`.
2. **The build artefact.** `qubivex` embeds a built `dist/` from a path given at compile time
   (`QUBIVEX_UI_DIST`). Release CI builds this repo, then builds `qubivex` with that path.

Production still has one server and one binary. Node is needed only to build.

## 2. Stack

Vite + React 18 + TypeScript (strict) + Tailwind CSS + Recharts + lucide-react.
Navigation is internal page state synced to `location.pathname` with `history.pushState`.
There is no React Router.
Markdown: `react-markdown` + `remark-gfm`. Code highlighting: a ~50-line rehype plugin
(`src/components/chat/highlight.ts`) over `lowlight`'s `createLowlight` with 18 registered
languages. `rehype-highlight` always bundles lowlight's 37 "common" grammars.
Tests: Vitest + @testing-library/react + jsdom. Lint: ESLint + typescript-eslint.

Do not add Next.js, Redux, component frameworks (MUI, Chakra, Ant), axios or EventSource
polyfills. `EventSource` cannot send an `Authorization` header or a POST body, so streams use
`fetch` and `ReadableStream`.

## 3. Layout of this repo

```
qubivex-ui/
  index.html
  package.json
  vite.config.ts
  tsconfig.json
  tailwind.config.ts
  src/
    main.tsx
    App.tsx                 # shell + page switch
    version.ts
    components/
      layout/               # AppShell, Sidebar, Header
      common/               # Button, Dialog, Badge, Stat, EmptyState, ErrorPanel, ConfirmDialog, Unavailable
      chat/                 # MessageList, Message, Composer, ChatSettings, Markdown
      metrics/              # MetricCard, TimeSeriesChart, PollControls
      models/               # InventoryTable, ModelDetail, SearchPanel, PullJobs, VerifyResult, AnalyseResult
      system/               # RuntimeCard, HardwareCard, ConfigCard
    pages/                  # ChatPage, MetricsPage, ModelsPage, SystemPage, SettingsPage
    services/               # api.ts auth.ts chat.ts sse.ts models.ts metrics.ts system.ts
    hooks/                  # usePolling, useConnection, useCapabilities, useAuth
    types/                  # api.ts (DTOs, mirrored from 01)
    utils/                  # bytes.ts, duration.ts, prometheus.ts, rates.ts
    styles/index.css
  test/fixtures/            # real payloads captured from a running server
  docs/
```

## 4. Dev, proxy and base path

- The production base is `/ui/`, so set `base: '/ui/'` in `vite.config.ts`. Pages are
  `/ui/chat`, `/ui/metrics`, `/ui/models`, `/ui/system` and `/ui/settings`. `/ui` and `/ui/`
  redirect to `/ui/chat`.
- The API lives on the same origin. Calls use absolute paths (`/v1/...`, `/metrics`, `/health`),
  never `/ui/v1/...`.
- Dev: `npm run dev` serves on :5173. The proxy forwards `/v1`, `/metrics` and `/health` to
  `QUBIVEX_API` (default `http://127.0.0.1:8080`). The SSE proxy must not buffer:

```ts
// vite.config.ts
const target = process.env.QUBIVEX_API ?? 'http://127.0.0.1:8080';
export default defineConfig({
  base: '/ui/',
  plugins: [react()],
  server: { proxy: {
    '/v1': { target, changeOrigin: true },
    '/metrics': { target, changeOrigin: true },
    '/health': { target, changeOrigin: true },
  }},
  build: { outDir: 'dist', assetsDir: 'assets', sourcemap: false },
});
```

- An optional `VITE_API_BASE` lets the UI point at a different origin. That needs
  `--cors-origin` on the server. Default is same-origin (`''`).
- Run a dev server: `qubivex serve --model <id> --admin-token dev-admin`. Leaving out
  `--api-key` keeps `/v1` open on loopback.

## 5. Auth (`services/auth.ts`)

- Two secrets: `apiKey` and `adminToken`. Both are optional and kept in **sessionStorage**
  under `qubivex.apiKey` and `qubivex.adminToken`. Settings has an opt-in "Remember on this
  device", which uses localStorage. Wrap every storage access in try/catch.
- Never log them. Never put them in URLs. Never include them in error reports. The
  `ErrorPanel` shows `x-request-id`, never request headers.
- Detecting whether a key is needed: on start, call `GET /v1/models` with no key.
  - 200 → no API key needed. Show "Open (no API key)" in Settings.
  - 401 → open the API key dialog.
- Admin: admin calls send `Authorization: Bearer <adminToken>`.
  - 403 `admin_disabled` → disable admin actions server-wide and show a tooltip:
    "Server started without --admin-token".
  - 401 → open the admin token dialog. Never fall back to sending the API key.
- `auth.ts` exposes `getApiKey()`, `getAdminToken()`, `setApiKey()`, `setAdminToken()`,
  `clear()` and `subscribe()`. Components read these through `useAuth()`.

## 6. API client (`services/api.ts`)

All HTTP goes through this file. Everything else imports from `services/*`.

```ts
export type Auth = 'none' | 'api' | 'admin';

export class ApiError extends Error {
  status: number; code: string | null; type: string | null;
  param: string | null; requestId: string | null; retryAfter: number | null;
}

export async function request<T>(path: string, opts: {
  method?: 'GET' | 'POST' | 'DELETE'; body?: unknown; auth?: Auth;
  timeoutMs?: number;            // default 15_000; load/verify/analyse pass larger values
  signal?: AbortSignal;
  parse?: 'json' | 'text';
}): Promise<T>;

export async function stream(path: string, body: unknown, opts: {
  auth?: Auth; signal: AbortSignal;
}): Promise<Response>;           // throws ApiError if !res.ok; caller reads res.body
```

- Timeout: an `AbortController` combined with the caller's signal (`AbortSignal.any` where
  available, with a manual fallback). Streams have **no** overall timeout, only the caller's
  abort.
- Parse error bodies as `{error:{code,message,param,type}}`. If parsing fails, use
  `code=null` and the status text as the message.
- Read `x-request-id` and `retry-after` from every response.
- A 401 emits an `auth-required` event with the auth kind, which the shell turns into the
  key dialog. Other errors are thrown to the caller.
- Network failure (a `TypeError` from fetch) is an `ApiError` with `status: 0` and
  `code: 'network'`. The connection indicator watches for it.

## 7. Chat streaming (`services/sse.ts`, `services/chat.ts`)

Minimal SSE reader. The server only sends `data:` lines, but parse the spec anyway (CRLF,
multi-line data, comments):

```ts
export async function* readSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '', data: string[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i;
    while ((i = buf.search(/\r?\n/)) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(buf[i] === '\r' ? i + 2 : i + 1);
      if (line === '') { if (data.length) { yield data.join('\n'); data = []; } continue; }
      if (line.startsWith(':')) continue;
      if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (data.length) yield data.join('\n');
}
```

`chat.ts` turns those strings into typed events:

```ts
type ChatEvent =
  | { kind: 'delta'; text: string }
  | { kind: 'finish'; reason: 'stop' | 'length' | string }
  | { kind: 'usage'; usage: Usage }
  | { kind: 'error'; error: ApiErrorBody }   // in-stream error (01 §5 rule 2)
  | { kind: 'done' };                          // [DONE]

export async function* streamChat(req: ChatRequest, signal: AbortSignal): AsyncGenerator<ChatEvent>;
```

The message model leaves room for multimodal input without implementing it:

```ts
type ContentPart = { type: 'text'; text: string };   // add image/audio variants only when the API accepts them
type ChatMessage = { id: string; role: 'system'|'user'|'assistant'; parts: ContentPart[];
                     status?: 'streaming'|'done'|'stopped'|'interrupted'|'error';
                     finish?: string; usage?: Usage; error?: ApiErrorBody };
```

Send `content` as a plain string when there is a single text part, which is the simplest
contract. The composer decides whether to show attachments with
`capabilities.multimodal`, which stays `false` until the API advertises it.

States:

- Stop: `abort()` → status `stopped`, keep the text.
- Network drop mid-stream: status `interrupted`, show a Retry button.
- In-stream error: status `error`, show the error.
- `[DONE]` without a finish event: treat it as `interrupted`.

Never auto-retry a generation.

## 8. Metrics (`utils/prometheus.ts`, `utils/rates.ts`, `services/metrics.ts`)

- `parsePrometheus(text) → Map<name, Sample[]>`, where
  `Sample = { labels: Record<string,string>; value: number }`. Handle `# HELP`/`# TYPE`,
  label escaping (`\"`, `\\`, `\n`), `+Inf`, `NaN`, and histogram suffixes. Unit-test it
  against a fixture captured from a real `/metrics` (`test/fixtures/metrics.txt`).
- `rates.ts` takes two snapshots and returns rates (Δ/Δt), window means (Δsum/Δcount) and
  quantiles from bucket deltas. A negative delta means a counter reset → `null`.
- Return `undefined` when a series is absent. Return `null` when it is present but not
  computable yet (first scrape, Δcount = 0). Charts draw both as gaps, and cards show "—"
  with a tooltip saying which case applies.
- Poll with `usePolling(fn, intervalMs, {paused})`. Default 2000 ms, choices
  1/2/5/10/30 s. Keep a ring buffer of at most 900 points. Reset clears the buffer.

## 9. Capability detection (`hooks/useCapabilities.ts`)

The UI must work against today's gateway, which lacks the admin model routes, and against
newer ones. Detect features instead of assuming them:

- `GET /v1/system` → if it has `version`, use that. If `capabilities` is present (03, §3.1),
  use it as the source of truth.
- Otherwise fall back to probing: `GET /v1/admin/models/installed` → 404 or 405 means
  model management is unavailable. Today's gateway answers **405** `METHOD_NOT_ALLOWED`,
  because the path matches `DELETE /v1/admin/models/{id}` (verified against `qubivex serve`
  in Phase 3a). 200, 401 or 403 mean the route exists. Show "Requires Qubivex ≥ X" instead
  of the panels.

## 10. Design tokens

Dark first. Light mode is optional, behind `data-theme`.

| Token | Dark | Use |
|---|---|---|
| `--bg` | `#0b0d0c` | page |
| `--surface` | `#121514` | cards, sidebar |
| `--surface-2` | `#181c1a` | inputs, hover |
| `--border` | `#232826` | 1px dividers only |
| `--text` | `#e6ebe8` | primary |
| `--muted` | `#8a948f` | secondary |
| `--accent` | `#3ecf8e` | active nav, primary actions, healthy |
| `--warn` | `#f5a524` | attention |
| `--danger` | `#f04444` | errors, destructive |

Font: Inter (or system-ui) for UI text, JetBrains Mono (or ui-monospace) for numbers, ids
and code. Use tabular numerals for every metric. Base text 14px, compact density, 8px
spacing grid. No gradients and no decorative animation. Only spinners and the streaming caret
move.

Shell: a 240px sidebar that collapses to a drawer below 1024px, and a 56px header. Page
content is capped at 1280px, except the chat transcript, which is capped at 820px.
