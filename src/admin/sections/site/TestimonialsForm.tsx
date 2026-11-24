import { ShieldCheck } from 'lucide-react';
import { newItemId, type Testimonial } from '../../../data/content';
import { Checkbox, TextInput, Toggle, useEditor } from './fields';
import { ListField } from './ListEditor';
import { getIn } from './sectionDraft';

/** A testimonial while it is being written: the authorization starts unchecked. */
export type TestimonialDraft = Omit<Testimonial, 'authorized'> & { authorized: boolean };

export const newTestimonial = (): TestimonialDraft => ({ id: newItemId(), text: '', name: '', city: '', visible: true, authorized: false });

/** How the card looks on the home page (same shapes and type as the site's card). */
export function TestimonialPreview({ item }: { item: TestimonialDraft }) {
  const text = item.text.trim();
  const name = item.name.trim();
  const city = item.city.trim();
  return (
    <figure aria-label="Prévia do depoimento no site" className="flex flex-col gap-3 rounded-[12px] bg-champagne/70 p-4">
      <blockquote className="font-display text-[1.0625rem] leading-snug text-ink italic [overflow-wrap:anywhere]">
        {text ? `“${text}”` : <span className="text-ink-muted not-italic">O texto do depoimento aparece aqui.</span>}
      </blockquote>
      <figcaption className="text-sm text-ink-muted [overflow-wrap:anywhere]">{[name || 'Nome da cliente', city].filter(Boolean).join(' · ')}</figcaption>
    </figure>
  );
}

export function TestimonialsForm() {
  const { draft } = useEditor();
  const items = (getIn(draft, ['items']) as TestimonialDraft[] | undefined) ?? [];
  const shown = items.filter((t) => t.visible).length;
  return (
    <>
      <div className="flex gap-3 rounded-[12px] border border-line bg-champagne/50 p-3 text-sm">
        <ShieldCheck size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />
        <p>
          Publique só depoimentos reais, de clientes que autorizaram: o Código de Defesa do Consumidor proíbe propaganda enganosa, e o nome da cliente é um dado pessoal dela
          (LGPD). Por isso cada depoimento só é salvo com a autorização marcada.
        </p>
      </div>
      <ListField<TestimonialDraft>
        path={['items']}
        title="Depoimentos"
        hint={
          items.length
            ? `${shown} ${shown === 1 ? 'aparece' : 'aparecem'} no site. A ordem aqui é a ordem na página inicial.`
            : 'Enquanto não houver depoimento no site, a seção some da página inicial.'
        }
        itemName="depoimento"
        feminine={false}
        addLabel="Novo depoimento"
        addAt="start"
        newItem={newTestimonial}
        empty="Nenhum depoimento ainda. Toque em “Novo depoimento” para adicionar o primeiro."
        deleteText={(t) => (t.name.trim() ? `O depoimento de ${t.name.trim()} será apagado.` : 'Este depoimento será apagado.')}
        renderTitle={(t, i) => (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>{t.name.trim() || `Depoimento ${i + 1}`}</span>
            <span className={t.visible ? 'rounded-full bg-champagne px-2 text-xs leading-5 text-ink' : 'rounded-full border border-line px-2 text-xs leading-5 text-ink-muted'}>
              {t.visible ? 'No site' : 'Oculto'}
            </span>
          </span>
        )}
        renderItem={(t, _i, p) => (
          <>
            <TestimonialPreview item={t} />
            <TextInput path={[...p, 'text']} label="O que a cliente disse" long rows={4} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput path={[...p, 'name']} label="Nome" hint="Ex.: Ana P." />
              <TextInput path={[...p, 'city']} label="Cidade" hint="Ex.: Cuiabá/MT" />
            </div>
            <Toggle path={[...p, 'visible']} label="Mostrar no site" hint="Se desligar, o depoimento fica guardado aqui e sai do site." />
            <Checkbox path={[...p, 'authorized']} label="A cliente autorizou publicar este depoimento" hint="Com o nome e a cidade que aparecem acima." />
          </>
        )}
      />
    </>
  );
}
