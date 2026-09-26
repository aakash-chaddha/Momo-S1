# Native - browser parity

One request, the same weights, the same schema, the same image, posted to a native build of the fork
and to the wasm build in the browser. Recorded 2026-09-26 on this machine.

- request: `docs/parity-request.json` (the body the page sent; the image is the one the page prepared)
- native response: `docs/parity-native.json` - `llama-server.exe` build 11054, commit `89f5c5d27`,
  MSVC, CPU (`-ngl 0`), `--decision-seqs 12 --kv-unified -c 8192 -b 2048 -ub 1024 --jinja`
- browser response: `docs/parity-browser.json` - this repository's wasm build (memory64 + JSPI),
  headless Edge 153, CPU (no WebGPU in headless), the page's load parameters

## Decisions

```
browser {"kind":"scene","count":1,"indoors":true,"setting":"indoors","text_in_image":true,"text_kind":"none","color":"green","time_of_day":"day"}
native  {"kind":"scene","count":1,"indoors":true,"setting":"indoors","text_in_image":true,"text_kind":"none","color":"green","time_of_day":"day"}
identical: true
```

## Per-field probability

| field | value | browser | native | delta (pp) |
|---|---|---|---|---|
| `kind` | "scene" | 68.63% | 69.62% | 0.999 |
| `count` | 1 | 82.88% | 82.89% | 0.010 |
| `indoors` | true | 95.10% | 94.81% | 0.281 |
| `setting` | "indoors" | 84.04% | 83.96% | 0.078 |
| `text_in_image` | true | 70.21% | 69.74% | 0.467 |
| `text_kind` | "none" | 99.69% | 99.68% | 0.013 |
| `color` | "green" | 98.11% | 98.12% | 0.012 |
| `time_of_day` | "day" | 96.62% | 96.83% | 0.206 |

Largest delta: **0.999 pp**. The decisions are identical and every probability
agrees within one percentage point; the residue is float noise between the wasm SIMD kernels and the
native CPU kernels, not a difference in the method.

## Usage

| | prompt | cached | context | media | scored rows |
|---|---|---|---|---|---|
| browser | 640 | 0 | 24 | 72 | 47 |
| native | 640 | 0 | 24 | 72 | 47 |

(The native build is the fork's working tree with the in-progress media cut, which is why it also
reports `media_cached_tokens`; the wasm build pins `89f5c5d27` plus the `candidates` patch and the
media encoder cache. Neither changes the decision.)

## Timing (same machine, different backends)

| | prefill | scoring | total |
|---|---|---|---|
| browser (wasm, 16 threads) | 12149 ms | 2193 ms | 14342 ms |
| native (CPU, `-ngl 0`) | 329 ms | 181 ms | 509 ms |

## Repeat it

```bash
# 1. native
llama-server -m LFM2.5-VL-450M-Q4_0.gguf --mmproj mmproj-LFM2.5-VL-450m-Q8_0.gguf   --decision-seqs 12 --kv-unified -c 8192 -b 2048 -ub 1024 --jinja -ngl 0 --port 8099
curl -s localhost:8099/v1/decision -d @docs/parity-request.json

# 2. browser
npm run build && npm run smoke   # needs the model already cached, or run it once to download
# compare with docs/parity-browser.json
```
