import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Eraser, Loader2, Paintbrush, RotateCcw, ScanLine, Sparkles, Sun, Undo2, Wifi, ZapOff } from 'lucide-react';
import { Button } from '../../../components/ui/Button';
import { Sheet } from '../../../components/ui/Sheet';
import { cx } from '../../../components/ui/cx';
import { processImage } from '../../../lib/image';
import { canvasToBlob, compose, cutOut, loadSource, paintStroke, readAlpha, releaseCanvas, renderRetouchView, writeAlpha, makeCanvas, type BrushMode } from './compose';
import { ERROR_MESSAGES, getEngine, releaseEngine, StandardizeError } from './engine';
import { matteBounds, toCanvasPoint } from './geometry';
import { DEFAULT_MODEL, type Device } from './models';
import { downloadMb, isModelCached, markTipsSeen, tipsSeen } from './prefs';

export interface StandardizedPhoto {
  src: string;
  thumb: string;
}

interface StandardizeSheetProps {
  /** The photo to standardize (the original file when available, else the stored photo). */
  source: Blob;
  /** Called with the processed photo (same format as an upload) when she chooses the standardized one. */
  onApply: (photo: StandardizedPhoto) => void;
  /** Closes without changes ("Manter a original"). */
  onClose: () => void;
}

type Phase = 'tips' | 'loading' | 'cutting' | 'review' | 'retouch' | 'saving' | 'error';

const SOURCE_ERRORS = {
  'too-large': 'Esta foto é grande demais para padronizar. Tente outra.',
  unsupported: 'Não conseguimos abrir esta foto. Envie em JPG ou PNG.',
} as const;
const EMPTY_CUT = 'O recorte não encontrou a peça nesta foto. Retoque à mão (Restaurar) ou mantenha a original.';
const MAX_UNDO = 6;
const BRUSH_MIN = 1;
const BRUSH_MAX = 12;

function messageFor(err: unknown): string {
  if (err instanceof StandardizeError) return err.message;
  return ERROR_MESSAGES.unknown;
}

const TIPS = [
  { icon: ScanLine, text: 'Fundo liso, de uma cor só (papel ou tecido claro).' },
  { icon: Sun, text: 'Luz difusa: perto de uma janela, sem sol direto.' },
  { icon: ZapOff, text: 'Sem flash. Ele cria reflexos no metal e nas pedras.' },
  { icon: Sparkles, text: 'A peça inteira no quadro, sem cortar a corrente.' },
] as const;

