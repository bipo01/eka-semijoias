import { useState, type ImgHTMLAttributes } from 'react';
import { Monogram } from './Icons';
import { cx } from './cx';

interface ImgProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> {
  src: string;
  srcSet?: string | undefined;
  alt: string;
  /** CSS aspect ratio of the frame, e.g. "4 / 5". */
  ratio?: string;
  frameClassName?: string;
  priority?: boolean;
}

/**
 * Image in a fixed-ratio frame (no layout shift), fading in on load, with a
 * champagne monogram tile when the file fails to load.
 */
export function Img({ src, srcSet, alt, ratio = '4 / 5', frameClassName, className, priority, width = 480, height = 600, ...props }: ImgProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  return (
    <div className={cx('relative overflow-hidden bg-champagne', frameClassName)} style={{ aspectRatio: ratio }}>
      {state === 'error' ? (
        <div role="img" aria-label={alt} className="absolute inset-0 flex items-center justify-center text-rose">
          <Monogram className="size-12 opacity-70" />
        </div>
      ) : (
        <img
          src={src}
          srcSet={srcSet}
          alt={alt}
          width={width}
          height={height}
          loading={priority ? 'eager' : 'lazy'}
          decoding={priority ? 'sync' : 'async'}
          {...(priority ? { fetchPriority: 'high' as const } : {})}
          data-loaded={state === 'loaded' || priority ? 'true' : 'false'}
          ref={(el) => {
            if (el?.complete && el.naturalWidth > 0 && state === 'loading') setState('loaded');
          }}
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={cx('img-fade absolute inset-0 h-full w-full object-cover', className)}
          {...props}
        />
      )}
    </div>
  );
}
