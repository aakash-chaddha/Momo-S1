# momos-one: multimodal system-1 (JEV) decisions in the browser

Status: `ready-for-agent`
Tracker: local (no issue tracker is configured for the momos-one work; see Further Notes)
Supersedes nothing. Companion plan: `momos-one-plan.md`

---

## Problem Statement

The fork has a working `POST /v1/decision` endpoint: it scores every allowed value of a finite schema
as token branches forked from one cached context, so a whole answer comes back from one batched
forward pass, with a probability per field, and the JSON is assembled by code instead of generated
token by token. Since the media work, the fields are scored directly on the pixels - an image's
encoder output is decoded into the trunk before the branches fork, no caption in between.

The problem is that this is only reachable by someone who can build and run a native server with a
multi-gigabyte vision model and a GPU. The interesting property of the method - one pass, exact
probabilities, on-schema by construction - cannot be seen or measured by anyone else, and cannot be
compared against the token-by-token alternative in the same sitting.

wllama proves the pieces are available in a browser: it compiles the llama.cpp server context in wasm,
links mtmd, loads an mmproj, and already runs multimodal chat completions client-side. What is missing
is the decision path itself: `--decision-seqs` is a CLI-only flag, so wllama cannot enable the
endpoint at all, and there is no page that shows what a system-1 answer looks like next to a generated
one.

## Solution

A page, **momos-one**, that runs multimodal JEV entirely in the browser:

- it loads a small VLM (model + mmproj) into wasm through wllama, cached by the browser after the
  first visit;
- the user gives it evidence (one or more images) and a question as a finite schema: fields with an
  allowed set of values or a bounded range, each with a short description;
- one press runs a single decision pass and shows the answer as an assembled JSON object plus a
  probability per field, drawn as candidate bars, with the timing split into prefill and scoring, the
  number of scored rows, how many tokens the image took, and the raw request and response JSON;
- optionally, the same question is asked again as a JSON-constrained chat completion, streamed token
  by token with its own first-token and total time, so the page can show the measured ratio between
  one pass and N tokens on the machine the visitor is actually using;
- everything happens locally: no backend, no upload, and no request that leaves the page after the
  weights are cached.

The decision engine is not re-implemented in TypeScript. The wasm build runs the same
`handle_decision` code path as the native server, so a request that answers correctly on the server
answers identically in the browser.

## User Stories

**First visit, setup**

1. As a visitor, I want to load the model with one press, so that I can see the feature without assembling a server.
2. As a visitor, I want a progress meter for download and cache, model load, and warmup, so that I know the page is working and not hung.
3. As a visitor, I want to know the model's size before I download it, so that I can decide whether my connection and my device can take it.
4. As a visitor on a low-memory device, I want a clear failure when the model cannot be loaded, so that I am not left with a blank page.
5. As a returning visitor, I want the weights to come from the browser cache, so that the second visit is fast.
6. As a privacy-minded visitor, I want the page to state that nothing is uploaded and that the weights come from a public Hugging Face repo, so that I can trust it with a personal photo.
7. As a visitor, I want to see the model name and quantization that is currently loaded, so that I know what answered.

**Evidence**

8. As a visitor, I want to attach an image by drag and drop, by file picker, or by paste, so that I can use what is already on my clipboard.
9. As a visitor, I want to see a preview of the image that will be sent, so that I do not run a decision on the wrong file.
10. As a visitor, I want my large photo to be downscaled before it reaches the model, so that the decision does not cost far more tokens than the answer is worth.
11. As a visitor, I want to see how many tokens the image took, so that I can tell the difference between a cheap and an expensive image.
12. As a visitor, I want to attach several images and have each be its own context, so that I can decide about a whole set in one pass and compare the results side by side.
13. As a visitor, I want to use the page with no image at all, so that I can compare a text-only decision against a multimodal one.
14. As a visitor, I want to remove an attachment before running, so that a mistake does not require a reload.

**The question**

15. As a visitor, I want to pick an example question, so that I see a realistic schema before I write one.
16. As a visitor, I want to write instructions in plain language, so that the fields are answered in the sense I mean.
17. As a visitor, I want to add a field, name it, choose its type (enum, boolean, integer, number) and give it a short description, so that I can ask my own question without hand-writing JSON.
18. As a visitor, I want a per-field explanation of what the description is used for, so that I understand my words are the only thing steering the answer.
19. As a visitor, I want to write a bounded integer with a minimum and maximum, so that "how many" questions are answered with a number rather than a label.
20. As a visitor, I want to choose whether a numeric field's answer is the mode, the median, or the mean of its distribution, so that I can pick what the number means.
21. As a visitor, I want the schema to be validated before the run, so that I get a readable message instead of a model-side failure.
22. As a visitor, I want to paste or edit a whole schema as JSON when the form is too slow, so that I can bring my own schema from elsewhere.
23. As a visitor, I want to copy the equivalent HTTP request for my current settings, so that I can run the same decision against a native server.
24. As a developer, I want the page's request and response to be byte-compatible with the endpoint, so that a client I write against the page also works against the server and the reverse.

