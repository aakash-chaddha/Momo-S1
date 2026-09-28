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
 * still painting everywhere else. Reduced motion gets the still painting. A fifth plane, a dark
 * treeline on a positive translateZ so it travels fastest, rises as the reader descends toward
 * the peak; it is transparent at rest and where scroll timelines are unsupported.
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

      <svg
        className="scene-layer scene-foreground"
        viewBox="0 0 1200 320"
        preserveAspectRatio="none"
      >
        <path
          d="M0 320 L0 224.13 L-40 260 L-10.18 180.30 L19.62 260 L0.60 260 L29.60 148.67 L58.61 260 L27.30 260 L62.38 176.96 L97.45 260 L83.39 260 L133.24 96.14 L183.10 260 L148.19 260 L188.52 95.23 L228.86 260 L203.73 260 L229.18 174.57 L254.63 260 L245.98 260 L293.95 92.15 L341.91 260 L310.27 260 L338.15 129.49 L366.02 260 L341.13 260 L389.60 99.63 L438.06 260 L390.77 260 L436.17 138.63 L481.56 260 L433.83 260 L457.44 130.89 L481.04 260 L470.75 260 L516.58 115.09 L562.40 260 L525.95 260 L564.76 113.39 L603.58 260 L582.97 260 L625.37 81.06 L667.78 260 L636.39 260 L662.03 168.92 L687.68 260 L668.65 260 L695.08 105.43 L721.51 260 L704.99 260 L749.71 147.16 L794.44 260 L752.96 260 L783.31 187.90 L813.65 260 L787.02 260 L819.04 92.88 L851.05 260 L840.32 260 L868.52 94.15 L896.72 260 L878.84 260 L910.93 155.42 L943.02 260 L911.04 260 L960.50 178.67 L1009.96 260 L992.02 260 L1036.77 142.37 L1081.53 260 L1057.72 260 L1089.00 176.95 L1120.28 260 L1098.61 260 L1124.78 163.21 L1150.95 260 L1134.81 260 L1176.65 136.02 L1218.50 260 L1179.49 260 L1208.63 113.62 L1237.76 260 L1226.27 260 L1271.33 113.31 L1316.38 260 L1200 320 L1200 320 Z"
          fill="#16293a"
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
