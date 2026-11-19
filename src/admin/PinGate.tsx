import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Delete } from 'lucide-react';
import { cx } from '../components/ui/cx';
import { asset } from '../lib/assets';
import { DEFAULT_PIN_HASH } from '../lib/hash';
import { verifyPin } from './lib/session';

const MIN = 4;
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keyClass =
  'flex min-h-14 items-center justify-center rounded-[12px] bg-champagne/70 font-display text-[1.75rem] text-ink lining-nums transition-colors duration-[160ms] hover:bg-champagne active:bg-line disabled:opacity-50';

interface PinGateProps {
  pinHash: string;
  onUnlock: () => void;
}

/**
 * PIN keypad. The default PIN has 4 digits and is checked as soon as it is
 * complete; a custom PIN can have 4–6 digits, so each length from 4 is tried
 * silently and a wrong PIN is reported at 6 digits or on "Entrar".
 */
export function PinGate({ pinHash, onUnlock }: PinGateProps) {
  const maxLength = pinHash === DEFAULT_PIN_HASH ? MIN : 6;
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const attempt = useRef(0);
  const boxesRef = useRef<HTMLDivElement>(null);

  function shake() {
    const el = boxesRef.current;
    if (!el?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }],
      { duration: 360, easing: 'ease-out' },
    );
  }

  async function check(candidate: string, explicit: boolean) {
    const id = ++attempt.current;
    const ok = await verifyPin(candidate, pinHash);
    if (ok) return onUnlock();
    if (id !== attempt.current) return; // a newer digit superseded this check
    if (explicit || candidate.length >= maxLength) {
      setError(true);
      setPin('');
      shake();
    }
  }

  function press(digit: string) {
    if (pin.length >= maxLength) return;
    const next = pin + digit;
    setPin(next);
    setError(false);
    if (next.length >= MIN) void check(next, false);
  }

  function erase() {
    attempt.current++;
    setPin((p) => p.slice(0, -1));
  }

  function submit() {
    if (pin.length >= MIN) void check(pin, true);
  }

  // Physical keyboard: digits, Backspace and Enter.
  const handlers = useRef({ press, erase, submit });
  useLayoutEffect(() => {
    handlers.current = { press, erase, submit };
  });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^\d$/.test(e.key)) handlers.current.press(e.key);
      else if (e.key === 'Backspace') handlers.current.erase();
      else if (e.key === 'Enter') handlers.current.submit();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const boxes = maxLength === MIN ? MIN : Math.min(maxLength, Math.max(MIN, pin.length + 1));

  return (
    <main className="flex min-h-dvh flex-col items-center px-5 pt-[max(32px,env(safe-area-inset-top))] pb-[calc(24px+var(--safe-bottom))]">
      <div className="flex w-full max-w-[360px] flex-1 flex-col items-center">
        <img src={asset('brand/eka-emblem-rosegold-240.webp')} alt="" width={120} height={120} className="mt-4 size-[120px]" />
        <h1 className="mt-5 text-center font-display text-display-l">Painel ÉKA</h1>
        <span aria-hidden="true" className="mt-3 h-px w-12 bg-rose" />
        <p className="mt-4 text-center text-ink-muted">Digite seu PIN para entrar</p>

        <div ref={boxesRef} aria-hidden="true" className="mt-6 flex gap-3">
          {Array.from({ length: boxes }, (_, i) => (
            <span
              key={i}
              className={cx(
                'flex size-14 items-center justify-center rounded-[12px] border bg-white transition-colors duration-[160ms]',
                error ? 'border-danger' : i === pin.length ? 'border-copper' : 'border-line',
              )}
            >
              {i < pin.length && <span className="size-3 rounded-full bg-ink" />}
            </span>
          ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {pin.length ? `${pin.length} ${pin.length === 1 ? 'dígito digitado' : 'dígitos digitados'}` : ''}
        </p>
        <p role="alert" className="mt-3 min-h-6 text-center text-sm text-danger">
          {error ? 'PIN incorreto. Tente de novo.' : ''}
        </p>

        <div role="group" aria-label="Teclado do PIN" className="mt-4 grid w-full grid-cols-3 gap-2.5">
          {KEYS.map((k) => (
            <button key={k} type="button" className={keyClass} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          {maxLength > MIN ? (
            <button type="button" className={keyClass} disabled={pin.length < MIN} onClick={submit} aria-label="Entrar">
              <ArrowRight size={24} strokeWidth={1.5} />
            </button>
          ) : (
            <span />
          )}
          <button type="button" className={keyClass} onClick={() => press('0')}>
            0
          </button>
          <button type="button" className={keyClass} onClick={erase} disabled={!pin.length} aria-label="Apagar dígito">
            <Delete size={24} strokeWidth={1.5} />
          </button>
        </div>

        <Link to="/" className="link-underline mt-auto inline-flex min-h-11 items-center gap-1.5 pt-8 text-sm text-ink-muted hover:text-copper">
          <ArrowLeft size={16} strokeWidth={1.5} /> Voltar ao site
        </Link>
      </div>
    </main>
  );
}
