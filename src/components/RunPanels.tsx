import type { DecisionField, DecisionResponse } from '@wllama/wllama';
import type { DecisionRun, GenerationRun } from '../lib/runs';
import { RawJson } from './RawJson';

const pct = (p: number) => `${(p * 100).toFixed(1)}%`;
const ms = (v: number | null | undefined) =>
  v == null ? '—' : `${v.toFixed(v < 100 ? 1 : 0)} ms`;

function Metric({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="metric">
      <div className="k">{k}</div>
      <div className="v">
        {v}
        {sub ? <small> {sub}</small> : null}
      </div>
    </div>
  );
}

function Bars({ field }: { field: DecisionField }) {
  const candidates = field.candidates ?? [];
  if (!candidates.length) {
    return (
      <div className="bars">
        <div className="bar win">
          <div className="lab">{JSON.stringify(field.value)}</div>
          <div className="track">
            <div className="fill" style={{ width: `${field.probability * 100}%` }} />
          </div>
          <div className="pct">{pct(field.probability)}</div>
        </div>
      </div>
    );
  }
  const sorted = [...candidates].sort((a, b) => b.probability - a.probability);
  return (
    <div className="bars">
      {sorted.map((c, i) => {
        const win = JSON.stringify(c.value) === JSON.stringify(field.value);
        return (
          <div className={`bar${win ? ' win' : ''}`} key={i}>
            <div className="lab" title={JSON.stringify(c.value)}>
              {JSON.stringify(c.value)}
            </div>
            <div className="track">
              <div
                className="fill"
                style={{ width: `${Math.max(c.probability * 100, 0.5)}%` }}
              />
            </div>
            {/* the number is the text equivalent of the bar, for screen readers and for copying */}
            <div className="pct">{pct(c.probability)}</div>
          </div>
        );
      })}
    </div>
  );
}

export function DecisionPanel({
  run,
  resultIndex,
  setResultIndex,
  onRun,
  onCancel,
  canRun,
  descriptions,
}: {
  run: DecisionRun;
  resultIndex: number;
  setResultIndex: (i: number) => void;
  onRun: () => void;
  onCancel: () => void;
  canRun: boolean;
  descriptions: Record<string, string>;
}) {
  const response: DecisionResponse | null = run.response;
  const item = response?.results[Math.min(resultIndex, (response.results.length || 1) - 1)];
  const usage = response?.usage;
  const timings = response?.timings;

  return (
    <>
      <p className="sub">
        Every allowed value is scored as a token branch forked from the same cached prefix, all in
        one batched forward pass. The JSON below is assembled by the engine, not generated; the
        probabilities are the model's own distribution over the allowed values.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        {run.running ? (
          <button type="button" className="danger" onClick={onCancel}>
            cancel
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onRun}
            disabled={!canRun}
          >
            run the decision
          </button>
        )}
        <span className="status">{run.status}</span>
      </div>
      {run.error && <div className="error">{run.error}</div>}

      {response && timings && usage && (
        <>
          <div className="metrics">
            <Metric k="one pass" v={ms(timings.total_ms)} sub="engine" />
            <Metric k="wall" v={ms(run.wallMs)} sub="round trip" />
            <Metric k="prefill" v={ms(timings.prefill_ms)} />
            <Metric k="scoring" v={ms(timings.scoring_ms)} />
            <Metric k="rounds" v={String(timings.rounds)} />
            <Metric k="scored rows" v={String(usage.scored_rows)} />
            <Metric k="prompt tokens" v={String(usage.prompt_tokens)} />
            <Metric
              k="cached"
              v={String(usage.cached_tokens)}
              sub={usage.cached_tokens > 0 ? 'prefix reused' : 'cold'}
            />
            <Metric k="media tokens" v={String(usage.media_tokens)} />
            <Metric
              k="per decision"
              v={ms(timings.per_decision_ms)}
              sub={response.results.length > 1 ? `${response.results.length} contexts` : undefined}
            />
          </div>

          {response.results.length > 1 && (
            <div className="row" style={{ marginBottom: 10 }}>
              <label className="inline">
                <span>context</span>
                <select
                  value={Math.min(resultIndex, response.results.length - 1)}
                  onChange={(e) => setResultIndex(Number(e.target.value))}
                >
                  {response.results.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1} / {response.results.length}
                    </option>
                  ))}
                </select>
              </label>
              <span className="status">
                {response.results.length} decisions in one pass
              </span>
            </div>
          )}

          {item && (
            <>
              <div className="grid2">
                <div>
                  <h3 style={{ fontSize: 13, color: 'var(--dim)' }}>decision</h3>
                  <pre>{JSON.stringify(item.decision, null, 2)}</pre>
                </div>
                <div>
                  <h3 style={{ fontSize: 13, color: 'var(--dim)' }}>
                    per field · distribution over the allowed values
                  </h3>
                </div>
              </div>

              {Object.entries(item.fields).map(([name, field]) => (
                <div className="fieldcard" key={name}>
                  <div className="top">
                    <span className="fname">{name}</span>
                    <span className="fvalue">{JSON.stringify(field.value)}</span>
                    <span className="fprob">
                      {pct(field.probability)}
                      {field.probability < 0.5 && (
                        <span className="pill low"> · low confidence</span>
                      )}
                    </span>
                    <span className="markers">
                      <span>{field.tree ? 'exact distribution' : 'greedy walk'}</span>
                      <span>{field.scored_nodes} nodes</span>
                      {field.interval_p10_p90 && (
                        <span>
                          p10–p90 {JSON.stringify(field.interval_p10_p90)}
                        </span>
                      )}
                    </span>
                  </div>
                  {descriptions[name] && (
                    <div className="fdesc">{descriptions[name]}</div>
                  )}
                  <Bars field={field} />
                </div>
              ))}

              <RawJson
                label="response · the engine's exact bytes"
                value={response}
                filename="momos-one-decision-response.json"
              />
            </>
          )}
        </>
      )}
    </>
  );
}

