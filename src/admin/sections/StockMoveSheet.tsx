import { useMemo, useRef, useState, type FormEvent } from 'react';
import { Minus, Plus, Search } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { Img } from '../../components/ui/Img';
import { Chip, SwatchDot } from '../../components/ui/Misc';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import { byOrder, sizeFieldLabel, sizeLabel } from '../../data/catalog';
import { FINISH_LABEL, type Product, type Variant } from '../../data/schema';
import { comboKey, MAX_STOCK_QTY } from '../../data/stock';
import { errorMessage, idempotencyKey } from '../../lib/api';
import { productImageSources } from '../../lib/assets';
import { normalize } from '../../lib/search';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { QuantityStepper } from '../QuantityStepper';
import { MOVE_NOTE_MAX, registerMove, setStockMotive, withMotive, type MoveInput, type MoveKind, type SavedMotives, type StockData } from '../lib/stock';
import { MotivePicker, motiveToSend, type MotiveChoice } from './StockMotivePicker';

/*
 * "Registrar entrada" / "Registrar saída": one piece (finish, size), a
 * quantity, a motive and an optional note. The server is the authority: it
 * refuses an exit without enough units ("Só há N em estoque") and an entry on
 * a piece without stock control turns control on. "Outra entrada/saída" asks what it was; the
 * server saves that motive with the move and it comes back as a chip ("Tirar da lista" forgets it).
 */

const KIND_LABEL: Record<MoveKind, string> = { entrada: 'Registrar entrada', saida: 'Registrar saída' };

/** Exact units at home of one combination, or null when the product has no stock control. */
function unitsAtHome(data: StockData, productId: string, variantId: string, size: string): number | null {
  if (!data.tracked.includes(productId)) return null;
  return data.levels.find((l) => l.productId === productId && comboKey(l.variantId, l.size) === comboKey(variantId, size))?.qty ?? 0;
}

function homeTotal(data: StockData, productId: string): number | null {
  if (!data.tracked.includes(productId)) return null;
  return data.levels.filter((l) => l.productId === productId).reduce((s, l) => s + l.qty, 0);
}

function PiecePicker({ products, data, onPick }: { products: Product[]; data: StockData; onPick: (p: Product) => void }) {
  const [query, setQuery] = useState('');
  const q = normalize(query);
  const results = useMemo(() => {
    const all = [...products].sort(byOrder);
    if (!q) return all.slice(0, 30);
    return all.filter((p) => normalize(`${p.name} ${p.variants.map((v) => v.sku ?? '').join(' ')}`).includes(q)).slice(0, 30);
  }, [products, q]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <label htmlFor="move-piece-search" className="sr-only">
          Buscar peça
        </label>
        <Search size={18} strokeWidth={1.5} aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-muted" />
        <input
          id="move-piece-search"
          type="search"
          placeholder="Buscar peça ou referência"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-h-12 w-full rounded-[10px] border border-line bg-white pr-3 pl-10 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
      </div>
      <ul className="flex flex-col" aria-label="Peças do catálogo">
        {results.map((p) => {
          const image = p.images[0];
          const home = homeTotal(data, p.id);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onPick(p)} className="flex w-full items-center gap-3 rounded-[10px] p-2 text-left hover:bg-champagne focus-visible:outline-2 focus-visible:outline-copper">
                {image ? <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-10 shrink-0 rounded-[6px]" width={40} height={50} /> : <span className="h-[50px] w-10 shrink-0 rounded-[6px] bg-champagne" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.name}</span>
                  <span className="block truncate text-xs text-ink-muted">{home === null ? 'Sem controle de estoque' : `${home} em casa`}</span>
                </span>
              </button>
            </li>
          );
        })}
        {!results.length && <li className="p-3 text-center text-sm text-ink-muted">Nenhuma peça com esse nome.</li>}
      </ul>
    </div>
  );
}

