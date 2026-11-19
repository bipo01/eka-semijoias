import { Heart, Menu, Search, ShoppingBag } from 'lucide-react';
import { Link, NavLink } from 'react-router-dom';
import { cartCount, useCart } from '../../store/cart';
import { useCatalog } from '../../store/catalog';
import { useUi } from '../../store/ui';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/cx';
import { AnnouncementBar } from './AnnouncementBar';
import { Lockup } from './Logo';
import { MAIN_NAV } from './nav';

function BagButton() {
  const count = useCart((s) => cartCount(s.items));
  const openPanel = useUi((s) => s.openPanel);
  return (
    <IconButton label={count ? `Sacola, ${count} ${count === 1 ? 'item' : 'itens'}` : 'Sacola vazia'} onClick={() => openPanel('bag')} className="relative">
      <ShoppingBag size={22} strokeWidth={1.5} />
      {count > 0 && (
        <span aria-hidden="true" className="price absolute top-1 right-0.5 flex min-w-[18px] items-center justify-center rounded-full bg-copper px-1 text-[11px] leading-[18px] text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </IconButton>
  );
}

export function Header() {
  const openPanel = useUi((s) => s.openPanel);
  const collectionSlug = useCatalog((s) => (s.data.collections.find((c) => c.featuredOnHome) ?? s.data.collections[0])?.slug);
  const nav = MAIN_NAV.filter((item) => item.to !== '/colecao' || collectionSlug).map((item) =>
    item.to === '/colecao' ? { ...item, to: `/colecao/${collectionSlug}` } : item,
  );
  return (
    <>
    <AnnouncementBar />
    <header className="sticky top-0 z-40 bg-ivory/95 backdrop-blur supports-[backdrop-filter]:bg-ivory/85">
      <div className="border-b border-line">
        <div className="container-x relative flex h-[var(--header-h)] items-center justify-between gap-2">
          {/* Mobile: menu · centered logo · search + bag */}
          <div className="flex items-center lg:hidden">
            <IconButton label="Abrir menu" onClick={() => openPanel('menu')} className="-ml-2.5">
              <Menu size={24} strokeWidth={1.5} />
            </IconButton>
          </div>
          <Link to="/" aria-label="ÉKA Semijoias, página inicial" className="absolute left-1/2 -translate-x-1/2 rounded-md lg:static lg:translate-x-0">
            <Lockup />
          </Link>
          <nav aria-label="Principal" className="hidden lg:block">
            <ul className="flex items-center gap-8">
              {nav.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    className={({ isActive }) =>
                      cx(
                        'relative inline-flex min-h-11 items-center text-[0.9375rem] text-ink transition-colors hover:text-copper',
                        'after:absolute after:inset-x-0 after:bottom-2 after:h-px after:origin-left after:bg-rose after:transition-transform after:duration-[240ms]',
                        isActive ? 'after:scale-x-100' : 'after:scale-x-0 hover:after:scale-x-100',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>
          <div className="-mr-2.5 flex items-center lg:gap-1">
            <IconButton label="Buscar peças" onClick={() => openPanel('search')}>
              <Search size={22} strokeWidth={1.5} />
            </IconButton>
            <Link to="/favoritos" aria-label="Favoritos" title="Favoritos" className="hidden size-11 items-center justify-center rounded-full hover:bg-champagne lg:inline-flex">
              <Heart size={22} strokeWidth={1.5} />
            </Link>
            <BagButton />
          </div>
        </div>
      </div>
    </header>
    </>
  );
}
