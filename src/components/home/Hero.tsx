import { useCallback, useEffect, useId, useRef, useState, type FocusEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Pause, Play } from 'lucide-react';
import type { HeroSlide } from '../../data/content';
import { framePlacement, frameVars, HERO_FRAMES, heroFrameCss } from '../../data/heroFrames';
import { useSection } from '../../hooks/useSection';
import { siteImageSources } from '../../lib/assets';
import { ButtonLink } from '../ui/Button';
import { cx } from '../ui/cx';

/**
 * A short headline breaks before its last word from 640 px up ("Brilho que / acompanha você"),
 * as the original design did; a long one wraps naturally.
 */
function HeroTitle({ title, highlight }: { title: string; highlight: string }) {
  const words = title.split(/\s+/);
  const short = words.length >= 3 && `${title} ${highlight}`.trim().length <= 32;
  const italic = highlight && (
    <>
      {' '}
      <em className="font-medium italic">{highlight}</em>
    </>
  );
  if (!short) return <>{title}{italic}</>;
  return (
    <>
      {words.slice(0, -1).join(' ')} <br className="hidden sm:block" />
      {words.at(-1)}
      {italic}
    </>
  );
}

/** Class of every hero photo; its focus and zoom per screen come from heroFrameCss (same media queries as the <source>s). */
const SHOT = 'hero-shot';
const FRAME_CSS = heroFrameCss(SHOT);
/** Horizontal finger travel that changes the photo. */
const SWIPE_PX = 40;

/**
 * One slide: a <picture> with the photo of each screen shape (its own or the main one) and the
 * <img> on the phone photo (the base of the frame CSS too, so photo and framing always agree).
 */
function HeroPicture({ slide, first, onSettled }: { slide: HeroSlide; first: boolean; onSettled: (id: string, first: boolean) => void }) {
  const phone = siteImageSources(framePlacement(slide, 'celular').image, 'hero');
  const settle = () => onSettled(slide.id, first);
  return (
    <picture>
      {HERO_FRAMES.filter((f) => f.id !== 'celular').map((f) => {
        const s = siteImageSources(framePlacement(slide, f.id).image, 'hero');
        return <source key={f.id} media={f.media} srcSet={s.srcSet ?? s.src} sizes={f.sizes} />;
      })}
      <img
        src={phone.src}
        srcSet={phone.srcSet}
        sizes="100vw"
        alt={slide.alt}
        loading={first ? 'eager' : 'lazy'}
        decoding={first ? 'sync' : 'async'}
        {...(first ? { fetchPriority: 'high' as const } : {})}
        draggable={false}
        ref={(el) => {
          if (el?.complete) settle();
        }}
        onLoad={settle}
        onError={settle}
        className={cx(SHOT, 'absolute inset-0 h-full w-full object-cover select-none')}
        style={frameVars(slide)}
      />
    </picture>
  );
}

function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);
  return reduced;
}

