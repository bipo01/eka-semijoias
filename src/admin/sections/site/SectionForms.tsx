import { useState, type ChangeEvent, type ComponentType } from 'react';
import { ImagePlus, Images, Loader2 } from 'lucide-react';
import { Button, buttonClass } from '../../../components/ui/Button';
import { Sheet } from '../../../components/ui/Sheet';
import { cx } from '../../../components/ui/cx';
import { toast } from '../../../store/ui';
import { newItemId, type ContentImage, type QaItem, type TextItem, type TitledItem } from '../../../data/content';
import { Group, HeaderFields, TextInput, Toggle, useEditor } from './fields';
import { ImageField, ImageInput, photoFromFile } from './ImageField';
import { ListField } from './ListEditor';
import { ProductPhotoChooser } from './ProductPhotoChooser';
import { pathKey, type Path } from './sectionDraft';
import type { SiteSectionId } from './siteSections';
import { TestimonialsForm } from './TestimonialsForm';

/*
 * The fields of each section, in the order they appear on the site. Labels
 * and hints speak to the owner; limits come from the schema.
 */

const titled = (): TitledItem => ({ id: newItemId(), title: '', text: '' });
const plain = (): TextItem => ({ id: newItemId(), text: '' });
const qa = (): QaItem => ({ id: newItemId(), question: '', answer: '' });

/** List of {title, text} items. */
function TitledList({ path, title, hint, itemName, addLabel, feminine = true, textLabel = 'Texto', titleLabel = 'Título' }: {
  path: Path;
  title: string;
  hint?: string;
  itemName: string;
  addLabel: string;
  feminine?: boolean;
  textLabel?: string;
  titleLabel?: string;
}) {
  return (
    <ListField<TitledItem>
      path={path}
      title={title}
      {...(hint ? { hint } : {})}
      itemName={itemName}
      feminine={feminine}
      addLabel={addLabel}
      newItem={titled}
      renderItem={(_item, _i, p) => (
        <>
          <TextInput path={[...p, 'title']} label={titleLabel} />
          <TextInput path={[...p, 'text']} label={textLabel} long />
        </>
      )}
    />
  );
}

/** List of single texts. */
function TextList({ path, title, hint, itemName, addLabel, feminine = true, label = 'Texto' }: { path: Path; title: string; hint?: string; itemName: string; addLabel: string; feminine?: boolean; label?: string }) {
  return (
    <ListField<TextItem>
      path={path}
      title={title}
      {...(hint ? { hint } : {})}
      itemName={itemName}
      feminine={feminine}
      addLabel={addLabel}
      newItem={plain}
      renderItem={(_item, _i, p) => <TextInput path={[...p, 'text']} label={label} long rows={2} />}
    />
  );
}

/** Questions and answers. */
function QaList({ path, title, hint }: { path: Path; title: string; hint?: string }) {
  return (
    <ListField<QaItem>
      path={path}
      title={title}
      {...(hint ? { hint } : {})}
      itemName="pergunta"
      addLabel="Adicionar pergunta"
      newItem={qa}
      deleteText={(q) => (q.question.trim() ? `“${q.question.trim()}”` : '')}
      renderItem={(_item, _i, p) => (
        <>
          <TextInput path={[...p, 'question']} label="Pergunta" />
          <TextInput path={[...p, 'answer']} label="Resposta" paragraphs rows={4} />
        </>
      )}
    />
  );
}

type GalleryItem = ContentImage & { id: string };

/** The Instagram strip: up to 6 photos; adding one starts by choosing the photo. */
function InstagramPhotos() {
  const { set, errors, draft } = useEditor();
  const [adding, setAdding] = useState(false);
  const path: Path = ['instagram'];
  const items = ((draft as { instagram?: GalleryItem[] }).instagram ?? []) as GalleryItem[];
  const append = (img: ContentImage) => set(path, [...items, { ...img, id: newItemId() }]);
  return (
    <>
      <ListField<GalleryItem>
        path={path}
        title="Fotos da faixa do Instagram"
        hint="Aparecem no fim da página inicial, com o link do seu perfil."
        itemName="foto"
        addLabel="Adicionar foto"
        onAdd={() => setAdding(true)}
        empty="Sem fotos, a faixa do Instagram não aparece."
        renderItem={(item, _i, p) => {
          const key = pathKey(p);
          return (
            <ImageField
              label="Foto"
              ratio="1 / 1"
              value={item}
              onChange={(img) => img && set(p, { ...img, id: item.id })}
              error={errors[`${key}.src`]}
              altError={errors[`${key}.alt`]}
              fieldKey={key}
            />
          );
        }}
      />
      <AddPhoto open={adding} onClose={() => setAdding(false)} onPick={append} />
    </>
  );
}

