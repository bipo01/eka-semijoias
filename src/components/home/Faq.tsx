import { useSection } from '../../hooks/useSection';
import { AccordionItem } from '../ui/Accordion';
import { SectionHeading } from '../ui/Misc';

/** The home FAQ: the owner's questions (Painel → Site → Perguntas frequentes) or the built-in ones. */
export function Faq() {
  const { titles } = useSection('inicio');
  const { items } = useSection('perguntas');
  if (!items.length) return null;
  return (
    <section aria-labelledby="home-faq" className="container-x pt-12 pb-16 lg:pt-20 lg:pb-24">
      <div className="mx-auto max-w-3xl">
        <SectionHeading id="home-faq" title={titles.faq} />
        <div className="flex flex-col gap-2">
          {items.map((item) => (
            <AccordionItem key={item.id} title={item.question}>
              <p className="whitespace-pre-line [overflow-wrap:anywhere]">{item.answer}</p>
            </AccordionItem>
          ))}
        </div>
      </div>
    </section>
  );
}
