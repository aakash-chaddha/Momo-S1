// Note: snake_case is used to match llama.cpp's naming convention
export interface LoadModelParams {
  log_level?: LogLevel;
  seed?: number;
  n_ctx?: number;
  n_batch?: number;
  n_ubatch?: number;
  // by default, all layers are offloaded if WebGPU is available
  n_gpu_layers?: number;
  // by default, on multi-thread build, we take half number of available threads (hardwareConcurrency / 2)
  n_threads?: number;
  embeddings?: boolean;
  offload_kqv?: boolean;
  // maximum number of parallel requests (completions, embeddings, ...); default: 4
  n_parallel?: number;
  // sequences reserved for the decision API, above the chat slots (0 = disabled, minimum 3);
  // setting this above 0 enables the unified KV cache (default: 0)
  n_seq_decision?: number;
  // share one KV cache of n_ctx tokens between all sequences (default: true)
  // when disabled, each sequence gets its own cache of (n_ctx / n_parallel) tokens
  kv_unified?: boolean;
  pooling_type?: // legacy values
  | 'LLAMA_POOLING_TYPE_UNSPECIFIED'
    | 'LLAMA_POOLING_TYPE_NONE'
    | 'LLAMA_POOLING_TYPE_MEAN'
    | 'LLAMA_POOLING_TYPE_CLS'
    // new values
    | 'unspecified'
    | 'none'
    | 'mean'
    | 'cls'
    | 'last'
    | 'rank';
  // context extending
  rope_scaling_type?:
    | 'LLAMA_ROPE_SCALING_TYPE_UNSPECIFIED'
    | 'LLAMA_ROPE_SCALING_TYPE_NONE'
    | 'LLAMA_ROPE_SCALING_TYPE_LINEAR'
    | 'LLAMA_ROPE_SCALING_TYPE_YARN';
  rope_freq_base?: number;
  rope_freq_scale?: number;
  yarn_ext_factor?: number;
  yarn_attn_factor?: number;
  yarn_beta_fast?: number;
  yarn_beta_slow?: number;
  yarn_orig_ctx?: number;
  // optimizations
  cache_type_k?: 'f32' | 'f16' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0';
  cache_type_v?: 'f32' | 'f16' | 'q8_0' | 'q5_1' | 'q5_0' | 'q4_1' | 'q4_0';
  flash_attn?: boolean; // true is auto, false is disabled
  swa_full?: boolean;
  chat_template?: string;
  jinja?: boolean;
  reasoning?: boolean;
  image_min_tokens?: number;
  image_max_tokens?: number;
  warmup?: boolean;
  no_kv_offload?: boolean;
  mmproj_offload?: boolean;
  cont_batching?: boolean;
  n_keep?: number;
  ctx_shift?: boolean;
  cache_idle_slots?: boolean;
  n_cache_reuse?: number;
  lora_adapters?: { path: string; scale?: number }[];
  lora_init_without_apply?: boolean;
  spec_draft_model?: string;
  spec_draft_ngl?: number;
  spec_draft_n_max?: number;
  spec_draft_n_min?: number;
  spec_draft_p_min?: number;
  spec_draft_threads?: number;
  spec_draft_threads_batch?: number;
  kv_overrides?: Record<string, string>;
  reasoning_budget_tokens?: number;
  reasoning_budget_message?: string;
  reasoning_format?: 'none' | 'deepseek-legacy' | 'deepseek';
  skip_chat_parsing?: boolean;
  prefill_assistant?: boolean;
  default_template_kwargs?: Record<string, any>;
}

// Note: snake_case is used to match llama.cpp's naming convention
export interface LoadedContextInfo {
  n_vocab: number;
  n_ctx: number;
  n_batch: number;
  n_ubatch: number;
  n_ctx_train: number;
  n_embd: number;
  n_layer: number;
  metadata: Record<string, string>;
  token_bos: number;
  token_eos: number;
  token_eot: number;
  list_tokens_eog: number[];
  has_encoder: boolean;
  token_decoder_start: number;
  add_bos_token: boolean;
  add_eos_token: boolean;
  has_image_input: boolean;
  has_audio_input: boolean;
}

// Note: snake_case is used to match llama.cpp's naming convention
export interface SamplingParams {
  // See sampling.h for more details
  seed?: number;
  mirostat?: number | undefined; // 0 = disabled, 1 = mirostat, 2 = mirostat 2.0
  mirostat_eta?: number | undefined;
  mirostat_tau?: number | undefined;
  samplers_sequence?: string[] | undefined; // unused for now
  temp?: number | undefined; // temperature
  top_p?: number | undefined;
  top_k?: number | undefined;
  penalty_last_n?: number | undefined;
  penalty_repeat?: number | undefined;
  penalty_freq?: number | undefined;
  penalty_present?: number | undefined;
  dynatemp_range?: number | undefined;
  dynatemp_exponent?: number | undefined;
  grammar?: string;
  n_prev?: number | undefined;
  n_probs?: number | undefined;
  min_p?: number | undefined;
  typ_p?: number | undefined;
  typical_p?: number | undefined;
  logit_bias?: { token: number; bias: number }[] | undefined;
  ignore_eos?: boolean | undefined;
}

export interface StreamParams<T> {
  stream: true;
  onData: (data: T) => void;
}

// ----- decision API: the same JSON shapes as llama-server's POST /v1/decision -----

// A context is a string, or an ordered list of content parts. The pinned engine supports one
// image per context; audio and video are not supported by the decision endpoint.
export type DecisionContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface DecisionRequest {
  // free-form instructions prepended to the field catalogue in the system prompt
  instructions?: string;
  // compact field specs ({name: {type, description, choices|minimum...}}) or a JSON Schema object
  schema: Record<string, unknown>;
  // one decision per entry, returned in the same order
  contexts: (string | DecisionContentPart[])[];
  // auto: exact distribution up to tree_max values, greedy beyond; tree: always exact; greedy: always walk
  mode?: 'auto' | 'tree' | 'greedy';
  // maximum number of allowed values per field scored exhaustively in auto mode (default: 128)
  tree_max?: number;
  // reuse the cached instructions + field catalogue prefix across requests (default: true)
  cache_prompt?: boolean;
}

// One allowed value and the probability the field gave it.
export interface DecisionCandidate {
  value: unknown;
  probability: number;
}

export interface DecisionField {
  // the value the field answered with (the mode, or the aggregate for numeric fields)
  value: unknown;
  // probability of the selected value
  probability: number;
  // how many trie nodes were scored for this field
  scored_nodes: number;
  // true when the field was scored exhaustively, false when its value was walked greedily
  tree: boolean;
  // numeric fields only: the 10th and 90th percentile of the distribution
  interval_p10_p90?: unknown[];
  // present exactly when the full distribution over the allowed values was scored
  candidates?: DecisionCandidate[];
}

export interface DecisionItem {
  decision: Record<string, unknown>;
  fields: Record<string, DecisionField>;
  usage: {
    context_tokens: number;
    media_tokens: number;
    scored_rows: number;
  };
}

export interface DecisionResponse {
  object: 'decision';
  results: DecisionItem[];
  model: string;
  created: number;
  usage: {
    prompt_tokens: number;
    cached_tokens: number;
    context_tokens: number;
    media_tokens: number;
    scored_rows: number;
  };
  timings: {
    prefill_ms: number;
    scoring_ms: number;
    total_ms: number;
    rounds: number;
    per_decision_ms: number;
  };
}

export enum LogLevel {
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}
