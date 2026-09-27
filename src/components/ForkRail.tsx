import type { DecisionField } from '@wllama/wllama';
import { pct, sec, valueText } from './Readout';

/**
 * The pass, drawn.
 *
 * The product's claim is that every allowed value is scored as a token branch forked from one
 * shared prefix, so all the fields are evaluated in one decode and cannot see each other. That
 * claim used to exist only as a sentence. This draws it, from the response's own numbers.
 *
 * Four things are deliberate:
 *   - the prefix is drawn once and every lane visibly hangs off it, because that is the claim;
 *   - everything resolves on ONE timeline, not lane by lane, because that is what "one batched
 *     pass" means. A lane-by-lane fill would be a diagram of something the engine does not do;
 *   - the lanes are the CURRENT schema, with the last run laid over them. The reader can edit the
 *     schema at any time, and a diagram that quietly kept showing the previous run's fields would
 *     be lying about what the next run will do. A lane with no result stays a ghost;
 *   - a lane and its field row highlight each other, so the diagram is a way into the numbers
 *     rather than an illustration.
 */

export interface LaneSpec {
  name: string;
  values: number;
}

export interface ForkUsage {
  prompt_tokens: number;
  cached_tokens: number;
  media_tokens: number;
  context_tokens?: number;
  scored_rows: number;
}

export function ForkRail({
  schema,
  fields,
  usage,
  rounds,
  prefillMs,
  contexts,
  resultIndex,
  hot,
  onHot,
  onPick,
}: {
  /** the current schema: lane names and their allowed-value counts */
  schema: LaneSpec[];
  /** the engine's per-field results from the last run, if there was one */
  fields: Record<string, DecisionField> | null;
  usage: ForkUsage | null;
  rounds: number | null;
  prefillMs: number | null;
  contexts: number;
  resultIndex: number;
  hot: string | null;
  onHot: (name: string | null) => void;
  onPick: (name: string) => void;
}) {
  const valuesByName = new Map(schema.map((l) => [l.name, l.values]));
  const schemaNames = schema.map((l) => l.name);
  // a field that was in the last run but is not in the schema any more still has a result worth
  // showing, so it keeps a lane and says where it came from
  const dropped = fields ? Object.keys(fields).filter((n) => !valuesByName.has(n)) : [];
  const names = [...schemaNames, ...dropped];
  const scored = names.filter((n) => fields?.[n]).length;
  const complete = names.length > 0 && scored === names.length;
  const decodes = rounds ?? null;

  if (!names.length) {
    return (
      <div className="fork" data-empty="true">
        <div className="fork-top">
          <h3>the pass, drawn</h3>
          <span className="fork-help">write a schema and the lanes appear here</span>
        </div>
      </div>
    );
  }

  return (
    <div className="fork" data-empty={scored ? 'false' : 'true'}>
      <div className="fork-top">
        <h3>the pass, drawn</h3>
        <span className="fork-count tnum">
          {names.length} lanes
          {' · '}
          {complete ? (
            <>
              {decodes ?? 1} {decodes === 1 ? 'decode' : 'decodes'}
              {' · '}
              {usage!.scored_rows} scored rows
            </>
          ) : scored ? (
            <>
              {scored} scored, {names.length - scored} waiting
            </>
          ) : (
            'not run yet'
          )}
        </span>
        <span className="fork-help">
          {complete
            ? 'every lane resolved in the same decode · pick one to jump to its field'
            : scored
              ? 'this is the last run, laid over the current schema · run again to redraw it'
              : 'the shape of the pass, from your schema'}
        </span>
      </div>

      <div className="fork-body">
        <div className="fork-prefix" data-empty={scored ? 'false' : 'true'}>
          <div className="pf-key">shared prefix</div>
          <div className="pf-name">instructions + field catalogue</div>
          {scored ? (
            <>
              <div className="pf-row">
                <span>prompt tokens</span>
                <b>{usage!.prompt_tokens}</b>
              </div>
              <div className="pf-row">
                <span>prefix reused</span>
                <b>{usage!.cached_tokens}</b>
              </div>
              <div className="pf-row">
                <span>image tokens</span>
                <b>{usage!.media_tokens}</b>
              </div>
              {prefillMs != null ? (
                <div className="pf-row">
                  <span>encoded in</span>
                  <b>{sec(prefillMs)}</b>
                </div>
              ) : null}
              {contexts > 1 ? (
                <div className="pf-row">
                  <span>context</span>
                  <b>
                    {resultIndex + 1} / {contexts}
                  </b>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="pf-row">
                <span>fields</span>
                <b>{names.length}</b>
              </div>
              <div className="pf-row">
                <span>status</span>
                <b>not run</b>
              </div>
            </>
          )}
        </div>

        <div className="fork-lanes">
          {names.map((name) => {
            const field = fields?.[name];
            const values = field?.candidates?.length ?? valuesByName.get(name) ?? 0;
            const candidates = field?.candidates
              ? [...field.candidates].sort((a, b) => b.probability - a.probability)
              : null;
            const isHot = hot === name;
            const gone = !valuesByName.has(name);
            const label = field
              ? `${name}: ${valueText(field.value)}, ${pct(field.probability)}, ${
                  field.tree ? 'exact distribution' : 'greedy walk'
                }, ${field.scored_nodes} scored nodes, ${values} allowed values${
                  gone ? ', no longer in the schema' : ''
                }`
              : `${name}, ${values} allowed values, not scored by the last run`;

            return (
              <button
                type="button"
                className="lane"
                key={name}
                data-hot={isHot ? 'true' : undefined}
                data-empty={field ? undefined : 'true'}
                aria-label={label}
                title={label}
                onMouseEnter={() => onHot(name)}
                onMouseLeave={() => onHot(null)}
                onFocus={() => onHot(name)}
                onBlur={() => onHot(null)}
                onClick={() => {
                  if (field) onPick(name);
                }}
              >
                <span className="lane-name">{name}</span>
                <span className="lane-strip" aria-hidden="true">
                  {candidates ? (
                    candidates.map((c, i) => (
                      <span
                        className="lane-seg"
                        key={i}
                        data-win={
                          valueText(c.value) === valueText(field!.value) ? 'true' : undefined
                        }
                        style={{ ['--w' as string]: String(Math.max(c.probability, 0.004)) }}
                      />
                    ))
                  ) : (
                    <span className="lane-seg" style={{ ['--w' as string]: '1' }} />
                  )}
                </span>
                <span className="lane-value">
                  {field ? valueText(field.value) : `${values} value${values === 1 ? '' : 's'}`}
                </span>
                <span
                  className="lane-prob"
                  data-low={field && field.probability < 0.5 ? 'true' : undefined}
                >
                  {field ? pct(field.probability) : ''}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* one sweep, once, across every lane at the same time */}
      {complete ? <span className="fork-sweep" aria-hidden="true" /> : null}
    </div>
  );
}
