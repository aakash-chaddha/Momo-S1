import { useRef, useState } from 'react';
import type { DecisionField, DecisionResponse } from '@wllama/wllama';
import type { DecisionRun, GenerationRun } from '../lib/runs';
import { RawJson } from './RawJson';
import { Cell, Readout, TimingSplit, pct, sec, valueText } from './Readout';
import { ForkRail, type LaneSpec } from './ForkRail';

const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * One bar per allowed value. The number is printed beside every bar, so the bar is a reading aid
 * and never the only carrier of the value: a wide distribution stays legible at any contrast.
 */
function Bars({ field }: { field: DecisionField }) {
  const candidates = field.candidates ?? [];
  const rows = candidates.length
    ? [...candidates].sort((a, b) => b.probability - a.probability)
    : [{ value: field.value, probability: field.probability }];

  return (
    <div className="bars">
      {rows.map((c, i) => {
        const win = valueText(c.value) === valueText(field.value);
        return (
          <div className={`bar${win ? ' win' : ''}`} key={i}>
            <div className="lab" title={JSON.stringify(c.value)}>
              {valueText(c.value)}
            </div>
            <div className="track">
              <div
                className="fill"
                style={{ ['--w' as string]: String(Math.max(c.probability, 0.004)) }}
              />
            </div>
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
  schemaLanes,
}: {
  run: DecisionRun;
  resultIndex: number;
  setResultIndex: (i: number) => void;
  onRun: () => void;
  onCancel: () => void;
  canRun: boolean;
  descriptions: Record<string, string>;
  /** the current schema, which is what the fork rail is a diagram of */
  schemaLanes: LaneSpec[];
}) {
  const response: DecisionResponse | null = run.response;
  const item = response?.results[Math.min(resultIndex, (response.results.length || 1) - 1)];
  const usage = response?.usage;
  const timings = response?.timings;
  const fields = item?.fields ?? null;

  // the two-way highlight: a lane and its field row light each other
  const [hot, setHot] = useState<string | null>(null);
  const rows = useRef<Record<string, HTMLDivElement | null>>({});

  const pick = (name: string) => {
    rows.current[name]?.scrollIntoView({
      block: 'center',
      behavior: reduceMotion() ? 'auto' : 'smooth',
    });
  };

  return (
    <>
      <p className="lede">
        Every allowed value is scored as a token branch forked from the same cached prefix, all in
        one batched forward pass. The JSON is assembled by the engine, not generated; the
        probabilities are the model's own distribution over the values you allowed.
      </p>

      <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
        {run.running ? (
          <button type="button" className="danger" onClick={onCancel}>
            cancel
          </button>
        ) : (
          <button type="button" className="primary" onClick={onRun} disabled={!canRun}>
            run the decision
          </button>
        )}
        <span className="status" data-tone={run.status.startsWith('done') ? 'ok' : undefined}>
          {run.status || (canRun ? 'ready' : 'waiting on the model, an image or a valid schema')}
        </span>
      </div>
      {run.error ? <div className="error">{run.error}</div> : null}

      <ForkRail
        schema={schemaLanes}
        fields={fields}
        usage={usage ?? null}
        rounds={timings?.rounds ?? null}
        prefillMs={timings?.prefill_ms ?? null}
        contexts={response?.results.length ?? 1}
        resultIndex={Math.min(resultIndex, (response?.results.length ?? 1) - 1)}
        hot={hot}
        onHot={setHot}
        onPick={pick}
      />

      {response && timings && usage ? (
        <>
          <TimingSplit
            prefillMs={timings.prefill_ms}
            scoringMs={timings.scoring_ms}
            rows={`${usage.scored_rows} scored rows · ${timings.rounds} decode round${
              timings.rounds === 1 ? '' : 's'
            }`}
          />

          <Readout>
            <Cell k="one pass" v={sec(timings.total_ms)!} sub="engine" />
            <Cell k="wall" v={sec(run.wallMs)!} sub="round trip" />
            <Cell k="per decision" v={sec(timings.per_decision_ms)!} />
            <Cell k="prompt tokens" v={String(usage.prompt_tokens)} />
            <Cell
              k="prefix cached"
              v={String(usage.cached_tokens)}
              sub={usage.cached_tokens > 0 ? 'reused' : 'cold'}
            />
            <Cell k="image tokens" v={String(usage.media_tokens)} />
            <Cell
              k="encoder cached"
              v={String(usage.media_cached_tokens ?? 0)}
              sub={usage.media_cached_tokens ? 'reused' : 'encoded'}
            />
            <Cell k="contexts" v={String(response.results.length)} />
          </Readout>

          {response.results.length > 1 ? (
            <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
              <label className="inline">
                <span>context</span>
                <select
                  value={Math.min(resultIndex, response.results.length - 1)}
                  onChange={(e) => setResultIndex(Number(e.target.value))}
                >
                  {response.results.map((_, i) => (
                    <option key={i} value={i}>
                      {i + 1} of {response.results.length}
                    </option>
                  ))}
                </select>
              </label>
              <span className="status">
                {response.results.length} decisions came back from the one pass
              </span>
            </div>
          ) : null}
        </>
      ) : null}

      {item && fields ? (
        <>
          <div className="panel-key" style={{ marginTop: 'var(--s-5)' }}>
            the assembled answer, and what the model thought of every alternative
          </div>
          <pre>{JSON.stringify(item.decision, null, 2)}</pre>

          <div className="field-list" style={{ marginTop: 'var(--s-4)' }}>
            {Object.entries(fields).map(([name, field]) => (
              <div
                className="field-row"
                key={name}
                data-hot={hot === name ? 'true' : undefined}
                ref={(el) => {
                  rows.current[name] = el;
                }}
                onMouseEnter={() => setHot(name)}
                onMouseLeave={() => setHot(null)}
              >
                <div className="top">
                  <span className="fname">{name}</span>
                  <span className="fvalue">{valueText(field.value)}</span>
                  <span className="fprob">
                    {pct(field.probability)}
                    {field.probability < 0.5 ? (
                      <span className="pill low"> · low confidence</span>
                    ) : null}
                  </span>
                  <span className="markers">
                    <span>{field.tree ? 'exact distribution' : 'greedy walk'}</span>
                    <span>{field.scored_nodes} nodes</span>
                    {field.interval_p10_p90 ? (
                      <span>
                        p10–p90 {valueText(field.interval_p10_p90[0])} to{' '}
                        {valueText(field.interval_p10_p90[1])}
                      </span>
                    ) : null}
                  </span>
                </div>
                {descriptions[name] ? <p className="fdesc">{descriptions[name]}</p> : null}
                <Bars field={field} />
              </div>
            ))}
          </div>

          <RawJson
            label="response · the engine's exact bytes"
            value={response}
            filename="momo-s1-decision-response.json"
          />
        </>
      ) : null}
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
  const ratio = decisionWallMs && total && run.answers.length ? total / decisionWallMs : null;

  return (
    <>
      <p className="lede">
        The same image and the same schema, asked again as a JSON-constrained completion and
        streamed token by token. The two runs are sequential and share no state, so the comparison
        is between measured wall times on your machine, not a claim.
      </p>

      <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
        {run.running ? (
          <button type="button" className="danger" onClick={onCancel}>
            cancel
          </button>
        ) : (
          <button type="button" className="primary" onClick={onRun} disabled={!canRun}>
            run token by token
          </button>
        )}
        <span className="status" data-tone={run.status.startsWith('done') ? 'ok' : undefined}>
          {run.status || (canRun ? 'ready' : 'the model has to be loaded first')}
        </span>
      </div>
      {run.error ? <div className="error">{run.error}</div> : null}

      {run.running ? (
        <div className="answer answer--stream">
          <div className="panel-key">
            context {run.currentIndex + 1} of {run.answers.length || 1} · streaming
          </div>
          <pre className="streaming">
            {run.current || '(waiting for the first token)'}
            <span className="caret" aria-hidden="true" />
          </pre>
        </div>
      ) : null}

      {run.answers.map((a) => (
        <div className="answer" key={a.contextIndex}>
          <Readout>
            <Cell k="first token" v={sec(a.ttftMs) ?? 'n/a'} />
            <Cell k="wall" v={sec(a.wallMs)!} />
            <Cell k="generated" v={String(a.usage?.completion_tokens ?? a.predictedN ?? 0)} sub="tokens" />
            <Cell
              k="speed"
              v={
                a.predictedN && a.predictedMs
                  ? `${((a.predictedN / a.predictedMs) * 1000).toFixed(1)} t/s`
                  : 'n/a'
              }
            />
            <Cell k="prompt" v={sec(a.promptMs) ?? 'n/a'} />
          </Readout>
          <pre>{a.text || '(empty)'}</pre>
        </div>
      ))}

      {ratio ? (
        <div className="ratio">
          <span className="ratio-num">{ratio.toFixed(1)}×</span>
          <span className="ratio-note">
            {ratio >= 1
              ? 'generating the same answer took this many times longer than deciding it in one pass'
              : 'generation was faster than the one pass on this run'}
            {': '}
            {sec(decisionWallMs!)} for the pass against {sec(total)} for{' '}
            {run.answers.length} completion{run.answers.length === 1 ? '' : 's'}, both measured with
            performance.now() on this device.
          </span>
        </div>
      ) : null}
    </>
  );
}
