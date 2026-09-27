# Models: what can run in this browser page

The page's default is one multimodal model (`LFM2.5-VL-450M`, first in `src/config.ts`), and the
model menu now also offers the candidates below so anyone can try them. This file is where each
one is argued: what it costs in download, and what it still has to prove before it can be called
measured. A model is either measured on this page's parameters (`docs/IMPLEMENTATION.md`) or its
`note` in `src/config.ts` says so - and a note that says `candidate, not measured here` means
exactly that.

Sizes below are the Hugging Face file listings at the time of writing (MB/GB, decimal), the text
quant plus the projector the page downloads. The bar is not "does it fit on a desktop", it is
"would a visitor accept this on a first visit, and can wasm hold it".

## What a model has to satisfy here

1. **A GGUF text model and a separate `mmproj` GGUF projector.** The decision endpoint takes an
   image as a context part, so the vision encoder has to exist as an mmproj.
2. **The encoder family must be in the shipped wasm.** `lib/wllama/src/wasm/wllama.wasm` is built
   from the llama.cpp fork with these mtmd encoders: siglip/llava, qwen3vl, gemma4v, internvl,
   minicpmv, granite4-vision. A family outside that list means rebuilding the wasm first.
3. **It has to fit the page's fixed load.** `n_ctx 8192`, `n_batch 2048`, `n_ubatch 1024` (at
   least the image tokens), image edge 512 px, so an image costs at most 256 tokens.
4. **It has to fit wasm memory.** Weights + KV for 12 decision sequences + the vision projector
   live in one ~4 GiB address space, with the media cache on top. Multi-GiB weights do not.
5. **The decision engine's branch cost has to be measured.** Every allowed value is scored on a
   branch copied from a shared prefix (`llama_memory_seq_cp`), up to 12 sequences at once. A
   hybrid or linear-attention trunk (Gated DeltaNet, sliding window) keeps per-sequence state, so
   measure the copy before trusting the timings - `docs/momos-one-plan.md` already flags this.

## The model menu

Ordered by download. "comfortable" is under ~600 MB and a first visit still feels reasonable;
"deliberate" is 0.5 - 2 GB, a download you choose to make.

| model (`id` in the menu) | text | projector | download | where it stands |
|---|---|---|---|---|
| LFM2.5-VL-450M Q4_0 `lfm2.5-vl-450m-q4_0` `LiquidAI/LFM2.5-VL-450M-GGUF` | 219 MB | 103 MB | **~307 MiB** | **the default, measured here** |
| SmolVLM-256M Q8_0 `smolvlm-256m-q8_0` `ggml-org/SmolVLM-256M-Instruct-GGUF` | 175 MB | 104 MB | ~266 MiB | comfortable · candidate, not measured |
| SmolVLM2-256M-Video Q8_0 `smolvlm2-256m-video-q8_0` `ggml-org/SmolVLM2-256M-Video-Instruct-GGUF` | 175 MB | 104 MB | ~266 MiB | comfortable · candidate, not measured |
| SmolVLM-500M Q8_0 `smolvlm-500m-q8_0` `ggml-org/SmolVLM-500M-Instruct-GGUF` | 437 MB | 109 MB | ~520 MiB | comfortable · candidate, not measured |
| SmolVLM2-500M-Video Q8_0 `smolvlm2-500m-video-q8_0` `ggml-org/SmolVLM2-500M-Video-Instruct-GGUF` | 437 MB | 109 MB | ~520 MiB | comfortable · candidate, not measured |
| Qwen3.5-0.8B Q4_0 `qwen3.5-0.8b-q4_0` `unsloth/Qwen3.5-0.8B-GGUF` | 507 MB | 205 MB | **~679 MiB** | deliberate · candidate; qwen35 needs a newer wasm |
| InternVL3-1B Q8_0 `internvl3-1b-q8_0` `ggml-org/InternVL3-1B-Instruct-GGUF` | 675 MB | 333 MB | ~961 MiB | deliberate · candidate, not measured |
| LFM2.5-VL-1.6B Q4_0 `lfm2.5-vl-1.6b-q4_0` `LiquidAI/LFM2.5-VL-1.6B-GGUF` | 696 MB | 583 MB | ~1.19 GiB | deliberate · candidate, not measured |
| InternVL3-2B Q4_K_M `internvl3-2b-q4_k_m` `ggml-org/InternVL3-2B-Instruct-GGUF` | 1117 MB | 337 MB | ~1.35 GiB | deliberate · candidate, not measured |
| Qwen3-VL-2B Q4_K_M `qwen3vl-2b-q4_k_m` `Qwen/Qwen3-VL-2B-Instruct-GGUF` | 1107 MB | 445 MB | ~1.45 GiB | deliberate · candidate, not measured |
| Qwen2-VL-2B Q4_K_M `qwen2vl-2b-q4_k_m` `ggml-org/Qwen2-VL-2B-Instruct-GGUF` | 986 MB | 710 MB | ~1.58 GiB | deliberate · candidate; qwen2vl encoder needs checking |
| SmolVLM2-2.2B Q4_K_M `smolvlm2-2.2b-q4_k_m` `ggml-org/SmolVLM2-2.2B-Instruct-GGUF` | 1113 MB | 593 MB | ~1.59 GiB | deliberate · candidate, not measured |
| Qwen3.5-2B Q4_0 `qwen3.5-2b-q4_0` `unsloth/Qwen3.5-2B-GGUF` | 1215 MB | 668 MB | ~1.75 GiB | deliberate · candidate; qwen35 needs a newer wasm |

