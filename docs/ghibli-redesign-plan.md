# momos-one · Ghibli redesign plan

**Status: shipped.** Every phase below was built and the suite is green: six passes (1280 / 390 /
360 / fixture ×2 / reduced motion) with zero contrast violations, no horizontal overflow, 14 of 14
keyboard stops with a visible ring, all eight interaction checks passing, and a `dist/` that is
cross-origin isolated with **zero external requests**. `npm run smoke` still drives the real model.

What is here is the plan as written, plus the record of where building it changed my mind. Those
are marked **[built]** or **[changed]** against the sections below.

The brief: make the page cool, 3D, scrollable and interactable, with Ghibli aesthetics. The page is
still the same tool: a local-first surface where a person loads a model, drops an image, writes a
finite schema, gets the whole schema decided in one batched pass with a probability per field, and
then watches the same answer arrive token by token. This plan changes how that reads, not what it
is, and not one line of engine code.

---

## 0. What is inherited and cannot be broken

The repo already contains a verification harness that encodes the product's honesty claims. A
redesign that breaks it has broken the product, so the harness is the contract.

**Commands that must stay green:**

| Command | What it protects |
|---|---|
| `npm run shots` | six passes (1280 / 390 / 360 / fixture ×2 / reduced-motion): pixel-measured text contrast, horizontal overflow, focus rings, dead anchors, alt text, one `h1`, no em dash, zero external requests, no console errors, the dist build's COOP/COEP isolation |
| `npm run smoke` | the real path: load the model, attach `samples/bliss.png`, run the decision and the generation |
| `npm run build` + the dist pass inside `shots` | `dist/` is self-contained and cross-origin isolated, and the `?fixture` seam is not in the production bundle |

**DOM contract to preserve verbatim** (all of it is asserted by name in `e2e/ui-shots.mjs` and
`e2e/decision-smoke.mjs`):

```
ids            #stage-00 #stage-01 #stage-02 #stage-03 #stage-04 #stage-wire
structure      section.stage · .rail-row > a[href="#stage-0X"] · .rail-state · .rail-list
               .statusbar · details.json > summary · #stage-02 .tabs button ("form" / "JSON")
fork rail      .lane (a <button>) · .lane-name · .lane-strip > .lane-seg · .lane-value · .lane-prob
               .fork-sweep
evidence       input[type=file] · .thumb .meta
labels         getByLabel('field name') · getByLabel('schema JSON')
button names   "load the model" · "run the decision" · "run token by token" · "+ add field"
               "download" · "copy" (and it must become "copied")
rail states    stage-02 .rail-state must read /N fields/ after edits
fixture seam   window.__momosFixture, gated on import.meta.env.DEV
```

**Copy rules the harness enforces:** exactly one `h1`; no em dash (`—`) anywhere in visible text;
every `<img>` has `alt` (prefer inline SVG with `aria-hidden="true"`, which has no such rule); every
`a[href^="#"]` has a live target.

**Hard rule for the new visuals:** text must stay legible on *composited pixels*, because that is
what is measured. Two consequences, both treated as design law rather than cleanup:

1. **No painterly gradient or texture may sit under a line of text.** Gradients, clouds, hills and
   grain live in scene layers and in panel margins. Text sits on flat, opaque panels.
2. **Text never fades.** An entrance animation that fades text in will be screenshotted mid-fade
   (the harness waits 160 ms after an instant scroll) and measured at partial alpha. So the reveal
   is split: the **panel shell** fades and translates, and the **text** only translates. Text is
   always composited at full opacity, so its contrast is deterministic rather than lucky. The
   result still reads as a heavy fade-up, and it reads better: the sheet of paper materialises and
   the words are already on it.

---

## 1. Concept: one gust and a drizzle

The engine's claim is that every allowed value is scored as a branch forked from one shared prefix,
so the whole schema resolves in **one batched decode** and the fields cannot see each other. Then
the same question is generated **token by token** so the two can be compared.

That is weather.

- **The one pass is a gust of wind.** It arrives once, crosses everything at once, and leaves the
  whole answer standing.
- **The generation is a drizzle.** It arrives drop by drop, patiently, and you can watch it.

Ghibli's whole vocabulary is wind, light, paper, grass and small living things, and every piece of
it maps onto something the engine actually does:

