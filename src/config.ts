import { LogLevel, type LoadModelParams } from '@wllama/wllama';
// prebuilt with `./scripts/build_wasm.sh` in the wllama fork; shipped in this repository
import wllamaWasm from '../lib/wllama/src/wasm/wllama.wasm?url';

export const WLLAMA_PATHS = { default: wllamaWasm };

// The default is small enough to load in a first browser visit; the rest are the candidates from
// docs/MODELS.md, offered so anyone can try them. A model belongs here either because it has been
// measured on this page's parameters (docs/IMPLEMENTATION.md) or because its note says what it
// still has to prove - most say `candidate, not measured here`, and the two on new backbones say
// that the shipped wasm may not load them at all. A model that needs a multi-GiB download is not a
// browser model, whatever its quality, and is not on this list.
export interface ModelChoice {
  id: string;
  name: string;
  repo: string;
  file: string;
  mmprojFile: string;
  size: number;
  mmprojSize: number;
  note: string;
}

export const MODELS: ModelChoice[] = [
  {
    id: 'lfm2.5-vl-450m-q4_0',
    name: 'LFM2.5-VL-450M Q4_0',
    repo: 'LiquidAI/LFM2.5-VL-450M-GGUF',
    file: 'LFM2.5-VL-450M-Q4_0.gguf',
    mmprojFile: 'mmproj-LFM2.5-VL-450m-Q8_0.gguf',
    size: 219311264,
    mmprojSize: 102815168,
    note: '450M parameters, image input, ~307 MiB to download',
  },
  // --- candidates: shipped so anyone can try them; notes say what each has still to prove ---
  {
    id: 'smolvlm-256m-q8_0',
    name: 'SmolVLM-256M Q8_0',
    repo: 'ggml-org/SmolVLM-256M-Instruct-GGUF',
    file: 'SmolVLM-256M-Instruct-Q8_0.gguf',
    mmprojFile: 'mmproj-SmolVLM-256M-Instruct-Q8_0.gguf',
    size: 175054528,
    mmprojSize: 103769856,
    note: '256M parameters, image input, ~266 MiB to download · candidate, not measured here',
  },
  {
    id: 'smolvlm2-256m-video-q8_0',
    name: 'SmolVLM2-256M-Video Q8_0',
    repo: 'ggml-org/SmolVLM2-256M-Video-Instruct-GGUF',
    file: 'SmolVLM2-256M-Video-Instruct-Q8_0.gguf',
    mmprojFile: 'mmproj-SmolVLM2-256M-Video-Instruct-Q8_0.gguf',
    size: 175056256,
    mmprojSize: 103771616,
    note: '256M parameters, image input, ~266 MiB to download · candidate, not measured here',
  },
  {
    id: 'smolvlm-500m-q8_0',
    name: 'SmolVLM-500M Q8_0',
    repo: 'ggml-org/SmolVLM-500M-Instruct-GGUF',
    file: 'SmolVLM-500M-Instruct-Q8_0.gguf',
    mmprojFile: 'mmproj-SmolVLM-500M-Instruct-Q8_0.gguf',
    size: 436806912,
    mmprojSize: 108783360,
    note: '500M parameters, image input, ~520 MiB to download · candidate, not measured here',
  },
  {
    id: 'smolvlm2-500m-video-q8_0',
    name: 'SmolVLM2-500M-Video Q8_0',
    repo: 'ggml-org/SmolVLM2-500M-Video-Instruct-GGUF',
    file: 'SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
    mmprojFile: 'mmproj-SmolVLM2-500M-Video-Instruct-Q8_0.gguf',
    size: 436808704,
    mmprojSize: 108785184,
    note: '500M parameters, image input, ~520 MiB to download · candidate, not measured here',
  },
  {
    id: 'qwen3.5-0.8b-q4_0',
    name: 'Qwen3.5-0.8B Q4_0',
    repo: 'unsloth/Qwen3.5-0.8B-GGUF',
    file: 'Qwen3.5-0.8B-Q4_0.gguf',
    mmprojFile: 'mmproj-F16.gguf',
    size: 507154688,
    mmprojSize: 204987232,
    note: '0.8B parameters, image input, ~679 MiB to download · candidate; qwen35 needs a newer wasm',
  },
  {
    id: 'internvl3-1b-q8_0',
    name: 'InternVL3-1B Q8_0',
    repo: 'ggml-org/InternVL3-1B-Instruct-GGUF',
    file: 'InternVL3-1B-Instruct-Q8_0.gguf',
    mmprojFile: 'mmproj-InternVL3-1B-Instruct-Q8_0.gguf',
    size: 675206560,
    mmprojSize: 332567840,
    note: '1B parameters, image input, ~961 MiB to download · candidate, not measured here',
  },
  {
    id: 'lfm2.5-vl-1.6b-q4_0',
    name: 'LFM2.5-VL-1.6B Q4_0',
    repo: 'LiquidAI/LFM2.5-VL-1.6B-GGUF',
    file: 'LFM2.5-VL-1.6B-Q4_0.gguf',
    mmprojFile: 'mmproj-LFM2.5-VL-1.6b-Q8_0.gguf',
    size: 695752480,
    mmprojSize: 583109888,
    note: '1.6B parameters, image input, ~1.2 GiB to download · candidate, not measured here',
  },
  {
    id: 'internvl3-2b-q4_k_m',
    name: 'InternVL3-2B Q4_K_M',
    repo: 'ggml-org/InternVL3-2B-Instruct-GGUF',
    file: 'InternVL3-2B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-InternVL3-2B-Instruct-Q8_0.gguf',
    size: 1116758816,
    mmprojSize: 337012000,
    note: '2B parameters, image input, ~1.35 GiB to download · candidate, not measured here',
  },
  {
    id: 'qwen3vl-2b-q4_k_m',
    name: 'Qwen3-VL-2B Q4_K_M',
    repo: 'Qwen/Qwen3-VL-2B-Instruct-GGUF',
    file: 'Qwen3VL-2B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-Qwen3VL-2B-Instruct-Q8_0.gguf',
    size: 1107409952,
    mmprojSize: 445053216,
    note: '2B parameters, image input, ~1.45 GiB to download · candidate, not measured here',
  },
  {
    id: 'qwen2vl-2b-q4_k_m',
    name: 'Qwen2-VL-2B Q4_K_M',
    repo: 'ggml-org/Qwen2-VL-2B-Instruct-GGUF',
    file: 'Qwen2-VL-2B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-Qwen2-VL-2B-Instruct-Q8_0.gguf',
    size: 986046944,
    mmprojSize: 709883360,
    note: '2B parameters, image input, ~1.58 GiB to download · candidate; qwen2vl encoder needs checking',
  },
  {
    id: 'smolvlm2-2.2b-q4_k_m',
    name: 'SmolVLM2-2.2B Q4_K_M',
    repo: 'ggml-org/SmolVLM2-2.2B-Instruct-GGUF',
    file: 'SmolVLM2-2.2B-Instruct-Q4_K_M.gguf',
    mmprojFile: 'mmproj-SmolVLM2-2.2B-Instruct-Q8_0.gguf',
    size: 1112602656,
    mmprojSize: 592523200,
    note: '2.2B parameters, image input, ~1.59 GiB to download · candidate, not measured here',
  },
  {
    id: 'qwen3.5-2b-q4_0',
    name: 'Qwen3.5-2B Q4_0',
    repo: 'unsloth/Qwen3.5-2B-GGUF',
    file: 'Qwen3.5-2B-Q4_0.gguf',
    mmprojFile: 'mmproj-F16.gguf',
    size: 1214873856,
    mmprojSize: 668227264,
    note: '2B parameters, image input, ~1.75 GiB to download · candidate; qwen35 needs a newer wasm',
  },
];

