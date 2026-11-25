import { Fragment } from 'react';
import { useCatalog } from '../../store/catalog';

export function AnnouncementBar() {
  const text = useCatalog((s) => s.data.settings.announcement.trim());
  if (!text) return null;
  // Each "·" part stays whole: on a narrow phone the bar wraps between the parts
  // ("Pedidos pelo WhatsApp ·" / "Envio para todo o Brasil"), never inside one.
  const parts = text.split(/\s+·\s+/);
  return (
    <div className="bg-champagne text-ink">
      <p className="container-x py-2 text-center text-[0.8125rem] leading-snug tracking-[0.01em] text-balance">
        {parts.map((part, i) => (
          <Fragment key={i}>
            {i > 0 && ' '}
            <span className="inline-block">{i < parts.length - 1 ? `${part}\u00a0·` : part}</span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}
