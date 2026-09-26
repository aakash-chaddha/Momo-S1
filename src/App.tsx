import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LogLevel,
  Wllama,
  type DecisionContentPart,
  type DecisionRequest,
  type LoadedContextInfo,
} from '@wllama/wllama';
import {
  DECISION_SEQS,
  DEFAULT_MODEL,
  MAX_IMAGE_EDGE,
  WLLAMA_PATHS,
  loadParams,
  totalSize,
} from './config';
import { DEFAULT_PRESET, PRESETS } from './lib/presets';
import { formatBytes, prepareImage, type PreparedImage } from './lib/multimodal';
import { validateSchema, type Json } from './lib/schema';
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
import { QuestionPanel } from './components/QuestionPanel';
import { DecisionPanel, GenerationPanel } from './components/RunPanels';
import { RawJson } from './components/RawJson';

type Phase = 'idle' | 'downloading' | 'loading' | 'ready';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

// The compat build (asyncify, no memory64) is a follow-up; the first cut targets the multithreaded,
// JSPI build. Say so instead of failing mysteriously.
const UA = navigator.userAgent;
const isFirefox = /Firefox\//.test(UA);
const isSafari = /^((?!chrome|chromium|android).)*safari/i.test(UA);

export default function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [info, setInfo] = useState<LoadedContextInfo | null>(null);

  const [instructions, setInstructions] = useState(DEFAULT_PRESET.instructions);
  const [schemaText, setSchemaText] = useState(() =>
    JSON.stringify(DEFAULT_PRESET.schema, null, 2)
  );
  const [context, setContext] = useState(DEFAULT_PRESET.context);
  const [images, setImages] = useState<PreparedImage[]>([]);

  const [decision, setDecision] = useState<DecisionRun>(idleDecisionRun);
  const [generation, setGeneration] = useState<GenerationRun>(idleGenerationRun);
  const [decisionIndex, setDecisionIndex] = useState(0);

  const wllamaRef = useRef<Wllama | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const model = DEFAULT_MODEL;
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

  const busy = decision.running || generation.running;
  const contextsReady = live.length > 0 || context.trim().length > 0;
  const canRun =
    phase === 'ready' && !busy && !schemaProblem && contextsReady;

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
          log_level: LogLevel.WARN,
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

  const addImages = useCallback(async (files: File[]) => {
    const prepared = await Promise.all(
      files.map((f) => prepareImage(f, MAX_IMAGE_EDGE))
    );
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
      status: 'deciding… (one batched pass; the first run encodes the image)',
      request: body,
    });
    try {
      const { response, wallMs } = await runDecision(w, body, ctrl.signal);
      setDecision({
        running: false,
        status: `done · ${response.results.length} decision(s) · engine ${(response.timings.total_ms / 1000).toFixed(1)} s · wall ${(wallMs / 1000).toFixed(1)} s`,
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
      images: live.length
        ? live.map((img) => img.bytes)
        : contexts.map(() => null),
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGeneration({
      ...idleGenerationRun,
      running: true,
      status: 'generating… (JSON-constrained, token by token)',
    });
    try {
      const answers = await runGeneration(w, input, ctrl.signal, (i, text) => {
        setGeneration((g) => ({
          ...g,
          current: text,
          currentIndex: i,
          status: `streaming context ${i + 1} of ${contexts.length}…`,
        }));
      });
      setGeneration({
        running: false,
        status: `done · ${answers.length} completion(s)`,
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

  // verification hook: the smoke test in e2e/ reads the raw states instead of scraping the DOM
  useEffect(() => {
    (window as any).__momos = { phase, info, decision, generation, schemaObj };
  }, [phase, info, decision, generation, schemaObj]);

  return (
    <>
      <header className="top">
        <h1>momos-one</h1>
        <p>
          Multimodal system-1 in your browser: a finite schema is scored against an image in{' '}
          <strong>one batched forward pass</strong>, with a probability per field, and the same
          question is then generated token by token for comparison. The engine is llama.cpp's{' '}
          <code>/v1/decision</code>, compiled to wasm - not re-implemented in JavaScript.
        </p>
        <div className="badges">
          <span className="badge hot">browser only</span>
          <span className="badge">no backend · no upload</span>
          <span className="badge">wasm + mtmd</span>
          <span className="badge">{model.name}</span>
          <span className="badge">{mb(totalSize(model))} download</span>
          <span className="badge">up to {DECISION_SEQS} decision sequences</span>
        </div>
      </header>

      {isFirefox && (
        <div className="notice">
          Firefox: this cut ships the memory64 + JSPI build only. If the page does not load the
          model, the compat build (asyncify) is the follow-up.
        </div>
      )}
      {!isFirefox && isSafari && (
        <div className="notice">
          Safari: this cut ships the memory64 + JSPI build only; the compat build is a follow-up.
        </div>
      )}

      {/* ------------------------------------------------ 00 setup */}
      <section id="setup">
        <h2>
          <span className="num">00 /</span> setup
          <span className="hint">load the model once; the browser caches the weights</span>
        </h2>

        <div className="grid2">
          <div>
            <p className="sub">
              <strong>{model.name}</strong> - {model.note}. The weights come from the public
              Hugging Face repository <code>{model.repo}</code> and stay on your machine after the
              first visit. Nothing is uploaded: there is no backend to upload to.
            </p>
            <div className="row">
              {phase === 'ready' ? (
                <span className="status">
                  loaded · {info?.has_image_input ? 'vision encoder ready' : 'no vision encoder'}
                </span>
              ) : (
                <button
                  type="button"
                  className="primary"
                  onClick={loadModel}
                  disabled={phase === 'downloading' || phase === 'loading'}
                >
                  {phase === 'idle' ? 'load the model' : 'loading…'}
                </button>
              )}
            </div>
            {(phase === 'downloading' || phase === 'loading') && (
              <>
                <div className="progress">
                  <div style={{ width: `${(downloaded ? 1 : progress) * 100}%` }} />
                </div>
                <div className="status">
                  {downloaded
                    ? 'download complete · loading the model into wasm and warming up…'
                    : `downloading ${(progress * 100).toFixed(0)}% · model ${formatBytes(model.size)}, projector ${formatBytes(model.mmprojSize)}`}
                </div>
              </>
            )}
            {loadError && <div className="error">{loadError}</div>}
            {phase === 'idle' && !loadError && (
              <div className="status">
                the first press downloads ~{mb(totalSize(model))}; the second visit reads the
                browser cache
              </div>
            )}
          </div>

          <div>
            <h3 style={{ fontSize: 13, color: 'var(--dim)', margin: '0 0 8px' }}>
              the load this page uses
            </h3>
            <pre>{`n_ctx         8192
n_batch        2048
n_ubatch       1024   (>= image tokens)
n_parallel        1
n_seq_decision    ${DECISION_SEQS}   (prefix + trunks + branches)
image_max_tokens 256
image scale      <= ${MAX_IMAGE_EDGE} px
jinja          true   (the model's chat template)
warmup         true
threads        ${Math.max(1, (navigator.hardwareConcurrency || 2) - 1)}`}</pre>
            {info && (
              <div className="metrics">
                <Metric k="n_ctx" v={String(info.n_ctx)} />
                <Metric k="n_batch" v={String(info.n_batch)} />
                <Metric k="n_ubatch" v={String(info.n_ubatch)} />
                <Metric k="layers" v={String(info.n_layer)} />
                <Metric k="n_embd" v={String(info.n_embd)} />
                <Metric
                  k="vision"
                  v={info.has_image_input ? 'yes' : 'no'}
                />
              </div>
            )}
          </div>
        </div>

        {info && !info.has_image_input && (
          <div className="notice">
            The loaded context reports no vision encoder. Pick a multimodal model with an mmproj:
            image contexts will be rejected until then, text-only decisions still work.
          </div>
        )}
      </section>

      {/* ------------------------------------------------ 01 evidence */}
      <section id="evidence">
        <h2>
          <span className="num">01 /</span> evidence
          <span className="hint">what the model gets to look at</span>
        </h2>
        <EvidencePanel
          images={images}
          onAdd={addImages}
          onRemove={removeImage}
          context={context}
          setContext={setContext}
          disabled={busy}
        />
        {!contextsReady && (
          <div className="notice">
            Add an image or write some context text: an empty context is rejected by the endpoint.
          </div>
        )}
      </section>

      {/* ------------------------------------------------ 02 question */}
      <section id="question">
        <h2>
          <span className="num">02 /</span> question
          <span className="hint">
            {preset?.blurb ?? 'instructions and a finite schema'}
          </span>
        </h2>
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
      <section id="one-pass">
        <h2>
          <span className="num">03 /</span> one pass
          <span className="hint">system-1 decision, exact probabilities</span>
        </h2>
        <DecisionPanel
          run={decision}
          resultIndex={decisionIndex}
          setResultIndex={setDecisionIndex}
          onRun={startDecision}
          onCancel={cancel}
          canRun={canRun}
          descriptions={descriptions}
        />
        {decision.request && (
          <RawJson
            label="request · POST /v1/decision · the same body against a native server started with --decision-seqs"
            value={decision.request}
            filename="momos-one-decision-request.json"
          />
        )}
      </section>

      {/* ------------------------------------------------ 04 token by token */}
      <section id="token-by-token">
        <h2>
          <span className="num">04 /</span> token by token
          <span className="hint">the same question, generated with a JSON grammar</span>
        </h2>
        <GenerationPanel
          run={generation}
          onRun={startGeneration}
          onCancel={cancel}
          canRun={canRun}
          decisionWallMs={decision.response ? decision.wallMs : null}
        />
        {generation.answers.length > 0 && schemaObj && (
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
            filename="momos-one-generation-request.json"
          />
        )}
      </section>

      <footer>
        <p>
          A 450M model answers small questions imperfectly. The page is built to show that instead of
          hiding it: every field carries its probability, numeric fields carry a p10-p90 interval,
          and fields scored by the cheap walk are marked as such. Read a low probability as a weak
          answer, not as a fact.
        </p>
        <p>
          No analytics, no third-party scripts, no request leaves the page after the weights are
          cached. The model's system prompt is rendered by the model's own chat template; the
          instructions you write are the only thing steering the answer besides the pixels.
        </p>
        <p>
          Built on the llama.cpp fork's <code>/v1/decision</code> endpoint, compiled to wasm with
          wllama. Reference for the wire format: the raw request and response panels above. To try
          the same request against a native server: build the fork, run{' '}
          <code>llama-server -m model.gguf --mmproj mmproj.gguf --decision-seqs {DECISION_SEQS}</code>
          , and post the copied body.
        </p>
        <p>
          Something broken? The library:{ }
          <a href="https://github.com/aakash-chaddha/wllama/issues">wllama issues</a> · the engine:{ }
          <a href="https://github.com/thecodacus/llama.cpp/issues">llama.cpp fork issues</a>.
        </p>
      </footer>
    </>
  );
}

function Metric({ k, v }: { k: string; v: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">{v}</div>
    </div>
  );
}
