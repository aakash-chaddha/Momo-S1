import type { LoadModelParams } from '@wllama/wllama';
// prebuilt with `./scripts/build_wasm.sh` in the wllama fork; shipped in this repository
import wllamaWasm from '../lib/wllama/src/wasm/wllama.wasm?url';

export const WLLAMA_PATHS = { default: wllamaWasm };

// One small, browser-proven multimodal model: wllama's own multimodal example loads the same
// repository, so the mtmd path is known to work in wasm. Alternates are added only after they
// are measured on this page's parameters.
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
];

export const DEFAULT_MODEL = MODELS[0];

export const totalSize = (m: ModelChoice) => m.size + m.mmprojSize;

// Fixed, documented load parameters. A report can be reproduced from these numbers alone.
// One debug switch is read from the URL: ?edge=384 changes the image downscale. (Forcing the
// vision projector to the CPU with mmproj_offload: false crashes this wasm build, so the page
// leaves llama.cpp's default: the projector offloads when a GPU backend exists.)
const query = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
const queryEdge = Number(query.get('edge'));

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
