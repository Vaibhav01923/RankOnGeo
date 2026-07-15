import Image from "next/image";

// Generated cover art for blog posts without a cover image. Deterministic
// per slug: all randomness is resolved eagerly inside buildArt() with a
// locally-created PRNG, so every render (server, client, StrictMode
// double-render) produces identical plain data — no shared mutable state.
// Motif vocabulary: the landing's night sky — stars, orbit rings, meadow
// horizon, drifting dandelion seeds. "Grown under a night sky."

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSlug(slug: string): number {
  let h = 2166136261;
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const INK_DEEP = "oklch(0.16 0.02 55)";
const INK_DEEPER = "oklch(0.12 0.018 55)";
const CREAM = "oklch(0.94 0.013 80)";
const RUST = "oklch(0.68 0.14 38)";
const OLIVE = "oklch(0.72 0.1 130)";

type Star = { cx: number; cy: number; r: number; warm: boolean; opacity: number };

type Art =
  | { kind: "constellation"; stars: Star[]; path: string; nodes: { x: number; y: number; bright: boolean }[] }
  | { kind: "orbits"; stars: Star[]; cx: number; cy: number; tilt: number; moonX: number; moonY: number }
  | { kind: "meadow"; stars: Star[]; blades: { d: string; olive: boolean }[]; flies: { cx: number; cy: number; r: number }[] }
  | { kind: "seeds"; stars: Star[]; seeds: { x: number; y: number; s: number; rot: number; opacity: number }[] };

function makeStars(rand: () => number, count: number, maxY = 0.85): Star[] {
  return Array.from({ length: count }, () => ({
    cx: rand() * 400,
    cy: rand() * 220 * maxY,
    r: 0.5 + rand() * 1.3,
    warm: rand() > 0.85,
    opacity: 0.25 + rand() * 0.5,
  }));
}

function buildArt(seed: number): Art {
  const rand = mulberry32(seed);
  const kind = (["constellation", "orbits", "meadow", "seeds"] as const)[seed % 4];

  if (kind === "constellation") {
    const stars = makeStars(rand, 26);
    const pts = Array.from({ length: 5 + Math.floor(rand() * 3) }, () => ({
      x: 60 + rand() * 280,
      y: 30 + rand() * 130,
    }));
    return {
      kind,
      stars,
      path: pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" "),
      nodes: pts.map((p, i) => ({ x: p.x, y: p.y, bright: i === 2 })),
    };
  }

  if (kind === "orbits") {
    const stars = makeStars(rand, 18);
    const cx = 120 + rand() * 160;
    const cy = 90 + rand() * 60;
    return {
      kind,
      stars,
      cx,
      cy,
      tilt: -18 + rand() * 36,
      moonX: cx + 78 * Math.cos(rand() * 6.28),
      moonY: cy - 20 - rand() * 30,
    };
  }

  if (kind === "meadow") {
    const stars = makeStars(rand, 20, 0.6);
    const blades = Array.from({ length: 22 }, (_, i) => {
      const x = 8 + i * 18 + rand() * 10;
      const h = 18 + rand() * 34;
      const lean = -6 + rand() * 12;
      return {
        d: `M${x.toFixed(1)} 220 Q${(x + lean).toFixed(1)} ${(220 - h * 0.6).toFixed(1)} ${(x + lean * 1.6).toFixed(1)} ${(220 - h).toFixed(1)}`,
        olive: i % 4 === 0,
      };
    });
    const flies = Array.from({ length: 5 }, () => ({
      cx: 30 + rand() * 340,
      cy: 150 + rand() * 45,
      r: 1.6 + rand(),
    }));
    return { kind, stars, blades, flies };
  }

  const stars = makeStars(rand, 16);
  const seeds = Array.from({ length: 9 }, () => ({
    x: 30 + rand() * 340,
    y: 30 + rand() * 160,
    s: 0.7 + rand() * 0.9,
    rot: rand() * 360,
    opacity: 0.4 + rand() * 0.5,
  }));
  return { kind: "seeds", stars, seeds };
}

const SEED_ANGLES = [-40, -20, 0, 20, 40];

