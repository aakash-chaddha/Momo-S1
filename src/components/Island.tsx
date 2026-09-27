/**
 * The island the model sits on.
 *
 * The one piece of saturated art on the page. It lives in the hero, in the empty half of the
 * setup deck, a slot with no text in it at all, which is exactly why it is allowed to be this
 * strong: nothing is read over it. Everything else painted on this page stays near paper value
 * because everything else is behind words.
 *
 * Decorative, and the whole thing is one aria-hidden SVG: it carries the metaphor (the weights
 * live here, on this machine, in this weather) and never information the reader needs.
 *
 * Two composition rules, both learned by getting them wrong first:
 *   - every shape stays inside the viewBox. A canopy drawn above y=0 is silently clipped and the
 *     island ends up looking like it is wearing a haircut;
 *   - the soil is narrower than the cap and tapers hard. Drawn as one wide bulb it reads as a
 *     potato; drawn narrow it reads as an island that happens to be floating.
 */

import { useTilt } from '../lib/motion';

export function Island() {
  return (
    <svg
      className="island-art tilt"
      ref={useTilt<SVGSVGElement>(2.6)}
      viewBox="0 0 560 300"
      aria-hidden="true"
      preserveAspectRatio="xMidYMin meet"
    >
      <defs>
        <linearGradient id="island-soil" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c8a277" />
          <stop offset="52%" stopColor="#ab815a" />
          <stop offset="100%" stopColor="#8b6742" />
        </linearGradient>
        <linearGradient id="island-grass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#aed0a4" />
          <stop offset="100%" stopColor="#78a572" />
        </linearGradient>
        <radialGradient id="island-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#ffefcd" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#ffefcd" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* the weather it floats in */}
      <ellipse cx="280" cy="128" rx="228" ry="104" fill="url(#island-glow)" />

      {/* soil: narrower than the cap, tapering hard */}
      <path
        d="M148 128 C 154 190 200 232 244 248 C 268 256 292 256 316 248 C 360 232 406 190 412 128 Z"
        fill="url(#island-soil)"
      />
      <path d="M172 158 C 216 178 344 178 388 158" stroke="#8b6742" strokeWidth="3" fill="none" opacity="0.3" strokeLinecap="round" />
      <path d="M196 196 C 232 212 328 212 364 196" stroke="#8b6742" strokeWidth="3" fill="none" opacity="0.22" strokeLinecap="round" />
      <path d="M252 250 C 250 258 247 263 243 268" stroke="#8b6742" strokeWidth="3" fill="none" strokeLinecap="round" opacity="0.4" />
      <path d="M308 250 C 310 257 312 262 315 266" stroke="#8b6742" strokeWidth="2.5" fill="none" strokeLinecap="round" opacity="0.3" />

      {/* the grass cap: wide, flat, catching the light */}
      <ellipse cx="280" cy="122" rx="168" ry="38" fill="url(#island-grass)" />
      <path
        d="M112 122 C 112 142 186 160 280 160 C 374 160 448 142 448 122 C 448 146 374 166 280 166 C 186 166 112 146 112 122 Z"
        fill="#6b9866"
        opacity="0.42"
      />
      <g stroke="#93c28c" strokeWidth="3" strokeLinecap="round" fill="none">
        <path d="M158 108 c 5 -13 3 -20 -1 -25" />
        <path d="M173 104 c 7 -11 9 -18 7 -25" />
        <path d="M404 110 c -5 -13 -3 -20 1 -25" />
      </g>

      {/* three trees, canopies well clear of the cap and inside the frame */}
      <g>
        <path d="M186 116 l6 -30 6 30 z" fill="#8a6c4c" />
        <circle cx="192" cy="70" r="30" fill="#6f9c68" />
        <circle cx="170" cy="82" r="20" fill="#84b27c" />
        <circle cx="214" cy="81" r="18" fill="#5f8c5c" />
      </g>
      <g>
        <path d="M276 114 l8 -42 8 42 z" fill="#8a6c4c" />
        <circle cx="284" cy="56" r="38" fill="#79a673" />
        <circle cx="254" cy="72" r="26" fill="#8ab783" />
        <circle cx="314" cy="70" r="24" fill="#5f8c5c" />
      </g>
      <g>
        <path d="M368 116 l5 -26 5 26 z" fill="#8a6c4c" />
        <circle cx="373" cy="78" r="24" fill="#6f9c68" />
        <circle cx="355" cy="88" r="16" fill="#84b27c" />
      </g>

      {/* the small resident */}
      <g transform="translate(232 112)">
        <ellipse cx="0" cy="0" rx="16" ry="14" fill="#2c2a26" />
        <circle cx="-5.5" cy="-2.5" r="3.6" fill="#fdfaf2" />
        <circle cx="5.5" cy="-2.5" r="3.6" fill="#fdfaf2" />
        <circle cx="-5.5" cy="-2.5" r="1.7" fill="#2c2a26" />
        <circle cx="5.5" cy="-2.5" r="1.7" fill="#2c2a26" />
        <g stroke="#2c2a26" strokeWidth="2.2" strokeLinecap="round">
          <path d="M-13 7 l-8 4" />
          <path d="M13 7 l8 4" />
          <path d="M-9 11 l-6 6" />
          <path d="M9 11 l6 6" />
        </g>
      </g>

      {/* three small stones, and nothing more */}
      <ellipse cx="196" cy="228" rx="11" ry="8" fill="#ab815a" opacity="0.55" />
      <ellipse cx="372" cy="242" rx="8" ry="6" fill="#ab815a" opacity="0.42" />
      <ellipse cx="252" cy="272" rx="6" ry="4.5" fill="#ab815a" opacity="0.3" />
    </svg>
  );
}