export function GenerationPanel({
  run,
  onRun,
  onCancel,
  canRun,
  decisionWallMs,
}: {
  run: GenerationRun;
  onRun: () => void;
  onCancel: () => void;
  canRun: boolean;
  decisionWallMs: number | null;
}) {
  const total = run.answers.reduce((a, b) => a + b.wallMs, 0);
  const ratio =
    decisionWallMs && total && run.answers.length
      ? total / decisionWallMs
      : null;

  return (
    <>
      <p className="sub">
        The same image and the same schema, asked again as a JSON-constrained completion and streamed
        token by token. The two runs are sequential and share no state, so the comparison is between
        measured wall times on your machine, not a claim.
      </p>

      <div className="row" style={{ marginBottom: 10 }}>
        {run.running ? (
          <button type="button" className="danger" onClick={onCancel}>
            cancel
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={onRun}
            disabled={!canRun}
          >
            run token by token
          </button>
        )}
        <span className="status">{run.status}</span>
      </div>
      {run.error && <div className="error">{run.error}</div>}
      {!canRun && !run.running && (
        <div className="notice">
          The model must be loaded before either run. Section 00 does that once.
        </div>
      )}

      {run.answers.map((a) => (
        <div className="answer" key={a.contextIndex}>
          <div className="metrics">
            <Metric k="first token" v={ms(a.ttftMs)} />
            <Metric k="wall" v={ms(a.wallMs)} />
            <Metric
              k="generated"
              v={String(a.usage?.completion_tokens ?? a.predictedN ?? '—')}
              sub="tokens"
            />
            <Metric
              k="speed"
              v={
                a.predictedN && a.predictedMs
                  ? `${((a.predictedN / a.predictedMs) * 1000).toFixed(1)} t/s`
                  : '—'
              }
            />
            <Metric k="prompt" v={ms(a.promptMs)} />
          </div>
          <pre>{a.text || '(empty)'}</pre>
        </div>
      ))}

      {run.running && (
        <div className="answer">
          <div className="status">
            streaming context {run.currentIndex + 1}
          </div>
          <pre className="streaming">{run.current || '(waiting for the first token…)'}</pre>
        </div>
      )}

      {ratio && (
        <div className="answer">
          <div className="metrics">
            <Metric k="one pass" v={ms(decisionWallMs)} />
            <Metric k="generation" v={ms(total)} sub={`${run.answers.length} completion(s)`} />
            <Metric
              k="ratio"
              v={`${ratio.toFixed(1)}×`}
              sub={ratio >= 1 ? 'generation is slower' : 'generation was faster'}
            />
          </div>
          <div className="status">
            measured with performance.now() on this device, both runs on the same image and schema
          </div>
        </div>
      )}
    </>
  );
}
