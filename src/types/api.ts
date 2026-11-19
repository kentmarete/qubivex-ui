// DTOs of the Qubivex gateway, written from payloads captured in test/fixtures/
// (see docs/01-api-inventory.md). Fields the server may omit are optional.

/** OpenAI-shaped error body: every gateway error has this shape. */
export interface ApiErrorBody {
  code: string | null;
  message: string;
  param: string | null;
  type: string | null;
}

export interface Health {
  status: string;
  models: number;
}

export interface ModelCard {
  id: string;
  object: 'model';
  created: number;
  owned_by: string;
}

/** POST /v1/models/unload. */
export interface UnloadResult {
  id: string;
  object: 'model';
  deleted: true;
  /** Requests still running on the unloaded model; its memory is freed when they end. */
  draining: number;
}

export interface ModelList {
  object: 'list';
  data: ModelCard[];
}

// ---- /v1/system ----------------------------------------------------------------

/** `qubivex_hardware::Probed<T>`: a value the OS reported, or why it could not. */
export type Probed<T> = { known: T } | { unknown: string };

export interface CpuTier {
  name: string;
  physical: number;
  logical: number;
}

export interface CpuInfo {
  arch: string;
  vendor?: Probed<string>;
  model?: Probed<string>;
  physical_cores?: Probed<number>;
  logical_cores?: Probed<number>;
  numa_nodes?: Probed<number>;
  tiers?: Probed<CpuTier[]>;
  simd?: string[];
}

export interface GpuDevice {
  name: string;
  ordinal: number;
  driver?: Probed<string>;
  memory?: Probed<number>;
  compute_units?: Probed<number>;
  unified_memory?: boolean;
}

export type GpuStatus =
  | { status: 'available'; devices: GpuDevice[] }
  | { status: 'unavailable'; reason: string };

export interface GpuInfo {
  backend: string;
  status: GpuStatus;
}

/** `"none"` or `{ "limited": bytes }`. */
export type CgroupLimit = 'none' | { limited: number };

export interface MemoryInfo {
  total?: Probed<number>;
  available?: Probed<number>;
  cgroup_limit?: Probed<CgroupLimit>;
}

export interface StorageInfo {
  mount_point: string;
  source?: string;
  filesystem?: string;
  kind?: Probed<string>;
  capacity?: Probed<number>;
  available?: Probed<number>;
}

export interface OsInfo {
  family: string;
  name?: Probed<string>;
  kernel?: Probed<string>;
}

export interface HardwareProfile {
  cpu?: CpuInfo;
  memory?: MemoryInfo;
  gpus?: GpuInfo[];
  storage?: Probed<StorageInfo[]>;
  os?: OsInfo;
}

export interface PrefixCacheStats {
  entries: number;
  positions: number;
  lookups: number;
  hits: number;
  tokens_reused: number;
  evicted: number;
}

export interface LoadedModel {
  id: string;
  architecture: string;
  max_context: number;
  generation_slots: number;
  generation_slots_free: number;
  queue_depth: number;
  queue_limit: number;
  kv_reserved_positions: number;
  prefix_cache: PrefixCacheStats;
  expert_cache_bytes: number;
  plan_budget_bytes: number | null;
  ledger_bytes: { dense: number; expert_cache: number; kv: number };
  /** Execution backend: cpu, metal, vulkan, sim. */
  placement: string;
}

export type ModelState = 'loading' | 'loaded' | 'failed';

/** Present on servers with the additions of docs/03 §3.1; absent today. */
export interface Capabilities {
  admin?: boolean;
  model_management?: boolean;
  /** Search and pull through /v1/admin/models/search and /pull (qubivex ADR-013 amendment 8). */
  model_downloads?: boolean;
  metrics?: boolean;
  multimodal?: boolean;
  web_ui?: boolean;
}

/** The server's token limits (`/v1/system` `limits`); null where unset, so the context limits it. */
export interface ServerLimits {
  default_max_tokens: number;
  max_generation_tokens: number | null;
  max_prompt_tokens: number | null;
  /** The server's --context, used for loads that do not set one. */
  load_context: number | null;
}

export interface SystemInfo {
  object: 'system';
  hardware: HardwareProfile | null;
  /** Absent on servers before the load-context change. */
  limits?: ServerLimits;
  models: LoadedModel[];
  model_states: { id: string; state: ModelState }[];
  models_draining: number;
  generations_active: number;
  version?: string;
  uptime_seconds?: number;
  capabilities?: Capabilities;
}

// ---- chat ----------------------------------------------------------------------

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens: number };
}

/** Only text parts exist: the gateway refuses any other part type (openai.rs). */
export type ContentPart = { type: 'text'; text: string };

export interface ChatRequestMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ChatRequest {
  model: string;
  messages: ChatRequestMessage[];
  stream: true;
  stream_options?: { include_usage: boolean };
  temperature?: number;
  top_p?: number;
  top_k?: number;
  max_tokens?: number;
  seed?: number;
  stop?: string[];
}

export interface ChatChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta?: { role?: string; content?: string };
    finish_reason: string | null;
  }[];
  usage?: Usage;
}

// ---- installed (qubivex docs/serving/http-api.md "Installed models") -------------------

/** One model on disk under the server's model directories. Model fields are absent when `status` is `error`. */
export interface InstalledModel {
  id: string | null;
  name?: string;
  /** Directory name inside its models directory; never a path. */
  dir: string;
  status: 'ok' | 'error';
  error: string | null;
  install_state: string;
  /** true when any id serves it, else the state of a load in flight or failed. */
  loaded: boolean | 'loading' | 'failed';
  serve_ids: string[];
  architecture?: string;
  format?: string;
  quantization?: string | null;
  source?: { provider: string; repository: string; revision: string } | null;
  max_context?: number | null;
  bytes?: { total: number; dense: number; routed_experts: number };
}

// ---- downloads (qubivex docs/serving/http-api.md "Model downloads") ----------------

export interface SearchHit {
  repository: string;
  downloads: number;
  likes: number;
  formats: string[];
  /** Needs an access token on the server (HF_TOKEN). */
  gated: boolean;
  /** Ids already installed from this repository. */
  installed_as: string[];
}

export interface PullSpec {
  repository: string;
  revision?: string;
  files?: string[];
  id?: string;
  name?: string;
  set?: Record<string, unknown>;
}

export type JobStatus = 'running' | 'validating' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  object: 'job';
  id: string;
  kind: 'pull';
  status: JobStatus;
  /** The id it installs as, once known. */
  model: string | null;
  repository: string;
  revision: string | null;
  created_at: number;
  finished_at: number | null;
  progress: {
    bytes_done: number;
    bytes_total: number;
    bytes_resumed: number;
    rate_bps: number | null;
    eta_seconds: number | null;
    files: { name: string; done: number; total: number }[];
    retrying: { file: string; attempt: number; delay_s: number; reason: string } | null;
  };
  result: { id: string; warnings: string[]; files: string[] } | null;
  error: { code: string; message: string } | null;
  cancellable: boolean;
}