**The decision run**

25. As a visitor, I want one press to run the decision, so that the cost of asking is one action.
26. As a visitor, I want to see the answer as one JSON object with the fields' selected values, so that I can read it as an answer and not as probabilities.
27. As a visitor, I want a probability per field, so that I can tell a confident answer from a coin flip.
28. As a visitor, I want the distribution over a field's allowed values, so that I can see whether the second-best value was close.
29. As a visitor, I want the numeric fields to show an interval, so that a "how many" answer reads with its uncertainty.
30. As a visitor, I want to know whether a field was scored exhaustively or walked greedily, so that I know how much of the distribution to trust.
31. As a visitor, I want the timing split into prefill, scoring, and total, so that I can see where the wall time actually goes.
32. As a visitor, I want to know how many rows were scored, so that I can connect the cost to the size of my schema.
33. As a visitor, I want to switch between the exact distribution and the cheap walk, so that I can trade quality for speed on a slow device.
34. As a visitor, I want to reuse a cached prefix across runs, so that repeating a decision with a changed image does not pay for the instructions again.
35. As a visitor, I want to cancel a run that is taking too long, so that the page is not stuck.
36. As a visitor, I want to see a clear error when the image is larger than the batch can take, with the number to change, so that I know it is a limit and not a crash.
37. As a visitor, I want to see a clear error when the loaded model has no vision encoder, so that I know to pick a multimodal model.
38. As a visitor, I want to see the raw request and response JSON, so that I can verify nothing was invented by the page.
39. As a visitor, I want to copy or download the result JSON, so that I can keep it as evidence of a run.
40. As a visitor, I want the page to keep the last result while I change the schema, so that I can compare two questions on the same image.

**The comparison**

41. As a visitor, I want to run the same question as a streamed, JSON-constrained completion, so that I can see the same answer generated token by token.
42. As a visitor, I want the generated run's own timing, first token time, and tokens per second, so that the comparison is between measured numbers and not a claim.
43. As a visitor, I want the ratio between one pass and the generated run shown with the run numbers, so that I can see the point of the method on my own machine.
44. As a visitor, I want both runs to use the same image and the same schema, so that the comparison is fair.
45. As a visitor, I want each run's answer side by side, so that I can see where generation invents a value that is not in my schema.
46. As a visitor, I want to know that the two runs are sequential and share nothing, so that the timings are not contaminated.

**Understanding what happened**

47. As a developer, I want the page to name the pieces of the pass (prefix, trunk, branches, scored rows), so that I can map the picture onto the engine.
48. As a developer, I want to know the sequence budget the decision was run with, so that I can tell why a wide schema degraded.
49. As a developer, I want to see which parts of the prompt were cached, so that I can reason about the cost of a repeated request.
50. As a maintainer, I want the browser path to call the same `handle_decision` as the server, so that parity is structural and not a re-implementation I have to keep in sync.
51. As a maintainer, I want the wasm build to pin one fork commit, so that a build is reproducible and I can tell which engine shipped.
52. As a maintainer, I want a documented parity check between a native server and the browser on the same model and request, so that I can prove the port is faithful before shipping a release.
53. As a maintainer, I want the load parameters that the page uses written down, so that I can reproduce a user's report.
54. As a user of the library, I want the decision API typed and documented next to the existing chat and embedding APIs, so that I can use it without reading the page.

**Access and honesty**

55. As a visitor on a phone, I want the page to be usable in a single column, so that I can try it without a desktop.
56. As a keyboard user, I want every control reachable and operable, so that I am not blocked by the drag and drop.
57. As a screen reader user, I want probability bars to have text equivalents, so that the numbers are not visual-only.
58. As a visitor, I want the page to say a 450M model is a small model and its answers can be wrong, so that I do not read the probabilities as truth.
59. As a visitor, I want to be told when a probability is low, so that a weak answer is visible rather than hidden behind a confident-looking JSON.
60. As a visitor, I want the page to work with no analytics or third-party script, so that my images and questions stay on my machine.
61. As a visitor, I want a way to report that something is broken, so that the maintainer hears about it.

## Implementation Decisions

