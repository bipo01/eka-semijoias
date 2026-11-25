import type { MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { backStepFrom } from '../../lib/navHistory';
import { storePageName } from '../../lib/storePages';
import { useCatalog } from '../../store/catalog';
import { cx } from '../ui/cx';

/**
 * "← Voltar para <page>" on the store's inner pages (a category, a piece). It really goes back to
 * where the visitor came from inside the store, so the catalog returns with its filters and scroll;
 * a page opened from a shared link (nothing known behind it) goes up to its parent instead (`up`).
 * Matters most in the installed app, which has no browser back button on iPhone.
 * `siblings`: pages under this prefix are the same level (the category chips), so coming from one
 * of them "Voltar" goes up rather than back to the other category.
 */
export function BackLink({ up, siblings, className }: { up: { to: string; label: string }; siblings?: string; className?: string }) {
  const location = useLocation();
  const navigate = useNavigate();
  const data = useCatalog((s) => s.data);
  const back = backStepFrom(location.key);
  const step = back && !(siblings && back.pathname.startsWith(siblings)) ? back : null;
  const stepName = step ? storePageName(step.pathname, data) : null;
  const target = step && stepName ? { to: step.pathname + step.search, label: stepName, steps: step.steps } : { ...up, steps: 0 };

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // New tab / window keeps the plain link.
    if (!target.steps || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(-target.steps);
  };

  return (
    <Link
      to={target.to}
      // Going up takes this page's place in history, as going back would: the parent never offers
      // "Voltar" to the page the visitor just left.
      replace={!target.steps}
      onClick={onClick}
      className={cx(
        'group -ml-1 inline-flex min-h-11 max-w-full items-center gap-2.5 rounded-full py-1 pr-3 pl-1 text-sm text-ink transition-colors duration-200 hover:text-copper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-line bg-white text-copper shadow-[0_1px_2px_rgb(48_33_28/0.06)] transition-[transform,border-color,background-color] duration-200 group-hover:-translate-x-0.5 group-hover:border-rose group-hover:bg-champagne group-active:scale-95 motion-reduce:transition-none motion-reduce:group-hover:translate-x-0"
      >
        <ArrowLeft size={18} strokeWidth={1.75} />
      </span>
      <span className="min-w-0 truncate">
        <span className="text-ink-muted transition-colors group-hover:text-copper">Voltar para </span>
        <span className="font-medium">{target.label}</span>
      </span>
    </Link>
  );
}
