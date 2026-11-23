import { useState, type FormEvent } from 'react';
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
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { EmptyState, SwitchRow } from '../FormBits';
import { formatDateTime } from '../lib/contact';
import { saveStock, useStockData, type StockData, type StockMovement } from '../lib/stock';

type Filter = 'todas' | 'controladas' | 'esgotadas' | 'ultimas';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'controladas', label: 'Com controle' },
  { id: 'ultimas', label: 'Últimas unidades' },
  { id: 'esgotadas', label: 'Esgotadas' },
];

interface Summary {
  tracked: boolean;
  total: number;
  soldOut: boolean;
  low: boolean;
}

function summarize(product: Product, data: StockData, threshold: number): Summary {
  const tracked = data.tracked.includes(product.id);
  if (!tracked) return { tracked, total: 0, soldOut: false, low: false };
  const qty = new Map(data.levels.filter((l) => l.productId === product.id).map((l) => [comboKey(l.variantId, l.size), l.qty]));
  const units = combosOf(product).map((c) => qty.get(comboKey(c.variantId, c.size)) ?? 0);
  const total = units.reduce((s, n) => s + n, 0);
  return { tracked, total, soldOut: total === 0, low: total > 0 && threshold > 0 && units.some((n) => n > 0 && n <= threshold) };
}

const REASON_LABEL: Record<StockMovement['reason'], string> = { ajuste: 'Ajuste', pedido: 'Pedido', devolucao: 'Devolução' };

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
  const movements = data.movements.filter((m) => m.productId === product.id).slice(0, 30);
  const variantName = (id: string) => {
    const v = product.variants.find((x) => x.id === id);
    return v ? FINISH_LABEL[v.finish] : 'Acabamento removido';
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

      {movements.length > 0 && (
        <section aria-labelledby={`mov-${product.id}`}>
          <h3 id={`mov-${product.id}`} className="mb-2 text-sm font-medium">Entradas e saídas</h3>
          <ul className="divide-y divide-line border-y border-line text-sm">
            {movements.map((m) => (
              <li key={m.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p>
                    {REASON_LABEL[m.reason]}
                    {m.orderNumber ? ` · pedido nº ${m.orderNumber}` : ''}
                  </p>
                  <p className="text-ink-muted">
                    {variantName(m.variantId)}
                    {m.size && ` · ${sizeLabel(m.size)}`} · {formatDateTime(m.at)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cx('price font-medium', m.delta < 0 ? 'text-danger' : 'text-success')}>{m.delta > 0 ? `+${m.delta}` : m.delta}</p>
                  <p className="price text-ink-muted">fica {m.qtyAfter}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

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

export function StockPage() {
  const { state, reload } = useStockData();
  const products = useCatalog((s) => s.data.products);
  const threshold = useCatalog((s) => s.data.settings.lowStockThreshold ?? DEFAULT_LOW_STOCK);
  const [filter, setFilter] = useState<Filter>('todas');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  if (state.status === 'loading') return <p className="py-10 text-center text-ink-muted" aria-busy="true">Carregando estoque…</p>;
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
  const data = state.data;
  const rows = [...products].sort(byOrder).map((p) => ({ product: p, summary: summarize(p, data, threshold) }));
  const counts: Record<Filter, number> = {
    todas: rows.length,
    controladas: rows.filter((r) => r.summary.tracked).length,
    ultimas: rows.filter((r) => r.summary.low).length,
    esgotadas: rows.filter((r) => r.summary.tracked && r.summary.soldOut).length,
  };
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    ({ product, summary }) =>
      (filter === 'todas' || (filter === 'controladas' && summary.tracked) || (filter === 'ultimas' && summary.low) || (filter === 'esgotadas' && summary.tracked && summary.soldOut)) &&
      (!q || product.name.toLowerCase().includes(q) || product.variants.some((v) => v.sku?.toLowerCase().includes(q))),
  );
  const open = products.find((p) => p.id === openId) ?? null;

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">
        Ligue o controle numa peça para o site mostrar “Esgotado” sozinho quando acabar. As peças saem do estoque quando você confirma um pedido e voltam se ele for cancelado.
      </p>
      <div className="no-scrollbar -mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => (
          <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
            {f.label}
            <span className={cx('price text-xs', filter === f.id ? 'text-white/85' : 'text-ink-muted')}>{counts[f.id]}</span>
          </Chip>
        ))}
      </div>
      <div className="relative mb-4">
        <label htmlFor="stock-search" className="sr-only">Buscar peça</label>
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
          {visible.map(({ product, summary }) => {
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
                    <p
                      className={cx(
                        'text-sm',
                        !summary.tracked ? 'text-ink-muted' : summary.soldOut ? 'font-medium text-danger' : summary.low ? 'font-medium text-copper' : 'text-ink',
                      )}
                    >
                      {!summary.tracked
                        ? 'Sem controle de estoque'
                        : summary.soldOut
                          ? 'Esgotada'
                          : `${summary.total} ${summary.total === 1 ? 'unidade' : 'unidades'}${summary.low ? ' · últimas unidades' : ''}`}
                    </p>
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

      <Sheet open={!!open} onClose={() => setOpenId(null)} title={open?.name ?? 'Estoque'} side="right">
        {open && <StockEditor key={open.id} product={open} data={data} onClose={() => setOpenId(null)} />}
      </Sheet>
    </>
  );
}
