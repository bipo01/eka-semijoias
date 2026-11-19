import { useBusiness, warrantyLabel } from '../../hooks/useBusiness';
import { AccordionItem } from '../ui/Accordion';
import { SectionHeading } from '../ui/Misc';

export function useFaq(): { q: string; a: string }[] {
  const biz = useBusiness();
  const faq: { q: string; a: string }[] = [
    {
      q: 'Como faço meu pedido?',
      a: 'Escolha as peças, coloque na sacola e toque em “Enviar pedido pelo WhatsApp”. A mensagem já vai pronta com as peças, os acabamentos e o total, e a gente combina pagamento e entrega por lá.',
    },
  ];
  if (biz.warrantyMonths) {
    faq.push({
      q: 'Qual a garantia?',
      a: `${warrantyLabel(biz.warrantyMonths)} contra defeitos no banho, com uso normal. Veja os detalhes na página Garantia e trocas.`,
    });
  }
  if (biz.shipsNationwide) {
    faq.push({ q: 'Vocês enviam para minha cidade?', a: 'Sim, enviamos para todo o Brasil. O valor e o prazo do frete são combinados no WhatsApp, de acordo com o seu CEP.' });
  }
  faq.push(
    { q: 'O banho escurece?', a: 'Com os cuidados certos, as peças mantêm o brilho por muito tempo. Evite perfume, água e produtos químicos em contato direto e guarde cada peça separada.' },
    { q: 'Posso encomendar uma peça que está esgotada?', a: 'Pode sim. Toque em “Avise-me” na peça ou fale com a gente pelo WhatsApp que avisamos quando ela voltar.' },
  );
  return faq;
}

export function Faq() {
  const faq = useFaq();
  return (
    <section aria-labelledby="home-faq" className="container-x pt-12 pb-16 lg:pt-20 lg:pb-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeading id="home-faq" title="Perguntas frequentes" />
        <div className="flex flex-col gap-2">
          {faq.map((item) => (
            <AccordionItem key={item.q} title={item.q}>
              <p>{item.a}</p>
            </AccordionItem>
          ))}
        </div>
      </div>
    </section>
  );
}
