import { asset } from '../../lib/assets';
import { cx } from '../ui/cx';

export function Lockup({ className, tone = 'copper' }: { className?: string; tone?: 'copper' | 'white' }) {
  return (
    <img
      src={asset(`brand/eka-lockup-${tone}.svg`)}
      alt="ÉKA Semijoias"
      width={84}
      height={28}
      className={cx('h-7 w-auto lg:h-9', className)}
      decoding="async"
    />
  );
}
