import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Wllama,
  type DecisionContentPart,
  type DecisionRequest,
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
  type GenerationRun,
} from './lib/runs';
import { EvidencePanel } from './components/EvidencePanel';
import { Island } from './components/Island';
import { Scene } from './components/Scene';
import { QuestionPanel } from './components/QuestionPanel';
import { DecisionPanel, GenerationPanel } from './components/RunPanels';
import { RawJson } from './components/RawJson';
import { Cell, Readout, sec } from './components/Readout';
import { StageRail, type StageRow } from './components/StageRail';
import { StatusBar } from './components/StatusBar';
import { NativeHandoff } from './components/NativeHandoff';
import type { LaneSpec } from './components/ForkRail';

type Phase = 'idle' | 'downloading' | 'loading' | 'ready';

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

  const [instructions, setInstructions] = useState(DEFAULT_PRESET.instructions);
  const [schemaText, setSchemaText] = useState(() =>
    JSON.stringify(DEFAULT_PRESET.schema, null, 2)
  );
  const [context, setContext] = useState(DEFAULT_PRESET.context);
  const [images, setImages] = useState<PreparedImage[]>([]);

  const [decision, setDecision] = useState<DecisionRun>(FIXTURE?.decision ?? idleDecisionRun);
  const [generation, setGeneration] = useState<GenerationRun>(
    FIXTURE?.generation ?? idleGenerationRun
  );
  const [decisionIndex, setDecisionIndex] = useState(0);

  const wllamaRef = useRef<Wllama | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const model = MODELS.find((m) => m.id === modelId) ?? DEFAULT_MODEL;
  const live = images.filter((i) => !i.error);

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
  const contextsReady = live.length > 0 || context.trim().length > 0;
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
      if (!cancelled) setImages([prepared]);
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // ----- actions -----

  const loadModel = useCallback(async () => {
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
        { repo: model.repo, file: model.file, mmprojFile: model.mmprojFile },
        {
          ...loadParams(model),
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
    } catch (e) {
      // a context that failed to load cannot be reused; the next press starts a fresh instance
      await w.exit().catch(() => undefined);
      wllamaRef.current = null;
      setPhase('idle');
      setDownloaded(false);
      setLoadError((e as Error)?.message || String(e));
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

  const addImages = useCallback(async (files: File[]) => {
    const prepared = await Promise.all(files.map((f) => prepareImage(f, MAX_IMAGE_EDGE)));
    setImages((prev) => [...prev, ...prepared]);
  }, []);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const applyPreset = useCallback((id: string) => {
    const preset = PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setInstructions(preset.instructions);
    setSchemaText(JSON.stringify(preset.schema, null, 2));
    setContext(preset.context);
  }, []);

  const buildContexts = useCallback((): DecisionRequest['contexts'] => {
    const text = context.trim();
    if (!live.length) return [text];
    return live.map((img) => {
      const parts: DecisionContentPart[] = [];
      if (text) parts.push({ type: 'text', text });
      parts.push({ type: 'image_url', image_url: { url: img.url } });
      return parts;
    });
  }, [context, live]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const startDecision = useCallback(async () => {
    const w = wllamaRef.current;
    if (!w || !schemaObj) return;
    const body: DecisionRequest = {
      instructions,
      schema: schemaObj,
      contexts: buildContexts(),
      mode: 'auto',
      cache_prompt: true,
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
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
    } catch (e) {
      const aborted = ctrl.signal.aborted;
      setDecision({
        ...idleDecisionRun,
        status: aborted ? 'stopped' : 'error',
        error: aborted ? '' : (e as Error)?.message || String(e),
        request: body,
      });
    } finally {
      abortRef.current = null;
    }
  }, [buildContexts, instructions, schemaObj]);

  const startGeneration = useCallback(async () => {
    const w = wllamaRef.current;
    if (!w || !schemaObj) return;
    const contexts = buildContexts();
    const input = {
      instructions,
      schema: schemaObj,
      contexts,
      images: live.length ? live.map((img) => img.bytes) : contexts.map(() => null),
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
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
    } catch (e) {
      const aborted = ctrl.signal.aborted;
      setGeneration((g) => ({
        ...g,
        running: false,
        status: aborted ? 'stopped' : 'error',
        error: aborted ? '' : (e as Error)?.message || String(e),
        current: '',
      }));
    } finally {
      abortRef.current = null;
    }
  }, [buildContexts, instructions, live, schemaObj]);

  // ----- render -----

  const preset = PRESETS.find((p) => p.id === DEFAULT_PRESET.id);
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
        state: live.length ? 'ok' : 'idle',
        note: live.length
          ? `${live.length} image${live.length === 1 ? '' : 's'}${
              context.trim() ? ' + text' : ''
            }`
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
      live.length,
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
              A finite schema is scored against an image in{' '}
              <strong>one batched forward pass</strong>, with a probability per field. Then the same
              question is generated token by token, so the two can be compared on your machine.
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
                      Nothing is uploaded: there is no backend to upload to. The weights came from{' '}
                      <code>{model.repo}</code> and now live in this browser&apos;s cache, so the
                      next visit loads them in seconds.
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
                        onClick={loadModel}
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
              images={images}
              onAdd={addImages}
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
              <span className="stage-note">the system-1 decision, with a probability per field</span>
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
              <span className="stage-note">the same question, generated with a JSON grammar</span>
            </div>
            <GenerationPanel
              run={generation}
              onRun={startGeneration}
              onCancel={cancel}
              canRun={canRun}
              decisionWallMs={decisionWallMs}
            />
            {generation.answers.length > 0 && schemaObj ? (
              <RawJson
                label="request · POST /v1/chat/completions body (first context)"
                value={generationRequestBody(
                  {
                    instructions,
                    schema: schemaObj,
                    contexts: buildContexts(),
                    images: live.map((img) => img.bytes),
                  },
                  0
                )}
                filename="momo-s1-generation-request.json"
              />
            ) : null}
          </section>

          <NativeHandoff model={model} />

          <footer className="colophon">
            <p>
              A 450M model answers small questions imperfectly. The page is built to show that
              instead of hiding it: every field carries its probability, numeric fields carry a
              p10-p90 interval, and fields scored by the cheap walk say so. Read a low probability
              as a weak answer, not as a fact.
            </p>
            <p>
              No analytics, no third-party scripts, and no request leaves the page once the weights
              are cached. The instructions you write are the only thing steering the answer besides
              the pixels.
            </p>
            <p>
              Something broken? The library: <a href="https://github.com/aakash-chaddha/wllama/issues">wllama issues</a> ·
              the engine: <a href="https://github.com/thecodacus/llama.cpp/issues">llama.cpp fork issues</a>.
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
