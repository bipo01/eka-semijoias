import { Minus, Plus } from 'lucide-react';
import { cx } from '../components/ui/cx';
import { countInput } from '../lib/countInput';

/*
 * − [ n ] + : a whole count. Typing never leaves a leading zero ("025"), an emptied field returns
 * to `min` when it loses focus, and the buttons rest at `min`/`max`. A typed number above `max` is
 * kept, so the form can say why it is too much ("Só há 3 em estoque").
 */
export function QuantityStepper({
  id,
  value,
  onChange,
  min,
  max,
  name,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min: number;
  max: number;
  /** Completes the buttons' names: "Diminuir <name>", "Aumentar <name>". */
  name: string;
  className?: string;
}) {
  const n = Number(value) || 0;
  const step = (delta: number) => onChange(String(Math.max(min, Math.min(max, n + delta))));
  const button = 'inline-flex size-10 items-center justify-center rounded-full transition-colors duration-[160ms] hover:bg-champagne disabled:pointer-events-none disabled:opacity-35';
  return (
    // Typing focus lights the whole pill (copper edge, soft halo) instead of a box around the number.
    <div
      className={cx(
        'inline-flex h-11 items-center rounded-full border border-line bg-white transition-[border-color,box-shadow] duration-[160ms]',
        'has-[input:focus]:border-copper has-[input:focus]:shadow-[0_0_0_3px_rgb(138_90_69/0.14)]',
        className,
      )}
    >
      <button type="button" aria-label={`Diminuir ${name}`} className={button} disabled={n <= min} onClick={() => step(-1)}>
        <Minus size={16} strokeWidth={1.5} />
      </button>
      <input
        id={id}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(countInput(e.target.value, { allowZero: min <= 0 }))}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => value === '' && onChange(String(min))}
        className="price w-14 bg-transparent text-center text-base caret-copper focus:outline-none focus-visible:shadow-none"
      />
      <button type="button" aria-label={`Aumentar ${name}`} className={button} disabled={n >= max} onClick={() => step(1)}>
        <Plus size={16} strokeWidth={1.5} />
      </button>
    </div>
  );
}