/** Adding a gallery photo: send a new one or pick a product photo. */
function AddPhoto({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (img: ContentImage) => void }) {
  const [busy, setBusy] = useState(false);
  const [choosing, setChoosing] = useState(false);

  async function upload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    const result = await photoFromFile(file, 'product');
    setBusy(false);
    if (!result.ok) return void toast(result.message, { tone: 'error' });
    onPick({ src: result.src, thumb: result.thumb, alt: '' });
    onClose();
  }

  return (
    <>
      <Sheet open={open && !choosing} onClose={() => !busy && onClose()} title="Adicionar foto" side="center">
        <div className="flex flex-col gap-2">
          <label className={cx(buttonClass('primary', 'md', true), 'cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper', busy && 'pointer-events-none opacity-50')}>
            <input type="file" accept="image/*" className="sr-only" onChange={upload} disabled={busy} />
            {busy ? <Loader2 size={18} strokeWidth={1.5} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <ImagePlus size={18} strokeWidth={1.5} aria-hidden="true" />}
            {busy ? 'Preparando foto…' : 'Enviar foto'}
          </label>
          <Button variant="secondary" block onClick={() => setChoosing(true)} disabled={busy}>
            <Images size={18} strokeWidth={1.5} aria-hidden="true" /> Escolher das fotos das peças
          </Button>
        </div>
      </Sheet>
      <ProductPhotoChooser
        open={open && choosing}
        onClose={() => setChoosing(false)}
        onPick={(img) => {
          setChoosing(false);
          onClose();
          onPick({ src: img.src, ...(img.thumb ? { thumb: img.thumb } : {}), alt: img.alt });
        }}
      />
    </>
  );
}

function InicioForm() {
  return (
    <>
      <Group title="Chamada principal" hint="O topo da página inicial, a primeira coisa que a cliente vê.">
        <TextInput path={['hero', 'title']} label="Título" />
        <TextInput path={['hero', 'highlight']} label="Destaque" hint="Palavra em itálico no fim do título." />
        <TextInput path={['hero', 'subtitle']} label="Subtítulo" long rows={2} />
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput path={['hero', 'primaryCta']} label="Botão principal" hint="Leva ao catálogo." />
          <TextInput path={['hero', 'secondaryCta']} label="Segundo botão" hint="Leva à página de revendedoras. Vazio, o botão some." />
        </div>
        <ImageInput path={['hero', 'image']} label="Foto da chamada" hint="Prefira uma foto em pé (retrato): no celular ela aparece vertical, e as bordas podem ser cortadas." wide ratio="4 / 5" />
      </Group>
      <Group title="Títulos das seções">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput path={['titles', 'categories']} label="Categorias" />
          <TextInput path={['titles', 'featured']} label="Peças em destaque" />
          <TextInput path={['titles', 'newArrivals']} label="Novidades" />
          <TextInput path={['titles', 'care']} label="Cuidados" />
          <TextInput path={['titles', 'testimonials']} label="Depoimentos" />
          <TextInput path={['titles', 'faq']} label="Perguntas frequentes" />
        </div>
      </Group>
      <Group title="Faixa da revenda" hint="O convite para ser revendedora, no meio da página inicial.">
        <Toggle path={['resellerBand', 'show']} label="Mostrar a faixa" />
        <TextInput path={['resellerBand', 'title']} label="Título" />
        <TextInput path={['resellerBand', 'text']} label="Texto" long rows={3} />
        <TextInput path={['resellerBand', 'cta']} label="Botão" />
        <ImageInput path={['resellerBand', 'image']} label="Foto da faixa" wide />
      </Group>
      <TitledList path={['careTips']} title="Dicas de cuidado" hint="As dicas curtas da página inicial." itemName="dica" addLabel="Adicionar dica" />
      <InstagramPhotos />
    </>
  );
}