| Engine | Page |
|---|---|
| the shared prefix | one stem |
| the field branches, forked from it | branches off that stem |
| a candidate value and its probability | a leaf, sized and weighted by probability |
| the winning value | the leaf that turns amber |
| probability under 50 % | a pale, small leaf, not a red alarm |
| `greedy walk` vs `exact distribution` | a branch only partly visited vs one fully in leaf |
| image tokens | the weight of the evidence plate, stamped with what it cost |
| one batched pass | one gust |
| token-by-token generation | a drizzle, drop by drop |

**The tell-someone sentence:** "you press one button and a gust goes through the stem and every
branch leafs out at once, then you watch the same answer fall as a drizzle."

**Vibe, rolled:** *Editorial warmth* (cream paper, film grain, high-contrast serif display) crossed
with *Z-axis cascade* (depth planes, slight rotations, real parallax). The layout archetype is the
Z-axis cascade; the texture is warm paper, not glass.

---

## 2. Design system

### Palette (daylight paper)

Six roles plus the engine's own semantic states. Warm, sunlit, low-saturation, with one live accent.

```
--paper         #F7F0E1   the canvas: warm paper
--paper-2       #FBF6EA   raised panels
--paper-3       #EFE5D2   inset wells, code areas
--ink           #22301F   forest ink, all primary text
--ink-soft      #4C5A47   secondary text
--ink-faint     #5F685A   labels, captions (the lightest text token allowed anywhere)
--sky           #3F6F86   the live accent: running state, active control
--moss          #4F7743   ok / complete
--amber         #D08A2E   the winner, the one that turned
--terra         #AB5538   low confidence, errors (terracotta, never alarm red)
--line          #DCCFB4   hairlines (decoration only, never identifies a control)
--line-strong   #9B8D71   control borders (must clear 3:1 as a UI boundary)
```

**Measured, not asserted.** Every pair below was computed from the hex values with the WCAG
relative-luminance formula, the same maths the harness runs on composited pixels:

| pair | ratio | threshold | verdict |
|---|---|---|---|
| `ink` on `paper` / `paper-2` / `paper-3` | 12.25 / 12.89 / 11.13 | 4.5 | pass |
| `ink-soft` on `paper` / `paper-3` | 6.47 / 5.88 | 4.5 | pass |
| `ink-faint` on `paper` / `paper-2` / `paper-3` | 5.12 / 5.39 / 4.65 | 4.5 | pass, the tightest in the set |
| `paper` on `sky` | 4.83 | 4.5 | pass |
| `paper` on `terra` | 4.53 | 4.5 | pass |
| `paper` on `moss` | 4.57 | 4.5 | pass |
| `ink` on `amber` | 4.87 | 4.5 | pass |
| `line-strong` on `paper-2` | 3.02 | 3.0 | pass, and only just |

`ink-faint` is the one to watch: it clears 4.5:1 by 0.65 on `paper-3`, so it does not get made any
lighter for optical reasons. Anything lighter than `ink-faint` is decoration and never carries
words. These numbers are re-measured on real pixels in Phase 1, and Phase 1 does not end until the
harness agrees with them.

### Type

The page promises that **no request leaves it once the weights are cached**, so a font CDN is out.
Fonts are vendored as woff2 into `src/assets/fonts/` and served from the bundle.

- **Fraunces** (variable, optical size + SOFT/WONK axes) for display: warm, storybook, slightly
  hand-drawn. This is the Ghibli voice.
- **Nunito Sans** for UI text: rounded humanist, kind at 12 px, still honest for a tool.
- `ui-monospace` for every number. Tabular figures stay on (`font-variant-numeric: tabular-nums`).

Fallback stack if vendoring does not survive: `ui-serif, 'Iowan Old Style', Palatino, Georgia` for
display and `ui-rounded, 'Segoe UI', system-ui` for text. Neither is on the banned list.

Banned list is honoured: no Inter, Roboto, Arial, Open Sans or Helvetica anywhere, including in
fallback chains.

### Shape and texture

- Radii: 20 / 28 / 40 px and full pills. Nothing is square. Panels are **hand-cut paper**, so they
  carry a very slight rotation (±0.35 deg) on desktop and none on mobile.
- The double-bezel from the design language, translated into paper: a warm outer tray
  (`paper-3`, hairline, 8 px padding, 40 px radius) holding an inner sheet (`paper-2`, inset light
  edge `inset 0 1px 0 rgba(255,255,255,0.7)`, `calc(40px - 8px)` radius). Machined, but out of card
  stock instead of aluminium.