### The engine stays where it is

The decision engine and the endpoint already exist in the fork and are not re-implemented:

- the browser runs the same request handler as the native server, reached through the server's own
  task queue, so the parsing, schema compilation, prompt rendering, tokenisation, media encode,
  media decode into the trunk, branch scoring, aggregation, and error taxonomy are shared code;
- the wasm build pins one fork commit that contains the engine, and the engine's source is added to
  the wasm target's sources and include path;
- no change to the engine is required for the feature to work.

### Load parameters (the one real gap)

`--decision-seqs` is CLI-only, so a native decision surface cannot be enabled from the library today.
The load request gains a decision sequence count, with the same meaning as the flag: the number of
sequence slots reserved for decisions above the chat slots, minimum 3, disabled at 0. When it is set
above zero the context uses a unified KV cache (the library already defaults to unified, and the
requirement is that branches can share the trunk's cells). A decision request made while the count is
below the minimum fails as a request error, not a crash.

The other load parameters the feature depends on are already in the load request and are used, not
added: the mmproj path, the batch and micro-batch sizes (a micro-batch must be at least as large as
the image's token count, because an image is decoded in one non-causal batch), the image token bounds,
the chat template options, and the context size.

### The decision API

One new public method on the wllama instance, a pass-through to the endpoint's body:

- input: the same JSON body the endpoint accepts - `instructions`, `schema` (compact field specs or a
  JSON Schema object), `contexts` (each a string or a list of content parts), and the optional
  `mode`, `tree_max`, `cache_prompt`, `cache_media`;
- output: the endpoint's response body, typed - the assembled `decision`, `fields` with `value`,
  `probability`, `scored_nodes`, `tree` and, for numeric fields, the interval; `usage` with prompt,
  cached, context, media, media-cached tokens and scored rows; `timings` with prefill, scoring, total,
  rounds, and per-decision time;
- errors: the endpoint's messages surface as library errors with the same text, so the page does not
  invent its own vocabulary.

Transport-wise the call travels over the existing binary glue protocol as one request/response message
pair, and the response is read through the existing result-polling path, so the new surface is small
and consistent with the chat and embedding calls.

### Per-candidate probabilities

The response as it stands reports only the winner's probability per field. Bars over the allowed
values need the whole distribution. The engine's field result already carries it when the field was
scored exhaustively, so the assembled field gains an optional list of value/probability pairs,
present exactly when a full distribution exists. This is a small additive change in the engine's
assembler, shared by the server and the browser, and it is the only change proposed to the fork for
this work. It is additive: existing clients keep working.

### The page

A single scrolling page with numbered sections, in the spirit of the existing browser experiment for
the text-only case:

- `00 / setup` - model choice (one default, plus alternates once measured), download, load and warmup
  meters, and the model's size before the download;
- `01 / evidence` - attachments (drag and drop, file picker, paste), previews, and the context text.
  Images are downscaled and re-encoded before they become data URLs; one image becomes one context,
  so a gallery decides in one pass and returns one result per image;
- `02 / question` - instructions, the schema editor (field rows: name, type, description, allowed
  values or bounds and step, aggregate for numerics), presets, and a JSON view for the whole request;
- `03 / one pass` - the decision result: assembled JSON, per-field probability with candidate bars,
  the numeric interval, the exhaustive/walked marker, `usage`, `timings`, and the raw JSON;
- `04 / token by token` - the same question as a JSON-constrained completion, streamed, with first
  token time, tokens per second, total time, and the same raw JSON view;
- a measured wall-time ratio between the two runs, computed from `performance.now()` on the visitor's
  machine, never asserted from a benchmark.

The page's states, which the UI must render distinctly because each has its own failure mode:

```
idle -> downloading -> loading -> warming -> ready -> deciding -> done
                                        |           |          |
                                        |           |          -> error (schema, media, model, ubatch)
                                        |           -> generating -> done
                                        -> error (load)
```

Two decisions inside the page:

- the fields a user writes are the compact form the endpoint already documents (name, type,
  description, choices or bounds, aggregate). The form is a view over that object, not a second
  schema language, so the JSON view and the HTTP view are always the same object;
- the default scoring mode is the automatic one; an explicit "exact distribution" toggle forces the
  exhaustive mode, which is what the bars need. The page shows which mode produced a result.

### Model

The default is a small, browser-proven multimodal model (about half a gigabyte for model plus
projector), chosen because wllama's own multimodal example already loads it and its mtmd path is
verified in a browser. Alternates are added only after they are measured on the page's own parameters.
Load parameters for the page are fixed and documented: a small context, one chat slot, a decision
sequence budget in the low tens, a micro-batch large enough for the bounded image, the chat template
enabled, and warmup on.

## Testing Decisions

What makes a good test here: it asserts the external contract of the public API - the shape and
validity of a decision response, and the error taxonomy - and never the internals of the engine, the
prompt text, or the order of tokens. Tests must be able to fail for a user-visible reason.

**Seam 1 (the only permanent seam): the public decision API.** A browser test loads a small model
from Hugging Face and calls the decision API directly, with no page involved. It covers:

- a decision over a small schema returns one result per context, in order, with every field answered
  by a value from its own allowed set - the property that makes the method's output on-schema by
  construction;
- probabilities are present, inside their range, and the winner is consistent with the distribution
  when the distribution is reported;
- usage and timing fields are present and internally consistent (scored rows greater than zero,
  prompt tokens accounting for context, media and cached tokens);
- a second identical request with prefix reuse on returns the same decision as the first - the
  branch/prefix machinery must not change an answer;
- the decision sequence count below the minimum, a malformed schema, and an empty context list each
  produce a request error carrying the engine's own message rather than a hang or a crash.

Prior art in the repository: the existing browser test suite for the public API already loads real
small models from Hugging Face in vitest browser mode and asserts behaviour through the public
methods, and the model-manager suite does the same for loading. The new test belongs in that suite
and follows its sequential, one-model-per-test style.

**Verification run (not automated, documented): native versus browser parity.** The same request on
the same model through the native CLI tool and through the wasm build must produce the same decisions
and the same probabilities. This is evidence for a release, recorded next to the page's README with
the two JSON bodies, because it needs a native build and a real vision model and therefore cannot run
in the test suite. This is the strongest available statement that the port is faithful.

**Optional: glue round-trip.** The repository has a manual, unautomated C++ check of glue message
serialisation. Adding the new message pair to it is cheap and follows existing prior art, but the
binary is not built or run by any automated job, so it is not a seam the feature depends on.

**Not tested:** the React page (no UI test in this cut - the page holds no logic that is not either a
pure display of the response or covered by the API seam), the native endpoint (it already has its own
documented manual verification), and the model's answer quality (a 450M model's quality is not a
pass/fail property).

## Out of Scope

- Video parts (mtmd has no video chunk; frames arrive as images).
- PDF rasterisation and audio parts, unless the fork's in-progress media work is pinned, in which case
  audio parts are inherited from the endpoint rather than built for the page.
- Firefox and Safari (the compat build's asyncify path for a long synchronous decision pass is a
  follow-up; the first cut targets the multithreaded, memory64 path).
- The game from the existing playground, and the multi-model router behaviour.
- Prompt and media caching knobs in the UI beyond reuse on/off, and any caching of encoder output
  across page reloads.
- WebGPU offload, LoRA, multiple resident models, and any server-side deployment of the endpoint.
- Training, fine-tuning, or any change to the model weights.
- Publishing to a domain, analytics, accounts, or sharing links.

## Further Notes

- **Tracker.** No issue tracker is configured for this work, and both repositories' contributor rules
  forbid creating issues on the contributor's behalf, so the spec is published as a file next to the
  plan. The status line above carries the `ready-for-agent` label. If it should live in a real tracker,
  say which one and it can be filed by you directly.
- **The fork has uncommitted work.** The media cut that adds audio parts, several images per context,
  and an encoder cache is staged and in the working tree but not committed, so it cannot be pinned or
  fetched. The default assumption is that the browser port pins the last commit, which has text parts
  and one image per context. Pinning the newer cut needs it committed first, and it widens the page's
  media support for free.
- **Submodule drift is the main build risk.** The library pins a different upstream base than the
  fork's, and the library's native glue calls server APIs that move. The first phase is therefore a
  build spike against a pinned fork commit, with fixes kept in the library's own glue, never in the
  submodule. If that spike cannot be made to pass in a bounded effort, the fallback is to vendor the
  engine into the library against upstream server sources - at the cost of duplicating the media
  decode and request handling, and of losing structural parity.
- **The build is container-based.** The wasm target is built in an emscripten container (memory64 and
  JSPI for the default target, asyncify for the compat target), which is why the pinned submodule must
  be checked out on the host before the container runs.
- **Honesty about the model.** A half-gigabyte VLM answers small questions imperfectly. The page is
  built to show that rather than hide it: probabilities, distributions, the exhaustive/walked marker,
  low-confidence highlighting, and a line that says the model is small.
- **No acting on the user's behalf.** This work does not commit, push, open pull requests, or write
  reviewer replies, in either repository.