// The URL is read once, here, so every switch below can use it: ?model= picks the model,
// ?edge=384 changes the image downscale, ?log=info prints the engine's load report.
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);

// ?model=<id> falls back to MODELS[0] so a typo loads the default instead of nothing.
export const DEFAULT_MODEL = MODELS.find((m) => m.id === query.get('model')) ?? MODELS[0];

export const totalSize = (m: ModelChoice) => m.size + m.mmprojSize;

// Fixed, documented load parameters. A report can be reproduced from these numbers alone.
// (Forcing the vision projector to the CPU with mmproj_offload: false crashes this wasm build,
// so the page leaves llama.cpp's default: the projector offloads when a GPU backend exists.)
const queryEdge = Number(query.get('edge'));

// ?log=info prints the engine's load report (which tensors go to WebGPU) to the console
export const LOG_LEVEL = query.get('log') === 'info' ? LogLevel.INFO : LogLevel.WARN;

export const MAX_IMAGE_EDGE =
  Number.isFinite(queryEdge) && queryEdge >= 128 && queryEdge <= 1024 ? queryEdge : 512; // px
export const DECISION_SEQS = 12; // cached prefix + trunks + branches; the schema is scored in rounds

export const loadParams = (model: ModelChoice): LoadModelParams => ({
  n_ctx: 8192,
  n_parallel: 1,
  n_seq_decision: DECISION_SEQS,
  n_batch: 2048,
  n_ubatch: 1024, // must be >= the image token count; one image is decoded in one non-causal batch
  n_threads: Math.max(1, (navigator.hardwareConcurrency || 2) - 1),
  jinja: true, // render the system/user prompt with the model's own chat template
  warmup: true,
  image_max_tokens: 256,
  // n_gpu_layers is left at wllama's default: WebGPU is used when the browser has it, CPU otherwise
});
