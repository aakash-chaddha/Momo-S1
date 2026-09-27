import type { DecisionField } from '@wllama/wllama';
import type { DecisionRun, GenerationRun } from '../lib/runs';
import { Cell, Readout, sec, valueText, pct } from './Readout';

// The generated text is one JSON object. Take it as written; when the model wrapped it in prose or
// the stream was cut, fall back to the outer braces before giving up.
function parseGenerated(text: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    /* fall through */
  }
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s >= 0 && e > s) {
    try {
      const v = JSON.parse(text.slice(s, e + 1));
      return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
    } catch {
      /* give up */
    }
  }
  return null;
}

const sameValue = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Both answers and both clocks, in one place. The bars are measured wall times scaled to the
 * slower run; the table is the two answers on the same fields, so agreement is visible instead of
 * implied. Nothing here is estimated: every number comes from the two runs above it.
 */
export function ComparePanel({
  decision,
  generation,
  onRunBoth,
  canRun,
  busy,
}: {
  decision: DecisionRun;
  generation: GenerationRun;
  onRunBoth: (signal?: AbortSignal) => void;
  canRun: boolean;
  busy: boolean;
}) {
  const result = decision.response?.results[0] ?? null;
  const fields = result?.fields ?? null;
  const answer: Record<string, unknown> | null = (result?.decision as Record<string, unknown>) ?? null;

  const gen = generation.answers[0] ?? null;
  const genAnswer = gen ? parseGenerated(gen.text) : null;

  const decisionWallMs = decision.response ? decision.wallMs : null;
  const genWallMs = gen ? gen.wallMs : null;
  const both = decisionWallMs != null && genWallMs != null;
  const ratio = both ? genWallMs! / decisionWallMs! : null;
  const slowest = Math.max(decisionWallMs ?? 0, genWallMs ?? 0) || 1;

  const names = [...new Set([...Object.keys(answer ?? {}), ...Object.keys(genAnswer ?? {})])];
  const agree = names.filter((n) => sameValue(answer?.[n], genAnswer?.[n])).length;

  return (
    <>
      <p className="lede">
        System-1 against autoregressive, on one question: the same image and the same schema,
        answered once in one batched pass and once generated token by token under a JSON grammar.
        The bars are the two wall times on your machine, and the table is the two answers on the
        same fields.
      </p>

      <div className="row" style={{ marginBottom: 'var(--s-4)' }}>
        <button type="button" className="primary" onClick={() => onRunBoth()} disabled={busy || !canRun}>
          run both
        </button>
        <span className="status">
          {busy
            ? 'a run is in flight; this waits for it'
            : both
              ? 'both runs done · the bars below are measured wall times'
              : canRun
                ? 'press run both: the pass runs first, then the generation'
                : 'waiting on the model, an image or a valid schema'}
        </span>
      </div>

      <div className="race">
        <div className="race-row">
          <span className="race-name">one pass</span>
          <div className="race-track">
            {decisionWallMs != null ? (
              <div
                className="race-fill"
                data-kind="pass"
                style={{ ['--w' as string]: String(decisionWallMs / slowest) }}
              />
            ) : null}
          </div>
          <span className="race-val tnum">{sec(decisionWallMs) ?? 'not run'}</span>
        </div>
        <div className="race-row">
          <span className="race-name">token by token</span>
          <div className="race-track">
            {genWallMs != null ? (
              <div
                className="race-fill"
                data-kind="gen"
                style={{ ['--w' as string]: String(genWallMs / slowest) }}
              />
            ) : null}
          </div>
          <span className="race-val tnum">{sec(genWallMs) ?? 'not run'}</span>
        </div>
      </div>

      {ratio ? (
        <div className="ratio">
          <span className="ratio-num">{ratio.toFixed(1)}×</span>
          <span className="ratio-note">
            {ratio >= 1
              ? 'the one pass answered this many times faster than generating the same answer'
              : 'token by token was faster on this run'}
            {': '}
            {sec(decisionWallMs!)} against {sec(genWallMs!)}. Both timed with performance.now(), and
            the runs are sequential and share no state.
          </span>
        </div>
      ) : null}

      {both ? (
        <Readout>
          <Cell k="one pass" v={sec(decisionWallMs!)!} sub="wall" />
          <Cell k="token by token" v={sec(genWallMs!)!} sub="wall" />
          <Cell k="first token" v={sec(gen!.ttftMs) ?? 'n/a'} />
          <Cell
            k="generated"
            v={String(gen!.usage?.completion_tokens ?? gen!.predictedN ?? 0)}
            sub="tokens"
          />
          <Cell
            k="speed"
            v={
              gen!.predictedN && gen!.predictedMs
                ? `${((gen!.predictedN / gen!.predictedMs) * 1000).toFixed(1)} t/s`
                : 'n/a'
            }
          />
          <Cell
            k="pass split"
            v={
              decision.response
                ? `${sec(decision.response.timings.prefill_ms)} prefill`
                : 'n/a'
            }
            sub={decision.response ? `${sec(decision.response.timings.scoring_ms)} scoring` : undefined}
          />
          <Cell
            k="agreement"
            v={`${agree}/${names.length}`}
            sub="fields"
          />
        </Readout>
      ) : null}

      {names.length ? (
        <div className="cmp-table">
          <div className="cmp-row cmp-head">
            <span>field</span>
            <span>one pass</span>
            <span>token by token</span>
            <span>match</span>
          </div>
          {names.map((name) => {
            const f = (fields?.[name] ?? null) as DecisionField | null;
            const a = answer?.[name];
            const g = genAnswer?.[name];
            const ok = genAnswer ? sameValue(a, g) : null;
            return (
              <div className="cmp-row" key={name}>
                <span className="cmp-name">{name}</span>
                <span className="cmp-val" data-col="pass">
                  {answer ? valueText(a) : '—'}
                  {f ? <small>{pct(f.probability)} confidence</small> : null}
                </span>
                <span className="cmp-val" data-col="gen">
                  {genAnswer ? valueText(g) : gen ? '(unreadable JSON)' : '—'}
                </span>
                <span className="cmp-mark" data-ok={ok === null ? undefined : ok ? 'true' : 'false'}>
                  {ok === null ? '·' : ok ? 'same' : 'differs'}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="status">
          run both to put the two answers and the two clocks next to each other.
        </p>
      )}
    </>
  );
}
