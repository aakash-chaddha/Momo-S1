import type { ReactNode } from 'react';

// Time is shown in seconds: one decimal once past 10 s, two below that. This is the only
// formatting rule the page needs, so it lives in one place.
export const sec = (ms: number | null | undefined): string | null =>
  ms == null ? null : `${(ms / 1000).toFixed(ms >= 10_000 ? 1 : 2)} s`;

export const pct = (p: number): string => `${(p * 100).toFixed(1)}%`;

// A value as it is written in the assembled JSON, but without the quotes: in a dense
// list of lanes the quotes are noise, and the JSON panel below shows the exact bytes.
export const valueText = (v: unknown): string =>
  typeof v === 'string' ? v : JSON.stringify(v) ?? String(v);

export function Cell({
  k,
  v,
  sub,
  hot,
}: {
  k: string;
  v: ReactNode;
  sub?: string;
  hot?: boolean;
}) {
  return (
    <div className="cell" data-hot={hot ? 'true' : undefined}>
      <div className="k">{k}</div>
      <div className="v tnum">
        {v}
        {sub ? <small>{sub}</small> : null}
      </div>
    </div>
  );
}

export function Readout({ children }: { children: ReactNode }) {
  return <div className="readout">{children}</div>;
}

// Where the time actually went: the vision encoder and the prompt (prefill) then the branch
// scoring, proportional, on one strip. Two parts, because the response reports two parts.
export function TimingSplit({
  prefillMs,
  scoringMs,
  rows,
}: {
  prefillMs: number;
  scoringMs: number;
  rows?: string;
}) {
  const prefill = Math.max(prefillMs, 0);
  const scoring = Math.max(scoringMs, 0);
  const total = prefill + scoring || 1;
  const prefillShare = prefill / total;
  const scoringShare = scoring / total;

  return (
    <div className="split">
      <div
        className="split-bar"
        style={{
          gridTemplateColumns: `${Math.max(prefillShare, 0.002)}fr ${Math.max(scoringShare, 0.002)}fr`,
        }}
        role="img"
        aria-label={`engine time split: prefill ${sec(prefill)}, scoring ${sec(scoring)}`}
      >
        <div className="split-part" data-part="prefill">
          {prefillShare > 0.1 ? `${Math.round(prefillShare * 100)}%` : ''}
        </div>
        <div className="split-part" data-part="scoring">
          {scoringShare > 0.1 ? `${Math.round(scoringShare * 100)}%` : ''}
        </div>
      </div>
      <div className="split-legend">
        <span>
          <i data-part="prefill" /> prefill {sec(prefill)}
        </span>
        <span>
          <i data-part="scoring" /> scoring {sec(scoring)}
        </span>
        {rows ? <span>{rows}</span> : null}
      </div>
    </div>
  );
}
