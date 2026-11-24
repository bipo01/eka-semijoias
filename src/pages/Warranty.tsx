import { Check, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { useBusiness, warrantyLabel } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMessages } from '../hooks/useMessages';
import { useSection } from '../hooks/useSection';
import { whatsappUrl } from '../lib/whatsapp';

const itemText = 'min-w-0 whitespace-pre-line [overflow-wrap:anywhere]';

export function WarrantyPage() {
  useDocumentTitle('Garantia e trocas');
  const biz = useBusiness();
  const message = useMessages();
  const { covered, notCovered, steps, exchanges } = useSection('garantia');
  return (
    <div className="pb-16">
      <PageHeader
        eyebrow="Garantia e trocas"
        title={biz.warrantyMonths ? warrantyLabel(biz.warrantyMonths) : 'Garantia e trocas'}
        intro={biz.warrantyMonths ? `Todas as nossas peças têm ${warrantyLabel(biz.warrantyMonths).toLowerCase()} contra defeitos no banho.` : 'Nossas peças têm garantia contra defeitos de fabricação. Fale com a gente para saber os detalhes.'}
      />
      {biz.warrantyTerms && (
        <section aria-labelledby="regras" className="container-x mb-4 lg:mb-6">
          <div className="max-w-3xl rounded-[12px] bg-champagne p-6">
            <h2 id="regras" className="font-display text-display-m">Regras da garantia</h2>
            <p className="mt-3 break-words whitespace-pre-line">{biz.warrantyTerms}</p>
          </div>
        </section>
      )}
      {(covered.length > 0 || notCovered.length > 0) && (
        <div className="container-x grid gap-4 md:grid-cols-2 lg:gap-6">
          {covered.length > 0 && (
            <section aria-labelledby="coberto" className="rounded-[12px] border border-line bg-white p-6">
              <h2 id="coberto" className="font-display text-display-m">O que a garantia cobre</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {covered.map((c) => (
                  <li key={c.id} className="flex gap-3"><Check size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" /><span className={itemText}>{c.text}</span></li>
                ))}
              </ul>
            </section>
          )}
          {notCovered.length > 0 && (
            <section aria-labelledby="nao-coberto" className="rounded-[12px] border border-line bg-white p-6">
              <h2 id="nao-coberto" className="font-display text-display-m">O que não cobre</h2>
              <ul className="mt-4 flex flex-col gap-3">
                {notCovered.map((c) => (
                  <li key={c.id} className="flex gap-3"><X size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" /><span className={itemText}>{c.text}</span></li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
      <section {...(steps.length ? { 'aria-labelledby': 'como-acionar' } : { 'aria-label': exchanges ? 'Trocas e garantia' : 'Falar sobre a garantia' })} className="container-x mt-10 lg:mt-14">
        <div className="max-w-3xl">
          {steps.length > 0 && (
            <>
              <h2 id="como-acionar" className="font-display text-display-m">Como acionar</h2>
              <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5">
                {steps.map((step) => (
                  <li key={step.id} className={itemText}>{step.text}</li>
                ))}
              </ol>
            </>
          )}
          {exchanges && (
            <>
              <h2 className={steps.length ? 'mt-10 font-display text-display-m' : 'font-display text-display-m'}>Trocas</h2>
              <p className={`mt-3 ${itemText}`}>{exchanges}</p>
            </>
          )}
          <ButtonAnchor href={whatsappUrl(biz.whatsapp, message('garantia'))} className={steps.length || exchanges ? 'mt-6' : ''}>
            <WhatsAppIcon size={20} /> Falar sobre garantia
          </ButtonAnchor>
        </div>
      </section>
    </div>
  );
}
