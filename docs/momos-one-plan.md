# momos-one: multimodal system-1 (JEV) in the browser

Plan for a browser page that loads a small VLM with wllama (wasm) and answers a finite schema from
an image in **one** batched forward pass, with per-field probabilities - the same
`POST /v1/decision` engine that already exists in the llama.cpp fork, but running client-side.

Written 2026-09-26. No code changed yet.

---

## 1. What exists today (verified)

| repo | state |
|---|---|
| `F:/lab/jev/llama.cpp` | fork `thecodacus/llama.cpp`, branch `parallel-decision-media`, HEAD `89f5c5d27`. Engine in `tools/parallel-decision/`, endpoint `POST /v1/decision` in `tools/server/server-context.cpp`. **Uncommitted**: cut 2 staged, cut 3 (audio + multiple images per context + encoder cache) in the working tree, plus untracked `HOW_TO.md` |
| `F:/lab/jev/wllama` | fork `aakash-chaddha/wllama`, HEAD `46af429`, **submodule `llama.cpp` is empty** (never initialized). Pinned at upstream `c7bda03` |
| `F:/lab/jev/decision-playground` | React + Vite UI that talks to a running llama-server over HTTP. No backend of its own |

### Facts that make this port cheap

1. **wllama already compiles the llama.cpp *server*** (`CMakeLists.txt` `LLAMA_SERVER_SRC`:
   `server-context.cpp`, `server-task.cpp`, `server-chat.cpp`, `server-common.cpp`,
   `server-schema.cpp`, `server-stream.cpp`) and links `mtmd`. `cpp/wllama-context.h:254` holds a
   real `server_context ctx_server;`.
2. **wllama provides its own single-threaded queue** (`cpp/wllama-context.h:1015`
   `server_queue::start_loop`, `server_response_reader::post_task/next/has_next`). One call to
   `start_loop()` drains every queued task and runs `callback_update_slots()` once.
3. **`handle_decision` needs no slot and no new engine code.** It is a case in
   `process_single_task` (`server-context.cpp:2835`) - the same function wllama already drives. The
   HTTP route only builds a `server_task(SERVER_TASK_TYPE_DECISION)` with
   `task.decision_request = body` and reads one result (`server-context.cpp:5496`).
4. **Multimodal plumbing is in place**: `load_req` already has `mmproj_path`, `image_min_tokens`,
   `image_max_tokens`, `kv_unified`, `n_parallel`, `jinja`; `load_res` reports
   `has_image_input` / `has_audio_input`; chat already accepts `image` / `audio` parts.
5. **The decision engine is self-contained**: `decision-engine.{h,cpp}` depend only on `llama.h`,
   `common/json.h` and `common/chat.h` (banked by `chat.cpp`, already compiled by wllama).
   Media is decoded through a `std::function` callback the engine never inspects.
6. Docker 29.7.2 + compose v5.5.0 are available; the wasm build is
   `scripts/build_wasm.sh` (emsdk 4.0.20 image, mem64 + JSPI, no exceptions) and a compat build
   (asyncify) for Firefox/Safari.

### The one blocking gap

`--decision-seqs N` exists only as a CLI flag (`common/arg.cpp:2552`), and the flag handler also
forces the unified KV cache (`tools/server/server.cpp:162`). wllama never parses argv, it builds
`common_params` field by field from the glue message. So `n_seq_decision` has to be added to
`load_req` (wllama defaults `kv_unified = true` already, `src/wllama.ts:551`).

---

## 2. Goal / non-goals

**Goal.** A page, `momos-one`, where the user loads a small multimodal GGUF + mmproj, attaches an
image, writes instructions and a finite schema, and gets:

- the decision in one pass: assembled JSON, per-field probability, timing split into
  `prefill_ms` / `scoring_ms`, `scored_rows`, `rounds`, `media_tokens`, `cached_tokens`;
- optionally the same question answered token-by-token by a JSON-constrained chat completion, with
  its own first-token / total timing, so the page can show the ratio (the openjev.com framing, with
  pixels as the evidence);
- the exact request/response JSON, so the page doubles as the reference for the native endpoint.

Everything runs in the browser. No server, no upload.

**Non-goals (first cut).** Video, PDF rasterising, audio parts (unless cut 3 is pinned - see D3),
the game page from decision-playground, multiple models resident, prompt/media caching UI knobs,
Firefox/Safari parity (mem64 + JSPI on Chrome first; compat build later).

