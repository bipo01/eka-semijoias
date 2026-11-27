import { useState, type ComponentType } from 'react';
import { newItemId, type ContentImage, type QaItem, type TextItem, type TitledItem } from '../../../data/content';
import { Group, HeaderFields, TextInput, Toggle, useEditor } from './fields';
import { HeroSlides } from './HeroSlidesForm';
import { AddPhoto, ImageField, ImageInput } from './ImageField';
import { ListField } from './ListEditor';
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
      </Group>
      <HeroSlides />
      <Group title="Títulos das seções">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput path={['titles', 'categories']} label="Categorias" />
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

const NAME_HINT = 'Escreva {primeiro_nome} onde entra o primeiro nome dela.';

function PagamentoForm() {
  return (
    <>
      <p className="text-sm text-ink-muted">
        Textos da página que a cliente abre pelo link de pagamento. Onde aparece {'{pedido}'}, {'{primeiro_nome}'} ou {'{total}'}, entra o número do pedido, o primeiro nome da cliente ou o valor. Um trecho entre [ ] some quando o que está dentro dele fica vazio.
      </p>
      <Group title="Topo da página">
        <TextInput path={['header', 'title']} label="Título" hint="O número do pedido aparece logo depois (nº 1024)." />
        <TextInput path={['header', 'waiting']} label="Chamada enquanto falta pagar" hint="Aparece acima do título, depois de “Oi, Ana!”." />
        <TextInput path={['header', 'review']} label="Chamada depois do comprovante" />
        <TextInput path={['header', 'paid']} label="Chamada com o pagamento confirmado" />
        <TextInput path={['header', 'cancelled']} label="Chamada com o pedido cancelado" />
      </Group>
      <Group title="Pix">
        <TextInput path={['pix', 'title']} label="Título" />
        <TextInput path={['pix', 'step1']} label="Passo 1" long rows={2} hint="“Pix Copia e Cola” fica em destaque." />
        <TextInput path={['pix', 'step2']} label="Passo 2" long rows={2} hint="{total} é o valor do pedido." />
        <TextInput path={['pix', 'step3']} label="Passo 3" long rows={2} />
        <TextInput path={['pix', 'qrHint']} label="Frase acima do QR Code" />
        <TextInput path={['pix', 'unavailable']} label="Aviso quando a chave Pix não está cadastrada" long rows={3} />
      </Group>
      <Group title="Comprovante">
        <TextInput path={['receipt', 'title']} label="Título para enviar o comprovante" />
        <TextInput path={['receipt', 'againTitle']} label="Título para trocar o comprovante" hint="Quando a cliente envia outro arquivo, ele substitui o que ela tinha enviado." />
        <TextInput path={['replaceNote']} label="Aviso ao trocar o comprovante" long rows={2} />
        <TextInput path={['discarded']} label="Aviso quando a loja descarta um comprovante" long rows={3} hint="Aparece no link de pagamento acima do Pix, quando você descarta um comprovante errado." />
        <TextInput path={['tooBig']} label="Aviso quando o arquivo passa do limite" long rows={3} hint="O limite é de 700 KB. Logo abaixo aparecem o tamanho do arquivo e o botão “Enviar pelo WhatsApp”." />
        <TextInput path={['tooBigMessage']} label="Mensagem do botão “Enviar pelo WhatsApp”" long rows={2} hint="{pedido} é o número do pedido; {primeiro_nome}, o nome da cliente." />
      </Group>
      <Group title="Situação do pedido">
        <TextInput path={['status', 'reviewTitle']} label="Comprovante recebido: título" />
        <TextInput path={['status', 'reviewText']} label="Comprovante recebido: texto" long rows={2} />
        <TextInput path={['status', 'paidTitle']} label="Pagamento confirmado: título" />
        <TextInput path={['status', 'paidText']} label="Pagamento confirmado: texto" long rows={3} />
        <TextInput path={['status', 'cancelledTitle']} label="Pedido cancelado: título" />
        <TextInput path={['status', 'cancelledText']} label="Pedido cancelado: texto" long rows={2} />
      </Group>
      <Group title="Link com problema" hint="Quando o link de pagamento mudou ou não abriu. A explicação do motivo aparece sozinha.">
        <TextInput path={['problem', 'goneTitle']} label="Título quando o link não vale mais" />
        <TextInput path={['problem', 'failedTitle']} label="Título quando a página não abriu" />
        <TextInput path={['problem', 'message']} label="Mensagem do botão “Falar no WhatsApp”" long rows={2} />
      </Group>
      <Group title="Ajuda" hint="Mensagens que já vão escritas quando a cliente chama a gente no WhatsApp por esta página.">
        <TextInput path={['help', 'question']} label="Pergunta no fim da página" />
        <TextInput path={['help', 'message']} label="Mensagem de dúvida sobre o pagamento" long rows={2} hint="{pedido} é o número do pedido." />
        <TextInput path={['help', 'cancelledMessage']} label="Mensagem de dúvida com o pedido cancelado" long rows={2} hint="{pedido} é o número do pedido." />
      </Group>
    </>
  );
}

