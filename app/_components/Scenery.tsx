/* Hand-drawn SVG scenery for the marketing surfaces: the orbit globe. */

export function GlobeViz() {
  return (
    <svg viewBox="0 0 560 560" fill="none" className="h-auto w-full overflow-visible" aria-hidden="true">
      <defs>
        <radialGradient id="sphere" cx=".38" cy=".3" r=".85">
          <stop offset="0" stopColor="#e2d5b3" />
          <stop offset=".45" stopColor="#c19a68" />
          <stop offset="1" stopColor="#7a5c40" />
        </radialGradient>
        <linearGradient id="orbWarm" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#b1552e" stopOpacity="0" />
          <stop offset=".6" stopColor="#b1552e" stopOpacity=".8" />
          <stop offset="1" stopColor="#d68a5a" />
        </linearGradient>
        <linearGradient id="orbCool" x1="1" y1="0" x2="0" y2="0">
          <stop offset="0" stopColor="#6f7f3f" stopOpacity="0" />
          <stop offset=".6" stopColor="#6f7f3f" stopOpacity=".8" />
          <stop offset="1" stopColor="#a8b87a" />
        </linearGradient>
        <pattern id="dots" width="11" height="11" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.35" fill="#5a4530" />
        </pattern>
        <clipPath id="sphereClip">
          <circle cx="280" cy="285" r="188" />
        </clipPath>
        <marker id="arrowW" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#d68a5a" />
        </marker>
        <marker id="arrowC" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0L10 5L0 10z" fill="#a8b87a" />
        </marker>
      </defs>

      <circle cx="280" cy="285" r="188" fill="url(#sphere)" />
      <circle cx="280" cy="285" r="188" stroke="rgba(48,40,33,.15)" strokeWidth="1" />

      <g clipPath="url(#sphereClip)" opacity=".8">
        <path d="M150 220 C 170 190, 215 185, 232 210 C 246 230, 238 260, 218 276 C 200 292, 196 318, 180 330 C 160 344, 138 330, 134 302 C 130 272, 134 244, 150 220 Z" fill="url(#dots)" />
        <path d="M262 190 C 288 168, 330 170, 352 190 C 372 208, 380 238, 366 260 C 350 284, 318 282, 300 264 C 280 246, 248 240, 250 218 C 251 206, 254 197, 262 190 Z" fill="url(#dots)" />
        <path d="M300 300 C 322 288, 352 294, 362 316 C 372 338, 360 366, 338 374 C 316 382, 292 370, 288 346 C 285 326, 286 308, 300 300 Z" fill="url(#dots)" />
        <path d="M380 224 C 400 210, 428 216, 438 236 C 448 256, 438 280, 418 288 C 398 296, 378 284, 374 262 C 371 246, 370 232, 380 224 Z" fill="url(#dots)" />
        <path d="M196 356 C 212 348, 232 354, 238 370 C 244 386, 234 402, 218 406 C 202 410, 188 398, 186 382 C 185 372, 188 362, 196 356 Z" fill="url(#dots)" />
      </g>

      <circle cx="212" cy="242" r="4" fill="#a8b87a" className="tw" />
      <circle cx="318" cy="222" r="4.5" fill="#a8b87a" className="tw" style={{ animationDelay: "-.8s" }} />
      <circle cx="336" cy="330" r="3.6" fill="#a8b87a" className="tw" style={{ animationDelay: "-1.6s" }} />
      <circle cx="412" cy="252" r="3.4" fill="#a8b87a" className="tw" style={{ animationDelay: "-2.2s" }} />
      <circle cx="176" cy="300" r="3" fill="#d9853f" className="tw" style={{ animationDelay: "-1.1s" }} />
      <circle cx="216" cy="382" r="3" fill="#d9853f" className="tw" style={{ animationDelay: "-2.7s" }} />

      <ellipse cx="216" cy="196" rx="120" ry="72" fill="rgba(255,250,235,.14)" transform="rotate(-24 216 196)" />

      <path id="orbA" d="M52 330 A 252 96 -16 0 1 508 240" stroke="url(#orbWarm)" strokeWidth="3.5" markerEnd="url(#arrowW)" />
      <path id="orbB" d="M520 350 A 252 90 12 0 1 60 260" stroke="url(#orbCool)" strokeWidth="3.5" markerEnd="url(#arrowC)" />

      <circle r="5.5" fill="#d68a5a">
        <animateMotion dur="8s" repeatCount="indefinite">
          <mpath href="#orbA" />
        </animateMotion>
      </circle>
      <circle r="5.5" fill="#a8b87a">
        <animateMotion dur="10s" repeatCount="indefinite">
          <mpath href="#orbB" />
        </animateMotion>
      </circle>

      <circle cx="80" cy="120" r="1.8" fill="#b0a58e" className="tw" />
      <circle cx="480" cy="96" r="2.2" fill="#b0a58e" className="tw" style={{ animationDelay: "-1.3s" }} />
      <circle cx="520" cy="470" r="1.8" fill="#b0a58e" className="tw" style={{ animationDelay: "-2s" }} />
      <circle cx="60" cy="450" r="1.6" fill="#b0a58e" className="tw" style={{ animationDelay: "-.7s" }} />
      <path d="M508 148 l3.2 7.2 7.2 3.2 -7.2 3.2 -3.2 7.2 -3.2-7.2 -7.2-3.2 7.2-3.2z" fill="#a8b87a" opacity=".7" className="tw" style={{ animationDelay: "-1.9s" }} />
      <path d="M96 88 l2.4 5.4 5.4 2.4 -5.4 2.4 -2.4 5.4 -2.4-5.4 -5.4-2.4 5.4-2.4z" fill="#d9853f" opacity=".7" className="tw" style={{ animationDelay: "-.4s" }} />
    </svg>
  );
}
