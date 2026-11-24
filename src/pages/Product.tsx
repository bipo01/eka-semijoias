import { useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, ShoppingBag } from 'lucide-react';
import { TrustList, useTrustItems } from '../components/home/TrustStrip';
import { FavoriteButton } from '../components/product/FavoriteButton';
import { Gallery } from '../components/product/Gallery';
import { ProductCard } from '../components/product/ProductCard';
import { useAddToBag } from '../components/product/useAddToBag';
import { AccordionItem } from '../components/ui/Accordion';
import { Button, ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { FINISH_SWATCH, Price, Stepper } from '../components/ui/Misc';
import { cx } from '../components/ui/cx';
import { byOrder, defaultVariant, effectivePrice, galleryFor, isPurchasable, sizeFieldLabel } from '../data/catalog';
import { isLowStock, stockOf, variantInStock } from '../data/stock';
import { FINISH_LABEL, type Product, type StockMap } from '../data/schema';
import { useBusiness, warrantyLabel } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { formatBRL } from '../lib/format';
import { whatsappUrl } from '../lib/whatsapp';
import { useMessages } from '../hooks/useMessages';
import { useSection } from '../hooks/useSection';
import { cartKey, MAX_QTY, useCart } from '../store/cart';
import { useCatalog } from '../store/catalog';
import { useUi } from '../store/ui';
import { NotFoundPage } from './NotFound';

const DETAIL_LABELS: [keyof Product['details'], string][] = [
  ['material', 'Material'],
  ['plating', 'Banho'],
  ['stones', 'Pedras'],
  ['dimensions', 'Medidas'],
  ['clasp', 'Fecho'],
  ['weight', 'Peso'],
];

export function ProductPage() {
  const { slug } = useParams();
  const product = useCatalog((s) => s.data.products.find((p) => p.slug === slug));
  const { notFoundTitle } = useSection('geral');
  useDocumentTitle(product?.name ?? notFoundTitle);
  if (!product) return <NotFoundPage />;
  return <ProductView key={product.id} product={product} />;
}

function ProductView({ product }: { product: Product }) {
  const data = useCatalog((s) => s.data);
  const biz = useBusiness();
  const message = useMessages();
  const productLink = `${window.location.origin}/produto/${product.slug}`;
  const addToBag = useAddToBag();
  const openPanel = useUi((s) => s.openPanel);
  const cartItems = useCart((s) => s.items);
  const stock = data.stock;
  const [params, setParams] = useSearchParams();
  const variant = product.variants.find((v) => v.finish === params.get('acabamento')) ?? defaultVariant(product, stock);
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [qtyChoice, setQty] = useState(1);
  const trust = useTrustItems('product');
  const { productTips } = useSection('cuidados');
  const { productText: warrantyText } = useSection('garantia');

  const gallery = galleryFor(product, variant);
  const category = data.categories.find((c) => c.id === product.categoryId);
  const purchasable = isPurchasable(product, stock) && variantInStock(stock, product, variant);
  const sizes = variant.sizes ?? [];
  const sizeName = sizes.length ? sizeFieldLabel(sizes) : '';
  const sizeUnits = (s: string) => stockOf(stock, product.id, variant.id, s);
  const validSize = size && sizes.includes(size) && sizeUnits(size) !== 0 ? size : null;
  // Units of the chosen combination (null: no stock control, or a size still to be chosen).
  const units = sizes.length ? (validSize ? sizeUnits(validSize) : null) : stockOf(stock, product.id, variant.id);
  const inBag = cartItems.find((i) => cartKey(i) === cartKey({ productId: product.id, variantId: variant.id, ...(validSize ? { size: validSize } : {}) }))?.qty ?? 0;
  const maxQty = units === null ? MAX_QTY : Math.max(0, Math.min(MAX_QTY, units - inBag));
  const qty = Math.max(1, Math.min(qtyChoice, maxQty || 1));
  const allInBag = units !== null && units > 0 && maxQty === 0;
  const lowStock = isLowStock(units, data.settings.lowStockThreshold);

  const related = useMemo(() => completeTheLook(product, data.products, stock), [product, data.products, stock]);

  const selectFinish = (finish: string) => {
    const next = new URLSearchParams(params);
    next.set('acabamento', finish);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  const requireSize = (): boolean => {
    if (sizes.length && !validSize) {
      setSizeError(true);
      document.getElementById('size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return false;
    }
    return true;
  };

  const add = (opts: { quiet?: boolean } = {}): boolean => {
    if (!requireSize()) return false;
    if (allInBag) {
      openPanel('bag');
      return false;
    }
    addToBag(product, variant, { qty, ...(validSize ? { size: validSize } : {}), ...(opts.quiet ? { quiet: true } : {}) });
    return true;
  };

  /** "Pedir agora": the piece goes to the bag and the bag opens to finish the order (every order is registered). */
  const orderNow = () => {
    if (add({ quiet: true })) openPanel('bag');
  };
  const notifyHref = whatsappUrl(biz.whatsapp, message('aviseme', { peca: `${product.name} (${FINISH_LABEL[variant.finish]})`, link_peca: productLink }));

  const details = DETAIL_LABELS.filter(([k]) => product.details[k]);

  const buyButtons = (inBar: boolean) =>
    purchasable ? (
      <>
        <Button size={inBar ? 'md' : 'lg'} onClick={() => add()} className={cx('flex-1 whitespace-nowrap', inBar && 'min-w-0 !gap-1.5 !px-3 text-[0.9375rem]')}>
          <ShoppingBag size={19} strokeWidth={1.5} aria-hidden="true" className={cx(inBar && 'max-[379px]:hidden')} /> Adicionar à sacola
        </Button>
        <Button
          variant="secondary"
          size={inBar ? 'md' : 'lg'}
          aria-label="Pedir agora"
          title="Pedir agora"
          className={inBar ? 'w-12 shrink-0 !px-0' : ''}
          onClick={orderNow}
        >
          <WhatsAppIcon size={22} />
          {!inBar && 'Pedir agora'}
        </Button>
      </>
    ) : (
      <ButtonAnchor href={notifyHref} size={inBar ? 'md' : 'lg'} variant="secondary" className="flex-1">
        <WhatsAppIcon size={20} /> Avise-me quando voltar
      </ButtonAnchor>
    );

  return (
    <div className="pb-[calc(96px+var(--safe-bottom))] lg:pb-20">
      <nav aria-label="Você está em" className="container-x hidden pt-6 text-sm text-ink-muted lg:block">
        <ol className="flex items-center gap-1.5">
          <li><Link to="/catalogo" className="hover:text-copper">Catálogo</Link></li>
          {category && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <li><Link to={`/catalogo/${category.slug}`} className="hover:text-copper">{category.name}</Link></li>
            </>
          )}
          <ChevronRight size={14} aria-hidden="true" />
          <li aria-current="page" className="text-ink">{product.name}</li>
        </ol>
      </nav>

      <div className="container-x pt-4 lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-14 lg:pt-6">
        <div className="lg:sticky lg:top-[calc(var(--header-h)+24px)] lg:self-start">
          <Gallery images={gallery.images} name={product.name} caption={gallery.caption} />
        </div>

        <div className="mt-5 lg:mt-0">
          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-display-m lg:text-display-l">{product.name}</h1>
            <FavoriteButton productId={product.id} name={product.name} className="-mt-1 -mr-2 shrink-0" />
          </div>
          <Price price={product.price} promoPrice={product.promoPrice} size="lg" className="mt-2" />
          {!purchasable && <p className="mt-2 inline-flex rounded-full bg-champagne px-3 py-1 text-sm">Esgotado</p>}

          <fieldset className="mt-6 border-t border-line pt-5">
            <legend className="sr-only">Acabamento</legend>
            <p aria-hidden="true" className="mb-3 font-medium">
              Acabamento: <span className="font-normal text-ink-muted">{FINISH_LABEL[variant.finish]}</span>
            </p>
            <div role="radiogroup" aria-label="Acabamento" className="flex flex-wrap gap-4">
              {product.variants.map((v) => {
                const checked = v.id === variant.id;
                const inStock = variantInStock(stock, product, v);
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    aria-label={`${FINISH_LABEL[v.finish]}${inStock ? '' : ' (esgotado)'}`}
                    onClick={() => selectFinish(v.finish)}
                    className="group flex min-w-16 flex-col items-center gap-1.5"
                  >
                    <span className={cx('inline-flex size-12 items-center justify-center rounded-full transition-shadow', checked ? 'ring-1 ring-copper ring-offset-2 ring-offset-ivory' : 'group-hover:ring-1 group-hover:ring-line')}>
                      <span className={cx('size-10 rounded-full ring-1 ring-black/10', !inStock && 'opacity-40')} style={{ background: FINISH_SWATCH[v.finish] }} />
                    </span>
                    <span className={cx('text-sm', checked ? 'font-medium text-copper' : 'text-ink-muted', !inStock && 'line-through')}>{FINISH_LABEL[v.finish]}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {sizes.length > 0 && (
            <fieldset id="size-picker" className="mt-6">
              <legend className="mb-3 font-medium">
                {sizeName}
                {validSize && <span className="font-normal text-ink-muted">: {validSize}</span>}
              </legend>
              <div role="radiogroup" aria-label={sizeName} aria-describedby={sizeError ? 'size-error' : undefined} className="flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const soldOut = sizeUnits(s) === 0;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={validSize === s}
                      aria-disabled={soldOut || undefined}
                      aria-label={soldOut ? `${s} (esgotado)` : undefined}
                      onClick={() => {
                        if (soldOut) return;
                        setSize(s);
                        setSizeError(false);
                      }}
                      className={cx(
                        'price inline-flex size-11 items-center justify-center rounded-full border text-sm',
                        soldOut
                          ? 'cursor-not-allowed border-line bg-transparent text-ink-muted line-through decoration-ink-muted/70'
                          : validSize === s
                            ? 'border-copper bg-copper text-white'
                            : 'border-line bg-white hover:border-copper',
                      )}
                    >
                      {s}
                    </button>
                  );
                })}
              </div>
              {sizeError && (
                <p id="size-error" role="alert" className="mt-2 text-sm text-danger">
                  Escolha {sizeName === 'Aro' ? 'o aro' : 'o tamanho'} para continuar.
                </p>
              )}
            </fieldset>
          )}

          {purchasable && lowStock && (
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-copper">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-copper" /> Últimas unidades
            </p>
          )}
          {purchasable && allInBag && (
            <p className="mt-4 text-sm text-ink-muted">Você já colocou na sacola todas as unidades disponíveis.</p>
          )}

          {purchasable && (
            <div className="mt-6 flex items-center gap-4">
              <span className="font-medium" id="qty-label">Quantidade</span>
              <Stepper value={qty} onChange={setQty} max={Math.max(1, maxQty)} label="Quantidade" />
              {qty > 1 && (
                <p className="hidden text-ink-muted lg:block">
                  Total <span className="price text-lg text-ink">{formatBRL(effectivePrice(product) * qty)}</span>
                </p>
              )}
            </div>
          )}

          <div className="mt-6 hidden gap-3 lg:flex">{buyButtons(false)}</div>

          {product.description && <p className="mt-6 border-t border-line pt-5 whitespace-pre-line text-ink">{product.description}</p>}

          <div className="mt-6 flex flex-col gap-2">
            {details.length > 0 && (
              <AccordionItem title="Detalhes da peça" defaultOpen>
                <dl className="divide-y divide-line">
                  {details.map(([k, label]) => (
                    <div key={k} className="grid grid-cols-[96px_1fr] gap-3 py-2 text-sm">
                      <dt className="font-medium text-ink">{label}</dt>
                      <dd className="text-ink">{product.details[k]}</dd>
                    </div>
                  ))}
                </dl>
              </AccordionItem>
            )}
            <AccordionItem title="Cuidados">
              {productTips.length > 0 && (
                <ul className="list-disc space-y-1 pl-5 text-sm">
                  {productTips.map((tip) => (
                    <li key={tip.id} className="[overflow-wrap:anywhere]">{tip.text}</li>
                  ))}
                </ul>
              )}
              <Link to="/como-cuidar" className="mt-2 inline-flex min-h-11 items-center text-sm text-copper underline underline-offset-4">Ver todos os cuidados</Link>
            </AccordionItem>
            {biz.warrantyMonths && (
              <AccordionItem title={warrantyLabel(biz.warrantyMonths)}>
                {warrantyText && <p className="text-sm whitespace-pre-line [overflow-wrap:anywhere]">{warrantyText}</p>}
                <Link to="/garantia" className="mt-2 inline-flex min-h-11 items-center text-sm text-copper underline underline-offset-4">Garantia e trocas</Link>
              </AccordionItem>
            )}
          </div>

          <TrustList items={trust} compact className="mt-6 border-y border-line py-5" />

          <div className="mt-6 flex items-center justify-between gap-4 rounded-[12px] bg-champagne p-4">
            <p className="font-display text-title leading-snug">Ficou com alguma dúvida?</p>
            <ButtonAnchor href={whatsappUrl(biz.whatsapp, message('duvida', { peca: product.name, link_peca: productLink }))} variant="secondary" size="sm" className="shrink-0 bg-ivory/60">
              <WhatsAppIcon size={18} /> Fale com a gente
            </ButtonAnchor>
          </div>

          {variant.sku && <p className="mt-4 text-micro tracking-[0.04em] text-ink-muted">Ref. {variant.sku}</p>}
        </div>
      </div>

      {related.length > 0 && (
        <section aria-labelledby="complete-look" className="mt-14 lg:mt-20">
          <div className="container-x">
            <h2 id="complete-look" className="mb-4 font-display text-display-m md:text-display-l">Complete o look</h2>
          </div>
          <ul className="no-scrollbar flex snap-x snap-mandatory scroll-px-[var(--gutter)] gap-3 overflow-x-auto px-[var(--gutter)] lg:container-x lg:grid lg:grid-cols-4 lg:gap-5">
            {related.map((p) => (
              <li key={p.id} className="w-[40%] shrink-0 snap-start sm:w-[30%] lg:w-auto">
                <ProductCard product={p} compact sizes="(min-width: 1024px) 280px, 40vw" />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* One-row sticky bar (mobile/tablet): price · add to bag · WhatsApp */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ivory/95 pb-[var(--safe-bottom)] shadow-[var(--shadow-1)] backdrop-blur lg:hidden">
        <div className="container-x flex h-16 items-center gap-3">
          <div className="min-w-0 shrink-0">
            {qty > 1 ? (
              <span className="price block text-xs leading-none text-ink-muted">
                {qty} × {formatBRL(effectivePrice(product))}
              </span>
            ) : (
              product.promoPrice != null && <s className="price block text-xs leading-none text-ink-muted">{formatBRL(product.price)}</s>
            )}
            <span className={cx('price block text-lg leading-tight', product.promoPrice != null && 'text-copper')}>
              {qty > 1 && <span className="sr-only">Total: </span>}
              {formatBRL(effectivePrice(product) * qty)}
            </span>
          </div>
          <div className="flex flex-1 items-center gap-2">{buyButtons(true)}</div>
        </div>
      </div>
    </div>
  );
}

/** Same collection first, then other categories, never the product itself; purchasable only. */
function completeTheLook(product: Product, all: Product[], stock: StockMap | undefined): Product[] {
  const pool = all.filter((p) => p.id !== product.id && isPurchasable(p, stock));
  const sameCollection = pool.filter((p) => p.collectionIds.some((c) => product.collectionIds.includes(c)) && p.categoryId !== product.categoryId);
  const otherCategory = pool.filter((p) => p.categoryId !== product.categoryId && !sameCollection.includes(p));
  const seenNames = new Set<string>();
  const picked: Product[] = [];
  for (const p of [...sameCollection.sort(byOrder), ...otherCategory.sort(byOrder)]) {
    if (seenNames.has(p.categoryId)) continue; // one per category reads as a look
    seenNames.add(p.categoryId);
    picked.push(p);
    if (picked.length === 4) break;
  }
  return picked;
}