export default function StandardizeSheet({ source, onApply, onClose }: StandardizeSheetProps) {
  const [phase, setPhase] = useState<Phase>(() => (tipsSeen() ? 'loading' : 'tips'));
  const [error, setError] = useState('');
  const [canRetouch, setCanRetouch] = useState(false);
  const [progress, setProgress] = useState<{ loaded: number; total: number } | null>(null);
  const [firstDownload, setFirstDownload] = useState<boolean | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [beforeUrl, setBeforeUrl] = useState('');
  const [afterUrl, setAfterUrl] = useState('');
  const [workSize, setWorkSize] = useState({ width: 0, height: 0 });
  const [mode, setMode] = useState<BrushMode>('erase');
  const [brush, setBrush] = useState(4);
  const [undoCount, setUndoCount] = useState(0);
  const [retouchNote, setRetouchNote] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);
  const headingId = useId();

  const run = useRef(0);
  const inFlight = useRef(false);
  const before = useRef('');
  const work = useRef<HTMLCanvasElement | null>(null);
  const mask = useRef<HTMLCanvasElement | null>(null);
  const aiAlpha = useRef<Uint8ClampedArray | null>(null);
  const afterBlob = useRef<Blob | null>(null);
  const history = useRef<Uint8ClampedArray[]>([]);
  const view = useRef<HTMLCanvasElement | null>(null);
  const scratch = useRef<HTMLCanvasElement | null>(null);
  const stroke = useRef<{ id: number; last: { x: number; y: number } } | null>(null);
  const frame = useRef(0);
  const cursor = useRef<HTMLDivElement>(null);

  useEffect(() => () => {
    if (afterUrl) URL.revokeObjectURL(afterUrl);
  }, [afterUrl]);

  // Announce each step to screen readers by moving focus to its heading.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, [phase]);

  /** Composes the standardized photo from the current mask; false when the mask is empty. */
  const recompose = useCallback(async (): Promise<boolean> => {
    if (!work.current || !mask.current) return false;
    const bounds = matteBounds(readAlpha(mask.current), mask.current.width, mask.current.height);
    const out = bounds ? compose(work.current, mask.current, bounds) : null;
    if (!out) return false;
    try {
      const blob = await canvasToBlob(out);
      afterBlob.current = blob;
      setAfterUrl(URL.createObjectURL(blob));
      return true;
    } finally {
      releaseCanvas(out);
    }
  }, []);

  /** Cut-out pipeline. Callers put the sheet in the 'loading' phase first; state changes here happen after awaits. */
  const start = useCallback(async () => {
    const token = ++run.current;
    const alive = () => run.current === token;
    inFlight.current = true;
    try {
      if (!work.current) {
        const loaded = await loadSource(source);
        if (!alive()) {
          if (typeof loaded !== 'string') releaseCanvas(loaded);
          return;
        }
        if (typeof loaded === 'string') {
          setError(SOURCE_ERRORS[loaded]);
          setPhase('error');
          return;
        }
        work.current = loaded;
        setWorkSize({ width: loaded.width, height: loaded.height });
        before.current = URL.createObjectURL(source); // the "before" image: the picked file itself
        setBeforeUrl(before.current);
      }
      const cached = (await isModelCached(DEFAULT_MODEL, 'webgpu')) || (await isModelCached(DEFAULT_MODEL, 'wasm'));
      if (!alive()) return;
      setFirstDownload(!cached);
      const engine = await getEngine((loaded, total) => {
        if (alive()) setProgress({ loaded, total });
      });
      if (!alive()) return;
      setDevice(engine.device);
      setPhase('cutting');
      const cut = await cutOut((rgba) => engine.segment(rgba), engine.model.size, work.current);
      if (!alive()) {
        releaseCanvas(cut);
        return;
      }
      setDevice(engine.device);
      releaseCanvas(mask.current);
      mask.current = cut;
      aiAlpha.current = readAlpha(cut);
      history.current = [];
      setUndoCount(0);
      setCanRetouch(true);
      if (await recompose()) setPhase('review');
      else {
        setError(EMPTY_CUT);
        setPhase('error');
      }
    } catch (err) {
      if (!alive()) return;
      console.warn('[padronizador]', err instanceof StandardizeError ? `${err.code}: ${err.detail}` : err);
      // A crashed or out-of-memory worker is not reused.
      if (!(err instanceof StandardizeError) || err.code !== 'network') releaseEngine(true);
      setError(messageFor(err));
      setPhase('error');
    } finally {
      if (alive()) {
        inFlight.current = false;
        setProgress(null);
      }
    }
  }, [source, recompose]);

  // Starts right away when the tips were already seen. On unmount: stop a download or cut still
  // running (frees the worker), let an idle engine linger briefly, and free every canvas.
  const skipTips = useRef(phase === 'loading');
  useEffect(() => {
    if (skipTips.current) void start();
    const canvases = { work, mask, view, scratch };
    const jobs = run;
    return () => {
      jobs.current++;
      if (before.current) URL.revokeObjectURL(before.current);
      before.current = '';
      cancelAnimationFrame(frame.current);
      for (const ref of Object.values(canvases)) {
        releaseCanvas(ref.current);
        ref.current = null;
      }
      aiAlpha.current = afterBlob.current = null;
      history.current = [];
      releaseEngine(inFlight.current);
      inFlight.current = false;
    };
  }, [start]);

  function restart() {
    setError('');
    setCanRetouch(false);
    setPhase('loading');
    void start();
  }

  function continueFromTips() {
    markTipsSeen();
    restart();
  }

  async function chooseStandardized() {
    const blob = afterBlob.current;
    if (!blob) return;
    const token = ++run.current;
    setError('');
    setPhase('saving');
    const result = await processImage(new File([blob], 'padronizada.png', { type: 'image/png' }));
    if (run.current !== token) return;
    if (!result.ok) {
      setError(result.message);
      setPhase('review');
      return;
    }
    onApply({ src: result.src, thumb: result.thumb });
  }

  // ----- Retouch -------------------------------------------------------------

  const draw = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      if (!view.current || !work.current || !mask.current) return;
      scratch.current ??= makeCanvas(1, 1);
      renderRetouchView(view.current, work.current, mask.current, scratch.current);
    });
  }, []);

  useEffect(() => {
    if (phase === 'retouch') draw();
  }, [phase, draw]);

  function brushDiameter(): number {
    return (brush / 100) * Math.max(workSize.width, workSize.height);
  }

  function snapshot() {
    if (!mask.current) return;
    history.current.push(readAlpha(mask.current));
    if (history.current.length > MAX_UNDO) history.current.shift();
    setUndoCount(history.current.length);
  }

  function pointFor(e: ReactPointerEvent<HTMLCanvasElement>) {
    return toCanvasPoint(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect(), workSize.width, workSize.height);
  }

  function moveCursor(e: ReactPointerEvent<HTMLCanvasElement>) {
    const el = cursor.current;
    if (!el) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const size = (brushDiameter() * rect.width) / Math.max(1, workSize.width);
    el.style.width = el.style.height = `${size}px`;
    el.style.transform = `translate(${e.clientX - rect.left - size / 2}px, ${e.clientY - rect.top - size / 2}px)`;
    el.style.opacity = '1';
  }

  function onPointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!mask.current || stroke.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    snapshot();
    const p = pointFor(e);
    stroke.current = { id: e.pointerId, last: p };
    paintStroke(mask.current, p, p, brushDiameter(), mode);
    setRetouchNote('');
    moveCursor(e);
    draw();
  }

  function onPointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    moveCursor(e);
    const s = stroke.current;
    if (!s || s.id !== e.pointerId || !mask.current) return;
    const p = pointFor(e);
    paintStroke(mask.current, s.last, p, brushDiameter(), mode);
    s.last = p;
    draw();
  }

  function endStroke(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (stroke.current?.id === e.pointerId) stroke.current = null;
  }

  function hideCursor() {
    if (cursor.current) cursor.current.style.opacity = '0';
  }

  function undo() {
    const prev = history.current.pop();
    setUndoCount(history.current.length);
    if (!prev || !mask.current) return;
    writeAlpha(mask.current, prev);
    draw();
  }

  function resetToAi() {
    if (!mask.current || !aiAlpha.current) return;
    snapshot();
    writeAlpha(mask.current, aiAlpha.current);
    draw();
  }

  async function finishRetouch() {
    try {
      if (await recompose()) {
        setError('');
        setPhase('review');
      } else setRetouchNote('Nada ficou marcado como peça. Use “Restaurar” para pintar a peça de volta.');
    } catch {
      setRetouchNote(ERROR_MESSAGES.unknown);
    }
  }

  function openRetouch() {
    if (!mask.current) return;
    setError('');
    setRetouchNote('');
    setPhase('retouch');
  }

  // ----- Render --------------------------------------------------------------

  const keepOriginal = (
    <Button variant="ghost" onClick={onClose}>
      Manter a original
    </Button>
  );
  const busy = phase === 'loading' || phase === 'cutting' || phase === 'saving';

  let footer: React.ReactNode;
  if (phase === 'tips') footer = (
    <>
      {keepOriginal}
      <Button onClick={continueFromTips}>
        <Sparkles size={18} strokeWidth={1.5} aria-hidden="true" /> Padronizar
      </Button>
    </>
  );
  else if (phase === 'review' || phase === 'saving') footer = (
    <>
      {keepOriginal}
      <Button onClick={chooseStandardized} disabled={phase === 'saving'} aria-busy={phase === 'saving'}>
        {phase === 'saving' ? 'Preparando…' : 'Usar a padronizada'}
      </Button>
    </>
  );
  else if (phase === 'retouch') footer = (
    <>
      {keepOriginal}
      <Button onClick={finishRetouch}>Ver resultado</Button>
    </>
  );
  else if (phase === 'error') footer = (
    <>
      {keepOriginal}
      {canRetouch ? (
        <Button onClick={openRetouch}>
          <Paintbrush size={18} strokeWidth={1.5} aria-hidden="true" /> Retocar à mão
        </Button>
      ) : (
        <Button onClick={restart}>Tentar de novo</Button>
      )}
    </>
  );
  else footer = keepOriginal;

  const heading = (text: string) => (
    <h3 ref={headingRef} id={headingId} tabIndex={-1} className="text-title font-medium outline-none">
      {text}
    </h3>
  );

  return (
    <Sheet
      open
      side="full"
      title="Padronizar foto"
      onClose={onClose}
      footer={<div className="mx-auto flex max-w-[720px] flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 [&>button]:w-full sm:[&>button]:w-auto">{footer}</div>}
    >
      <div className="mx-auto flex max-w-[720px] flex-col gap-4 pt-1" aria-busy={busy}>
        {phase === 'tips' && (
          <section aria-labelledby={headingId} className="flex flex-col gap-4">
            {heading('Antes de padronizar')}
            <p className="text-ink-muted">
              A gente recorta a peça, coloca no fundo da marca com uma sombra suave e deixa todas as fotos do mesmo tamanho. Fica melhor quando a foto tem:
            </p>
            <ul className="flex flex-col gap-3">
              {TIPS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-champagne text-copper">
                    <Icon size={18} strokeWidth={1.5} aria-hidden="true" />
                  </span>
                  <span className="pt-1.5">{text}</span>
                </li>
              ))}
            </ul>
            <p className="flex items-start gap-3 rounded-[12px] border border-line bg-white p-3 text-sm text-ink-muted">
              <Wifi size={18} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-copper" />
              Na primeira vez, o padronizador baixa cerca de {downloadMb(DEFAULT_MODEL, 'wasm')} MB e depois fica guardado neste aparelho. Use o Wi-Fi. O recorte é feito aqui mesmo: a foto só sai do aparelho quando você salva a peça.
            </p>
          </section>
        )}

        {phase === 'loading' && (
          <section aria-labelledby={headingId} className="flex flex-col gap-3">
            {heading(firstDownload ? 'Baixando o padronizador' : 'Preparando o padronizador')}
            {firstDownload && progress && progress.total > 0 ? (
              <>
                <progress className="h-2 w-full appearance-none overflow-hidden rounded-full bg-champagne [&::-moz-progress-bar]:bg-copper [&::-webkit-progress-bar]:bg-champagne [&::-webkit-progress-value]:bg-copper" max={progress.total} value={progress.loaded} aria-labelledby={headingId} />
                <p className="text-sm text-ink-muted" aria-live="polite">
                  {Math.round(progress.loaded / 1_000_000)} de {Math.round(progress.total / 1_000_000)} MB. Só na primeira vez; use o Wi-Fi se puder.
                </p>
              </>
            ) : (
              <p className="flex items-center gap-2 text-ink-muted" role="status">
                <Loader2 size={18} strokeWidth={1.5} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
                {firstDownload ? 'Começando o download. Use o Wi-Fi se puder.' : 'Um instante…'}
              </p>
            )}
          </section>
        )}

        {phase === 'cutting' && (
          <section aria-labelledby={headingId} className="flex flex-col gap-3">
            {heading('Recortando a peça')}
            <p className="flex items-center gap-2 text-ink-muted" role="status">
              <Loader2 size={18} strokeWidth={1.5} aria-hidden="true" className="animate-spin motion-reduce:animate-none" />
              {device === 'webgpu' ? 'Leva alguns segundos.' : 'Pode levar até meio minuto neste aparelho.'}
            </p>
          </section>
        )}

        {phase === 'error' && (
          <section aria-labelledby={headingId} className="flex flex-col gap-3">
            {heading('Não deu certo desta vez')}
            <p role="alert" className="text-danger">
              {error}
            </p>
          </section>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <section aria-labelledby={headingId} className="flex flex-col gap-4">
            {heading('Antes e depois')}
            <div className="grid grid-cols-2 gap-3">
              <figure className="flex flex-col gap-1.5">
                <div className="aspect-[4/5] overflow-hidden rounded-[10px] border border-line bg-white">
                  {beforeUrl && <img src={beforeUrl} alt="Foto original" className="h-full w-full object-contain" />}
                </div>
                <figcaption className="text-sm text-ink-muted">Antes</figcaption>
              </figure>
              <figure className="flex flex-col gap-1.5">
                <div className="aspect-[4/5] overflow-hidden rounded-[10px] border border-line bg-ivory">
                  {afterUrl && <img src={afterUrl} alt="Foto padronizada: a peça no fundo da marca" className="h-full w-full object-contain" />}
                </div>
                <figcaption className="text-sm text-ink-muted">Depois</figcaption>
              </figure>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button variant="secondary" size="sm" onClick={openRetouch} disabled={phase === 'saving'}>
                <Paintbrush size={16} strokeWidth={1.5} aria-hidden="true" /> Retocar
              </Button>
              <p className="text-sm text-ink-muted">Sobrou fundo ou faltou um pedaço da peça? Retoque com o pincel.</p>
            </div>
          </section>
        )}

        {phase === 'retouch' && (
          <section aria-labelledby={headingId} className="flex flex-col gap-3">
            {heading('Retocar o recorte')}
            <p className="text-sm text-ink-muted">A parte escurecida sai da foto. Pinte com o dedo ou o mouse: “Apagar” tira, “Restaurar” devolve.</p>
            <div className="relative mx-auto w-full max-w-[520px] touch-none overflow-hidden rounded-[10px] border border-line bg-white select-none">
              <canvas
                ref={view}
                width={workSize.width}
                height={workSize.height}
                role="img"
                aria-label="Foto para retocar; a parte escurecida é o fundo que vai sair"
                className="block h-auto max-h-[58dvh] w-full cursor-none object-contain"
                style={{ touchAction: 'none' }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={endStroke}
                onPointerCancel={endStroke}
                onPointerLeave={hideCursor}
              />
              <div
                ref={cursor}
                aria-hidden="true"
                className={cx('pointer-events-none absolute top-0 left-0 rounded-full border-2 opacity-0 shadow-[0_0_0_1px_rgb(255_255_255/0.8)]', mode === 'erase' ? 'border-ink' : 'border-copper')}
              />
            </div>
            <div className="flex flex-col gap-3">
              <fieldset className="flex flex-wrap gap-2">
                <legend className="sr-only">Pincel</legend>
                {(
                  [
                    { value: 'erase', label: 'Apagar', Icon: Eraser },
                    { value: 'restore', label: 'Restaurar', Icon: Paintbrush },
                  ] as const
                ).map(({ value, label, Icon }) => (
                  <label
                    key={value}
                    className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-4 text-sm font-medium has-[:checked]:border-copper has-[:checked]:bg-champagne has-[:checked]:text-copper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-copper"
                  >
                    <input type="radio" name="brush-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                    <Icon size={16} strokeWidth={1.5} aria-hidden="true" /> {label}
                  </label>
                ))}
              </fieldset>
              <label className="flex items-center gap-3 text-sm">
                <span className="shrink-0">Tamanho do pincel</span>
                <input
                  type="range"
                  min={BRUSH_MIN}
                  max={BRUSH_MAX}
                  step={0.5}
                  value={brush}
                  onChange={(e) => setBrush(Number(e.target.value))}
                  aria-valuetext={`${brush}% da foto`}
                  className="min-h-11 w-full accent-copper"
                />
              </label>
              <div className="flex flex-wrap gap-1">
                <Button variant="ghost" size="sm" onClick={undo} disabled={undoCount === 0}>
                  <Undo2 size={16} strokeWidth={1.5} aria-hidden="true" /> Desfazer
                </Button>
                <Button variant="ghost" size="sm" onClick={resetToAi}>
                  <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> Voltar ao recorte automático
                </Button>
              </div>
              {retouchNote && (
                <p role="alert" className="text-sm text-danger">
                  {retouchNote}
                </p>
              )}
            </div>
          </section>
        )}
      </div>
    </Sheet>
  );
}