function PerguntasForm() {
  return <QaList path={['items']} title="Perguntas frequentes" hint="A ordem aqui é a ordem na página inicial." />;
}

function SobreForm() {
  return (
    <>
      <HeaderFields path={['header']} />
      <Group title="Sua história">
        <TextInput path={['story']} label="História" paragraphs rows={12} />
        <TextInput path={['signature']} label="Assinatura" hint="Aparece no fim da história. Vazio, não aparece." />
        <ImageInput path={['image']} label="Foto ao lado da história" emptyText="Sem foto, aparece o emblema da ÉKA." />
      </Group>
      <Group title="Valores">
        <TextInput path={['valuesTitle']} label="Título dos valores" />
      </Group>
      <TitledList path={['values']} title="O que guia a ÉKA" itemName="valor" feminine={false} addLabel="Adicionar valor" />
    </>
  );
}

function CuidadosForm() {
  return (
    <>
      <HeaderFields path={['header']} />
      <TitledList path={['steps']} title="Cuidados" itemName="cuidado" feminine={false} addLabel="Adicionar cuidado" />
      <Group title="Por que o banho escurece">
        <TextInput path={['why', 'title']} label="Título" hint="Vazio, o quadro não aparece." />
        <TextInput path={['why', 'text']} label="Texto" paragraphs rows={6} />
      </Group>
      <TextList path={['productTips']} title="Dicas na página de cada peça" hint="Aparecem no quadro “Cuidados” de todas as peças." itemName="dica" addLabel="Adicionar dica" />
    </>
  );
}

function GarantiaForm() {
  return (
    <>
      <p className="text-sm text-ink-muted">O prazo e as regras da garantia ficam em Configurações, junto com as informações da loja.</p>
      <TextList path={['covered']} title="O que a garantia cobre" itemName="item" feminine={false} addLabel="Adicionar item" />
      <TextList path={['notCovered']} title="O que a garantia não cobre" itemName="item" feminine={false} addLabel="Adicionar item" />
      <TextList path={['steps']} title="Como acionar a garantia" itemName="passo" feminine={false} addLabel="Adicionar passo" />
      <Group title="Trocas e página da peça">
        <TextInput path={['exchanges']} label="Trocas" paragraphs rows={4} />
        <TextInput path={['productText']} label="Texto do quadro de garantia em cada peça" long rows={3} />
      </Group>
    </>
  );
}

function RevendedorasForm() {
  return (
    <>
      <Group title="Topo da página">
        <TextInput path={['hero', 'eyebrow']} label="Chamada acima do título" />
        <TextInput path={['hero', 'title']} label="Título" />
        <TextInput path={['hero', 'highlight']} label="Destaque" hint="Palavra em itálico no fim do título." />
        <TextInput path={['hero', 'text']} label="Texto" long rows={3} />
        <TextInput path={['hero', 'cta']} label="Botão" hint="Leva ao pré-cadastro." />
        <ImageInput path={['hero', 'image']} label="Foto do topo" wide />
      </Group>
      <Group title="Como funciona">
        <TextInput path={['stepsTitle']} label="Título" />
      </Group>
      <TitledList path={['steps']} title="Passos" itemName="passo" feminine={false} addLabel="Adicionar passo" />
      <Group title="Vantagens">
        <TextInput path={['benefitsTitle']} label="Título" />
      </Group>
      <TitledList path={['benefits']} title="Lista de vantagens" itemName="vantagem" addLabel="Adicionar vantagem" />
      <Group title="Dúvidas">
        <TextInput path={['faqTitle']} label="Título" />
      </Group>
      <QaList path={['faq']} title="Perguntas das revendedoras" />
      <Group title="Pré-cadastro e menu">
        <TextInput path={['formTitle']} label="Título do pré-cadastro" />
        <TextInput path={['formIntro']} label="Texto do pré-cadastro" long rows={3} />
        <TextInput path={['menuText']} label="Frase no menu da loja" hint="Aparece embaixo de “Seja revendedora” no menu." />
      </Group>
    </>
  );
}