function MoveForm({
  kind,
  onKind,
  initialProductId,
  data,
  onMotives,
  onDone,
}: {
  kind: MoveKind;
  onKind: (k: MoveKind) => void;
  initialProductId: string | null;
  data: StockData;
  onMotives: (motives: SavedMotives) => void;
  onDone: () => void;
}) {
  const products = useCatalog((s) => s.data.products);
  const [product, setProduct] = useState<Product | null>(() => products.find((p) => p.id === initialProductId) ?? null);
  const [variant, setVariant] = useState<Variant | null>(() => product?.variants[0] ?? null);
  const [size, setSize] = useState<string | undefined>(undefined);
  const [qty, setQty] = useState('1');
  const [motive, setMotive] = useState<MotiveChoice>(null);
  const [motiveText, setMotiveText] = useState('');
  const [forgetting, setForgetting] = useState(false);
  const motiveTextRef = useRef<HTMLInputElement>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The same move retried (lost answer, double tap) keeps its key, so it is applied once.
  const sent = useRef<{ body: string; key: string } | null>(null);

  const pick = (p: Product) => {
    setProduct(p);
    setVariant(p.variants[0] ?? null);
    setSize(undefined);
    setError(null);
  };
  const switchKind = (k: MoveKind) => {
    onKind(k);
    setMotive(null);
    setMotiveText('');
    setError(null);
  };
  const saved = data.motives[kind];

  async function forgetMotive(label: string) {
    if (forgetting) return;
    setForgetting(true);
    try {
      onMotives(await setStockMotive(kind, label, false));
      setMotive(null);
      setError(null);
      toast(`“${label}” saiu da lista de motivos.`, {
        action: {
          label: 'Desfazer',
          onClick: () => {
            setStockMotive(kind, label, true).then(onMotives, (err: unknown) => toast(errorMessage(err), { tone: 'error' }));
          },
        },
      });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setForgetting(false);
    }
  }

  if (!product || !variant) {
    return (
      <div className="flex flex-col gap-4">
        <KindSwitch kind={kind} onChange={switchKind} />
        <PiecePicker products={products} data={data} onPick={pick} />
      </div>
    );
  }

  const sizes = variant.sizes ?? [];
  const needsSize = sizes.length > 0 && !size;
  const comboSize = size ?? '';
  const current = needsSize ? null : unitsAtHome(data, product.id, variant.id, comboSize);
  const tracked = data.tracked.includes(product.id);
  const n = Number(qty);
  const qtyValid = qty !== '' && Number.isInteger(n) && n >= 1 && n <= MAX_STOCK_QTY;
  const max = kind === 'saida' ? Math.max(1, current ?? 1) : MAX_STOCK_QTY;
  const image = product.images[0];
  const after = current !== null && qtyValid ? (kind === 'entrada' ? current + n : current - n) : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy || !product || !variant) return;
    if (needsSize) return setError(`Escolha o ${sizeFieldLabel(sizes).toLowerCase()}.`);
    if (!qtyValid) return setError('Informe a quantidade: um número inteiro, de 1 em diante.');
    const motiveFields = motiveToSend(kind, motive, motiveText, saved);
    if ('error' in motiveFields) {
      if (motiveFields.focusText) motiveTextRef.current?.focus();
      return setError(motiveFields.error);
    }
    if (kind === 'saida' && !tracked) return setError('Esta peça não tem controle de estoque. Ligue o controle em “Ajustar contagem” antes de registrar uma saída.');
    if (kind === 'saida' && current !== null && n > current) return setError(current === 0 ? 'Não há unidades desta peça em estoque.' : `Só há ${current} em estoque.`);
    const input: MoveInput = { kind, productId: product.id, variantId: variant.id, size: comboSize, qty: n, ...motiveFields, ...(note.trim() ? { note: note.trim() } : {}) };
    const body = JSON.stringify(input);
    if (sent.current?.body !== body) sent.current = { body, key: idempotencyKey() };
    setError(null);
    setBusy(true);
    try {
      const result = await registerMove(input, sent.current.key);
      const what = kind === 'entrada' ? 'Entrada registrada' : 'Saída registrada';
      toast(`${what}: ${product.name}, fica ${result.qtyAfter}.${result.trackingStarted ? ' Controle de estoque ligado.' : ''}`, { tone: 'success' });
      // Her new motive is a chip right away (the stock reload that follows brings the server's list).
      if (input.motiveLabel) onMotives({ ...data.motives, [kind]: withMotive(saved, input.motiveLabel) });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-5">
      <KindSwitch kind={kind} onChange={switchKind} />

      <div className="flex items-start gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3">
        {image && <Img {...productImageSources(image, true)} alt="" ratio="4 / 5" frameClassName="w-12 shrink-0 rounded-[8px]" width={48} height={60} />}
        <div className="min-w-0 flex-1">
          <p className="leading-snug font-medium">{product.name}</p>
          {product.variants.length === 1 && <p className="text-sm text-ink-muted">{FINISH_LABEL[variant.finish]}</p>}
        </div>
        <button type="button" className="min-h-11 shrink-0 text-sm text-copper underline underline-offset-4" onClick={() => setProduct(null)}>
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

      <p aria-live="polite" className="rounded-[10px] bg-champagne px-4 py-3 text-sm">
        {needsSize
          ? `Escolha o ${sizeFieldLabel(sizes).toLowerCase()} para ver as unidades.`
          : current === null
            ? kind === 'entrada'
              ? 'Esta peça ainda não tem controle de estoque. Ao registrar a entrada, o controle liga: os outros acabamentos e tamanhos começam com 0.'
              : 'Esta peça não tem controle de estoque. Ligue o controle em “Ajustar contagem” para registrar saídas.'
            : `Em casa agora: ${current}${after !== null && after >= 0 ? ` · depois: ${after}` : ''}`}
      </p>

      <div className="flex items-center justify-between gap-3">
        <label htmlFor="move-qty" className="font-medium">
          Quantidade
        </label>
        <QuantityStepper id="move-qty" name="quantidade" value={qty} onChange={setQty} min={1} max={max} />
      </div>

      <MotivePicker
        kind={kind}
        saved={saved}
        choice={motive}
        onChoice={(c) => {
          setMotive(c);
          setError(null);
        }}
        text={motiveText}
        onText={setMotiveText}
        onForget={(label) => void forgetMotive(label)}
        forgetting={forgetting}
        textRef={motiveTextRef}
      />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="move-note" className="font-medium">
          Observação <span className="font-normal text-ink-muted">(opcional)</span>
        </label>
        <input
          id="move-note"
          value={note}
          maxLength={MOVE_NOTE_MAX}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'entrada' ? 'Ex.: NF 123, fornecedor de São Paulo' : 'Ex.: fecho quebrado'}
          aria-describedby="move-note-hint"
          className="min-h-12 w-full rounded-[10px] border border-line bg-white px-3 text-base placeholder:text-ink-muted focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
        <p id="move-note-hint" className="text-xs text-ink-muted">
          Aparece no histórico. Não escreva nome, telefone ou outros dados de clientes.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-[10px] bg-champagne px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" block disabled={busy} aria-busy={busy}>
        {busy ? 'Registrando…' : kind === 'entrada' ? `Registrar entrada${qtyValid ? ` de ${n}` : ''}` : `Registrar saída${qtyValid ? ` de ${n}` : ''}`}
      </Button>
    </form>
  );
}