function usePageVisible(): boolean {
  const [visible, setVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  useEffect(() => {
    const update = () => setVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return visible;
}

/** Keyboard focus (not a tap or click, which also focuses the button) pauses the slides. */
const isKeyboardFocus = (el: Element) => {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
};

interface ControlsProps {
  count: number;
  current: number;
  playing: boolean;
  slidesId: string;
  onPick: (index: number) => void;
  onToggle: () => void;
  onFocusChange: (inside: boolean) => void;
  className: string;
}

/** Dots (copper pill = the photo on screen) and pause/play; every control is a 44 px target. */
function Controls({ count, current, playing, slidesId, onPick, onToggle, onFocusChange, className }: ControlsProps) {
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    if (isKeyboardFocus(e.target)) onFocusChange(true);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onFocusChange(false);
  };
  return (
    <div className={cx('items-center', className)} onFocus={onFocus} onBlur={onBlur}>
      {Array.from({ length: count }, (_, i) => (
        <button
          key={i}
          type="button"
          className="group flex size-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-copper"
          aria-label={`Mostrar foto ${i + 1} de ${count}`}
          aria-current={i === current ? 'true' : undefined}
          aria-controls={slidesId}
          onClick={() => onPick(i)}
        >
          <span
            aria-hidden="true"
            className={cx(
              'block h-1.5 rounded-full transition-all duration-[240ms] motion-reduce:transition-none',
              i === current ? 'w-6 bg-copper' : 'w-1.5 bg-rose-light group-hover:bg-rose',
            )}
          />
        </button>
      ))}
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-line" />
      <button
        type="button"
        className="flex size-11 cursor-pointer items-center justify-center rounded-full text-ink-muted transition-colors duration-[160ms] hover:text-copper focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-copper"
        aria-label={playing ? 'Pausar a troca de fotos' : 'Continuar a troca de fotos'}
        aria-controls={slidesId}
        onClick={onToggle}
      >
        {playing ? <Pause size={16} strokeWidth={1.75} aria-hidden="true" /> : <Play size={16} strokeWidth={1.75} aria-hidden="true" />}
      </button>
    </div>
  );
}

export function Hero() {
  const { hero } = useSection('inicio');
  const slides = hero.slides;
  const count = slides.length;
  const many = count > 1;
  const slidesId = useId();

  const [active, setActive] = useState(0);
  const [previous, setPrevious] = useState<number | null>(null);
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set());
  /** The other photos mount once the first one is on screen (it is the page's largest paint). */
  const [othersReady, setOthersReady] = useState(false);
  const reduced = useReducedMotion();
  /** null: the visitor did not choose; slides change on their own unless she prefers less motion. */
  const [choice, setChoice] = useState<'play' | 'pause' | null>(null);
  const playing = choice === null ? !reduced : choice === 'play';
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [touching, setTouching] = useState(false);
  const visible = usePageVisible();
  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);

  const current = Math.min(active, count - 1);
  const running = many && playing && !hovered && !focused && !touching && visible;

  const onSettled = useCallback((id: string, first: boolean) => {
    setSettled((s) => (s.has(id) ? s : new Set(s).add(id)));
    if (first) setOthersReady(true);
  }, []);

  const go = useCallback(
    (index: number) => {
      const next = ((index % count) + count) % count;
      if (next === current) return;
      setOthersReady(true);
      setPrevious(current);
      setActive(next);
    },
    [count, current],
  );

  // Autoplay: the next photo once it is ready (never a fade into an empty frame); restarts after every change.
  const nextId = many ? slides[(current + 1) % count]?.id : undefined;
  const nextReady = !!nextId && settled.has(nextId);
  useEffect(() => {
    if (!running || !nextReady) return;
    const timer = window.setTimeout(() => go(current + 1), hero.interval * 1000);
    return () => window.clearTimeout(timer);
  }, [running, nextReady, current, go, hero.interval]);

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!many || e.pointerType === 'mouse') return;
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    setTouching(true);
  }
  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const start = swipe.current;
    if (!start || start.id !== e.pointerId) return;
    swipe.current = null;
    setTouching(false);
    if (e.type !== 'pointerup') return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) >= SWIPE_PX && Math.abs(dx) > Math.abs(dy) * 1.3) go(current + (dx < 0 ? 1 : -1));
  }

  const toggle = () => setChoice(playing ? 'pause' : 'play');
  const controls = (className: string) => (
    <Controls count={count} current={current} playing={playing} slidesId={slidesId} onPick={go} onToggle={toggle} onFocusChange={setFocused} className={className} />
  );

  return (
    <section aria-labelledby="hero-title" className="relative md:grid md:grid-cols-[minmax(0,45fr)_minmax(0,55fr)] md:items-center md:gap-8 lg:gap-12">
      <style>{FRAME_CSS}</style>
      <div className="relative md:order-2">
        <div
          className="relative aspect-[4/5] overflow-hidden bg-champagne md:aspect-auto md:h-[min(640px,calc(100dvh-140px))] md:min-h-[480px] md:w-full"
          {...(many
            ? {
                role: 'region',
                'aria-roledescription': 'carrossel',
                'aria-label': 'Fotos em destaque',
                onPointerEnter: (e: ReactPointerEvent) => e.pointerType === 'mouse' && setHovered(true),
                onPointerLeave: (e: ReactPointerEvent) => e.pointerType === 'mouse' && setHovered(false),
              }
            : {})}
        >
          <div
            id={slidesId}
            className={cx('absolute inset-0', many && 'touch-pan-y')}
            aria-live={many ? (running ? 'off' : 'polite') : undefined}
            onPointerDown={onPointerDown}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
          >
            {slides.map((slide, i) => {
              if (i > 0 && !othersReady) return null;
              const shown = i === current;
              const under = i === previous && !shown;
              return (
                <div
                  key={slide.id}
                  className="absolute inset-0 transition-opacity duration-[900ms] ease-in-out motion-reduce:transition-none"
                  // The photo coming in fades in above the one going out (which stays opaque below it): a true crossfade.
                  style={{ opacity: shown || under ? 1 : 0, zIndex: shown ? 2 : under ? 1 : 0 }}
                  {...(many ? { role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} de ${count}`, 'aria-hidden': shown ? undefined : true } : {})}
                >
                  <HeroPicture slide={slide} first={i === 0} onSettled={onSettled} />
                </div>
              );
            })}
          </div>
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 z-[3] h-[38%] bg-gradient-to-t from-ivory via-ivory/70 to-transparent md:hidden" />
          {many && controls('absolute bottom-4 left-4 z-[4] hidden rounded-full bg-ivory/85 px-1 shadow-[var(--shadow-1)] backdrop-blur-sm md:flex')}
        </div>
      </div>
      <div className="relative z-10 -mt-36 px-[var(--gutter)] pb-8 md:order-1 md:mt-0 md:py-12 md:pr-0 md:pl-[max(var(--gutter),calc((100vw-1200px)/2))] lg:py-16">
        <h1 id="hero-title" className="font-display text-display-xl break-words text-ink md:text-display-l lg:text-display-xl">
          <HeroTitle title={hero.title} highlight={hero.highlight} />
        </h1>
        <span aria-hidden="true" className="mt-4 block h-px w-16 bg-rose" />
        {hero.subtitle && <p className="mt-4 max-w-sm text-lg leading-snug [overflow-wrap:anywhere] text-ink">{hero.subtitle}</p>}
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6 md:flex-col md:items-start md:gap-3 lg:flex-row lg:items-center lg:gap-6">
          <ButtonLink to="/catalogo" size="lg" className="w-full sm:w-auto">
            {hero.primaryCta} <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </ButtonLink>
          {hero.secondaryCta && (
            <Link to="/revendedoras" className="link-underline inline-flex min-h-11 items-center self-center text-copper hover:text-copper-dark sm:self-auto">
              {hero.secondaryCta}
            </Link>
          )}
        </div>
        {/* On phones the headline covers the bottom of the photo, so the controls sit under the buttons, never on the jewelry. */}
        {many && controls('mt-4 flex justify-center sm:-ml-3 sm:justify-start md:hidden')}
      </div>
    </section>
  );
}
