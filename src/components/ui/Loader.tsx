import { cx } from './cx';

/*
 * The brand's loading animation (designed in ChatGPT for the panel, 2026-11-25): inline SVG + CSS
 * keyframes in base.css (`.eka-loader-*`), crisp at any size, an opacity pulse only when the
 * visitor asks for reduced motion. Always above a short text that says what is loading.
 *   brilho  — a faceted gem draws itself, a sparkle orbits it (default: pages and lists)
 *   colar   — a pendant swings on a fine chain (people: resellers, customers, her panel)
 *   perolas — three pearls breathe in turn (compact, inside cards and pickers)
 */

export type LoaderVariant = 'brilho' | 'colar' | 'perolas';

function Brilho() {
  return (
    <svg className="eka-loader-brilho" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path
        className="eka-loader-gem"
        d="M12 28 22 15H50L60 28 36 57Z M12 28H60 M22 15 28 28 36 57 44 28 50 15 M28 28 36 15 44 28"
        pathLength={100}
        stroke="#B48C78"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path className="eka-loader-shine" d="M28 28 36 15 44 28 36 57Z" fill="#E6BEA4" />
      <g className="eka-loader-orbit">
        <path className="eka-loader-sparkle" d="M36 3Q36 9 42 9Q36 9 36 15Q36 9 30 9Q36 9 36 3Z" fill="#B48C78" />
      </g>
    </svg>
  );
}

function Colar() {
  return (
    <svg className="eka-loader-colar" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M11 10Q13 32 36 34Q59 32 61 10" stroke="#B48C78" strokeWidth={1.5} strokeLinecap="round" />
      <g className="eka-loader-pendant">
        <ellipse cx="36" cy="37" rx="2.5" ry="4" stroke="#8A5A45" strokeWidth={1.3} />
        <path d="M36 40C32 46 26 51 26 57A10 10 0 0 0 46 57C46 51 40 46 36 40Z" fill="#F3E6DC" stroke="#B48C78" strokeWidth={1.5} />
        <path d="M36 43 30 55 36 64 42 55Z M26 57 36 64 46 57 M30 55H42" stroke="#B48C78" strokeWidth={0.8} strokeLinejoin="round" />
        <path className="eka-loader-glint" d="M42 43Q42 48 47 48Q42 48 42 53Q42 48 37 48Q42 48 42 43Z" fill="#B48C78" />
      </g>
    </svg>
  );
}

function Pearl({ cx: x, cy, r, order }: { cx: number; cy: number; r: number; order: 'first' | 'second' | 'third' }) {
  return (
    <g className={`eka-loader-pearl eka-loader-pearl-${order}`}>
      <circle cx={x} cy={cy} r={r} fill="#F3E6DC" stroke="#B48C78" strokeWidth={1.2} />
      <circle className="eka-loader-pearl-light" cx={x} cy={cy} r={r - 1} fill="#E6BEA4" />
      <ellipse cx={x - r * 0.31} cy={cy - r * 0.31} rx={r * 0.34} ry={r * 0.22} transform={`rotate(-35 ${x - r * 0.31} ${cy - r * 0.31})`} fill="#FBF8F5" />
    </g>
  );
}

function Perolas() {
  return (
    <svg className="eka-loader-perolas" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <path d="M6 25Q36 64 66 25" stroke="#B48C78" strokeWidth={1.2} strokeLinecap="round" opacity={0.65} />
      <Pearl cx={16} cy={36} r={8} order="first" />
      <Pearl cx={36} cy={44.5} r={9} order="second" />
      <Pearl cx={56} cy={36} r={8} order="third" />
    </svg>
  );
}

const ART = { brilho: Brilho, colar: Colar, perolas: Perolas } as const;

export function Loader({ label, variant = 'brilho', size = 72, className }: { label: string; variant?: LoaderVariant; size?: number; className?: string }) {
  const Art = ART[variant];
  return (
    <div role="status" aria-live="polite" className={cx('eka-loader flex flex-col items-center justify-center gap-3 py-12 text-center', className)}>
      <span className="block" style={{ width: size, height: size }}>
        <Art />
      </span>
      <p className="text-sm tracking-wide text-ink-muted">{label}</p>
    </div>
  );
}
