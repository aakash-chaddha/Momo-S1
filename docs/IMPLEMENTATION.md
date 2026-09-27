# momos-one: implementation report

Implements `momos-one-plan.md` / `momos-one-spec.md`. Written 2026-09-26. No commits, no pushes, no
PRs in either repository; everything below is working-tree state.

## Where things are

| piece | location |
|---|---|
| the page | `F:/lab/jev/Momo-S1/` (standalone release repo; the page had been developed in `wllama/examples/momos-one/`) |
| the library API | `wllama.createDecision(body)` in `F:/lab/jev/wllama/src/wllama.ts`, types in `src/types/types.ts` |
| the glue action | `cpp/glue.hpp` (`decs_req` / `decs_res`, `n_seq_decision`), `cpp/wllama-context.h` (`action_decision`), `cpp/wllama.cpp` |
| the engine | pinned fork `89f5c5d27` (the `wllama/llama.cpp` submodule) + the `candidates` patch; the shipped wasm is prebuilt, see `lib/wllama/PROVENANCE.md` |
| the fork's copy of that patch | uncommitted edit in `F:/lab/jev/llama.cpp/tools/parallel-decision/decision-engine.cpp` |
| evidence | `docs/PARITY.md`, `docs/evidence-smoke.json`, `docs/parity-*.json`, `docs/img/` |
| tests | `wllama/src/decision.test.ts` (4 browser tests, added to the existing vitest suite) |

## Decisions taken (the plan's open questions, D1-D6)

- **D1** - the page was developed in `wllama/examples/momos-one/` and then moved to the standalone release repo `F:/lab/jev/Momo-S1/` on request: one repo, the prebuilt wasm,
  the page compiles the library straight from `../../src` (vite alias + tsconfig path), so no built
  `@wllama/wllama` package is needed.
- **D2** - option **A**: the submodule is pointed at the fork and `decision-engine.cpp` is added to
  `WLLAMA_SRC`, so wasm runs the same `handle_decision` as the server. The pin is staged
  (`git add llama.cpp` -> `89f5c5d27`); the fork commit is not on any public remote yet, so a fresh
  submodule init needs the local clone or a push.
- **D3** - the pin is `89f5c5d27` (cut 1 + cut 2 + one image per context). Cut 3 (audio, multiple
  images per context, encoder cache) is **not** in the browser build; the page's one-image-per-context
  gallery works on the pin.
- **D4** - implemented: `assemble()` now adds `candidates: [{value, probability}, ...]` to a field
  when its full distribution was scored. Shared by server and browser. The native binary on this
  machine predates the patch, which is why the parity run compares the winner's probability per field.
- **D5** - thin typed pass-through: `createDecision(body)` mirrors the HTTP body 1:1 and returns the
  endpoint's response body typed (`DecisionRequest` / `DecisionResponse`). The page builds the body;
  the library adds nothing. `createDecision` accepts an `abortSignal`, which is kept off the wire.
- **D6** - default model is `LiquidAI/LFM2.5-VL-450M-GGUF`: `LFM2.5-VL-450M-Q4_0.gguf` (209 MiB) +
  `mmproj-LFM2.5-VL-450m-Q8_0.gguf` (98 MiB). The page shows the real sizes from the HF repo.

