import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Delete } from 'lucide-react';
import { cx } from '../components/ui/cx';
import { ApiError, errorMessage } from '../lib/api';
import { asset } from '../lib/assets';
import { login } from './lib/session';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const keyClass =
  'flex min-h-14 items-center justify-center rounded-[12px] bg-champagne/70 font-display text-[1.75rem] text-ink lining-nums transition-colors duration-[160ms] hover:bg-champagne active:bg-line disabled:opacity-50';

interface PinGateProps {
  /** Digits of the current PIN (from the server), so the keypad submits as soon as it is complete. */
  pinLength: number;
  onUnlock: (pinLength: number) => void;
  /** Shown inside a dialog over the panel (session expired mid-edit): no page landmark, a different hint. */
  embedded?: boolean;
}

function failureMessage(error: unknown): string {
  if (error instanceof ApiError && error.code === 'invalid_pin') {
    const left = (error.details as { attemptsLeft?: number } | undefined)?.attemptsLeft;
    if (left === 0) return error.message;
    return left != null && left <= 2 ? `PIN incorreto. ${left === 1 ? 'Resta 1 tentativa' : `Restam ${left} tentativas`} antes de uma pausa.` : 'PIN incorreto. Tente de novo.';
  }
  return errorMessage(error);
}

/** PIN keypad. The PIN is checked by the server once all its digits are typed. */
export function PinGate({ pinLength, onUnlock, embedded = false }: PinGateProps) {
  const maxLength = pinLength;
  const [pin, setPinState] = useState('');
  // Fast taps can land before React re-renders: the ref always holds what was typed, so no digit is
  // lost (two quick taps once kept only one, and the PIN came out short).
  const typed = useRef('');
  const setPin = (value: string) => {
    typed.current = value;
    setPinState(value);
  };
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const boxesRef = useRef<HTMLDivElement>(null);

  function shake() {
    const el = boxesRef.current;
    if (!el?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    el.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-8px)' }, { transform: 'translateX(8px)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(0)' }],
      { duration: 360, easing: 'ease-out' },
    );
  }

  async function check(candidate: string) {
    setChecking(true);
    try {
      const status = await login(candidate);
      onUnlock(status.pinLength);
    } catch (e) {
      setChecking(false);
      setError(failureMessage(e));
      setPin('');
      shake();
    }
  }

  function press(digit: string) {
    const current = typed.current;
    if (checking || current.length >= maxLength) return;
    const next = current + digit;
    setPin(next);
    setError(null);
    if (next.length === maxLength) void check(next);
  }

  function erase() {
    if (checking) return;
    setPin(typed.current.slice(0, -1));
  }

  function submit() {
    if (!checking && pin.length === maxLength) void check(pin);
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

  const boxes = maxLength;
  const Root = embedded ? 'div' : 'main';

  return (
    <Root className={cx('flex flex-col items-center px-5', embedded ? 'py-4' : 'min-h-dvh pt-[max(32px,env(safe-area-inset-top))] pb-[calc(24px+var(--safe-bottom))]')}>
      <div className="flex w-full max-w-[360px] flex-1 flex-col items-center">
        <img src={asset('brand/eka-emblem-rosegold-240.webp')} alt="" width={120} height={120} className="mt-4 size-[120px]" />
        <h1 className="mt-5 text-center font-display text-display-l">Painel ÉKA</h1>
        <span aria-hidden="true" className="mt-3 h-px w-12 bg-rose" />
        <p className="mt-4 text-center text-ink-muted">{embedded ? 'Sua sessão terminou. Digite o PIN para continuar de onde parou.' : 'Digite seu PIN para entrar'}</p>

        <div ref={boxesRef} aria-hidden="true" className="mt-6 flex w-full justify-center gap-2">
          {Array.from({ length: boxes }, (_, i) => (
            <span
              key={i}
              className={cx(
                'flex aspect-square max-w-14 min-w-0 flex-1 items-center justify-center rounded-[12px] border bg-white transition-colors duration-[160ms]',
                error ? 'border-danger' : checking ? 'border-line opacity-60' : i === pin.length ? 'border-copper' : 'border-line',
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
          {error ?? ''}
        </p>
        <p className="sr-only" aria-live="polite">
          {checking ? 'Verificando o PIN' : ''}
        </p>

        <div role="group" aria-label="Teclado do PIN" className="mt-4 grid w-full grid-cols-3 gap-2.5">
          {KEYS.map((k) => (
            <button key={k} type="button" className={keyClass} disabled={checking} onClick={() => press(k)}>
              {k}
            </button>
          ))}
          <span />
          <button type="button" className={keyClass} disabled={checking} onClick={() => press('0')}>
            0
          </button>
          <button type="button" className={keyClass} onClick={erase} disabled={checking || !pin.length} aria-label="Apagar dígito">
            <Delete size={24} strokeWidth={1.5} />
          </button>
        </div>

        {!embedded && (
          <Link to="/" className="link-underline mt-auto inline-flex min-h-11 items-center gap-1.5 pt-8 text-sm text-ink-muted hover:text-copper">
          <ArrowLeft size={16} strokeWidth={1.5} /> Voltar ao site
        </Link>
        )}
      </div>
    </Root>
  );
}
