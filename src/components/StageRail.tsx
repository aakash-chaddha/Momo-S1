import { useEffect, useState, type ReactNode } from 'react';

export type StageState = 'idle' | 'run' | 'ok' | 'bad';

export interface StageRow {
  id: string;
  num: string;
  name: string;
  state: StageState;
  note: string;
}

/**
 * The chrome, and this page's navigation.
 *
 * A working surface is not a marketing page with a wordmark bar: the rail carries the five stages,
 * their live state, and nothing else. The active row steps out into the gutter and lights its dot,
 * which is the only "where am I" indicator the page needs.
 */
export function StageRail({
  brand,
  sub,
  claim,
  rows,
  foot,
}: {
  brand: string;
  sub: string;
  claim: ReactNode;
  rows: StageRow[];
  foot: ReactNode;
}) {
  const [active, setActive] = useState(rows[0]?.id ?? '');
  const ids = rows.map((r) => r.id).join(',');

  useEffect(() => {
    const all = ids.split(',');
    let frame = 0;
    const pick = () => {
      frame = 0;
      let current = all[0] ?? '';
      for (const id of all) {
        const el = document.getElementById(id);
        // 150px clears the phone's sticky stage strip without skipping a short stage
        if (el && el.getBoundingClientRect().top <= 150) current = id;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(pick);
    };
    pick();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids]);

  return (
    <nav className="rail" aria-label="stages">
      <div className="rail-brand">
        <h1>{brand}</h1>
        <span className="sys">{sub}</span>
      </div>
      <p className="rail-claim">{claim}</p>

      <ul className="rail-list">
        {rows.map((row) => (
          <li
            className="rail-row"
            key={row.id}
            data-state={row.state}
            aria-current={active === row.id ? 'true' : undefined}
          >
            <a href={`#${row.id}`}>
              <span className="rail-dot" aria-hidden="true" />
              <span className="rail-name">
                <span className="rail-num">{row.num}</span>
                {row.name}
              </span>
              <span className="rail-state">{row.note}</span>
            </a>
          </li>
        ))}
      </ul>

      <div className="rail-foot">{foot}</div>
    </nav>
  );
}
