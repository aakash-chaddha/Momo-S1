import { useEffect, useRef } from 'react';

/**
 * Pointer tilt, for the things on this page that are objects rather than panels.
 *
 * Three constraints shape it:
 *   - transform only, so it never triggers a layout and never fights the wasm engine for time;
 *   - one rAF per pointer event at most, and the value is written as a custom property the
 *     stylesheet already reads, so no React state is touched while the pointer moves;
 *   - off for touch (a tilt that tracks a finger is nausea, not depth) and off under
 *     prefers-reduced-motion, where it sets the resting value and does nothing else.
 *
 * The measurement harness never moves the pointer before it has finished measuring, so an
 * element that is tilted only on hover is always photographed at rest.
 */
export function useTilt<T extends Element>(max = 2.4) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current as HTMLElement | SVGSVGElement | null;
    if (!el) return;

    const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    const enabled = () => fine.matches && !still.matches;

    let raf = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      raf = 0;
      el.style.setProperty('--tilt-x', `${(-y * max).toFixed(2)}deg`);
      el.style.setProperty('--tilt-y', `${(x * max).toFixed(2)}deg`);
    };

    const onMove = (e: PointerEvent) => {
      if (!enabled()) return;
      const r = el.getBoundingClientRect();
      x = ((e.clientX - r.left) / r.width - 0.5) * 2;
      y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!raf) raf = requestAnimationFrame(paint);
    };

    const onLeave = () => {
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
    };

    el.addEventListener('pointermove', onMove as EventListener);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove as EventListener);
      el.removeEventListener('pointerleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [max]);

  return ref;
}
