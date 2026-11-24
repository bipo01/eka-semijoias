import { Link } from 'react-router-dom';
import { Bed, Droplets, FlaskConical, Gem, Lock, Package, Sparkles, SprayCan, Wind } from 'lucide-react';
import { ContentPageHeader } from '../components/layout/PageHeader';
import { paragraphs } from '../data/content';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';

/** Icons of the care steps by position; steps beyond them get the fallback. */
const STEP_ICONS = [SprayCan, Droplets, FlaskConical, Package, Sparkles, Wind, Bed, Lock];

export function CarePage() {
  useDocumentTitle('Como cuidar');
  const care = useSection('cuidados');
  const why = care.why;
  const hasWhy = !!(why.title || why.text);
  return (
    <div className="pb-16">
      <ContentPageHeader header={care.header} />
      <ol className="container-x grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:gap-5">
        {care.steps.map((step, i) => {
          const Icon = STEP_ICONS[i] ?? Gem;
          return (
            <li key={step.id} className="flex gap-4 rounded-[12px] border border-line bg-white p-5 lg:flex-col">
              <span className="relative inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-champagne text-copper" aria-hidden="true">
                <Icon size={22} strokeWidth={1.5} />
                <span className="price absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-copper text-[11px] text-white">{i + 1}</span>
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-title break-words">{step.title}</h2>
                {step.text && <p className="mt-1 text-sm whitespace-pre-line [overflow-wrap:anywhere] text-ink-muted">{step.text}</p>}
              </div>
            </li>
          );
        })}
      </ol>
      <section {...(why.title ? { 'aria-labelledby': 'escurece' } : { 'aria-label': hasWhy ? 'Sobre o desgaste do banho' : 'Garantia e trocas' })} className="container-x mt-12 lg:mt-16">
        <div className="max-w-3xl rounded-[12px] bg-champagne p-6 lg:p-10">
          {hasWhy && (
            <>
              {why.title && <h2 id="escurece" className="font-display text-display-m break-words">{why.title}</h2>}
              {paragraphs(why.text).map((p, i) => (
                <p key={i} className={`${i === 0 && !why.title ? '' : 'mt-3 '}whitespace-pre-line [overflow-wrap:anywhere] text-ink`}>
                  {p}
                </p>
              ))}
            </>
          )}
          <p className={hasWhy ? 'mt-3 text-ink' : 'text-ink'}>
            Notou algo diferente na sua peça? Veja a nossa <Link to="/garantia" className="text-copper underline underline-offset-4">garantia e trocas</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