Two families on this list are the ones to expect trouble from. **Qwen3.5** (0.8B and 2B) sits on a
new hybrid backbone, Gated DeltaNet with gated attention and 262k native context; llama.cpp
merged support for it ([#19435](https://github.com/ggml-org/llama.cpp/pull/19435) dense/MoE text,
[#19468](https://github.com/ggml-org/llama.cpp/pull/19468) the series incl. vision with mmproj;
`src/models/qwen35.cpp`), but this repo's `wllama.wasm` predates that work, so those two entries
will not load until the fork picks it up and the wasm is rebuilt. **Qwen2-VL** is the older Qwen
encoder, not the qwen3vl one the binary is known to carry: it may load, it may not, and the answer
is in the browser console with `?log=info`.

The SmolVLM rows are the small ones. 256M rides the siglip/llava encoder already in the wasm, and
256M is the only class smaller than what the page ships. The trade is the obvious one: a 256M
model reading a screenshot is a toy at this task - measure it as a control, not as a replacement.
The `Video` variants are the same class of weights and also take images.

### Qwen3.5-0.8B in particular

`unsloth/Qwen3.5-0.8B-GGUF` is the most interesting entry here: a 0.8B **multimodal** model
("Causal Language Model with Vision Encoder", image-text-to-text) at **~679 MB** at Q4_0, and the
Small series disables thinking by default, which suits a page that wants one short JSON answer.
What it still has to prove here, beyond the wasm rebuild above:

- **The branch cost of the decision engine.** A recurrent linear-attention trunk carries state per
  sequence; the forked branches (`llama_memory_seq_cp`) copy that state. Measure the scoring pass
  at `n_seq_decision 12` before assuming the 12-sequence budget still holds.
- **The projector is F16 only** in the unsloth repo (205 MB), so the image encoder is a fixed
  cost no matter how hard the text model is quantised.
- **Wasm memory.** Q4_0 weights + projector + 8192-token KV is snug inside the 32-bit wasm heap
  compared to the 450M; the lighter quants (`Q3_K_S` 441 MB, `UD-IQ2_XXS` 338 MB) buy room.

Note also: these GGUFs pair a separate `mmproj` with the text model, which is exactly the shape
this page loads (`--mmproj` on native). Ollama cannot take that pair; llama.cpp and this page can.

## Not browser models (multi-GiB, whatever the quality)

Gemma 4 E2B (2.8 - 9.3 GB text + 557 MB - 1 GB projector; this is the entry removed from the page
for being too big), Gemma 4 E4B and larger, Gemma 3 4B (2.5 GB + 851 MB), Qwen2.5-VL-3B (1.9 GB +
845 MB) and everything above it, Pixtral 12B, Mistral Small 3.1 24B, Llama 4 Scout, InternVL3-8B
and 14B, Moondream2 (2.8 GB text + 910 MB projector, no small quant published), Qwen3.5-4B and
9B (2.5 GB and up before the projector), and the whole Qwen3.5 medium tier. Fine on a desktop,
not a thing a visitor downloads from a web page.

## Measuring one (what turns a candidate into a measured model)

1. Run it here: `npm run smoke` for a real decision and generation, `npm run bench` for the
   cold/warm split, `?log=info` for the device split and for whether its encoder loaded at all.
2. Record what it does in `docs/IMPLEMENTATION.md`. The preset set (at most three fields) is the
   yardstick: first decision, warm decision, generation, and the ratio.
3. Then change its `note` in `src/config.ts` to the plain measured one, in the style of the
   default's. Until that line changes, the row in the menu is a claim, not a measurement.

Adding a model in the first place is one entry in `MODELS` (`src/config.ts`): `id`, `name`,
`repo`, `file`, `mmprojFile`, the two sizes in bytes exactly as published on Hugging Face, and a
`note` that says what it is, what it costs, and what it has still to prove. The `?model=` query
and the webmcp `load-model` tool both read this list. If its encoder family is not in the shipped
wasm, rebuild `lib/wllama/src/wasm/wllama.wasm` from the fork first (`scripts/build_wasm.sh`
there).