---

## 3. Data path

```
page (React)
  wllama.createDecision(body)                        src/wllama.ts
    -> worker: wllama.action('decision', {data_json})  src/worker.ts
      -> glue_msg_decision_req                         cpp/glue.hpp
        -> wllama_context::action_decision             cpp/wllama-context.h
             rd.post_task(server_task(SERVER_TASK_TYPE_DECISION){decision_request = body})
      -> get_result polls -> server_queue::start_loop()
        -> server_context_impl::process_single_task    (server-context.cpp:2835)
          -> handle_decision(body)                     (server-context.cpp:2444)
             compile_schema -> render_prompt -> tokenize_text
             mtmd_batch_encode + mtmd_helper_decode_image_chunk   (mmproj)
             llama_decision::engine::decide_batch_media
               llama_memory_seq_cp (fork from the cached prefix) + ONE llama_decode
             assemble() -> decision + fields
      -> server_task_result_decision -> JSON -> glue_msg_get_result_res -> TS
```

The request/response shape stays byte-identical to `POST /v1/decision`, so `decision-playground`'s
`lib/api.ts` types, `lib/schema.ts` field compiler and `lib/multimodal.ts` image preparation port
over with only the transport swapped (fetch -> wllama call).

---

## 4. Decisions that need your call before I write code

| # | question | my recommendation | cost of the alternative |
|---|---|---|---|
| **D1** | Where does the page live? | `wllama/examples/momos-one/` - Vite + React + TS, `@wllama/wllama: file:../../`, exactly like `examples/main` (it already imports `src/wasm/wllama.wasm?url` and handles the compat build). One repo, one build, the page proves the fork's feature. | separate `F:/lab/jev/momos-one` repo: cleaner split, needs its own wasm asset pipeline and a second place to rebuild |
| **D2** | How does wasm get the engine? | **(A)** point the `llama.cpp` submodule at the fork commit and add `tools/parallel-decision/decision-engine.cpp` to `WLLAMA_SRC`. wasm then runs the *same* `handle_decision` as the native server, so parity is free. | **(B)** vendor `decision-engine.{h,cpp}` into `cpp/` against upstream server sources: keeps the submodule on upstream, but re-implements the 120-line media decode + request parsing + errors in wllama, and drifts from the server |
| **D3** | Which fork state to pin? | `89f5c5d27` (committed, cut 1 + text parts + one image). Cut 3 is uncommitted, so it cannot be pinned or fetched. If you want audio/multi-image in v1, commit cut 3 first and I pin that. | pinning cut 3 unlocks audio parts and the encoder cache, and matches `tools/parallel-decision/README.md` as it stands in your working tree |
| **D4** | Probability bars need the whole distribution, which `assemble()` does not return (`fields[].{value,probability,scored_nodes,tree}` only). | add `"candidates": [{"value":..., "probability":...}, ...]` to `fields[name]` inside `assemble()` (`decision-engine.cpp`) when `fr.probs.size() == sp.values.size()`. ~6 lines, shared by server and wasm, so one response shape for both. | without it the page can only draw the winner's probability plus the numeric p10-p90 interval - much weaker visual for enums/booleans |
| **D5** | wllama API shape | thin, typed pass-through: `createDecision(body: DecisionRequest): Promise<DecisionResponse>`, mirroring the HTTP body 1:1, plus `getDecisionTimings()`. Keeps the library honest to the endpoint and keeps the playground types reusable. | a builder API (fields/choices/contexts as TS objects) is nicer to use but diverges from the wire format and doubles the surface to maintain |
| **D6** | Default model | `LFM2.5-VL-450M` Q4_0 + mmproj Q8_0 (`LiquidAI/LFM2.5-VL-450M-GGUF`, ~540 MB together) - it is the model wllama's own multimodal example and `examples/main` already ship, so the mtmd path is browser-proven. Add 1-2 alternates in a dropdown once measured. | a 2B VLM (Qwen3-VL-2B class) decides better but downloads ~1.5-2 GB and needs a bigger KV budget in wasm |

Nothing else in this plan needs a llama.cpp change. D4 is the only edit I would propose to the fork,
and only if you want the bars.

---

## 5. Phases