- Shadows are soft and warm, never harsh: `0 24px 60px -32px rgba(90, 70, 40, 0.35)`.
- Grain: an inline `feTurbulence` data-URI (no network) on a **fixed**, `pointer-events: none`
  overlay at ≤ 3 % opacity. It never sits on a scrolling container.
- Buttons: rounded pills, generous padding, with the trailing arrow nested in its own small circle
  that slides up-and-right on hover (`group-hover: translate-x-1 -translate-y-px scale-105`).

### Scene art

All imagery is inline SVG and CSS, painted in the repo: layered hills, clouds, a floating island,
grass, leaves, raindrops, a small soot-sprite. No stock photography, no generated raster, no
external URLs. The only photographic pixels on the page remain the reader's own evidence image.

---

## 3. The 3D technique, and why not WebGL

**Depth is CSS 3D (`perspective`, `preserve-3d`, `translateZ`, `rotateX/Y`) over painted SVG
planes. No Three.js, no WebGL canvas.** Three reasons, in order of weight:

1. **The page measures its own engine.** llama.cpp takes WebGPU when the browser has it. A WebGL
   render loop running beside inference competes for the same GPU and would distort the very
   timings the page reports as measured facts. The product's honesty claim is worth more than a
   shader.
2. **CSS 3D runs on the compositor**, animating `transform` and `opacity` only. It holds 60 fps
   next to a wasm model chewing sixteen CPU cores, where a WebGL scene would not.
3. **The bundle stays small.** This page already ships a wasm engine and pulls ~307 MiB of weights.
   Adding 600 KB of renderer for parallax clouds is not a trade worth making.

Scroll choreography uses `animation-timeline: view()` / `scroll()` where it is available (Chrome and
Edge are the supported browsers and both have it) with an `IntersectionObserver` fallback, and
`prefers-reduced-motion: reduce` turns the whole layer into a static composition.

**Mobile:** below 768 px every 3D transform is dropped, overlaps and rotations are removed, the
cascade becomes a single column with `gap-6`, and full-height sections use `min-h-[100dvh]` rather
than `h-screen`. The 3D is a desktop reward; the tool works everywhere.

---

## 4. Section by section

```
00  setup            a floating island in a sky; the load control as the island's engine house
01  evidence         the photo plate, floating, tiltable, stamped with what it cost in tokens
02  question         a field notebook spread: your schema written as leaves on a bare stem
03  one pass         THE GUST: the stem branches and leafs out, all at once. The peak.
04  token by token   THE DRIZZLE: the same answer falling drop by drop, then the ratio
close                handoff: the same request body, a real command line, a copy button
```

**00 · setup.** The hero is a dimensional sky: three to five painted planes (far hills, cloud banks,
a middle meadow, drifting pollen) at different `translateZ`, with pointer-tilt on the cloud planes
and scroll-scrubbed drift. Sitting in it, the floating island carries the load control. The wait is
still honest: real bytes, real progress, a real parameter table. Ghibli patience, not fake drama.
The island lifts a few pixels and the sky brightens when the model reports ready.

**01 · evidence.** Your own image on a paper plate with a deckled edge, `perspective` tilt that
follows the pointer, and a wax-stamp seal reading the token cost (`72 tokens`). Several images
become several plates on a drying line, slightly rotated. Drop, pick and paste all stay.

**02 · question.** The quiet before the peak, and it stays quiet. The field catalogue is a notebook
spread: one row per field on a hairline, the type and the allowed values written beside it. As you
add a field, a bare twig appears on the stem at the left margin, labelled with its value count, so
the shape of the next pass is visible before it costs sixteen seconds. Tabs (`form` / `JSON`) become
two paper tabs on the top edge of the sheet.

**03 · one pass. The peak.** The fork rail becomes **the stem**: one trunk (the shared prefix) and
one branch per field, each branch carrying a leaf per allowed value, leaf area proportional to
probability. On **one gust** every branch leafs out on the same timeline, because that is what the
engine does and a lane-by-lane fill would be a lie about it. Hovering or focusing a branch still
highlights its field row and vice versa; clicking jumps to the row. Ghost fields stay bare twigs.
Beside it: the timing split as a small anemometer (prefill / scoring / total), the exact-vs-greedy
marker as "fully in leaf" versus "partly visited", and the per-field distributions as petals that
fan out on hover.

