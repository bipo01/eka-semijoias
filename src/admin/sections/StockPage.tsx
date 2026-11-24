import { useMemo, useState, type FormEvent } from 'react';
import { ChevronRight, Minus, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { Img } from '../../components/ui/Img';
import { Chip } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { byOrder, sizeLabel } from '../../data/catalog';
import { FINISH_LABEL, type Product } from '../../data/schema';
import { combosOf, comboKey, DEFAULT_LOW_STOCK, MAX_STOCK_QTY } from '../../data/stock';
import { productImageSources } from '../../lib/assets';
import { formatBRL } from '../../lib/format';
import { normalize } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { EmptyState, SwitchRow } from '../FormBits';
import { holdingKey, matchesFilter, productStock, saveStock, STOCK_FILTERS, stockOverview, useStockData, type MoveKind, type ProductStock, type StockData, type StockFilter } from '../lib/stock';
import { MovementList, StockHistory } from './StockHistory';
import { StockMoveSheet, type MoveRequestState } from './StockMoveSheet';

/*
 * Estoque: overview (at home, with resellers, value), entries and exits,
 * per-piece stock with an absolute "Ajustar contagem" editor, and the history.
 */

function StockEditor({ product, data, onClose }: { product: Product; data: StockData; onClose: () => void }) {
  // The numbers this edit started from: sent as `expected`, so a change made meanwhile (an order
  // confirmed, another device) is reported instead of silently overwritten.
  const snapshot = () => ({
    wasTracked: data.tracked.includes(product.id),
    start: new Map(data.levels.filter((l) => l.productId === product.id).map((l) => [comboKey(l.variantId, l.size), l.qty])),
  });
  const [base, setBase] = useState(snapshot);
  const { wasTracked, start } = base;
  const valuesFrom = (from: Map<string, number>) => Object.fromEntries(combosOf(product).map((c) => [comboKey(c.variantId, c.size), String(from.get(comboKey(c.variantId, c.size)) ?? 0)]));
  const [tracked, setTracked] = useState(wasTracked);
  const [values, setValues] = useState<Record<string, string>>(() => valuesFrom(start));
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const reloadNumbers = () => {
    const next = snapshot();
    setBase(next);
    setTracked(next.wasTracked);
    setValues(valuesFrom(next.start));
    setError(null);
  };
  const qtyOf = (key: string) => {
    const n = Number(values[key]);
    return Number.isInteger(n) && n >= 0 ? n : NaN;
  };
  const step = (key: string, delta: number) => setValues((v) => ({ ...v, [key]: String(Math.max(0, Math.min(MAX_STOCK_QTY, (Number(v[key]) || 0) + delta))) }));

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (busy) return;
    if (!tracked && wasTracked && !confirmOff) return setConfirmOff(true);
    const combos = combosOf(product);
    if (tracked && combos.some((c) => Number.isNaN(qtyOf(comboKey(c.variantId, c.size))) || qtyOf(comboKey(c.variantId, c.size)) > MAX_STOCK_QTY)) {
      return setError({ message: 'Use só números inteiros, de 0 em diante.', conflict: false });
    }
    setError(null);
    setBusy(true);
    const levels = tracked
      ? combos.map((c) => {
          const key = comboKey(c.variantId, c.size);
          return { variantId: c.variantId, size: c.size, qty: qtyOf(key), expected: start.get(key) ?? null };
        })
      : [];
    const problem = await saveStock(product.id, tracked, levels);
    setBusy(false);
    setConfirmOff(false);
    if (problem) {
      setError(problem);
      return;
    }
    toast(tracked ? 'Estoque salvo.' : 'Controle de estoque desligado.', { tone: 'success' });
    onClose();
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <SwitchRow
        label="Controlar estoque desta peça"
        hint={tracked ? 'Quando acabar, a peça aparece como esgotada sozinha.' : 'Desligado, a peça segue o interruptor “Disponível”, sem contar unidades.'}
        checked={tracked}
        onChange={setTracked}
      />

      {tracked &&
        product.variants.map((v) => {
          const combos = v.sizes?.length ? v.sizes : [''];
          return (
            <fieldset key={v.id} className="rounded-[12px] border border-line bg-white p-4">
              <legend className="px-1 font-medium">
                {FINISH_LABEL[v.finish]}
                {!v.available && <span className="font-normal text-ink-muted"> · indisponível no site</span>}
              </legend>
              <ul className="mt-1 flex flex-col gap-2">
                {combos.map((size) => {
                  const key = comboKey(v.id, size);
                  const label = size ? sizeLabel(size) : 'Unidades';
                  const id = `stock-${product.id}-${key}`;
                  return (
                    <li key={key} className="flex items-center justify-between gap-3">
                      <label htmlFor={id} className="text-sm">
                        {label}
                        {start.has(key) && <span className="text-ink-muted"> · antes {start.get(key)}</span>}
                      </label>
                      <div className="inline-flex h-11 items-center rounded-full border border-line bg-white">
                        <button type="button" aria-label={`Diminuir ${label}`} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-champagne" onClick={() => step(key, -1)}>
                          <Minus size={16} strokeWidth={1.5} />
                        </button>
                        <input
                          id={id}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={values[key] ?? '0'}
                          onChange={(e) => setValues((x) => ({ ...x, [key]: e.target.value.replace(/\D/g, '').slice(0, 6) }))}
                          onFocus={(e) => e.currentTarget.select()}
                          className="price w-12 bg-transparent text-center text-base focus:outline-none"
                        />
                        <button type="button" aria-label={`Aumentar ${label}`} className="inline-flex size-10 items-center justify-center rounded-full hover:bg-champagne" onClick={() => step(key, 1)}>
                          <Plus size={16} strokeWidth={1.5} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </fieldset>
          );
        })}

      {error && (
        <div role="alert" className="flex flex-col gap-2 rounded-[10px] bg-champagne px-4 py-3 text-sm">
          <p>{error.message}</p>
          {error.conflict && (
            <button type="button" className="min-h-11 self-start font-medium text-copper underline underline-offset-4" onClick={reloadNumbers}>
              Ver os números atuais
            </button>
          )}
        </div>
      )}
      <Button type="submit" size="lg" block disabled={busy || (!tracked && !wasTracked)} aria-busy={busy}>
        {busy ? 'Salvando…' : 'Salvar estoque'}
      </Button>

      <ConfirmDialog
        open={confirmOff}
        title="Desligar o controle de estoque?"
        confirmLabel="Desligar"
        cancelLabel="Voltar"
        tone="danger"
        onConfirm={() => void submit()}
        onCancel={() => {
          setConfirmOff(false);
          setTracked(true);
        }}
      >
        As quantidades desta peça são apagadas. A peça volta a seguir só o interruptor “Disponível”.
      </ConfirmDialog>
    </form>
  );
}

function Kpi({ label, value, hint, tone, className }: { label: string; value: string; hint?: string | undefined; tone?: 'danger' | 'copper' | undefined; className?: string }) {
  return (
    <div className={cx('min-w-0 rounded-[12px] border border-line bg-white px-3 py-2.5 md:p-4', className)}>
      <p className="truncate text-sm text-ink-muted">{label}</p>
      <p className={cx('price mt-0.5 text-[1.375rem] leading-tight whitespace-nowrap md:text-[1.5rem]', tone === 'danger' ? 'text-danger' : tone === 'copper' ? 'text-copper' : 'text-ink')}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** "3 em casa · 2 nas maletas" (or the sold-out / no-control wording) for a product row. */
export function stockLine(stock: ProductStock): string {
  const kits = stock.inKits > 0 ? ` · ${stock.inKits}\u00a0nas\u00a0maletas` : '';
  if (!stock.tracked) return `Sem controle de estoque${kits}`;
  if (stock.soldOut) return `Esgotada em casa${kits}`;
  return `${stock.home} em casa${kits}${stock.low ? ' · poucas unidades' : ''}`;
}

/** Where the units of each finish/size are: at home and with which resellers. */
function Whereabouts({ product, data }: { product: Product; data: StockData }) {
  const tracked = data.tracked.includes(product.id);
  const qty = new Map(data.levels.filter((l) => l.productId === product.id).map((l) => [comboKey(l.variantId, l.size), l.qty]));
  const lines = combosOf(product)
    .map((c) => {
      const variant = product.variants.find((v) => v.id === c.variantId);
      const holders = data.kitsByCombo[holdingKey(product.id, c.variantId, c.size)] ?? [];
      return { key: comboKey(c.variantId, c.size), label: [variant ? FINISH_LABEL[variant.finish] : '', c.size && sizeLabel(c.size)].filter(Boolean).join(' · '), home: tracked ? (qty.get(comboKey(c.variantId, c.size)) ?? 0) : null, holders };
    })
    .filter((l) => l.home !== null || l.holders.length > 0);
  if (!lines.length) return null;
  return (
    <section aria-labelledby={`where-${product.id}`}>
      <h3 id={`where-${product.id}`} className="mb-2 text-[1.25rem] leading-tight">
        Onde estão as peças
      </h3>
      <ul className="divide-y divide-line rounded-[12px] border border-line bg-white text-sm">
        {lines.map((l) => (
          <li key={l.key} className="flex items-start justify-between gap-3 px-4 py-2.5">
            <span className="min-w-0">
              {l.label || 'Unidades'}
              {l.holders.length > 0 && (
                <span className="block text-ink-muted">
                  Nas maletas: {l.holders.map((h) => `${h.resellerName || 'revendedora'} (${h.qty})`).join(', ')}
                </span>
              )}
            </span>
            <span className="price shrink-0 text-right">{l.home === null ? '—' : `${l.home} em casa`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ProductStockPanel({ product, data, onMove, onClose }: { product: Product; data: StockData; onMove: (kind: MoveKind) => void; onClose: () => void }) {
  const movements = data.movements.filter((m) => m.productId === product.id).slice(0, 30);
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => onMove('entrada')}>
          <Plus size={18} strokeWidth={1.5} aria-hidden="true" /> Entrada
        </Button>
        <Button variant="secondary" onClick={() => onMove('saida')}>
          <Minus size={18} strokeWidth={1.5} aria-hidden="true" /> Saída
        </Button>
      </div>
      <Whereabouts product={product} data={data} />
      <section aria-labelledby={`adjust-${product.id}`} className="flex flex-col gap-3">
        <div>
          <h3 id={`adjust-${product.id}`} className="text-[1.25rem] leading-tight">
            Ajustar contagem
          </h3>
          <p className="text-sm text-ink-muted">Para corrigir depois de contar as peças: os números abaixo substituem os atuais.</p>
        </div>
        <StockEditor key={product.id} product={product} data={data} onClose={onClose} />
      </section>
      {movements.length > 0 && (
        <section aria-labelledby={`mov-${product.id}`}>
          <h3 id={`mov-${product.id}`} className="mb-2 text-[1.25rem] leading-tight">
            Entradas e saídas
          </h3>
          <MovementList movements={movements} products={[product]} showProduct={false} />
        </section>
      )}
    </div>
  );
}

let moveSession = 0;

export function StockPage() {
  const { state, reload } = useStockData();
  const products = useCatalog((s) => s.data.products);
  const threshold = useCatalog((s) => s.data.settings.lowStockThreshold ?? DEFAULT_LOW_STOCK);
  const [filter, setFilter] = useState<StockFilter>('todas');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [move, setMove] = useState<MoveRequestState | null>(null);
  const data = state.status === 'ready' ? state.data : null;
  const rows = useMemo(() => (data ? [...products].sort(byOrder).map((p) => ({ product: p, stock: productStock(p, data, threshold) })) : []), [products, data, threshold]);

  if (state.status === 'loading' || !data) {
    if (state.status === 'error') {
      return (
        <div role="alert" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="text-ink-muted">{state.message}</p>
          <Button variant="secondary" onClick={reload}>
            Tentar de novo
          </Button>
        </div>
      );
    }
    return (
      <p className="py-10 text-center text-ink-muted" aria-busy="true">
        Carregando estoque…
      </p>
    );
  }

  const overview = stockOverview(rows);
  const counts = Object.fromEntries(STOCK_FILTERS.map((f) => [f.id, rows.filter((r) => matchesFilter(r.stock, f.id)).length])) as Record<StockFilter, number>;
  const q = normalize(query.trim());
  const visible = rows.filter(({ product, stock }) => matchesFilter(stock, filter) && (!q || normalize(`${product.name} ${product.variants.map((v) => v.sku ?? '').join(' ')}`).includes(q)));
  const open = products.find((p) => p.id === openId) ?? null;
  const startMove = (kind: MoveKind, productId: string | null = null) => {
    setOpenId(null);
    setMove({ kind, productId, session: ++moveSession });
  };

  return (
    <>
      <p className="mb-4 text-sm text-ink-muted">
        Com o controle ligado, o site mostra “Esgotado” sozinho quando a peça acaba. Pedidos confirmados e maletas tiram do estoque; cancelamentos e acertos devolvem.
      </p>

      {/* Phone: units in a row of three, the value on its own line, then the alerts; wide screens: one row. */}
      <section aria-label="Resumo do estoque" className="mb-4 grid grid-cols-6 gap-2 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.7fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Kpi className="col-span-2 lg:col-span-1" label="Em casa" value={String(overview.home)} hint="unidades" />
        <Kpi className="col-span-2 lg:col-span-1" label="Nas maletas" value={String(overview.inKits)} hint="unidades" />
        <Kpi className="col-span-2 lg:col-span-1" label="Total registrado" value={String(overview.total)} hint="das peças com controle" />
        <Kpi className="col-span-6 lg:col-span-1" label="Valor em estoque" value={formatBRL(overview.valueCents)} hint="a preço de venda, com as maletas" />
        <Kpi className="col-span-3 lg:col-span-1" label="Esgotadas" value={String(overview.soldOut)} tone={overview.soldOut ? 'danger' : undefined} hint="sem unidades em casa" />
        <Kpi className="col-span-3 lg:col-span-1" label="Poucas unidades" value={String(overview.low)} tone={overview.low ? 'copper' : undefined} hint={`até ${threshold} por acabamento`} />
      </section>

      <div className="mb-5 grid grid-cols-2 gap-2 sm:flex">
        <Button className="px-3 text-[0.9375rem] whitespace-nowrap sm:px-6" onClick={() => startMove('entrada')}>
          <Plus size={18} strokeWidth={1.5} aria-hidden="true" className="hidden sm:block" /> Registrar entrada
        </Button>
        <Button variant="secondary" className="px-3 text-[0.9375rem] whitespace-nowrap sm:px-6" onClick={() => startMove('saida')}>
          <Minus size={18} strokeWidth={1.5} aria-hidden="true" className="hidden sm:block" /> Registrar saída
        </Button>
      </div>

      <div role="group" aria-label="Filtrar peças" className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {STOCK_FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className={cx('price text-xs', filter === f.id ? 'text-white/85' : 'text-ink-muted')}>{counts[f.id]}</span>
          </Chip>
        ))}
      </div>
      <div className="relative mb-4">
        <label htmlFor="stock-search" className="sr-only">
          Buscar peça
        </label>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id="stock-search"
          type="search"
          placeholder="Buscar peça ou referência"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
      </div>

      {visible.length ? (
        <ul className="flex flex-col gap-2">
          {visible.map(({ product, stock }) => {
            const image = product.images[0];
            return (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(product.id)}
                  className="flex w-full items-center gap-3 rounded-[12px] border border-line bg-white p-3 text-left transition-colors hover:border-copper focus-visible:outline-2 focus-visible:outline-copper"
                >
                  {image ? (
                    <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} />
                  ) : (
                    <span className="h-[60px] w-12 shrink-0 rounded-[8px] bg-champagne" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate">{product.name}</p>
                    <p className={cx('text-sm', !stock.tracked ? 'text-ink-muted' : stock.soldOut ? 'font-medium text-danger' : stock.low ? 'font-medium text-copper' : 'text-ink')}>{stockLine(stock)}</p>
                  </div>
                  <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>Nenhuma peça neste filtro.</EmptyState>
      )}

      <StockHistory movements={data.movements} products={products} />

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? 'Estoque'} side="right">
        {open && <ProductStockPanel product={open} data={data} onMove={(kind) => startMove(kind, open.id)} onClose={() => setOpenId(null)} />}
      </Sheet>
      <StockMoveSheet request={move} data={data} onClose={() => setMove(null)} />
    </>
  );
}
