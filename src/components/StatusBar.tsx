import { sec } from './Readout';

/**
 * Real telemetry at the bottom edge, for the whole page.
 *
 * Every value here is measured on this machine: the isolation state that decides whether the wasm
 * runs multithreaded, the thread count, the context the engine actually loaded, and the wall time
 * of the last run in each direction. Nothing is a claim.
 */
export function StatusBar({
  phase,
  model,
  context,
  threads,
  isolated,
  decisionWallMs,
  generationWallMs,
  ratio,
}: {
  phase: string;
  model: string;
  context: number | null;
  threads: number;
  isolated: boolean;
  decisionWallMs: number | null;
  generationWallMs: number | null;
  ratio: number | null;
}) {
  return (
    <div className="statusbar" role="status" aria-live="off">
      <span className="sb-live">{phase}</span>
      <span className="sb sb-hide-sm">
        <span className="sb-key">model</span>
        <span className="sb-val">{model}</span>
      </span>
      <span className="sb sb-hide-md">
        <span className="sb-key">ctx</span>
        <span className="sb-val">{context ?? 'pending'}</span>
      </span>
      <span className="sb sb-hide-md">
        <span className="sb-key">threads</span>
        <span className="sb-val">{threads}</span>
      </span>
      <span className="sb sb-hide-md">
        <span className="sb-key">wasm</span>
        <span className="sb-val">{isolated ? 'multithreaded' : 'single thread'}</span>
      </span>
      <span className="sb-spacer" />
      <span className="sb">
        <span className="sb-key">one pass</span>
        <span className="sb-val">{sec(decisionWallMs) ?? 'not run'}</span>
      </span>
      <span className="sb sb-hide-sm">
        <span className="sb-key">token by token</span>
        <span className="sb-val">{sec(generationWallMs) ?? 'not run'}</span>
      </span>
      {ratio != null ? (
        <span className="sb">
          <span className="sb-key">gen / pass</span>
          <span className="sb-val">{ratio.toFixed(1)}×</span>
        </span>
      ) : null}
    </div>
  );
}