function ContatoForm() {
  return (
    <>
      <HeaderFields path={['header']} />
      <Group title="Mensagem rápida">
        <TextInput path={['quickTitle']} label="Título da mensagem rápida" />
      </Group>
    </>
  );
}

function GeralForm() {
  return (
    <>
      <Group title="Rodapé">
        <TextInput path={['footerTagline']} label="Frase do rodapé" long rows={2} />
      </Group>
      <Group title="Sacola vazia">
        <TextInput path={['bagEmptyTitle']} label="Título" />
        <TextInput path={['bagEmptyText']} label="Texto" long rows={2} />
      </Group>
      <Group title="Depois do pedido">
        <TextInput path={['afterOrderText']} label="Texto que aparece com o número do pedido" long rows={3} />
      </Group>
      <Group title="Página não encontrada: peça" hint="Quando alguém abre o link de uma peça que saiu do catálogo ou teve o link trocado.">
        <TextInput path={['notFoundTitle']} label="Título" />
        <TextInput path={['notFoundText']} label="Texto" long rows={2} />
      </Group>
      <Group title="Página não encontrada: categoria" hint="Quando alguém abre o link de uma categoria que foi apagada ou renomeada.">
        <TextInput path={['categoryNotFoundTitle']} label="Título" />
        <TextInput path={['categoryNotFoundText']} label="Texto" long rows={2} />
      </Group>
      <Group title="Página não encontrada: outros links" hint="Quando o link está errado ou é de uma página que não existe mais.">
        <TextInput path={['pageNotFoundTitle']} label="Título" />
        <TextInput path={['pageNotFoundText']} label="Texto" long rows={2} />
        <TextInput path={['notFoundSuggestions']} label="Título das peças sugeridas (vazio esconde as peças)" />
      </Group>
    </>
  );
}

function PrivacidadeForm() {
  return (
    <>
      <p className="text-sm text-ink-muted">
        A política precisa dizer a verdade sobre o que o site faz com os dados. Se mudar algo aqui, confira se continua certo. A data “Atualizada em” muda sozinha quando você salva.
      </p>
      <HeaderFields path={['header']} />
      <ListField<TitledItem>
        path={['blocks']}
        title="Blocos da política"
        itemName="bloco"
        feminine={false}
        addLabel="Adicionar bloco"
        newItem={titled}
        renderItem={(_item, _i, p) => (
          <>
            <TextInput path={[...p, 'title']} label="Título" />
            <TextInput path={[...p, 'text']} label="Texto" paragraphs rows={8} />
          </>
        )}
      />
    </>
  );
}

function CompartilharForm() {
  return (
    <>
      <p className="text-sm text-ink-muted">É o que aparece no Google e quando alguém manda o link do site no WhatsApp ou no Instagram. As páginas das peças mostram a foto e o nome da própria peça.</p>
      <Group title="Título e descrição">
        <TextInput path={['title']} label="Título do site" />
        <TextInput path={['description']} label="Descrição" long rows={3} hint="Uma ou duas frases sobre a loja." />
      </Group>
      <Group title="Imagem da prévia">
        <ImageInput path={['image']} label="Imagem do link" hint="Foto larga, de preferência deitada." wide emptyText="Sem foto, a prévia usa a imagem padrão da ÉKA." />
      </Group>
    </>
  );
}

export const SECTION_FORMS: Record<SiteSectionId, ComponentType> = {
  inicio: InicioForm,
  depoimentos: TestimonialsForm,
  perguntas: PerguntasForm,
  sobre: SobreForm,
  cuidados: CuidadosForm,
  garantia: GarantiaForm,
  revendedoras: RevendedorasForm,
  contato: ContatoForm,
  geral: GeralForm,
  privacidade: PrivacidadeForm,
  compartilhar: CompartilharForm,
};
