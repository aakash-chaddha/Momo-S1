import { totalSize, type ModelChoice } from '../config';

export type ProloguePhase = 'idle' | 'downloading' | 'loading' | 'ready';

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

// Smooth-scroll, unless the reader asked for reduced motion (the stylesheet already switches the
// page's own anchor jumps to instant under the same preference).
function go(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

/**
 * The way in: one centered claim over the daylight sky, with the real load control as its
 * action. Not a marketing hero above the tool (the pipeline below is unchanged and nothing is
 * pushed out of reach): it is the first thing the scroll-driven descent moves through. The
 * eyebrow, title, sub and action drift upward at four different rates as the reader scrolls
 * past, which is the parallax grammar in miniature. Translate only, never a fade: words keep
 * their contrast at every millisecond.
 *
 * The heading is a paragraph, not an h1: the stage rail carries the page's single h1, and the
 * verification harness fails the build on a second one.
 */
export function Prologue({
  phase,
  model,
  progress,
  onLoad,
}: {
  phase: ProloguePhase;
  model: ModelChoice;
  progress: number;
  onLoad: () => void;
}) {
  const total = totalSize(model);
  const busy = phase === 'downloading' || phase === 'loading';

  const primary =
    phase === 'ready' ? (
      <button type="button" className="primary" onClick={() => go('stage-03')}>
        see the one pass
      </button>
    ) : (
      <button type="button" className="primary" onClick={onLoad} disabled={busy}>
        {phase === 'idle'
          ? `load the model · ${mb(total)}`
          : phase === 'downloading'
            ? `${(progress * 100).toFixed(0)}% of ${mb(total)}`
            : 'loading into wasm'}
      </button>
    );

  const note =
    phase === 'ready'
      ? 'ready · in this browser, nothing uploaded'
      : phase === 'idle'
        ? model.note
        : phase === 'downloading'
          ? 'the browser caches this; the second visit reads it back'
          : 'the encoder is warmed before the first decision';

  return (
    <header className="prologue">
      <p className="prologue-eyebrow">Momo-S1 · system-1</p>
      <p className="prologue-title">Think once, answer whole.</p>
      <p className="prologue-sub">
        The entire schema scored against your image in{' '}
        <strong>one batched forward pass</strong>, in this browser, with{' '}
        <strong>a probability per field</strong>. Then the same weights answer the slow way, so
        both can be compared side by side.
      </p>
      <div className="prologue-cta">
        {primary}
        {phase === 'ready' ? null : (
          <button type="button" className="ghost" onClick={() => go('stage-00')}>
            how it works
          </button>
        )}
      </div>
      <p className="status prologue-note">{note}</p>
    </header>
  );
}