### P0 - spike: wasm builds with the engine (highest risk, do first)

1. Initialize the submodule from the local fork clone (no network fetch, keeps history):
   ```bash
   cd /f/lab/jev/wllama
   git clone /f/lab/jev/llama.cpp llama.cpp
   git -C llama.cpp checkout 89f5c5d27
   git -C llama.cpp remote set-url origin https://github.com/thecodacus/llama.cpp.git
   git add llama.cpp            # records the pin; .gitmodules url -> the fork (D2/A)
   ```
2. `CMakeLists.txt`: add `${CMAKE_CURRENT_SOURCE_DIR}/llama.cpp/tools/parallel-decision/decision-engine.cpp`
   to `WLLAMA_SRC` and its directory to `include_directories`.
3. `./scripts/build_wasm.sh` (docker, emsdk 4.0.20). Expect breakage where wllama's glue meets the
   fork's server API (the fork sits ~4 commits past upstream `60b06ab9a`, wllama's pin is older).
   Fixes belong in `cpp/`, never in `llama.cpp/`.
4. Acceptance: `esm/index.js` + `wasm/wllama.wasm` build; the multimodal example still loads
   LFM2.5-VL and completes; `wllama.debug` reports the loaded context.

**This is the go/no-go point.** If the fork's tree cannot be made to build under emscripten within a
bounded effort, D2/B (vendor the engine, keep upstream server sources) is the fallback.

### P1 - native side: glue action + load params

- `cpp/glue.hpp`: `glue_msg_decision_req { data_json }` -> `glue_msg_decision_res { success, req_id }`,
  plus `n_seq_decision` on `glue_msg_load_req`.
- `cpp/wllama-context.h`: `action_decision()` copied from `post_decision`
  (`server-context.cpp:5496`): parse the body, `server_task task(SERVER_TASK_TYPE_DECISION)`,
  `task.id = rd.get_new_id()`, `task.decision_request = body`, `post_task`, `register_reader`.
  In `action_load`: `params.n_seq_decision = req.n_seq_decision.value` (require `>= 3`) and keep
  `params.kv_unified = true`. Reject early with a clear message when `n_seq_decision < 3` or when a
  media context arrives with no mmproj - the engine already returns those as JSON errors.
- `cpp/wllama.cpp`: `WLLAMA_ACTION(decision)`.
- `npm run build:glue` to regenerate `src/glue/messages.ts`.

### P2 - wllama TS API

- `src/types/types.ts`: `DecisionRequest` / `DecisionResponse` (result item, field, usage, timings) and
  `n_seq_decision` in the load params.
- `src/wllama.ts`: `createDecision(body)` per D5 - post, then reuse the existing `getResponse` poll
  loop (the decision is a single non-streaming result, so one or two polls).
- `src/worker.ts`: nothing, the action name is generic.
- Optional helper: `imageFromBlob(blob, { maxPx })` -> downscale + JPEG + `data:image/...;base64,...`
  part, ported from `decision-playground/src/lib/multimodal.ts` (it measured 2310x3072 -> 1102 image
  tokens / 739 ms vs 1024 px -> 336 tokens / 332 ms, same answer; in wasm downscale harder, 512 px,
  and set `image_max_tokens`).

### P3 - momos-one page

Single scrolling page, numbered sections, minimal/technical like openjev.com:

```
momos-one                     [browser only] [no backend] [your timings] [1.56 GB model]
multimodal system-1, in your browser

00 / setup     Load the model once            model select + download/cache, load, warmup meters
01 / evidence  Give it something to look at   drop / paste image, preview, context text
02 / question  Ask a finite question          instructions, schema editor (enum/boolean/int/number), presets
03 / one pass  System-1 decision               per-field bars, assembled JSON, prefill/scoring ms, rows
04 / token by token  Generation                streaming JSON-constrained completion, tokens, t/s, first token
                                              measured wall-time ratio: one pass vs N tokens
                                              raw request / response JSON (collapsible)
```

- Reuse from `decision-playground`: schema editor + presets idea, decision card, stopwatch,
  model select, and the "compare against generation" panel.