**04 · token by token.** The drizzle. Tokens land one at a time as ink drops into the answer, and a
wind gauge beside it compares the two measured speeds (one pass vs generation) as a needle sweeping
to the ratio. Patient, low contrast by design, exactly as the energy curve wants.

**close.** The editable command line stays the ending (it is the honest close: the same request body
against a native server). It sits on a wooden desk plane with the colophon, and a copy button that
reports `copied`.

---

## 5. Interaction inventory

Everything below is `transform` / `opacity` only.

1. **Sky parallax.** Pointer move tilts the cloud planes (rAF-throttled, ±1.5 deg max); scroll
   scrubs the depth planes at different rates.
2. **The gust.** One sweep across the stem; every branch leafs out together (stagger of 0 inside a
   branch, all branches on one timeline).
3. **Branch ↔ row highlight.** The existing two-way highlight, kept, now also lifts the branch
   4 px on `translateZ`.
4. **Leaf hover.** A leaf grows to 1.15 and reveals its candidate label and exact probability.
5. **Photo plate tilt.** Pointer-tracked 3D tilt on the evidence plate, returning to rest with a
   spring curve on leave.
6. **Petal fan.** Hovering a field row fans its candidate petals out in a 3D arc; the winner is
   amber; a click flips the card to that field's raw JSON.
7. **Physical mode switch** (`auto | tree | greedy`): a chunky knob that slides between three
   notches.
8. **Soot sprite.** A tiny ink creature in the margin that scrubs along with scroll position and
   settles on the current stage. Decorative, `aria-hidden`, removed under reduced motion.
9. **Drizzle scrub.** In stage 04 the transcript can be scrubbed back and forth to any token point.

---

## 6. Motion choreography

```
--ease-spring  cubic-bezier(0.22, 1, 0.36, 1)     everything that settles
--ease-gust    cubic-bezier(0.16, 1, 0.3, 1)      the one-pass sweep
--ease-pop     cubic-bezier(0.34, 1.4, 0.64, 1)   leaf-out, stamps, toggles
```

No `linear`, no `ease-in-out`, no instant state change anywhere. Entrance reveals are a heavy
fade-up over 700 ms (`translate-y-12` → 0), driven by `IntersectionObserver` with `rootMargin` so
they start before the element is on screen. Parallax and depth are `animation-timeline` driven and
never touch `top`, `left`, `width` or `height`.

The entrance reveal, exactly: the panel shell goes `opacity 0 → 1` with `translate-y-8 → 0` over
700 ms; text inside it goes `translate-y-3 → 0` over the same 700 ms **at `opacity: 1` throughout**.
No `filter: blur` on anything that scrolls, because blur repaints and the guardrails are
transform-and-opacity only.

`prefers-reduced-motion: reduce` collapses all of it: reveals become instant, parallax and tilt are
off, the gust resolves without a sweep, and the drizzle prints the whole answer at once. The
harness has a dedicated reduced-motion pass and it must stay green.

---

## 7. Phases

Each phase ends green or it does not end.

| Phase | Work | Gate |
|---|---|---|
| **0. Baseline** | run `npm run shots` and the dist pass as they stand; keep `e2e/out/ui/summary.json` as the fixture | current suite is green before anything moves |
| **1. Tokens and type** | rewrite the `:root` block in `src/index.css` (palette, type, radii, shadow, the three easings), vendor the two woff2 files, `@font-face`, `index.html` meta + favicon + `color-scheme`, re-measure the contrast table above on real pixels and lock it | `npm run shots` green at all six viewports |
| **2. Scene layer + stage 00** | the painted sky planes, the island, the load control reskinned as the engine house, grain overlay, the first parallax | contrast + overflow + focus green |
| **3. Stages 01 and 02** | photo plate with tilt and stamp, the notebook spread, the field rows, the tabs | interaction pass green (add field, rename, JSON round-trip, presets) |
| **4. Stage 03, the signature** | the stem and branches, the single gust, leaves as distributions, the anemometer timing split, petal fans | lanes, `fork-sweep`, `lane-name` all still asserted green |
| **5. Stage 04 and close** | the drizzle, the ratio gauge, the command-line handoff | `#stage-wire` present, copy → `copied`, download writes real JSON |
| **6. Motion, mobile, reduced motion** | the easing pass, mobile collapse under 768 px, reduced-motion composition | 360 px and the reduced pass green |
| **7. Ship** | `npm run build`, the dist pass (isolation, zero external requests, no fixture seam), `npm run shots --update-docs` so `docs/img/*.webp` matches what the page now looks like, README wording that references the old look, and a new row in `scrollcraft/FINGERPRINTS.md` | full suite green, screenshots refreshed |

