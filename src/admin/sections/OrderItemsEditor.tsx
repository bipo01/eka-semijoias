import { useMemo, useRef, useState } from 'react';
import { Plus, Search, X } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/Button';
import { Img } from '../../components/ui/Img';
import { Chip, Stepper, SwatchDot } from '../../components/ui/Misc';
import { cx } from '../../components/ui/cx';
import { byOrder, effectivePrice, sizeFieldLabel, sizeLabel } from '../../data/catalog';
import { MAX_ORDER_ITEMS, MAX_ORDER_LINE_QTY } from '../../data/orders';
import { FINISH_LABEL, type Catalog, type Product, type Variant } from '../../data/schema';
import { stockOf, STOCK_PUBLIC_CAP } from '../../data/stock';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { normalize } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import type { OrderLine } from '../lib/orders';

/*
 * The pieces of an order the owner registers or edits: search the catalog,
 * pick finish, size and quantity, adjust or remove lines. Prices shown are a
 * preview (pieces already in the order keep the price agreed then); the
 * server prices and checks the stock when saving.
 */

export const lineKey = (l: { productId: string; variantId: string; size?: string | undefined }) => `${l.productId}|${l.variantId}|${l.size ?? ''}`;

/** Merges a line into the list (same piece, finish and size: quantities add up, capped). */
export function addLine(lines: OrderLine[], line: OrderLine): OrderLine[] {
  const key = lineKey(line);
  const existing = lines.find((l) => lineKey(l) === key);
  if (!existing) return [...lines, line];
  return lines.map((l) => (l === existing ? { ...l, qty: Math.min(MAX_ORDER_LINE_QTY, l.qty + line.qty) } : l));
}

/** Units in stock for a tracked combination ("20+" past the public cap), or null when not tracked. */
function stockHint(catalog: Catalog, productId: string, variantId: string, size?: string): string | null {
  const units = stockOf(catalog.stock, productId, variantId, size);
  if (units === null) return null;
  if (units <= 0) return 'Sem estoque';
  return `${units >= STOCK_PUBLIC_CAP ? `${STOCK_PUBLIC_CAP}+` : units} em estoque`;
}

/** Preview price of a line: the agreed price for pieces already in the order, today's price otherwise. */
export function linePrice(catalog: Catalog, line: OrderLine, agreed?: ReadonlyMap<string, number>): number | null {
  const fixed = agreed?.get(lineKey(line));
  if (fixed !== undefined) return fixed;
  const product = catalog.products.find((p) => p.id === line.productId);
  return product ? effectivePrice(product) : null;
}

const ALL = '__todas__';
const OTHER = '__sem_categoria__';

