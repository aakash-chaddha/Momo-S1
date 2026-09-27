/**
 * The world behind the instrument.
 *
 * Painted planes, not a photograph: a bright sky, a low sun, four banks of cloud and two faint
 * ridges. Everything is inline SVG and CSS gradients, so nothing on this page fetches art after
 * the weights are cached.
 *
 * Three rules shape every colour in here:
 *
 *   - it is decorative, so it carries no text and is hidden from assistive tech entirely;
 *   - it sits BEHIND text, so its pixels have to leave the ink tokens over them clearing their
 *     threshold. The page tests itself on composited pixels, so this is measurable, not a vibe.
 *   - therefore the drama comes from LIGHT shapes, not dark ones. Clouds, sun and sky are all
 *     at or above the paper's luminance, so they lift contrast under text instead of eating it.
 *     The ridges are the only dark-ish marks and they are washed almost to paper. The one piece
 *     of saturated art on the page (the island the model sits on) lives in the hero, in a slot
 *     with no text in it at all.
 *
 * Motion is transform and opacity only. The parallax is a CSS scroll-driven animation where the
 * browser has one (Chrome and Edge do, which is what this page targets) and it degrades to a
 * still painting everywhere else. Reduced motion gets the still painting.
 */

export function Scene() {
  return (
    <div className="scene" aria-hidden="true">
      <div className="scene-layer scene-sun" />

      {/* far banks: small, soft, slowest */}
      <svg
        className="scene-layer scene-clouds scene-clouds--far"
        viewBox="0 0 1200 420"
        preserveAspectRatio="xMidYMin slice"
      >
        <g fill="#ffffff">
          <g opacity="0.5" transform="translate(150 110)">
            <ellipse cx="0" cy="0" rx="94" ry="30" />
            <ellipse cx="58" cy="-16" rx="62" ry="27" />
            <ellipse cx="-58" cy="-9" rx="54" ry="22" />
          </g>
          <g opacity="0.54" transform="translate(620 72)">
            <ellipse cx="0" cy="0" rx="112" ry="33" />
            <ellipse cx="72" cy="-19" rx="72" ry="30" />
            <ellipse cx="-76" cy="-8" rx="62" ry="23" />
          </g>
          <g opacity="0.48" transform="translate(1060 150)">
            <ellipse cx="0" cy="0" rx="82" ry="26" />
            <ellipse cx="50" cy="-13" rx="54" ry="23" />
            <ellipse cx="-48" cy="-6" rx="46" ry="19" />
          </g>
        </g>
      </svg>

      <svg
        className="scene-layer scene-hills scene-hills--far"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 150 C 118 58 258 132 398 96 C 538 60 658 134 798 104 C 938 74 1078 140 1200 92 L1200 320 L0 320 Z"
          fill="#d7e7cf"
        />
        <path
          d="M0 214 C 158 148 298 212 458 186 C 618 160 738 218 898 196 C 1038 176 1118 208 1200 188 L1200 320 L0 320 Z"
          fill="#cfe3c4"
        />
      </svg>

      {/* near banks: large, bright, the ones that carry the parallax */}
      <svg
        className="scene-layer scene-clouds scene-clouds--near"
        viewBox="0 0 1200 420"
        preserveAspectRatio="xMidYMin slice"
      >
        <g fill="#ffffff">
          <g opacity="0.7" transform="translate(280 232)">
            <ellipse cx="0" cy="0" rx="150" ry="42" />
            <ellipse cx="96" cy="-24" rx="94" ry="36" />
            <ellipse cx="-102" cy="-12" rx="80" ry="28" />
            <ellipse cx="26" cy="-40" rx="66" ry="28" />
          </g>
          <g opacity="0.58" transform="translate(980 300)">
            <ellipse cx="0" cy="0" rx="126" ry="36" />
            <ellipse cx="80" cy="-20" rx="78" ry="30" />
            <ellipse cx="-78" cy="-9" rx="64" ry="23" />
          </g>
          <g opacity="0.5" transform="translate(640 356)">
            <ellipse cx="0" cy="0" rx="104" ry="30" />
            <ellipse cx="64" cy="-16" rx="64" ry="25" />
            <ellipse cx="-62" cy="-7" rx="52" ry="19" />
          </g>
        </g>
      </svg>

      <svg
        className="scene-layer scene-hills scene-hills--near"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 246 C 172 194 292 240 452 218 C 620 194 736 242 892 222 C 1032 204 1120 232 1200 218 L1200 320 L0 320 Z"
          fill="#c6dfb9"
        />
      </svg>

      <div className="scene-layer scene-pollen">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}
