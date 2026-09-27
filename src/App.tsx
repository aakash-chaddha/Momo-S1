import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wllama,
  type DecisionContentPart,
  type DecisionRequest,
  type DecisionResponse,
  type LoadedContextInfo,
} from '@wllama/wllama';
import {
  DECISION_SEQS,
  DEFAULT_MODEL,
  LOG_LEVEL,
  MAX_IMAGE_EDGE,
  MODELS,
  WLLAMA_PATHS,
  loadParams,
  totalSize,
} from './config';
import { DEFAULT_PRESET, PRESETS } from './lib/presets';
import { formatBytes, prepareImage, type PreparedImage } from './lib/multimodal';
import { parseForm, validateSchema, valueCount, type Json } from './lib/schema';
import {
  idleDecisionRun,
  idleGenerationRun,
  runDecision,
  runGeneration,
  generationRequestBody,
  type DecisionRun,
  type GenerationAnswer,
  type GenerationRun,
} from './lib/runs';
import { fetchSample, SAMPLES } from './lib/samples';
import {
  installWebMcpTools,
  type EvidenceInput,
  type MomosTools,
  type QuestionInput,
} from './lib/webmcp';
import { EvidencePanel } from './components/EvidencePanel';
import { Island } from './components/Island';
import { Scene } from './components/Scene';
import { QuestionPanel } from './components/QuestionPanel';
import { DecisionPanel, GenerationPanel } from './components/RunPanels';
import { ComparePanel } from './components/ComparePanel';
import { RawJson } from './components/RawJson';
import { Cell, Readout, sec } from './components/Readout';
import { StageRail, type StageRow } from './components/StageRail';
import { StatusBar } from './components/StatusBar';
import { NativeHandoff } from './components/NativeHandoff';
import { AgentHandoff } from './components/AgentHandoff';
import type { LaneSpec } from './components/ForkRail';

type Phase = 'idle' | 'downloading' | 'loading' | 'ready';

// what a run reports back to its caller (the buttons ignore it, the webmcp tools return it)
type DecisionOutcome =
  | { ok: true; response: DecisionResponse; wallMs: number }
  | { ok: false; error: string };
type GenerationOutcome =
  | { ok: true; answers: GenerationAnswer[] }
  | { ok: false; error: string };

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;
const THREADS = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);

// The compat build (asyncify, no memory64) is a follow-up; the first cut targets the multithreaded,
// JSPI build. Say so instead of failing mysteriously.
const UA = navigator.userAgent;
const isFirefox = /Firefox\//.test(UA);
const isSafari = /^((?!chrome|chromium|android).)*safari/i.test(UA);

// ---------------------------------------------------------------------------------------------
// A dev-only verification seam. `e2e/ui-shots.mjs` injects a RECORDED response (the real one in
// e2e/out/summary.json) so the populated layout can be photographed without a 307 MiB download.
// It is read once, only in a dev build, only behind ?fixture, and it computes nothing the real run
// does not: the image is downscaled by the page's own prepareImage().
// ---------------------------------------------------------------------------------------------
interface Fixture {
  phase?: Phase;
  info?: LoadedContextInfo | null;
  decision?: DecisionRun;
  generation?: GenerationRun;
  image?: string;
  // the request the recorded run was made with: the page then shows the run it depicts
  request?: { instructions?: string; schema?: Json; context?: string };
}

function readFixture(): Fixture | null {
  if (!import.meta.env.DEV) return null;
  if (typeof location === 'undefined') return null;
  if (!new URLSearchParams(location.search).has('fixture')) return null;
  return (window as unknown as { __momosFixture?: Fixture }).__momosFixture ?? null;
}

const FIXTURE = readFixture();