Other open questions from the spec: the page runs text-only decisions too (preset "Ticket routing,
text only"); it uses the locally built wasm and does **not** set a CDN compat fallback; the deploy
target is a plain `vite build` and nothing was published.

## What was verified

**wasm build (P0).** `SKIP_COMPAT=1 ./scripts/build_wasm.sh` (docker, emsdk 4.0.20, memory64 + JSPI +
WebGPU) produced `src/wasm/wllama.wasm` (8.7 MB) + `wllama.js`; tsup and the `.d.ts` build pass. The
compat (asyncify) build was skipped on purpose - Firefox/Safari are out of scope for this cut.

**Page end-to-end (P3), headless Edge 153, 16 threads, CPU** - `node e2e/decision-smoke.mjs`:

```
model load (download + wasm load + warmup)   15.3 s
decision  wall 16.2 s   engine 14.3 s (prefill 12.1 s, scoring 2.2 s), 1 round, 47 scored rows
          640 prompt tokens, 24 context tokens, 72 media tokens, 8/8 fields exact distribution
generation wall 24.7 s  first token 17.8 s, 72 tokens, 9.9 t/s
ratio    1.7x (one pass vs the same question token by token)
```

Decision: `{kind: scene (68.6%), count: 1 (82.9%), indoors: true (95.1%), setting: indoors (84.0%),
text_in_image: true (70.2%), text_kind: none (99.7%), color: green (98.1%), time_of_day: day (96.6%)}`
- with `candidates` for every field, so the bars in section 03 are the engine's own distribution.

**API tests (P4)** - `npx vitest run src/decision.test.ts`: 4/4 passed in 15 s (on-schema answers per
context, distribution consistency, usage/timing accounting, prefix-cache stability, error taxonomy
including the engine's own `--decision-seqs` message).

**Native parity (P4)** - the same request body posted to `llama-server.exe` (build 11054, commit
`89f5c5d27`, CPU `-ngl 0`) and to the browser: **identical decisions**, every probability within
1.0 pp, identical usage (640/24/72/47). Full table and raw JSON in
`docs/PARITY.md` and `docs/parity-*.json`.

## What is not done

- The compat build (asyncify) for Firefox/Safari; the page says so.
- Native parity for the `candidates` array: the native binary predates the patch; rebuild the fork's
  server to compare distributions as well.
- Alternates in the model dropdown (spec: only after they are measured).
- No commits anywhere, as agreed. `git status` in wllama shows the full change set; the submodule
  pin is staged.
- The fork's `89f5c5d27` has not been pushed; the wasm pin therefore only reproduces on a machine
  with the local fork clone.

## Release packaging (added after the first draft)

- The project now lives in `F:/lab/jev/Momo-S1/` as a standalone repository: the page, the e2e
  runner, `public/samples/bliss.png`, the docs and screenshots, and a vendored copy of the library in
  `lib/wllama/src` (fork source + the prebuilt `wllama.wasm`). `npm install && npm run dev` works
  without the wllama fork, the llama.cpp fork or emscripten; `lib/wllama/PROVENANCE.md` records the
  snapshot and how to rebuild the wasm.
- The weights used by the optional native parity check live in `models/` (gitignored).
- `wllama/examples/momos-one` was removed from the fork. The fork keeps the library API, the glue
  action, the engine pin and `src/decision.test.ts`; its README points at this repository.

## UI refresh (added after the release packaging)

The page was rebuilt as a working surface rather than a styled document: the five stages became an
instrument with a stage rail for navigation, a bottom status bar carrying real telemetry, one
graphic per stage, and a bespoke diagram for the one pass. The design reasoning (grammar choice,
feeling curve, signature move, fingerprint row) is recorded in `scrollcraft/builds/momos-one-ui/BRIEF.md`
alongside this repository; the summary that matters here:

- **Signature move: the fork rail.** Stage 03 draws the pass from the response's own numbers: the
  shared prefix once, then one lane per field, each lane a stacked distribution over its allowed
  values, all resolving on a single sweep because they resolve in a single decode. A lane and its
  field row highlight each other, and each lane is a real button, so the diagram is navigable by
  keyboard and readable by a screen reader.
- **Depth without photography.** This world has no images to grade or parallax, so depth comes from
  elevation, edge light and overlap (the live control panel overlaps the readout beside it).
- **The palette was rebuilt around three line roles and three ink roles.** Previously one grey did
  the job of a row separator, a control border and a hover state, which put every input border at
  1.6:1 and every small label at 4.54:1. Row separators, panel frames and control borders are now
  three different values, and control borders clear 3:1 (WCAG 1.4.11) on the render.
- **Verified, not asserted.** `npm run shots` screenshots every stage at three widths in both the
  empty and populated states, and measures contrast on the composited pixels of every line of text
  at every scroll position, with the styled pair as an independent cross-check. Details in
  `e2e/out/ui/summary.json`; the procedure is in the README.
- **Screenshots are now WebP.** A grained dark page is a large PNG, and three of them are in the
  README: the same frames are about a twelfth of the size as WebP.
