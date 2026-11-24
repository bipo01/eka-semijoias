import { Check, X } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ButtonAnchor } from '../components/ui/Button';
import { WhatsAppIcon } from '../components/ui/Icons';
import { useBusiness, warrantyLabel } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { whatsappUrl } from '../lib/whatsapp';

const COVERED = ['Defeitos no banho, como descascar ou escurecer, com uso normal e os cuidados indicados'];
const NOT_COVERED = ['Pedras que se soltam ou se perdem', 'Peças quebradas, amassadas ou entortadas', 'Desgaste por contato com perfume, cremes, água ou produtos químicos', 'Uso fora dos cuidados indicados'];

export function WarrantyPage() {
  useDocumentTitle('Garantia e trocas');
  const biz = useBusiness();
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
      <div className="container-x grid gap-4 md:grid-cols-2 lg:gap-6">
        <section aria-labelledby="coberto" className="rounded-[12px] border border-line bg-white p-6">
          <h2 id="coberto" className="font-display text-display-m">O que a garantia cobre</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {COVERED.map((c) => (
              <li key={c} className="flex gap-3"><Check size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />{c}</li>
            ))}
          </ul>
        </section>
        <section aria-labelledby="nao-coberto" className="rounded-[12px] border border-line bg-white p-6">
          <h2 id="nao-coberto" className="font-display text-display-m">O que não cobre</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {NOT_COVERED.map((c) => (
              <li key={c} className="flex gap-3"><X size={20} strokeWidth={1.75} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />{c}</li>
            ))}
          </ul>
        </section>
      </div>
      <section aria-labelledby="como-acionar" className="container-x mt-10 lg:mt-14">
        <div className="max-w-3xl">
          <h2 id="como-acionar" className="font-display text-display-m">Como acionar</h2>
          <ol className="mt-4 flex list-decimal flex-col gap-2 pl-5">
            <li>Chame a gente no WhatsApp com o seu nome e a data do pedido.</li>
            <li>Envie uma foto da peça mostrando o defeito.</li>
            <li>A gente avalia e combina com você o conserto ou a troca.</li>
          </ol>
          <h2 className="mt-10 font-display text-display-m">Trocas</h2>
          <p className="mt-3">Quer trocar o tamanho ou o acabamento de uma peça que não foi usada? Fale com a gente pelo WhatsApp que explicamos como funciona.</p>
          <ButtonAnchor href={whatsappUrl(biz.whatsapp, 'Olá! Preciso de ajuda com a garantia ou a troca de uma peça.')} className="mt-6">
            <WhatsAppIcon size={20} /> Falar sobre garantia
          </ButtonAnchor>
        </div>
      </section>
    </div>
  );
}