export default function App() {
  const [phase, setPhase] = useState<Phase>(FIXTURE?.phase ?? 'idle');
  const [modelId, setModelId] = useState(DEFAULT_MODEL.id);
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState<LoadedContextInfo | null>(FIXTURE?.info ?? null);

  const [instructions, setInstructions] = useState(
    FIXTURE?.request?.instructions ?? DEFAULT_PRESET.instructions
  );
  const [schemaText, setSchemaText] = useState(() =>
    JSON.stringify(FIXTURE?.request?.schema ?? DEFAULT_PRESET.schema, null, 2)
  );
  const [context, setContext] = useState(FIXTURE?.request?.context ?? DEFAULT_PRESET.context);
  const [presetId, setPresetId] = useState(DEFAULT_PRESET.id);
  const [image, setImage] = useState<PreparedImage | null>(null);

  const [decision, setDecision] = useState<DecisionRun>(FIXTURE?.decision ?? idleDecisionRun);
  const [generation, setGeneration] = useState<GenerationRun>(
    FIXTURE?.generation ?? idleGenerationRun
  );
  const [decisionIndex, setDecisionIndex] = useState(0);

  const wllamaRef = useRef<Wllama | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const model = MODELS.find((m) => m.id === modelId) ?? DEFAULT_MODEL;
  const live = image && !image.error ? image : null;

  const schemaObj = useMemo<Json | null>(() => {
    try {
      const parsed = JSON.parse(schemaText || '{}');
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Json)
        : null;
    } catch {
      return null;
    }
  }, [schemaText]);
  const schemaProblem = schemaObj ? validateSchema(schemaObj) : 'the schema is not a JSON object';

  const descriptions = useMemo(() => {
    const out: Record<string, string> = {};
    if (!schemaObj) return out;
    const props = (schemaObj.properties ?? schemaObj) as Record<
      string,
      { description?: string }
    >;
    for (const [name, field] of Object.entries(props)) {
      if (field && typeof field === 'object' && typeof field.description === 'string') {
        out[name] = field.description;
      }
    }
    return out;
  }, [schemaObj]);

  // the lanes the fork rail draws before anything has run: real fields, real value counts
  const schemaLanes = useMemo<LaneSpec[]>(() => {
    if (!schemaObj) return [];
    try {
      return parseForm(schemaObj).fields.map((f) => {
        const n = valueCount(f);
        return { name: f.name, values: Number.isFinite(n) ? n : 0 };
      });
    } catch {
      return [];
    }
  }, [schemaObj]);

  const busy = decision.running || generation.running;
  const contextsReady = !!live || context.trim().length > 0;
  const canRun = phase === 'ready' && !busy && !schemaProblem && contextsReady;

  // ----- fixture seeding (dev only, and only under ?fixture) -----
  useEffect(() => {
    const url = FIXTURE?.image;
    if (!url) return;
    let cancelled = false;
    void (async () => {
      const blob = await (await fetch(url)).blob();
      const file = new File([blob], url.split('/').pop() ?? 'sample.png', { type: blob.type });
      const prepared = await prepareImage(file, MAX_IMAGE_EDGE);
      if (!cancelled) setImage(prepared);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- actions -----

  const loadModel = useCallback(async (pick?: string) => {
    // `pick` comes from the webmcp load-model tool; the button calls this with no argument
    const m = MODELS.find((x) => x.id === pick) ?? model;
    setLoadError('');
    setProgress(0);
    setDownloaded(false);
    setPhase('downloading');
    let w = wllamaRef.current;
    if (!w) {
      w = new Wllama(WLLAMA_PATHS, {
        logger: {
          debug: (...a: unknown[]) => console.debug('[wllama]', ...a),
          log: (...a: unknown[]) => console.log('[wllama]', ...a),
          warn: (...a: unknown[]) => console.warn('[wllama]', ...a),
          error: (...a: unknown[]) => console.error('[wllama]', ...a),
        },
      });
      wllamaRef.current = w;
    }
    try {
      await w.loadModelFromHF(
        { repo: m.repo, file: m.file, mmprojFile: m.mmprojFile },
        {
          ...loadParams(m),
          log_level: LOG_LEVEL,
          progressCallback: ({ loaded, total }) => {
            if (total) setProgress(Math.min(1, loaded / total));
            if (total && loaded >= total) {
              setDownloaded(true);
              setPhase('loading');
            }
          },
        }
      );
      setInfo(w.getLoadedContextInfo());
      setPhase('ready');
      return { ok: true as const, error: '' };
    } catch (e) {
      // a context that failed to load cannot be reused; the next press starts a fresh instance
      await w.exit().catch(() => undefined);
      wllamaRef.current = null;
      setPhase('idle');
      setDownloaded(false);
      const message = (e as Error)?.message || String(e);
      setLoadError(message);
      return { ok: false as const, error: message };
    }
  }, [model]);

  // Switching weights means a different context: drop the loaded engine, not just the state.
  const selectModel = useCallback(
    async (id: string) => {
      if (id === modelId) return;
      const w = wllamaRef.current;
      wllamaRef.current = null;
      setModelId(id);
      setPhase('idle');
      setInfo(null);
      setDownloaded(false);
      setProgress(0);
      setLoadError('');
      setDecision(idleDecisionRun);
      setGeneration(idleGenerationRun);
      if (w) await w.exit().catch(() => undefined);
    },
    [modelId]
  );

  // one image only: adding another replaces the one that is there, and the same image twice
  // (a second click on a sample, a repeated paste) is a no-op instead of a second context
  const addImage = useCallback(async (file: File) => {
    const prepared = await prepareImage(file, MAX_IMAGE_EDGE);
    setImage((prev) =>
      prev && prev.name === prepared.name && prev.size === prepared.size ? prev : prepared
    );
  }, []);

  const removeImage = useCallback(() => {
    setImage(null);
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(preset.id);
    setInstructions(preset.instructions);
    setSchemaText(JSON.stringify(preset.schema, null, 2));
    setContext(preset.context);
  }, []);

  const buildContexts = useCallback((): DecisionRequest['contexts'] => {
    const text = context.trim();
    const parts: DecisionContentPart[] = [];
    if (text) parts.push({ type: 'text', text });
    if (live) parts.push({ type: 'image_url', image_url: { url: live.url } });
    return parts.length ? [parts] : [text];
  }, [context, live]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startDecision = useCallback(async (external?: AbortSignal): Promise<DecisionOutcome> => {
    const w = wllamaRef.current;
    if (!w || !schemaObj)
      return { ok: false, error: 'the model is not loaded, or the schema is not valid' };
    const body: DecisionRequest = {
      instructions,
      schema: schemaObj,
      contexts: buildContexts(),
      mode: 'auto',
      cache_prompt: true,
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    // only a real AbortSignal is forwarded: a stray first argument (a click event, say) is not one
    const sig = external instanceof AbortSignal ? external : undefined;
    const forwarded = () => ctrl.abort();
    sig?.addEventListener('abort', forwarded);
    setGeneration(idleGenerationRun);
    setDecision({
      ...idleDecisionRun,
      running: true,
      status: 'deciding (one batched pass; the first run encodes the image)',
      request: body,
    });
    try {
      const { response, wallMs } = await runDecision(w, body, ctrl.signal);
      setDecision({
        running: false,
        status: `done · ${response.results.length} decision${
          response.results.length === 1 ? '' : 's'
        } · engine ${(response.timings.total_ms / 1000).toFixed(1)} s · wall ${(wallMs / 1000).toFixed(1)} s`,
        error: '',
        wallMs,
        response,
        request: body,
      });
      setDecisionIndex(0);
      return { ok: true, response, wallMs };
    } catch (e) {
      const aborted = ctrl.signal.aborted;
      const message = (e as Error)?.message || String(e);
      setDecision({
        ...idleDecisionRun,
        status: aborted ? 'stopped' : 'error',
        error: aborted ? '' : message,
        request: body,
      });
      return { ok: false, error: aborted ? 'stopped' : message };
    } finally {
      abortRef.current = null;
      sig?.removeEventListener('abort', forwarded);
    }
  }, [buildContexts, instructions, schemaObj]);

  const startGeneration = useCallback(async (external?: AbortSignal): Promise<GenerationOutcome> => {
    const w = wllamaRef.current;
    if (!w || !schemaObj)
      return { ok: false, error: 'the model is not loaded, or the schema is not valid' };
    const contexts = buildContexts();
    const input = {
      instructions,
      schema: schemaObj,
      contexts,
      images: contexts.map(() => (live ? live.bytes : null)),
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const sig = external instanceof AbortSignal ? external : undefined;
    const forwarded = () => ctrl.abort();
    sig?.addEventListener('abort', forwarded);
    setGeneration({
      ...idleGenerationRun,
      running: true,
      status: 'generating (JSON-constrained, token by token)',
    });
    try {
      const answers = await runGeneration(w, input, ctrl.signal, (i, text) => {
        setGeneration((g) => ({
          ...g,
          current: text,
          currentIndex: i,
          status: `streaming context ${i + 1} of ${contexts.length}`,
        }));
      });
      setGeneration({
        running: false,
        status: `done · ${answers.length} completion${answers.length === 1 ? '' : 's'}`,
        error: '',
        answers,
        current: '',
        currentIndex: 0,
      });
      return { ok: true, answers };
    } catch (e) {
      const aborted = ctrl.signal.aborted;
      const message = (e as Error)?.message || String(e);
      setGeneration((g) => ({
        ...g,
        running: false,
        status: aborted ? 'stopped' : 'error',
        error: aborted ? '' : message,
        current: '',
      }));
      return { ok: false, error: aborted ? 'stopped' : message };
    } finally {
      abortRef.current = null;
      sig?.removeEventListener('abort', forwarded);
    }
  }, [buildContexts, instructions, live, schemaObj]);

  // one press, both answers: the pass first, then the generation, so the comparison below is
  // always made from a pair that ran back to back on the same question
  const runBoth = useCallback(
    async (external?: AbortSignal) => {
      const decision = await startDecision(external);
      const generation = decision.ok ? await startGeneration(external) : null;
      return { decision, generation };
    },
    [startDecision, startGeneration]
  );

  // ----- webmcp: the same page functions, callable by a browser agent -----
  // The handlers read the state of this render and call the very callbacks the buttons call, so
  // a tool run and a click are the same run. They are rebuilt every render and kept in a ref;
  // the tools themselves are registered once, below.
  const toolsRef = useRef<MomosTools | null>(null);

  useEffect(() => {
    const loadModelFn = loadModel;
    const applyPresetFn = applyPreset; // property names are not bindings; alias what collides
    toolsRef.current = {
      status: () => ({
        phase,
        ready: phase === 'ready',
        canRun,
        busy,
        model: { id: model.id, name: model.name, repo: model.repo },
        models: MODELS.map((m) => ({
          id: m.id,
          name: m.name,
          note: m.note,
          download: totalSize(m),
        })),
        evidence: {
          image: live ? { name: live.name, size: live.size, note: live.note } : null,
          text: context,
        },
        question: { preset: presetId, instructions, schema: schemaObj, problem: schemaProblem },
        presets: PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          blurb: p.blurb,
          needsImage: !!p.needsImage,
        })),
        samples: SAMPLES.map((s) => ({ file: s.file, name: s.name, caption: s.caption })),
        runs: {
          decision: {
            status: decision.status,
            error: decision.error,
            wallMs: decision.wallMs,
            response: decision.response,
          },
          generation: {
            status: generation.status,
            error: generation.error,
            answers: generation.answers,
          },
        },
      }),

      loadModel: async (pick?: string) => {
        if (pick && !MODELS.some((m) => m.id === pick))
          throw new Error(
            `unknown model "${pick}"; available: ${MODELS.map((m) => m.id).join(', ')}`
          );
        if (pick && pick !== modelId) await selectModel(pick);
        const done = await loadModelFn(pick);
        if (!done.ok) throw new Error(done.error);
        return { ok: true, model: pick ?? modelId, phase: 'ready' };
      },

      setEvidence: async (input: EvidenceInput) => {
        if (input.clearImage) removeImage();
        if (input.sample) {
          const s = SAMPLES.find((x) => x.file === input.sample);
          if (!s)
            throw new Error(
              `unknown sample "${input.sample}"; available: ${SAMPLES.map((x) => x.file).join(', ')}`
            );
          await addImage(await fetchSample(s));
        }
        if (input.imageUrl) {
          const res = await fetch(input.imageUrl);
          if (!res.ok) throw new Error(`could not fetch the image: ${res.status}`);
          const blob = await res.blob();
          const name = input.imageUrl.split('/').pop()?.split('?')[0] || 'evidence';
          await addImage(new File([blob], name, { type: blob.type || 'image/png' }));
        }
        if (typeof input.text === 'string') setContext(input.text);
        return {
          ok: true,
          evidence: {
            image: input.clearImage && !input.sample && !input.imageUrl ? null : input.sample ?? input.imageUrl ?? live?.name ?? null,
            text: typeof input.text === 'string' ? input.text : context,
          },
        };
      },

      applyPreset: (preset: string) => {
        const p = PRESETS.find((x) => x.id === preset);
        if (!p)
          throw new Error(
            `unknown preset "${preset}"; available: ${PRESETS.map((x) => x.id).join(', ')}`
          );
        applyPresetFn(preset);
        return { ok: true, question: { preset: p.id, instructions: p.instructions, schema: p.schema, context: p.context } };
      },

      setQuestion: (input: QuestionInput) => {
        if (input.schema) {
          const problem = validateSchema(input.schema);
          if (problem) throw new Error(`schema rejected: ${problem}`);
          setSchemaText(JSON.stringify(input.schema, null, 2));
        }
        if (typeof input.instructions === 'string') setInstructions(input.instructions);
        return {
          ok: true,
          question: {
            instructions: typeof input.instructions === 'string' ? input.instructions : instructions,
            schema: input.schema ?? schemaObj,
          },
        };
      },

      runDecision: async (signal?: AbortSignal) => {
        if (phase !== 'ready') throw new Error('the model is not loaded yet: call load-model first');
        if (busy) throw new Error('a run is already in flight: call stop-run first');
        const out = await startDecision(signal);
        if (!out.ok) throw new Error(out.error);
        return { ok: true, wallMs: Math.round(out.wallMs), response: out.response };
      },

      runGeneration: async (signal?: AbortSignal) => {
        if (phase !== 'ready') throw new Error('the model is not loaded yet: call load-model first');
        if (busy) throw new Error('a run is already in flight: call stop-run first');
        const out = await startGeneration(signal);
        if (!out.ok) throw new Error(out.error);
        return { ok: true, answers: out.answers };
      },

      runBoth: async (signal?: AbortSignal) => {
        if (phase !== 'ready') throw new Error('the model is not loaded yet: call load-model first');
        if (busy) throw new Error('a run is already in flight: call stop-run first');
        const out = await runBoth(signal);
        return { ok: out.decision.ok, ...out };
      },

      stopRun: () => {
        cancel();
        return { ok: true, stopped: true };
      },
    };
  });

  // register once; the tools keep calling the latest handlers through the ref
  useEffect(() => installWebMcpTools(() => toolsRef.current as MomosTools), []);

  // ----- render -----

  const preset = PRESETS.find((p) => p.id === presetId);
  const decisionWallMs = decision.response ? decision.wallMs : null;
  const generationTotalMs = generation.answers.length
    ? generation.answers.reduce((a, b) => a + b.wallMs, 0)
    : null;
  const ratio =
    decisionWallMs && generationTotalMs ? generationTotalMs / decisionWallMs : null;

  const stageRows: StageRow[] = useMemo(
    () => [
      {
        id: 'stage-00',
        num: '00',
        name: 'setup',
        state: loadError ? 'bad' : phase === 'ready' ? 'ok' : phase === 'idle' ? 'idle' : 'run',
        note:
          phase === 'ready'
            ? `${model.name} loaded`
            : phase === 'downloading'
              ? `${(progress * 100).toFixed(0)}% of ${mb(totalSize(model))}`
              : phase === 'loading'
                ? 'loading into wasm'
                : 'not loaded',
      },
      {
        id: 'stage-01',
        num: '01',
        name: 'evidence',
        state: live ? 'ok' : 'idle',
        note: live
          ? `image${context.trim() ? ' + text' : ''}`
          : context.trim()
            ? 'text only'
            : 'empty',
      },
      {
        id: 'stage-02',
        num: '02',
        name: 'question',
        state: schemaProblem ? 'bad' : 'ok',
        note: schemaProblem
          ? 'schema problem'
          : `${schemaLanes.length} fields · ${schemaLanes.reduce((a, l) => a + l.values, 0)} values`,
      },
      {
        id: 'stage-03',
        num: '03',
        name: 'one pass',
        state: decision.running ? 'run' : decision.error ? 'bad' : decision.response ? 'ok' : 'idle',
        note: decision.running
          ? 'deciding'
          : decision.response
            ? `${sec(decision.wallMs) ?? ''} wall · ${decision.response.usage.scored_rows} rows`
            : 'not run',
      },
      {
        id: 'stage-04',
        num: '04',
        name: 'token by token',
        state: generation.running
          ? 'run'
          : generation.error
            ? 'bad'
            : generation.answers.length
              ? 'ok'
              : 'idle',
        note: generation.running
          ? 'streaming'
          : generation.answers.length
            ? `${sec(generationTotalMs) ?? ''}${ratio ? ` · ${ratio.toFixed(1)}×` : ''}`
            : 'not run',
      },
      {
        id: 'stage-05',
        num: '05',
        name: 'side by side',
        state: ratio ? 'ok' : 'idle',
        note: ratio ? `${ratio.toFixed(1)}× gen / pass` : 'run both to compare',
      },
    ],
    [
      context,
      decision.error,
      decision.response,
      decision.running,
      decision.wallMs,
      generation.answers.length,
      generation.error,
      generation.running,
      generationTotalMs,
      live,
      loadError,
      model.name,
      phase,
      progress,
      ratio,
      schemaLanes,
      schemaProblem,
    ]
  );

  // verification hook: the smoke test in e2e/ reads the raw states instead of scraping the DOM
  useEffect(() => {
    (window as any).__momos = { phase, info, decision, generation, schemaObj, modelId };
  }, [phase, info, decision, generation, schemaObj, modelId]);

  // Only what the engine actually reported. A field it does not report is left out rather than
  // filled with a zero, and a value that differs from the requested one is marked.
  const ctxValues: { k: string; want: string | null; got: string }[] = [];
  if (info) {
    const raw = info as unknown as Record<string, unknown>;
    const wanted: [string, string | null][] = [
      ['n_ctx', '8192'],
      ['n_batch', '2048'],
      ['n_ubatch', '1024'],
      ['n_layer', null],
      ['n_embd', null],
    ];
    for (const [k, want] of wanted) {
      if (raw[k] == null) continue;
      ctxValues.push({ k, want, got: String(raw[k]) });
    }
    ctxValues.push({ k: 'vision', want: 'yes', got: info.has_image_input ? 'yes' : 'no' });
  }

  return (
    <>
      <Scene />
      <div className="app" data-phase={phase}>
      <a className="skip" href="#stage-00">
        skip to the stages
      </a>

      <div className="shell">
        <StageRail
          brand="Momo-S1"
          sub="system-1"
          claim={
            <>
              A multimodal model that thinks once and answers whole: the entire schema scored
              against your image in <strong>one batched forward pass</strong>, in this browser,
              with <strong>a probability per field</strong> and no way to answer off schema. Then
              the same weights write the answer the slow way, so both routes can be compared on
              your own machine.
            </>
          }
          rows={stageRows}
          foot={
            <>
              <ul className="rail-facts">
                <li>browser only</li>
                <li>no backend, no upload</li>
                <li>llama.cpp /v1/decision in wasm</li>
                <li>up to {DECISION_SEQS} decision sequences</li>
              </ul>
              <span className="status">
                {MODELS.length} model{MODELS.length === 1 ? '' : 's'} · {model.name}
              </span>
            </>
          }
        />

        <main className="stages">
          {isFirefox ? (
            <div className="notice">
              Firefox: this cut ships the memory64 + JSPI build only. If the page does not load the
              model, the compat build (asyncify) is the follow-up.
            </div>
          ) : null}
          {!isFirefox && isSafari ? (
            <div className="notice">
              Safari: this cut ships the memory64 + JSPI build only; the compat build is a
              follow-up.
            </div>
          ) : null}

          {/* ------------------------------------------------ 00 setup */}
          <section className="stage" id="stage-00">
            <div className="stage-head">
              <span className="stage-num">00</span>
              <h2>setup</h2>
              <span className="stage-note">load the model once; the browser caches the weights</span>
            </div>

            <div className="deck">
              <div className="deck-island">
              <div className="panel panel--raise deck-live">
                <div className="panel-key">the engine, on this machine</div>

                {phase === 'ready' ? (
                  <>
                    <div className="load-state">
                      <span className="big">ready</span>
                      <span>
                        {info?.has_image_input ? 'vision encoder on' : 'no vision encoder'}
                        {info ? ` · ${info.n_ctx} ctx` : ''}
                      </span>
                    </div>
                    <p className="lede" style={{ marginTop: 'var(--s-3)', marginBottom: 0 }}>
                      The model runs in the browser: there is no server to upload to. The weights
                      came from <code>{model.repo}</code> and now live in this browser&apos;s cache,
                      so the next visit loads them in seconds.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="load-state">
                      {phase === 'idle' ? (
                        <>
                          <span className="big">{mb(totalSize(model))}</span>
                          <span>to download, once</span>
                        </>
                      ) : (
                        <>
                          <span className="big tnum">
                            {phase === 'downloading' ? `${(progress * 100).toFixed(0)}%` : 'loading'}
                          </span>
                          <span>
                            {phase === 'downloading'
                              ? `${mb(progress * totalSize(model))} of ${mb(totalSize(model))}`
                              : 'into wasm and warming up'}
                          </span>
                        </>
                      )}
                    </div>

                    {phase !== 'idle' ? (
                      <div
                        className="progress"
                        data-indeterminate={downloaded ? 'true' : 'false'}
                        role="progressbar"
                        aria-valuenow={downloaded ? undefined : Math.round(progress * 100)}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="model download"
                      >
                        <div style={{ ['--p' as string]: downloaded ? 1 : progress }} />
                      </div>
                    ) : null}

                    <div className="status">
                      {phase === 'idle'
                        ? `${model.name}: model ${formatBytes(model.size)} + projector ${formatBytes(model.mmprojSize)}`
                        : phase === 'downloading'
                          ? 'the browser caches this; the second visit reads it back'
                          : 'the encoder is warmed before the first decision'}
                    </div>

                    <div className="row" style={{ marginTop: 'var(--s-4)' }}>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => void loadModel()}
                        disabled={phase === 'downloading' || phase === 'loading'}
                      >
                        {phase === 'idle' ? 'load the model' : 'loading…'}
                      </button>
                      <span className="status">{THREADS} threads</span>
                    </div>
                  </>
                )}

                {loadError ? <div className="error">{loadError}</div> : null}

                <div className="row" style={{ marginTop: 'var(--s-4)' }}>
                  <label className="inline" htmlFor="model-choice">
                    model
                  </label>
                  <select
                    id="model-choice"
                    value={modelId}
                    disabled={phase === 'downloading' || phase === 'loading' || busy}
                    onChange={(e) => void selectModel(e.target.value)}
                  >
                    {MODELS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} · {mb(totalSize(m))}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="status" style={{ marginTop: 'var(--s-2)' }}>
                  {model.note}
                </div>
              </div>
                <Island />
              </div>

              <div className="panel deck-spec">
                <div className="panel-key">the load this page asks for</div>
                <dl className="spec-list">
                  <div>
                    <dt>n_ctx</dt>
                    <dd>8192</dd>
                  </div>
                  <div>
                    <dt>n_batch</dt>
                    <dd>2048</dd>
                  </div>
                  <div>
                    <dt>n_ubatch</dt>
                    <dd>
                      1024 <i>at least the image tokens</i>
                    </dd>
                  </div>
                  <div>
                    <dt>n_seq_decision</dt>
                    <dd>
                      {DECISION_SEQS} <i>prefix, trunks, branches</i>
                    </dd>
                  </div>
                  <div>
                    <dt>image max tokens</dt>
                    <dd>256</dd>
                  </div>
                  <div>
                    <dt>image edge</dt>
                    <dd>
                      {MAX_IMAGE_EDGE} px <i>?edge= to change it</i>
                    </dd>
                  </div>
                  <div>
                    <dt>jinja</dt>
                    <dd>
                      true <i>the model&apos;s own chat template</i>
                    </dd>
                  </div>
                  <div>
                    <dt>threads</dt>
                    <dd>{THREADS}</dd>
                  </div>
                </dl>

                {info ? (
                  <>
                    <div className="panel-key" style={{ marginTop: 'var(--s-5)' }}>
                      reported by the engine
                    </div>
                    <Readout>
                      {ctxValues.map((c) => (
                        <Cell
                          key={c.k}
                          k={c.k}
                          v={c.got}
                          hot={c.want != null && c.want !== c.got}
                          sub={c.want != null && c.want !== c.got ? `asked for ${c.want}` : undefined}
                        />
                      ))}
                    </Readout>
                  </>
                ) : (
                  <div className="status" style={{ marginTop: 'var(--s-4)' }}>
                    the engine reports its own numbers here once the model is loaded
                  </div>
                )}
              </div>
            </div>

            {info && !info.has_image_input ? (
              <div className="notice" style={{ marginTop: 'var(--s-5)' }}>
                The loaded context reports no vision encoder. Pick a multimodal model with an
                mmproj: image contexts will be rejected until then, text-only decisions still work.
              </div>
            ) : null}
          </section>

          {/* ------------------------------------------------ 01 evidence */}
          <section className="stage" id="stage-01">
            <div className="stage-head">
              <span className="stage-num">01</span>
              <h2>evidence</h2>
              <span className="stage-note">what the model gets to look at</span>
            </div>
            <EvidencePanel
              image={image}
              onAdd={addImage}
              onRemove={removeImage}
              context={context}
              setContext={setContext}
              disabled={busy}
            />
            {!contextsReady ? (
              <div className="notice">
                Add an image or write some context text: an empty context is rejected by the
                endpoint.
              </div>
            ) : null}
          </section>

          {/* ------------------------------------------------ 02 question */}
          <section className="stage" id="stage-02">
            <div className="stage-head">
              <span className="stage-num">02</span>
              <h2>question</h2>
              <span className="stage-note">{preset?.blurb ?? 'instructions and a finite schema'}</span>
            </div>
            <QuestionPanel
              instructions={instructions}
              setInstructions={setInstructions}
              schemaText={schemaText}
              setSchemaText={setSchemaText}
              onPreset={applyPreset}
              disabled={busy}
            />
          </section>

          {/* ------------------------------------------------ 03 one pass */}
          <section className="stage" id="stage-03">
            <div className="stage-head">
              <span className="stage-num">03</span>
              <h2>one pass</h2>
              <span className="stage-note">the system-1 run: one pass, with a probability per field</span>
            </div>
            <DecisionPanel
              run={decision}
              resultIndex={decisionIndex}
              setResultIndex={setDecisionIndex}
              onRun={startDecision}
              onCancel={cancel}
              canRun={canRun}
              descriptions={descriptions}
              schemaLanes={schemaLanes}
            />
            {decision.request ? (
              <RawJson
                label="request · POST /v1/decision · the same body against a native server started with --decision-seqs"
                value={decision.request}
                filename="momo-s1-decision-request.json"
              />
            ) : null}
          </section>

          {/* ------------------------------------------------ 04 token by token */}
          <section className="stage" id="stage-04">
            <div className="stage-head">
              <span className="stage-num">04</span>
              <h2>token by token</h2>
              <span className="stage-note">the autoregressive run, generated token by token</span>
            </div>
            <GenerationPanel
              run={generation}
              onRun={startGeneration}
              onCancel={cancel}
              canRun={canRun}
            />
            {generation.answers.length > 0 && schemaObj ? (
              <RawJson
                label="request · POST /v1/chat/completions body (first context)"
                value={generationRequestBody(
                  {
                    instructions,
                    schema: schemaObj,
                    contexts: buildContexts(),
                    images: [live ? live.bytes : null],
                  },
                  0
                )}
                filename="momo-s1-generation-request.json"
              />
            ) : null}
          </section>

          {/* ------------------------------------------------ 05 side by side */}
          <section className="stage" id="stage-05">
            <div className="stage-head">
              <span className="stage-num">05</span>
              <h2>side by side</h2>
              <span className="stage-note">both answers on the same fields, and both wall times</span>
            </div>
            <ComparePanel
              decision={decision}
              generation={generation}
              onRunBoth={runBoth}
              canRun={canRun}
              busy={busy}
            />
          </section>

          <NativeHandoff model={model} />
          <AgentHandoff />

          <footer className="colophon">
            <p className="panel-key">why this exists</p>
            <ol className="why">
              <li>
                one decision, not one word at a time: a multimodal model reads the pixels and the
                question and writes the whole answer in a single pass, with a probability on every
                field it chose.
              </li>
              <li>
                the answer is on schema, guaranteed: fields and values can only come from the
                schema you wrote, so a run may pick the wrong value but can never come back
                malformed.
              </li>
              <li>
                it all happens in this tab: the engine is wasm, the weights sit in your browser
                cache, and no image and no question is ever uploaded anywhere.
              </li>
              <li>
                the trick is not a new model. Ordinary autoregressive weights, asked to decide
                between the answers you allow instead of generating toward one, become a system-1
                model.
              </li>
              <li>
                and then the honest part: the same weights answer the same question the old way,
                and the two clocks and the two answers are laid side by side for you to judge.
              </li>
            </ol>
            <p>
              A 450M model answers small questions imperfectly, and the comparison is only worth
              something if that stays visible: every field carries its probability, numeric fields
              carry a p10-p90 interval, and fields scored by the cheap walk say so. Read a low
              probability as a weak answer, not as a fact.
            </p>
            <p>
              No analytics, no third-party scripts, and no request leaves the page once the weights
              are cached. The instructions you write are the only thing steering the answer besides
              the pixels.
            </p>
            <p>
              Something broken? The library: <a href="https://github.com/aakash-chaddha/wllama/issues">wllama issues</a> ·
              the engine: <a href="https://github.com/aakash-chaddha/llama.cpp/issues">llama.cpp fork issues</a>.
            </p>
            <p>
              If this saved you time:{' '}
              <a href="https://www.buymeacoffee.com/aakashchaddha">buy me a coffee</a>.
            </p>
          </footer>
        </main>
      </div>

      <StatusBar
        phase={
          phase === 'ready'
            ? decision.running || generation.running
              ? 'running'
              : 'ready'
            : phase
        }
        model={model.name}
        context={info?.n_ctx ?? null}
        threads={THREADS}
        isolated={typeof crossOriginIsolated === 'boolean' ? crossOriginIsolated : false}
        decisionWallMs={decisionWallMs}
        generationWallMs={generationTotalMs}
        ratio={ratio}
      />
      </div>
    </>
  );
}