function RevendaForm() {
  return (
    <>
      <p className="text-sm text-ink-muted">Textos do painel das revendedoras. Os valores, as datas, o contrato e os botões continuam como estão.</p>
      <Group title="Entrar">
        <TextInput path={['login', 'title']} label="Título" />
        <TextInput path={['login', 'text']} label="Texto" long rows={2} />
        <TextInput path={['login', 'forgot']} label="Ajuda para quem esqueceu o PIN" long rows={2} />
      </Group>
      <Group title="Primeiro acesso" hint="A página do link de primeiro acesso, onde ela aceita o contrato e cria o PIN.">
        <TextInput path={['invite', 'greeting']} label="Saudação" hint={NAME_HINT} />
        <TextInput path={['invite', 'title']} label="Título" />
        <TextInput path={['invite', 'text']} label="Texto quando há contrato para aceitar" long rows={2} />
        <TextInput path={['invite', 'textNoContract']} label="Texto quando não há contrato" long rows={2} />
        <TextInput path={['invite', 'welcome']} label="Aviso depois de entrar pela primeira vez" />
        <TextInput path={['invite', 'goneTitle']} label="Título quando o link não vale mais" />
      </Group>
      <Group title="Contrato novo" hint="Quando você publica uma versão nova do contrato, ela aparece no painel.">
        <TextInput path={['contract', 'updateTitle']} label="Título" />
        <TextInput path={['contract', 'updateText']} label="Texto" long rows={2} />
        <TextInput path={['contract', 'accepted']} label="Aviso depois de aceitar" />
      </Group>
      <Group title="Resumo">
        <TextInput path={['panel', 'greeting']} label="Saudação" hint={NAME_HINT} />
        <TextInput path={['panel', 'title']} label="Título" />
        <TextInput path={['panel', 'topTier']} label="Frase quando ela chega na maior comissão" />
        <TextInput path={['panel', 'showcaseTitle']} label="Mostruário digital: título" />
        <TextInput path={['panel', 'showcaseText']} label="Mostruário digital: texto" long rows={2} />
        <TextInput path={['panel', 'installText']} label="Explicação para instalar o app da revenda" long rows={2} />
      </Group>
      <Group title="Maleta">
        <TextInput path={['kit', 'empty']} label="Quando ela não tem maleta aberta" long rows={2} />
        <TextInput path={['kit', 'soldOut']} label="Quando todas as peças foram vendidas" />
      </Group>
      <Group title="Registrar venda">
        <TextInput path={['sale', 'phoneHint']} label="Explicação do WhatsApp da cliente" />
        <TextInput path={['sale', 'registered']} label="Aviso de venda registrada" />
        <TextInput path={['sale', 'done']} label="Texto acima da mensagem para a cliente" long rows={2} />
        <TextInput path={['sale', 'undone']} label="Aviso de venda desfeita" />
      </Group>
      <Group title="Vendas e acertos">
        <TextInput path={['history', 'salesEmpty']} label="Quando ainda não há vendas na maleta" />
        <TextInput path={['history', 'settlementsEmpty']} label="Quando ainda não há acertos" />
      </Group>
      <Group title="Repasse" hint="A cliente paga à revendedora; no acerto, ela repassa à ÉKA o vendido menos a comissão. O valor, o Pix e os botões aparecem sozinhos.">
        <TextInput path={['repasse', 'cycleNote']} label="Explicação no resumo da maleta" long rows={2} />
        <TextInput path={['repasse', 'title']} label="Título do repasse depois do acerto" />
        <TextInput path={['repasse', 'text']} label="Texto acima do Pix" long rows={2} />
        <TextInput path={['repasse', 'noPix']} label="Quando a chave Pix da loja não está cadastrada" long rows={2} />
        <TextInput path={['repasse', 'reported']} label="Depois que ela avisa que pagou" long rows={2} />
        <TextInput path={['repasse', 'whatsapp']} label="Mensagem para enviar o comprovante" long rows={3} hint="{primeiro_nome} é o nome dela e {total} é o valor do repasse." />
        <TextInput path={['repasse', 'whatsappNoPix']} label="Mensagem quando não há chave Pix (para combinar o repasse)" long rows={3} hint="{primeiro_nome} é o nome dela e {total} é o valor do repasse." />
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
  pagamento: PagamentoForm,
  revenda: RevendaForm,
};