function KindSwitch({ kind, onChange }: { kind: MoveKind; onChange: (k: MoveKind) => void }) {
  return (
    <div role="group" aria-label="Tipo de movimentação" className="flex gap-2">
      <Chip selected={kind === 'entrada'} onClick={() => onChange('entrada')} className={cx('flex-1 justify-center')}>
        <Plus size={16} strokeWidth={1.5} aria-hidden="true" /> Entrada
      </Chip>
      <Chip selected={kind === 'saida'} onClick={() => onChange('saida')} className={cx('flex-1 justify-center')}>
        <Minus size={16} strokeWidth={1.5} aria-hidden="true" /> Saída
      </Chip>
    </div>
  );
}

export interface MoveRequestState {
  kind: MoveKind;
  productId: string | null;
  /** Changes on every open, so the form starts fresh (and with a new idempotency key). */
  session: number;
}

export function StockMoveSheet({ request, data, onMotives, onClose }: { request: MoveRequestState | null; data: StockData; onMotives: (motives: SavedMotives) => void; onClose: () => void }) {
  // The last request stays rendered while the sheet slides out; the title follows the kind chosen inside.
  const [last, setLast] = useState<MoveRequestState | null>(request);
  const [kind, setKind] = useState<MoveKind>(request?.kind ?? 'entrada');
  if (request && request.session !== last?.session) {
    setLast(request);
    setKind(request.kind);
  }
  return (
    <Sheet open={!!request} onClose={onClose} title={KIND_LABEL[kind]} side="right">
      {last && <MoveForm key={last.session} kind={kind} onKind={setKind} initialProductId={last.productId} data={data} onMotives={onMotives} onDone={onClose} />}
    </Sheet>
  );
}