function Picker({ catalog, onAdd, onClose, addLabel }: { catalog: Catalog; onAdd: (line: OrderLine) => void; onClose: () => void; addLabel: string }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>(ALL);
  const [product, setProduct] = useState<Product | null>(null);
  const [variant, setVariant] = useState<Variant | null>(null);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);
  const categories = useMemo(() => new Map(catalog.categories.map((c) => [c.id, c.name])), [catalog.categories]);
  const q = normalize(query);
  // Every piece (no cap: a piece past the first screenful must be reachable without typing), filtered by
  // the search, then grouped by category in the owner's category order (pieces of a removed category last).
  const matches = useMemo(() => {
    const all = [...catalog.products].sort(byOrder);
    if (!q) return all;
    return all.filter((p) => normalize(`${p.name} ${categories.get(p.categoryId) ?? ''} ${p.variants.map((v) => v.sku ?? '').join(' ')}`).includes(q));
  }, [catalog.products, categories, q]);
  const groups = useMemo(() => {
    const order = [...catalog.categories].sort((a, b) => a.order - b.order).map((c) => c.id);
    const byCat = new Map<string, Product[]>();
    for (const p of matches) byCat.set(p.categoryId, [...(byCat.get(p.categoryId) ?? []), p]);
    const known = order.filter((id) => byCat.has(id)).map((id) => ({ id, name: categories.get(id)!, items: byCat.get(id)! }));
    const orphans = [...byCat.entries()].filter(([id]) => !categories.has(id)).flatMap(([, items]) => items);
    return orphans.length ? [...known, { id: OTHER, name: 'Sem categoria', items: orphans }] : known;
  }, [matches, catalog.categories, categories]);
  const shown = category === ALL ? groups : groups.filter((g) => g.id === category);
  /** Chips: every category with pieces in the catalog (counts follow the search). */
  const chips = useMemo(() => {
    const order = [...catalog.categories].sort((a, b) => a.order - b.order);
    return order.filter((c) => catalog.products.some((p) => p.categoryId === c.id));
  }, [catalog.categories, catalog.products]);
  const countIn = (id: string) => groups.find((g) => g.id === id)?.items.length ?? 0;

  const choose = (p: Product) => {
    setProduct(p);
    const first = p.variants.find((v) => v.available) ?? p.variants[0] ?? null;
    setVariant(first);
    setSize(undefined);
    setQty(1);
  };

  if (product && variant) {
    const sizes = variant.sizes ?? [];
    const needsSize = sizes.length > 0 && !size;
    const image = product.images[0];
    return (
      <div className="flex flex-col gap-4 rounded-[12px] border border-copper bg-white p-4">
        <div className="flex items-start gap-3">
          {image && <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-14 shrink-0 rounded-[8px]" width={56} height={70} />}
          <div className="min-w-0 flex-1">
            <p className="leading-snug font-medium">{product.name}</p>
            <p className="price text-sm text-ink-muted">{formatBRL(effectivePrice(product))}</p>
            {!product.available && <p className="text-xs text-ink-muted">Oculta no site</p>}
          </div>
          <button type="button" className="min-h-9 text-sm text-copper underline underline-offset-4" onClick={() => setProduct(null)}>
            Trocar peça
          </button>
        </div>
        {product.variants.length > 1 && (
          <div>
            <p className="mb-2 text-sm font-medium">Acabamento</p>
            <div role="group" aria-label="Acabamento" className="flex flex-wrap gap-2">
              {product.variants.map((v) => (
                <Chip
                  key={v.id}
                  selected={v.id === variant.id}
                  onClick={() => {
                    setVariant(v);
                    setSize(undefined);
                  }}
                >
                  <SwatchDot finish={v.finish} /> {FINISH_LABEL[v.finish]}
                </Chip>
              ))}
            </div>
          </div>
        )}
        {sizes.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium">{sizeFieldLabel(sizes)}</p>
            <div role="group" aria-label={sizeFieldLabel(sizes)} className="flex flex-wrap gap-2">
              {sizes.map((s) => (
                <Chip key={s} selected={s === size} onClick={() => setSize(s)}>
                  {sizeLabel(s)}
                </Chip>
              ))}
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Stepper value={qty} onChange={setQty} max={MAX_ORDER_LINE_QTY} label="Quantidade" size="sm" />
          {(!sizes.length || size) && <span className="text-sm text-ink-muted">{stockHint(catalog, product.id, variant.id, size) ?? 'Sem controle de estoque'}</span>}
        </div>
        <div className="flex gap-2">
          <Button
            block
            disabled={needsSize}
            onClick={() => {
              onAdd({ productId: product.id, variantId: variant.id, ...(size ? { size } : {}), qty });
              onClose();
            }}
          >
            {needsSize ? 'Escolha o tamanho' : addLabel}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    );
  }

  const row = (p: Product) => {
    const image = p.images[0];
    return (
      <li key={p.id}>
        <button type="button" onClick={() => choose(p)} className="flex w-full items-center gap-3 rounded-[10px] p-2 text-left hover:bg-champagne focus-visible:outline-2 focus-visible:outline-copper">
          {image ? <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} /> : <span className="w-12 shrink-0" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{p.name}</span>
            {!p.available && <span className="block truncate text-xs text-ink-muted">Oculta no site</span>}
          </span>
          <span className="price shrink-0 text-sm">{formatBRL(effectivePrice(p))}</span>
        </button>
      </li>
    );
  };

  return (
    // No inner scroll box: the list uses the panel's height and the panel scrolls; the search, the
    // categories and "Fechar" stay pinned at the top while she scrolls.
    <div className="flex flex-col rounded-[12px] border border-copper bg-white">
      <div className="sticky top-0 z-10 flex flex-col gap-3 rounded-t-[12px] border-b border-line bg-white p-3 pb-2">
        <div className="flex items-center justify-between gap-3">
          <p className="font-medium">Escolha a peça</p>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <div className="relative">
          <label htmlFor="order-piece-search" className="sr-only">
            Buscar peça
          </label>
          <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
          <input
            id="order-piece-search"
            ref={searchRef}
            type="search"
            autoFocus
            placeholder="Buscar peça ou referência"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
          />
        </div>
        {chips.length > 1 && (
          <div role="group" aria-label="Categorias" className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 py-1">
            <Chip selected={category === ALL} onClick={() => setCategory(ALL)}>
              Todas <span className={cx('price text-xs', category === ALL ? 'text-white/80' : 'text-ink-muted')}>{matches.length}</span>
            </Chip>
            {chips.map((c) => (
              <Chip key={c.id} selected={category === c.id} onClick={() => setCategory(c.id)}>
                {c.name} <span className={cx('price text-xs', category === c.id ? 'text-white/80' : 'text-ink-muted')}>{countIn(c.id)}</span>
              </Chip>
            ))}
          </div>
        )}
      </div>
      <div className="p-2 pb-3">
        {shown.length > 0 && (
          <ul aria-label="Peças do catálogo">
            {shown.map((g) => (
              <li key={g.id} className={cx(category === ALL && 'pt-2 first:pt-1')}>
                {category === ALL && (
                  <h3 className="eyebrow flex items-baseline gap-2 px-2 pb-1 text-ink-muted">
                    {g.name} <span className="h-px flex-1 self-center bg-line" aria-hidden="true" />
                  </h3>
                )}
                <ul aria-label={`Peças de ${g.name}`}>{g.items.map(row)}</ul>
              </li>
            ))}
          </ul>
        )}
        {!shown.length && (
          <div className="flex flex-col items-center gap-2 p-4 text-center text-sm text-ink-muted">
            <p>{q ? 'Nenhuma peça com esse nome' : 'Nenhuma peça'}{category !== ALL && ` em ${categories.get(category) ?? 'esta categoria'}`}.</p>
            {category !== ALL && matches.length > 0 && (
              <button type="button" className="min-h-11 text-copper underline underline-offset-4" onClick={() => setCategory(ALL)}>
                Ver em todas as categorias ({matches.length})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function OrderItemsEditor({
  lines,
  onChange,
  agreed,
  label = 'Peças do pedido',
  addLabel = 'Adicionar ao pedido',
}: {
  lines: OrderLine[];
  onChange: (lines: OrderLine[]) => void;
  agreed?: ReadonlyMap<string, number>;
  /** Accessible name of the list ("Peças da maleta" in a kit). */
  label?: string;
  addLabel?: string;
}) {
  const catalog = useCatalog((s) => s.data);
  const [picking, setPicking] = useState(lines.length === 0);
  const total = lines.reduce((sum, l) => sum + (linePrice(catalog, l, agreed) ?? 0) * l.qty, 0);

  return (
    <section aria-label={label} className="flex flex-col gap-3">
      {lines.length > 0 && (
        <ul className="divide-y divide-line border-y border-line">
          {lines.map((line) => {
            const product = catalog.products.find((p) => p.id === line.productId);
            const variant = product?.variants.find((v) => v.id === line.variantId);
            const unit = linePrice(catalog, line, agreed);
            const image = product?.images[0];
            const hint = stockHint(catalog, line.productId, line.variantId, line.size);
            const name = product?.name ?? 'Peça removida do catálogo';
            return (
              <li key={lineKey(line)} className="flex items-start gap-3 py-3">
                {image ? <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} /> : <span className="w-12 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className={cx('leading-snug', !product && 'text-danger')}>{name}</p>
                  <p className="text-sm text-ink-muted">
                    {variant ? FINISH_LABEL[variant.finish] : '—'}
                    {line.size && ` · ${sizeLabel(line.size)}`}
                    {hint && ` · ${hint}`}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <Stepper
                      value={line.qty}
                      max={MAX_ORDER_LINE_QTY}
                      size="sm"
                      label={`Quantidade de ${name}`}
                      onChange={(qty) => onChange(lines.map((l) => (l === line ? { ...l, qty } : l)))}
                    />
                    <span className="price">{unit === null ? '—' : formatBRL(unit * line.qty)}</span>
                  </div>
                </div>
                <IconButton label={`Remover ${name}`} onClick={() => onChange(lines.filter((l) => l !== line))}>
                  <X size={18} strokeWidth={1.5} />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      {picking ? (
        <Picker catalog={catalog} addLabel={addLabel} onAdd={(line) => onChange(addLine(lines, line))} onClose={() => setPicking(false)} />
      ) : (
        lines.length < MAX_ORDER_ITEMS && (
          <Button variant="secondary" block onClick={() => setPicking(true)}>
            <Plus size={18} strokeWidth={1.5} /> Adicionar peça
          </Button>
        )
      )}
      {lines.length > 0 && (
        <div className="flex items-baseline justify-between">
          <span>Total das peças</span>
          <span className="price text-xl">{formatBRL(total)}</span>
        </div>
      )}
    </section>
  );
}
