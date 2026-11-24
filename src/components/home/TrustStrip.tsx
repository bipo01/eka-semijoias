import { CreditCard, Leaf, ShieldCheck, Truck } from 'lucide-react';
import type { ReactNode } from 'react';
import { useBusiness, warrantyLabel } from '../../hooks/useBusiness';
import { WhatsAppIcon } from '../ui/Icons';
import { cx } from '../ui/cx';

export interface TrustItem {
  icon: ReactNode;
  label: string;
}

export function useTrustItems(context: 'home' | 'product'): TrustItem[] {
  const biz = useBusiness();
  // What the owner confirmed comes first; the WhatsApp line only fills a free slot (at most 4 items).
  const items: TrustItem[] = [];
  if (biz.warrantyMonths) items.push({ icon: <ShieldCheck size={26} strokeWidth={1.25} />, label: warrantyLabel(biz.warrantyMonths) });
  if (biz.shipsNationwide) items.push({ icon: <Truck size={26} strokeWidth={1.25} />, label: 'Envio para todo o Brasil' });
  if (biz.hypoallergenic) items.push({ icon: <Leaf size={26} strokeWidth={1.25} />, label: 'Peças antialérgicas' });
  if (biz.installments) items.push({ icon: <CreditCard size={26} strokeWidth={1.25} />, label: `Parcelamento em até ${biz.installments}x` });
  if (context === 'home' && items.length < 4) items.splice(biz.warrantyMonths ? 1 : 0, 0, { icon: <WhatsAppIcon size={26} strokeWidth={1.25} />, label: 'Pedido pelo WhatsApp' });
  if (context === 'product' && items.length < 3) items.push({ icon: <WhatsAppIcon size={26} strokeWidth={1.25} />, label: 'Atendimento pelo WhatsApp' });
  return items.slice(0, 4);
}

export function TrustList({ items, className, compact }: { items: TrustItem[]; className?: string; compact?: boolean }) {
  if (!items.length) return null;
  return (
    <ul className={cx('grid divide-x divide-line', className)} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((item) => (
        <li key={item.label} className={cx('flex flex-col items-center gap-2 px-2 text-center text-ink lg:flex-row lg:justify-center lg:gap-3 lg:text-left', compact ? 'text-[0.8125rem] leading-tight' : 'text-sm leading-tight lg:text-[0.9375rem]')}>
          <span className="text-copper" aria-hidden="true">{item.icon}</span>
          <span className="max-w-[9rem] lg:max-w-none">{item.label}</span>
        </li>
      ))}
    </ul>
  );
}

export function TrustStrip() {
  const items = useTrustItems('home');
  return (
    <section aria-label="Por que comprar com a gente" className="bg-champagne/60 lg:bg-champagne">
      <div className="container-x py-5 lg:py-6">
        <TrustList items={items} />
      </div>
    </section>
  );
}
