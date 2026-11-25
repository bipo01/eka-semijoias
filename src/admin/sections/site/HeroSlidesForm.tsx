import { useId, useRef, useState, type ChangeEvent, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { ImagePlus, Loader2, RotateCcw, Undo2 } from 'lucide-react';
import { Button, buttonClass } from '../../../components/ui/Button';
import { cx } from '../../../components/ui/cx';
import { newItemId, type ContentImage, type HeroFrame, type HeroSlide } from '../../../data/content';
import {
  clampPercent,
  clampZoom,
  dragFocus,
  FRAME_DEFAULT,
  framePlacement,
  frameStyle,
  HERO_FRAMES,
  INTERVAL_DEFAULT,
  INTERVAL_MAX,
  INTERVAL_MIN,
  PHONE_TEXT_AREA,
  ZOOM_MAX,
  ZOOM_MIN,
  type HeroFrameId,
} from '../../../data/heroFrames';
import { siteImageSources } from '../../../lib/assets';
import { toast } from '../../../store/ui';
import { TextInput, useEditor } from './fields';
import { SwitchRow } from '../../FormBits';
import { AddPhoto, ImageField, photoFromFile } from './ImageField';
import { ListField } from './ListEditor';
import { getIn, pathKey, textLimit, type Path } from './sectionDraft';

/*
 * "Fotos do topo" of Painel → Site → Página inicial: the slides of the home hero
 * and, per slide, how the photo sits on each screen shape (src/data/heroFrames.ts).
 * The preview uses the same CSS as the site (object-position + zoom around the
 * focus point), so what she frames here is what visitors see.
 */

const SLIDES: Path = ['hero', 'slides'];
const ROTATE: Path = ['hero', 'rotate'];
/** Tallest preview box, so a portrait frame stays comfortable on a phone. */
const PREVIEW_MAX_H = 360;
const KEY_STEP = 2;
/** Box of the screen thumbnails in the chips. */
const THUMB_W = 48;
const THUMB_H = 36;
const KEY_STEP_BIG = 10;

/** The slide's photos and framing. */
export function HeroSlides() {
  const { draft, set } = useEditor();
  const [adding, setAdding] = useState(false);
  const slides = (getIn(draft, SLIDES) as HeroSlide[] | undefined) ?? [];
  return (
    <>
      <ListField<HeroSlide>
        path={SLIDES}
        title="Fotos do topo"
        hint="As fotos se revezam no topo da página inicial, nesta ordem. A primeira é a que aparece ao abrir o site."
        itemName="foto"
        addLabel="Adicionar foto"
        onAdd={() => setAdding(true)}
        renderTitle={(s, i) => slideTitle(s, i)}
        deleteText={(s) => (s.name.trim() || s.alt.trim() ? `“${s.name.trim() || s.alt.trim()}”` : '')}
        renderItem={(slide, _i, p) => <SlideFields slide={slide} path={p} />}
      />
      <RotationFields count={slides.length} />
      <AddPhoto
        open={adding}
        profile="wide"
        title="Adicionar foto ao topo"
        onClose={() => setAdding(false)}
        onPick={(img) => set(SLIDES, [...slides, { id: newItemId(), name: '', alt: img.alt, image: img, frames: {} }])}
      />
    </>
  );
}

/** "Foto 2 · Anel e pulseira" (or "Foto 2" while it has no name). */
function slideTitle(slide: HeroSlide, i: number) {
  const name = slide.name.trim();
  return (
    <>
      Foto {i + 1}
      {name && <span className="font-normal text-ink-muted"> · {name}</span>}
    </>
  );
}

/** "Revezar as fotos" (on/off) and, while on, "Trocar de foto a cada". */
function RotationFields({ count }: { count: number }) {
  const { draft, set } = useEditor();
  if (count < 2) return <p className="-mt-1 text-sm text-ink-muted">Com uma foto só, ela fica parada no topo. Com duas ou mais, elas podem se revezar.</p>;
  const rotate = getIn(draft, ROTATE) !== false;
  return (
    <div className="flex flex-col gap-3">
      {/* A section saved before this switch existed has no value: it rotated, so it reads as on. */}
      <SwitchRow
        label="Revezar as fotos"
        hint={rotate ? 'As fotos se revezam no topo, nesta ordem.' : 'Só a Foto 1 aparece, parada. As outras ficam guardadas aqui para quando você quiser.'}
        checked={rotate}
        onChange={(v) => set(ROTATE, v)}
        className="rounded-[12px] border border-line bg-white px-4 py-3"
      />
      {rotate && <IntervalField />}
    </div>
  );
}

/** "Trocar de foto a cada": seconds between slides. */
function IntervalField() {
  const { draft, set, errors } = useEditor();
  const uid = useId();
  const path: Path = ['hero', 'interval'];
  const value = Number(getIn(draft, path) ?? INTERVAL_DEFAULT);
  const error = errors[pathKey(path)];
  return (
    <div className="flex flex-col gap-2 rounded-[12px] border border-line bg-white px-4 pt-3 pb-4">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${uid}-interval`} className="font-medium">
          Trocar de foto a cada
        </label>
        <output htmlFor={`${uid}-interval`} className="font-medium text-copper tabular-nums" aria-hidden="true">
          {value} segundos
        </output>
      </div>
      <input
        id={`${uid}-interval`}
        type="range"
        min={INTERVAL_MIN}
        max={INTERVAL_MAX}
        step={1}
        value={value}
        onChange={(e) => set(path, Number(e.target.value))}
        aria-valuetext={`${value} segundos`}
        aria-describedby={`${uid}-interval-hint`}
        data-field={pathKey(path)}
        className="range"
        style={{ '--fill': `${((value - INTERVAL_MIN) / (INTERVAL_MAX - INTERVAL_MIN)) * 100}%` } as CSSProperties}
      />
      <p id={`${uid}-interval-hint`} className="text-sm text-ink-muted">
        A troca para enquanto a cliente mexe nas fotos.
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/** One slide: main photo with its description, then the framing per screen. */
function SlideFields({ slide, path }: { slide: HeroSlide; path: Path }) {
  const { id, set, errors } = useEditor();
  const key = pathKey(path);
  const imageKey = `${key}.image`;
  const imageError = Object.entries(errors).find(([k]) => (k === imageKey || k.startsWith(`${imageKey}.`)) && k !== `${imageKey}.alt`)?.[1];
  return (
    <>
      <TextInput path={[...path, 'name']} label="Nome da foto" hint="Para você reconhecer a foto aqui no painel." placeholder="Ex.: Brinco e colar" />
      <ImageField
        label="Foto principal"
        hint="Aparece nas telas que não têm foto própria. Ao trocar a foto, o enquadramento de cada tela recomeça."
        wide
        preview={false}
        value={{ ...slide.image, alt: slide.alt }}
        onChange={(img) => {
          if (!img) return;
          const replaced = img.src !== slide.image.src;
          // The description is the slide's; a new picture also starts a new framing (the old one was for the old photo).
          set(path, { ...slide, alt: img.alt, image: img, frames: replaced ? {} : slide.frames });
        }}
        error={imageError}
        altError={errors[`${key}.alt`] ?? errors[`${imageKey}.alt`]}
        altMax={textLimit(id, [...path, 'alt']) || 200}
        fieldKey={imageKey}
      />
      <FramingEditor slide={slide} path={path} />
    </>
  );
}

/** Chips for the 5 screens, the draggable preview of the chosen one, zoom and its own photo. */
function FramingEditor({ slide, path }: { slide: HeroSlide; path: Path }) {
  const { set } = useEditor();
  const uid = useId();
  const [frameId, setFrameId] = useState<HeroFrameId>('celular');
  const [busy, setBusy] = useState(false);
  const info = HERO_FRAMES.find((f) => f.id === frameId)!;
  const placement = framePlacement(slide, frameId);
  const framesPath: Path = [...path, 'frames'];
  const own = slide.frames[frameId]?.image;

  /** Writes this frame (only what differs from the automatic framing is worth keeping). */
  function write(next: { x: number; y: number; zoom: number; image?: ContentImage | undefined }) {
    const { image, ...pos } = next;
    const isDefault = pos.x === FRAME_DEFAULT.x && pos.y === FRAME_DEFAULT.y && pos.zoom === FRAME_DEFAULT.zoom;
    const frames = { ...slide.frames };
    if (!image && isDefault) delete frames[frameId];
    else frames[frameId] = { ...pos, ...(image ? { image } : {}) } satisfies HeroFrame;
    set(framesPath, frames);
  }
  const move = (pos: { x: number; y: number }) => write({ ...pos, zoom: placement.zoom, image: own });

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const result = await photoFromFile(file, 'wide');
    setBusy(false);
    if (!result.ok) return void toast(result.message, { tone: 'error' });
    // A new picture starts centered.
    write({ ...FRAME_DEFAULT, image: { src: result.src, thumb: result.thumb, alt: '' } });
    toast(`Foto pronta para a tela “${info.label}”. Salve para ir ao site.`, { tone: 'success' });
  }

  return (
    <div role="group" aria-labelledby={`${uid}-title`} className="flex flex-col gap-3 rounded-[12px] bg-champagne/50 p-3">
      <div>
        <p id={`${uid}-title`} className="font-medium">
          Enquadramento em cada tela
        </p>
        <p className="text-sm text-ink-muted">Cada tela mostra a foto num formato. Escolha a tela e arraste a foto para deixar a joia em destaque.</p>
      </div>
      <fieldset className="min-w-0">
        <legend className="sr-only">Tela</legend>
        {/* One row of the five screens, each thumbnail in its own shape (they fit a 48×36 box). */}
        {/* Equal columns that never break a word ("Computador" takes what it needs). */}
        <div className="flex gap-0.5">
          {HERO_FRAMES.map((f) => {
            const p = framePlacement(slide, f.id);
            const thumb = siteImageSources(p.image, 'tile');
            const size = f.aspect > THUMB_W / THUMB_H ? { width: THUMB_W, height: Math.round(THUMB_W / f.aspect) } : { width: Math.round(THUMB_H * f.aspect), height: THUMB_H };
            return (
              <label
                key={f.id}
                className="relative flex min-h-11 flex-1 basis-0 cursor-pointer flex-col items-center gap-1.5 rounded-[10px] pt-2 pb-1.5 text-center text-xs leading-tight text-ink-muted transition-colors duration-[160ms] hover:bg-white/70 has-checked:bg-white has-checked:font-medium has-checked:text-copper has-checked:shadow-[0_0_0_1.5px_var(--c-copper)] has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-copper"
              >
                <input type="radio" name={`${uid}-frame`} value={f.id} checked={frameId === f.id} onChange={() => setFrameId(f.id)} className="sr-only" />
                <span aria-hidden="true" className="flex h-9 items-end justify-center">
                  <span className="relative block overflow-hidden rounded-[3px] bg-champagne shadow-[0_0_0_1px_rgb(43_29_24/0.08)]" style={size}>
                    <img src={thumb.src} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" style={frameStyle(p)} />
                  </span>
                </span>
                <span className="text-balance">{f.label}</span>
                {p.adjusted && (
                  <>
                    <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-rose" />
                    <span className="sr-only">(ajustado)</span>
                  </>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>

      <FramePreview
        key={frameId}
        frameLabel={info.label}
        ratio={info.ratio}
        aspect={info.aspect}
        phone={frameId === 'celular'}
        image={placement.image}
        alt={slide.alt}
        x={placement.x}
        y={placement.y}
        zoom={placement.zoom}
        onMove={move}
      />
      <p className="text-sm text-ink-muted">
        {frameId === 'celular' ? 'No celular, o título fica sobre a faixa clara de baixo: deixe a joia fora dela.' : 'Nesta tela nada fica por cima da foto.'}
      </p>

      <ZoomField value={placement.zoom} onChange={(zoom) => write({ x: placement.x, y: placement.y, zoom, image: own })} />

      <div className="flex flex-wrap gap-2">
        <label
          className={cx(buttonClass('secondary', 'sm'), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper', busy && 'pointer-events-none opacity-50')}
          aria-busy={busy || undefined}
        >
          <input type="file" accept="image/*" className="sr-only" onChange={upload} disabled={busy} />
          {busy ? <Loader2 size={16} strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImagePlus size={16} strokeWidth={1.5} aria-hidden="true" />}
          {busy ? 'Preparando foto…' : own ? 'Trocar a foto desta tela' : 'Usar outra foto só nesta tela'}
        </label>
        {own && (
          <Button variant="ghost" size="sm" onClick={() => write({ ...FRAME_DEFAULT })} disabled={busy}>
            <Undo2 size={16} strokeWidth={1.5} aria-hidden="true" /> Usar a foto principal
          </Button>
        )}
        {placement.adjusted && (
          <Button variant="ghost" size="sm" onClick={() => write({ ...FRAME_DEFAULT, image: own })} disabled={busy}>
            <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> Voltar ao enquadramento automático
          </Button>
        )}
      </div>
    </div>
  );
}

interface FramePreviewProps {
  frameLabel: string;
  ratio: string;
  aspect: number;
  phone: boolean;
  image: ContentImage;
  alt: string;
  x: number;
  y: number;
  zoom: number;
  onMove: (pos: { x: number; y: number }) => void;
}

/**
 * The photo in the chosen screen's shape. Dragging (finger or mouse) moves the photo; while the
 * finger is down only this preview follows, and the draft takes the new focus when it lifts.
 * Arrow keys move it too (Shift for bigger steps).
 */
function FramePreview({ frameLabel, ratio, aspect, phone, image, alt, x, y, zoom, onMove }: FramePreviewProps) {
  const uid = useId();
  const box = useRef<HTMLDivElement>(null);
  const natural = useRef<{ width: number; height: number } | null>(null);
  const drag = useRef<{ id: number; sx: number; sy: number; start: { x: number; y: number } } | null>(null);
  const [live, setLive] = useState<{ x: number; y: number } | null>(null);
  const pos = live ?? { x, y };
  const src = siteImageSources(image, 'hero');

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    drag.current = { id: e.pointerId, sx: e.clientX, sy: e.clientY, start: { x, y } };
    setLive({ x, y });
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setLive(dragFocus({ start: d.start, dx: e.clientX - d.sx, dy: e.clientY - d.sy, box: { width: rect.width, height: rect.height }, natural: natural.current, zoom }));
  }
  function onPointerEnd(e: ReactPointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    const rect = e.currentTarget.getBoundingClientRect();
    const end = dragFocus({ start: d.start, dx: e.clientX - d.sx, dy: e.clientY - d.sy, box: { width: rect.width, height: rect.height }, natural: natural.current, zoom });
    setLive(null);
    if (end.x !== x || end.y !== y) onMove(end);
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? KEY_STEP_BIG : KEY_STEP;
    // Like dragging: the arrow moves the photo, so the focus goes the other way.
    const delta = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
    if (!delta) return;
    e.preventDefault();
    const next = { x: clampPercent(x + delta[0]!), y: clampPercent(y + delta[1]!) };
    if (next.x !== x || next.y !== y) onMove(next);
  }

  return (
    <div className="flex flex-col items-center">
      <div
        ref={box}
        tabIndex={0}
        role="group"
        aria-roledescription="área de enquadramento"
        aria-label={`Foto na tela ${frameLabel}: foco a ${pos.x}% da esquerda e ${pos.y}% do topo. Arraste a foto ou use as setas para mover.`}
        aria-describedby={`${uid}-hint`}
        data-frame-preview=""
        className={cx(
          'group relative w-full touch-none overflow-hidden rounded-[10px] bg-champagne shadow-[var(--shadow-1)] select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper',
          live ? 'cursor-grabbing' : 'cursor-grab',
        )}
        style={{ aspectRatio: ratio, maxWidth: `${Math.round(PREVIEW_MAX_H * aspect)}px` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onKeyDown={onKeyDown}
      >
        <img
          src={src.src}
          srcSet={src.srcSet}
          sizes={`${Math.round(PREVIEW_MAX_H * aspect)}px`}
          alt={alt}
          draggable={false}
          onLoad={(e) => {
            const img = e.currentTarget;
            if (img.naturalWidth > 0) natural.current = { width: img.naturalWidth, height: img.naturalHeight };
          }}
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={frameStyle({ ...pos, zoom })}
        />
        {phone && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 border-t border-dashed border-copper/60 bg-gradient-to-t from-ivory via-ivory/70 to-transparent" style={{ height: `${PHONE_TEXT_AREA * 100}%` }}>
            <span className="absolute inset-x-0 bottom-2 text-center text-xs font-medium text-ink-muted">Aqui fica o título</span>
          </div>
        )}
        {/* The focus point, while it is being moved. */}
        <span
          aria-hidden="true"
          className={cx(
            'pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(43_29_24/0.35)] transition-opacity duration-[160ms]',
            live ? 'opacity-100' : 'opacity-0 group-focus-visible:opacity-100',
          )}
          style={{ left: `${pos.x}%`, top: `${pos.y}%` }}
        />
      </div>
      <p id={`${uid}-hint`} className="sr-only">
        O ponto de foco fica no mesmo lugar quando você aumenta o zoom.
      </p>
    </div>
  );
}

/** Zoom 100–250 %, around the focus point. */
function ZoomField({ value, onChange }: { value: number; onChange: (zoom: number) => void }) {
  const uid = useId();
  const pct = Math.round(value * 100);
  const min = ZOOM_MIN * 100;
  const max = ZOOM_MAX * 100;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={`${uid}-zoom`} className="text-sm font-medium">
          Zoom
        </label>
        <output htmlFor={`${uid}-zoom`} className="text-sm font-medium text-copper tabular-nums" aria-hidden="true">
          {pct}%
        </output>
      </div>
      <input
        id={`${uid}-zoom`}
        type="range"
        min={min}
        max={max}
        step={5}
        value={pct}
        onChange={(e) => onChange(clampZoom(Number(e.target.value) / 100))}
        aria-valuetext={pct === 100 ? 'sem zoom' : `${pct}%`}
        className="range"
        style={{ '--fill': `${((pct - min) / (max - min)) * 100}%` } as CSSProperties}
      />
    </div>
  );
}
