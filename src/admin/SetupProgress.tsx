import { useId } from 'react';
import { Link } from 'react-router-dom';
import { Check, CheckCircle2, ChevronRight, Circle } from 'lucide-react';
import { cx } from '../components/ui/cx';
import { useCatalog } from '../store/catalog';
import { setupStatus, type SetupArea, type SetupItem, type SetupStatus } from './lib/setup';
import { adminPath } from './lib/paths';
import { CARD } from './ui';

/*
 * The "Complete as informações da loja" meters (rules in ./lib/setup.ts): the whole store at the
 * top of Configurações, and each place's own items (a Configurações tab, Produtos, Site) above
 * the form that answers them.
 */

export function useSetupStatus(): SetupStatus {
  const settings = useCatalog((s) => s.data.settings);
  const content = useCatalog((s) => s.data.content);
  const products = useCatalog((s) => s.data.products);
  return setupStatus({ settings, content, products });
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Scrolls to a field of this page, focuses it and gives it a short copper glow. */
export function focusField(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const target = el.matches('input, select, textarea') ? el : el.querySelector<HTMLElement>('input:checked, input, select, textarea, button');
  const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView?.({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  (target ?? el).focus({ preventScroll: true });
  const glow = el.matches('input, select, textarea') ? el : (el.closest('fieldset') ?? el);
  if (!reduce && typeof glow.animate === 'function')
    glow.animate(
      [
        { boxShadow: '0 0 0 0 rgb(138 90 69 / 0)', borderRadius: '12px' },
        { boxShadow: '0 0 0 6px rgb(138 90 69 / 0.28)', borderRadius: '12px', offset: 0.25 },
        { boxShadow: '0 0 0 0 rgb(138 90 69 / 0)', borderRadius: '12px' },
      ],
      { duration: 1600, easing: 'ease-out' },
    );
}

/** A thin meter: one bar, or one bead per item (`segments`). */
function Meter({ done, total, segments, label, className }: { done: number; total: number; segments?: boolean; label: string; className?: string }) {
  const complete = done === total;
  const fill = complete ? 'bg-success' : 'bg-gradient-to-r from-rose to-copper';
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={`${done} de ${total}`} className={cx('flex gap-1', className)}>
      {segments ? (
        Array.from({ length: total }, (_, i) => <span key={i} className={cx('h-1.5 flex-1 rounded-full transition-colors duration-300', i < done ? fill : 'bg-[#efe4dc]')} />)
      ) : (
        <span className="h-2 flex-1 overflow-hidden rounded-full bg-[#efe4dc]">
          <span className={cx('block h-full rounded-full transition-[width] duration-500 ease-out', fill)} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
        </span>
      )}
    </div>
  );
}

/** The whole store: overall meter and one chip per place, the current one marked. */
export function SetupOverview({ current }: { current?: SetupArea | undefined }) {
  const status = useSetupStatus();
  const titleId = useId();
  const left = status.total - status.done;
  const pct = Math.round((status.done / status.total) * 100);

  if (!left)
    return (
      <section aria-labelledby={titleId} className={cx(CARD, 'flex items-center gap-3 px-4 py-3')}>
        <CheckCircle2 size={22} strokeWidth={1.75} className="shrink-0 text-success" aria-hidden="true" />
        <h2 id={titleId} className="min-w-0 flex-1 text-sm">
          <span className="font-medium">Informações da loja completas.</span> <span className="text-ink-muted">O site mostra só o que você confirmou.</span>
        </h2>
        <span className="price shrink-0 text-sm text-ink-muted">
          {status.done} de {status.total}
        </span>
      </section>
    );

  return (
    <section aria-labelledby={titleId} className={cx(CARD, 'p-4 sm:p-5')}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id={titleId} className="font-display text-title">
            Complete as informações da loja
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">
            {`${left === 1 ? 'Falta' : 'Faltam'} ${plural(left, 'item', 'itens')}.`}
            <span className="hidden sm:inline"> Cada área mostra o que falta nela.</span>
          </p>
        </div>
        <p className="shrink-0 text-right leading-none">
          <span className="price font-display text-[1.75rem] font-semibold text-copper">{pct}%</span>
          <span className="price mt-1 block text-xs text-ink-muted">
            {status.done} de {status.total}
          </span>
        </p>
      </div>
      <Meter done={status.done} total={status.total} label="Informações da loja preenchidas" className="mt-3" />
      <ul aria-label="Por área" className="mt-3 flex flex-wrap gap-2">
        {status.areas.map((a) => {
          const complete = a.done === a.total;
          const here = a.id === current;
          return (
            <li key={a.id}>
              <Link
                to={a.to}
                aria-current={here ? 'page' : undefined}
                className={cx(
                  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors duration-[160ms]',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper',
                  complete ? 'border-transparent bg-success-tint text-success' : 'border-line bg-white text-ink hover:border-copper',
                  here && (complete ? 'ring-1 ring-success' : 'border-copper ring-1 ring-copper'),
                )}
              >
                {complete && <Check size={15} strokeWidth={2} aria-hidden="true" />}
                {a.label}
                {complete ? (
                  <span className="sr-only">: completo</span>
                ) : (
                  <span className="price rounded-full bg-champagne px-1.5 text-xs leading-5 text-ink">
                    <span aria-hidden="true">
                      {a.done}/{a.total}
                    </span>
                    <span className="sr-only">
                      : {a.done} de {a.total}
                    </span>
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PendingRow({ item }: { item: SetupItem }) {
  const body = (
    <>
      <Circle size={18} strokeWidth={1.5} className="mt-0.5 shrink-0 text-rose" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-ink">{item.label}</span>
        {(item.progress ?? item.hint) && <span className="mt-0.5 block text-xs leading-snug text-ink-muted">{item.progress ?? item.hint}</span>}
      </span>
      <span className="inline-flex shrink-0 items-center gap-0.5 text-copper">
        Preencher <ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
      </span>
    </>
  );
  const cls =
    'flex min-h-12 w-full items-start gap-2.5 rounded-xl px-2 py-2.5 text-left text-sm transition-colors duration-[160ms] hover:bg-champagne/60 focus-visible:outline-2 focus-visible:outline-copper';
  return (
    <li>
      {item.to ? (
        <Link to={item.to} className={cls}>
          {body}
        </Link>
      ) : (
        <button type="button" className={cls} onClick={() => item.field && focusField(item.field)}>
          {body}
        </button>
      )}
    </li>
  );
}

function DoneRow({ item }: { item: SetupItem }) {
  return (
    <li className="flex items-start gap-2.5 px-2 py-1.5 text-sm">
      <CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <span className="text-ink-muted">
          <span className="sr-only">Feito: </span>
          {item.label}
        </span>
        {item.value && <span className="min-w-0 truncate text-ink sm:max-w-[55%] sm:text-right">{item.value}</span>}
      </span>
    </li>
  );
}

/**
 * One place's items: a bead per item, what is missing (each opens its field) and what is
 * already filled in, with its value. Hidden where the place has no items (and, outside
 * Configurações, once everything there is done: the overview still shows it).
 */
export function AreaChecklist({ area, place = 'aba', hideWhenComplete, className }: { area: SetupArea; place?: 'aba' | 'área'; hideWhenComplete?: boolean; className?: string }) {
  const status = useSetupStatus();
  const titleId = useId();
  const own = status.areas.find((a) => a.id === area);
  if (!own || !own.total) return null;
  const pending = own.items.filter((i) => !i.done);
  const filled = own.items.filter((i) => i.done);
  const complete = !pending.length;
  if (complete && hideWhenComplete) return null;
  const showOverall = area === 'produtos' || area === 'site';

  return (
    <section aria-labelledby={titleId} className={cx(CARD, 'p-4', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-[0.6875rem] text-ink-muted">{place === 'aba' ? 'Nesta aba' : 'Nesta área'}</p>
          <h2 id={titleId} className={cx('mt-0.5 flex items-center gap-1.5 font-display text-title', complete && 'text-success')}>
            {complete && <CheckCircle2 size={20} strokeWidth={1.75} aria-hidden="true" />}
            {complete ? 'Tudo preenchido' : `${pending.length === 1 ? 'Falta' : 'Faltam'} ${plural(pending.length, 'item', 'itens')}`}
          </h2>
        </div>
        <span className="price shrink-0 text-sm text-ink-muted">
          {own.done} de {own.total}
        </span>
      </div>
      <Meter done={own.done} total={own.total} segments label={`Itens preenchidos ${place === 'aba' ? 'nesta aba' : 'nesta área'}`} className="mt-2.5" />

      {!complete && (
        <ul aria-label="Falta preencher" className="-mx-2 mt-2 flex flex-col">
          {pending.map((item) => (
            <PendingRow key={item.key} item={item} />
          ))}
        </ul>
      )}

      {filled.length > 0 &&
        (complete ? (
          <details className="group mt-1">
            <summary className="-mx-1 inline-flex min-h-11 cursor-pointer list-none items-center gap-1 px-1 text-sm text-copper [&::-webkit-details-marker]:hidden">
              <ChevronRight size={16} strokeWidth={1.5} aria-hidden="true" className="transition-transform group-open:rotate-90" /> Ver o que foi preenchido
            </summary>
            <ul aria-label="Já preenchido" className="-mx-2 flex flex-col">
              {filled.map((item) => (
                <DoneRow key={item.key} item={item} />
              ))}
            </ul>
          </details>
        ) : (
          <div className="mt-2 border-t border-line pt-2">
            <p className="px-0 pb-0.5 text-xs font-medium tracking-wide text-ink-muted uppercase">Já preenchido</p>
            <ul aria-label="Já preenchido" className="-mx-2 flex flex-col">
              {filled.map((item) => (
                <DoneRow key={item.key} item={item} />
              ))}
            </ul>
          </div>
        ))}

      {showOverall && status.done < status.total && (
        <p className="mt-2 border-t border-line pt-2 text-sm text-ink-muted">
          Na loja toda: {status.done} de {status.total}.{' '}
          <Link to={adminPath('configuracoes')} className="text-copper underline underline-offset-4">
            Ver tudo o que falta
          </Link>
        </p>
      )}
    </section>
  );
}