- Presets that suit a 450M VLM: `subject / count / setting / indoors / text-in-image` etc.
- Load params for the demo: `n_ctx 8192`, `n_parallel 1`, `n_seq_decision 12`, `n_batch 2048`,
  `n_ubatch 1024`, `n_threads` = cores-1, `jinja true`, `warmup true`, image bounded to <= 256 tokens.
  (An image is decoded in one non-causal batch, so `n_ubatch` must be >= its token count - the
  engine returns a clean 400 instead of aborting.)
- Show real numbers (`performance.now()`), not claims.

### P4 - verification, docs, deploy

- **Parity**: the same request (same model, text-only context) on the native fork server and in the
  browser must give identical `decision` and identical probabilities. This is the strongest evidence
  the wasm port is faithful. Record the two JSON blobs side by side.
- **Media**: one image, one schema, in the browser - capture `media_tokens`, `scoring_ms`,
  `total_ms`, and the memory figure from `wllama.debug`.
- **Tests**: no new tests under `llama.cpp/tests` (AGENTS.md). In wllama, at most one vitest case
  that loads a tiny text model and asserts the decision API returns a well-formed result; the
  multimodal path stays a manual smoke test (model download size).
- README section in `examples/momos-one`, and a short note in the wllama README next to the
  multimodal example.
- Deploy target: static build (`vite build`) - GitHub Pages, or the existing
  `scripts/build_hf_space.sh` route if you want it on HF Spaces. Weights stay on Hugging Face, the
  browser caches them.

---

## 6. Risks

| risk | why | mitigation |
|---|---|---|
| fork tree vs wllama glue API drift | wllama pins a different upstream commit than the fork's base; wllama calls `oaicompat_chat_params_parse`, `server_schema::eval_llama_cmpl_schema`, `get_meta()` etc. | P0 first; fixes in `cpp/` only; fallback D2/B |
| decision engine needs the unified KV cache | branch forking shares the trunk's cells via `seq_cp` | wllama already defaults `kv_unified: true`; set it explicitly when `n_seq_decision > 0` |
| image does not fit one ubatch | non-causal span cannot be split | bound image tokens (`image_max_tokens`, 512 px downscale) and require `n_ubatch >= image tokens`; the engine already 400s with the exact number |
| wasm memory | model + KV + `n_seq_decision` branches + compute buffers | 450M Q4 model, `n_ctx 8192`, `n_parallel 1`, `n_seq_decision 12`; measure with `wllama.debug`; mem64 build allows > 4 GB but slower |
| sliding-window / hybrid attention models | some backbones allocate KV per sequence, branches get expensive | LFM2 (reads `n_swa` if the GGUF has it) and Gemma are the suspects; measure branch cost at `n_seq_decision 12`, drop to 6 if needed |
| first-run wall time | wasm CPU prefill of an image + schema | show the meters on the page (download, load, warmup); publish honest ms numbers |
| compat build (Firefox/Safari) | asyncify + no mem64; long synchronous decision pass | out of scope for v1; ship the mem64/JSPI path and mark the compat build as a follow-up |
| decision quality of a 450M VLM | it is a tiny model | the page reports probabilities, so a low-confidence answer is visible rather than hidden; a model dropdown covers the rest |

---

## 7. Rough sequencing and cost

| phase | work | estimate |
|---|---|---|
| P0 | submodule pin + CMake + docker build + glue fixes | 2-4 h agent time, 2x 30-60 min builds (wasm + compat) |
| P1 | glue messages, `action_decision`, load param, regenerate glue | 1-2 h |
| P2 | TS types + `createDecision` + image helper | 2-3 h |
| P3 | page: layout, schema editor, both runs, visualisation | 1-2 days |
| P4 | parity run, measurements, README, static build | 3-4 h |

---

## 8. Open questions

1. D1-D6 above (repo layout, submodule pin, cut 3 in or out, `candidates` in the response, API shape,
   default model).
2. Do you want the page to also run a **text-only** decision (no image) as a control, or strictly
   multimodal?
3. Should momos-one keep the wllama fork's `examples/main`-style compat fallback to the CDN
   (`setCompat('default')`) or always use the locally built wasm?
4. Anything published (openjev.com style) at the end, or is a local dev server enough?

## 9. What I will not do

No commits, no pushes, no PRs, no reviewer replies. No edits under `wllama/llama.cpp/` (the submodule
pin is the only thing that moves, and it moves by `git submodule`/`git add`, tracked as a bump).
No changes to `decision-playground` unless you ask.
