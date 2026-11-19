import { asset } from '../../lib/assets';
import { cx } from '../ui/cx';

export function Lockup({ className, tone = 'copper' }: { className?: string; tone?: 'copper' | 'white' }) {
  return (
    <img
      src={asset(`brand/eka-lockup-${tone}.svg`)}
      alt="ÉKA Semijoias"
      width={108}
      height={36}
      className={cx('h-9 w-auto lg:h-11', className)}
      decoding="async"
    />
  );
}