export function BlogCover({
  slug,
  coverImageUrl,
  title,
  className = "",
  priority = false,
}: {
  slug: string;
  coverImageUrl?: string | null;
  title: string;
  className?: string;
  /** Set for the single above-the-fold hero use (the post page) — this is
      the site's worst LCP offender (7.3s) precisely because that image was
      lazy-loaded and undiscoverable in the initial HTML. Leave false for
      index-page thumbnails, which are legitimately below the fold. */
  priority?: boolean;
}) {
  if (coverImageUrl) {
    return (
      <div className={`relative overflow-hidden bg-[oklch(0.16_0.02_55)] ${className}`}>
        <Image
          src={coverImageUrl}
          alt={title}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
          priority={priority}
          fetchPriority={priority ? "high" : "auto"}
        />
      </div>
    );
  }

  const seed = hashSlug(slug);
  const art = buildArt(seed);

  return (
    <div className={`overflow-hidden ${className}`} aria-hidden="true">
      <svg viewBox="0 0 400 220" preserveAspectRatio="xMidYMid slice" className="h-full w-full" role="img" aria-label={`Cover art for ${title}`}>
        <defs>
          <radialGradient id={`glow-${seed}`} cx="50%" cy="0%" r="90%">
            <stop offset="0%" stopColor="oklch(0.22 0.03 55)" />
            <stop offset="100%" stopColor={INK_DEEP} />
          </radialGradient>
        </defs>
        <rect width="400" height="220" fill={`url(#glow-${seed})`} />

        {art.stars.map((s, i) => (
          <circle key={i} cx={s.cx.toFixed(1)} cy={s.cy.toFixed(1)} r={s.r.toFixed(2)} fill={s.warm ? RUST : CREAM} opacity={s.opacity.toFixed(2)} />
        ))}

        {art.kind === "constellation" && (
          <>
            <path d={art.path} stroke={OLIVE} strokeWidth="0.8" fill="none" opacity="0.55" />
            {art.nodes.map((p, i) => (
              <circle key={i} cx={p.x.toFixed(1)} cy={p.y.toFixed(1)} r={p.bright ? 3.2 : 1.9} fill={p.bright ? RUST : CREAM} opacity="0.9" />
            ))}
          </>
        )}

        {art.kind === "orbits" && (
          <g transform={`rotate(${art.tilt.toFixed(0)} ${art.cx.toFixed(1)} ${art.cy.toFixed(1)})`}>
            <circle cx={art.cx.toFixed(1)} cy={art.cy.toFixed(1)} r="26" stroke={RUST} strokeWidth="2" fill="none" opacity="0.9" />
            <circle cx={art.cx.toFixed(1)} cy={art.cy.toFixed(1)} r="52" stroke={CREAM} strokeWidth="0.7" fill="none" opacity="0.35" />
            <circle cx={art.cx.toFixed(1)} cy={art.cy.toFixed(1)} r="78" stroke={RUST} strokeWidth="1.1" strokeDasharray="5 7" fill="none" opacity="0.6" />
            <circle cx={art.moonX.toFixed(1)} cy={art.moonY.toFixed(1)} r="4" fill={OLIVE} />
          </g>
        )}

        {art.kind === "meadow" && (
          <>
            <path d="M0 196 Q200 176 400 198 L400 220 L0 220 Z" fill={INK_DEEPER} />
            {art.blades.map((b, i) => (
              <path key={i} d={b.d} stroke={b.olive ? OLIVE : CREAM} strokeWidth="1" fill="none" opacity={b.olive ? 0.7 : 0.28} />
            ))}
            {art.flies.map((f, i) => (
              <circle key={i} cx={f.cx.toFixed(1)} cy={f.cy.toFixed(1)} r={f.r.toFixed(2)} fill={OLIVE} opacity="0.85" />
            ))}
          </>
        )}

        {art.kind === "seeds" &&
          art.seeds.map((s, i) => (
            <g
              key={i}
              transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)}) rotate(${s.rot.toFixed(0)}) scale(${s.s.toFixed(2)})`}
              opacity={s.opacity.toFixed(2)}
            >
              <line x1="0" y1="0" x2="0" y2="14" stroke={CREAM} strokeWidth="0.9" />
              {SEED_ANGLES.map((a) => (
                <line
                  key={a}
                  x1="0"
                  y1="0"
                  x2={(8 * Math.sin((a * Math.PI) / 180)).toFixed(2)}
                  y2={(-8 * Math.cos((a * Math.PI) / 180)).toFixed(2)}
                  stroke={CREAM}
                  strokeWidth="0.7"
                />
              ))}
              <circle cx="0" cy="14" r="1.4" fill={RUST} />
            </g>
          ))}
      </svg>
    </div>
  );
}
