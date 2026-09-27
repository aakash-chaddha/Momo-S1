import { LogLevel, type LoadModelParams } from '@wllama/wllama';
// prebuilt with `./scripts/build_wasm.sh` in the wllama fork; shipped in this repository
import wllamaWasm from '../lib/wllama/src/wasm/wllama.wasm?url';

export const WLLAMA_PATHS = { default: wllamaWasm };

// Two multimodal models, both on llama.cpp's mtmd path, which is already compiled into the
// shipped wasm (siglip/llava, qwen3vl, gemma4v, internvl, minicpmv, granite4-vision are all in
// the binary). The default is small enough to load in a first browser visit; the alternate is a
// step up in quality at ~10x the download. A model is listed here only after it is measured on
// this page's parameters - see docs/IMPLEMENTATION.md.
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
  {
    id: 'gemma-4-e2b-iq2_m',
    name: 'Gemma 4 E2B UD-IQ2_M',
    repo: 'unsloth/gemma-4-E2B-it-GGUF',
    file: 'gemma-4-E2B-it-UD-IQ2_M.gguf',
    mmprojFile: 'mmproj-F16.gguf',
    size: 2290860128,
    mmprojSize: 985654080,
    note:
      'E2B = 2B effective (4.6B stored), image + audio input, ~3.1 GiB to download',
  },
];

// The URL is read once, here, so every switch below can use it: ?model= picks the alternate,
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