Deliverables per phase are diffs against the previous phase, so a regression points at one change.

---

## 8. Risks, named up front

1. **Contrast over painted art.** Mitigated by the flat-panel law (no gradient or texture under a
   line of text) and verified by the harness on composited pixels rather than by eye.
2. **Reveal animations caught mid-fade by a screenshot.** The harness waits 160 ms after an instant
   scroll, which is inside a 700 ms reveal. Splitting the reveal (shell fades, text does not) is
   what makes a mid-fade screenshot safe instead of lucky. This is the single most important rule
   in the plan and it is easy to violate by accident in one component, so it is checked in every
   phase, not only in Phase 6.
3. **3D transforms causing overflow at 360 px.** Mitigated by clipping scene containers, keeping
   text panels out of 3D space, and dropping all 3D below 768 px.
4. **Scroll-driven animations desynchronising the harness.** Screenshots are taken at fixed scroll
   positions, so any `animation-timeline` effect must resolve to a deterministic state at rest.
   Parallax and depth are safe; anything that changes text content on scroll is not allowed.
5. **Font vendoring.** The fallback stacks are already chosen and are not banned, so a failed
   download degrades the voice slightly and breaks nothing.
6. **Bundle weight.** Two variable woff2 files (~120 KB) plus SVG art. Trivial next to the wasm and
   the weights, and checked by the dist pass.

---

## 9. Decisions to confirm before Phase 1

All three came back "okay", so the plan's own recommendations were taken: **daylight paper**,
**vendored OFL fonts**, **full depth treatment**.

---

## 10. What changed while building it

Three things the plan got wrong, and what replaced them.

**1. The fade rule was too weak. [changed]** The plan said the panel shell may fade while the text
translates. That does not survive contact with the measurement: a shell at 60% opacity puts its
children's text at 60% alpha in the composited pixels, and `getComputedStyle(child).opacity` still
reports 1, so the harness measures a line it thinks is fully opaque. The rule that actually holds:

> **Nothing that contains words is ever made transparent. Entrances are a rise, not a fade.**

The reveal is `translate3d(0, 12px, 0) → 0`, scroll-driven via `animation-timeline: view()`, which
also makes it deterministic at every scroll position, so screenshots are reproducible. The travel
is 12 px and not 26: a transform promotes the element to its own layer and a scrubbed animation
lands it at fractional offsets, which resamples the glyphs inside it. Measured on the page, that
single change took the worst small-text line from 3.34:1 to 3.74:1 during motion.

**2. A leaf per candidate does not survive the data. [changed]** §1 mapped a candidate to a leaf
sized by probability. Built, it fails: the winner of a 68% field is one mark two hundred pixels
wide, and drawn as a blade it is a sausage; drawn fat, eight rows of statistics become eight brown
slabs. The numbers are a chart and should stay one. The plant lives where the metaphor is honest:
the **stem** is the shared prefix, the **branches** are the fields, the **buds** mark where each
branch leaves the trunk. The marks are thin rounded strokes, pale sage for the candidates and deep
moss for the winner, at equal height, because the width already encodes the probability and making
the winner taller would say the same thing twice and distort the proportions.

The warm accent was taken back out of the winners on purpose: eight ochre bars out-shout every
number beside them. Ochre is reserved for what is genuinely in flight.

**3. The saturated art had to leave the backdrop. [changed]** §2 put the island in the fixed scene.
Against real pixels the island's soil is 3.5:1 for the lightest text token: any caption over it
fails. The scene is therefore built out of **light** shapes only (clouds, sun, sky, near-white
ridges), which lift contrast under text instead of eating it, and the island moved into the empty
half of the setup deck, a slot with no text in it at all. That is the one place on the page allowed
to be saturated, and it is why.

**Not built, and why.** The drizzle scrub in stage 04 (§5.9) and the flip-to-JSON petal fan (§5.6)
were cut: the first needs a transcript model the streaming code does not expose, the second puts
interaction behind a gesture the harness's tab order cannot reach. Everything else in §5 shipped.

