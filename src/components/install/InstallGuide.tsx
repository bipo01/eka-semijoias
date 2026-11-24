import type { ReactNode } from 'react';
import { Copy, Ellipsis, EllipsisVertical, MonitorDown, Share, SquarePlus } from 'lucide-react';
import { APP_HEAD, type InstallApp, type InstallGuide as GuideKind, type InstallPlatform } from '../../lib/install';
import { toast } from '../../store/ui';
import { Button } from '../ui/Button';
import { Sheet } from '../ui/Sheet';
import { copyText } from './copyText';

const icon = { size: 18, strokeWidth: 1.75, 'aria-hidden': true, className: 'inline-block align-[-3px] text-copper' } as const;

/** Browser menu buttons have no visible name; screen readers get one. */
const MoreButton = () => (
  <>
    <Ellipsis {...icon} />
    <span className="sr-only">(mais opções)</span>
  </>
);
const MenuButton = () => (
  <>
    <EllipsisVertical {...icon} />
    <span className="sr-only">(menu do navegador)</span>
  </>
);

/**
 * A real screenshot of the step (iPhone 17 · iOS 26 · Safari, Pixel 7 · Android 16 · Chrome), cropped,
 * with a copper ring on what to tap. Made by scripts/install-guide-images.mjs from assets/install-guide/.
 */
interface Photo {
  src: string;
  alt: string;
  width: number;
  height: number;
}

interface Step {
  text: ReactNode;
  hint?: ReactNode;
  photo?: Photo;
}

const PHOTO_WIDTH = 640;
const photo = (name: string, height: number, alt: string): Photo => ({ src: `/images/install/${name}.webp`, alt, width: PHOTO_WIDTH, height });
const APP_SUFFIX: Record<InstallApp, string> = { store: 'store', admin: 'admin', reseller: 'reseller' };

interface GuideContent {
  lead?: ReactNode;
  steps: Step[];
  /** Offer "Copiar link" (the page cannot be installed from this browser). */
  copy?: { browser: string };
}

function content(guide: GuideKind, platform: InstallPlatform, app: InstallApp): GuideContent {
  switch (guide) {
    case 'ios-safari': {
      const name = APP_HEAD[app].appleTitle;
      return {
        steps: [
          {
            text: (
              <>
                Toque em <MoreButton />, no canto de baixo da tela.
              </>
            ),
            // iOS 26 moved Share into the "•••" menu; older versions keep it on the Safari bar.
            // Safari 26 freezes the system version in its user agent, so the guide covers both.
            hint: (
              <>
                Em iPhones mais antigos, o <Share {...icon} /> <strong>Compartilhar</strong> fica direto na barra do Safari: toque nele e pule para o passo 3.
              </>
            ),
            photo: photo('ios-1', 266, 'Barra do Safari com o botão de três pontinhos marcado.'),
          },
          {
            text: (
              <>
                Toque em <Share {...icon} /> <strong>Compartilhar</strong>.
              </>
            ),
            photo: photo('ios-2', 476, 'Menu do Safari com Compartilhar marcado.'),
          },
          {
            text: (
              <>
                Toque em <strong>Ver mais</strong>.
              </>
            ),
            hint: 'Se “Adicionar à Tela de Início” já aparecer, pule este passo.',
            photo: photo('ios-3', 456, 'Tela de compartilhar com o botão Ver mais marcado.'),
          },
          {
            text: (
              <>
                Toque em <SquarePlus {...icon} /> <strong>Adicionar à Tela de Início</strong>.
              </>
            ),
            photo: photo('ios-4', 361, 'Lista de ações com Adicionar à Tela de Início marcado.'),
          },
          {
            text: (
              <>
                Toque em <strong>Adicionar</strong>, no canto de cima.
              </>
            ),
            photo: photo(`ios-5-${APP_SUFFIX[app]}`, 318, `Tela Adicionar à Tela de Início com o nome ${name} e o botão Adicionar marcado.`),
          },
          {
            text: (
              <>
                Pronto: o ícone <strong>{name}</strong> fica na sua tela de início.
              </>
            ),
            photo: photo(`ios-6-${APP_SUFFIX[app]}`, 175, `Tela de início do iPhone com o ícone ${name} marcado.`),
          },
        ],
      };
    }
    case 'ios-chrome':
      return {
        steps: [
          {
            text: (
              <>
                Toque em <Share {...icon} /> <strong>Compartilhar</strong>, ao lado do endereço, no alto da tela.
              </>
            ),
          },
          {
            text: (
              <>
                Toque em <SquarePlus {...icon} /> <strong>Adicionar à Tela de Início</strong>.
              </>
            ),
            hint: 'Se não estiver à vista, role a lista para baixo.',
          },
          { text: <>Toque em <strong>Adicionar</strong>.</> },
        ],
      };
    case 'ios-other':
      return {
        steps: [
          {
            text: (
              <>
                Abra o menu do navegador <MoreButton /> e toque em <Share {...icon} /> <strong>Compartilhar</strong>.
              </>
            ),
          },
          {
            text: (
              <>
                Toque em <SquarePlus {...icon} /> <strong>Adicionar à Tela de Início</strong>.
              </>
            ),
          },
          { text: <>Toque em <strong>Adicionar</strong>.</> },
        ],
        copy: { browser: 'Safari' },
      };
    case 'in-app': {
      const app = platform.kind === 'in-app' ? platform.app : 'aplicativo';
      const browser = platform.kind === 'in-app' && !platform.ios ? 'Chrome' : 'Safari';
      return {
        lead: (
          <>
            Pelo navegador do {app} não dá para instalar. Abra esta página no {browser}:
          </>
        ),
        steps: [
          {
            text: (
              <>
                Toque em {browser === 'Safari' ? <MoreButton /> : <MenuButton />} no canto da tela.
              </>
            ),
          },
          {
            text: (
              <>
                Escolha <strong>Abrir no navegador</strong> ou <strong>Abrir no {browser}</strong>.
              </>
            ),
          },
          { text: <>Lá, toque em <strong>Instalar o app</strong> de novo.</> },
        ],
        copy: { browser },
      };
    }
    case 'mac-safari':
      return {
        steps: [
          { text: <>Na barra de menus, abra <strong>Arquivo</strong>.</> },
          { text: <>Escolha <strong>Adicionar ao Dock</strong>.</> },
          { text: <>Confirme em <strong>Adicionar</strong>.</> },
        ],
      };
    case 'desktop-manual':
      return {
        steps: [
          {
            text: (
              <>
                Na barra de endereço, clique no ícone <MonitorDown {...icon} />
                <span className="sr-only">(instalar)</span>, do lado direito.
              </>
            ),
            hint: (
              <>
                Se ele não aparecer, abra o menu <MenuButton /> do navegador e procure a opção de <strong>instalar</strong> (no Chrome, fica em{' '}
                <strong>Salvar e compartilhar</strong>).
              </>
            ),
          },
          {
            text: (
              <>
                Confirme em <strong>Instalar</strong>.
              </>
            ),
          },
        ],
      };
    case 'android-manual': {
      const name = APP_HEAD[app].appleTitle === 'ÉKA' ? 'ÉKA Semijoias' : APP_HEAD[app].appleTitle;
      return {
        steps: [
          {
            text: (
              <>
                Toque em <MenuButton />, no canto de cima do navegador.
              </>
            ),
            photo: photo('android-1', 140, 'Barra do Chrome com o botão de menu (três pontinhos) marcado.'),
          },
          {
            text: (
              <>
                Toque em <strong>Adicionar à tela inicial</strong>.
              </>
            ),
            hint: (
              <>
                Em alguns celulares aparece <strong>Instalar app</strong>: pode tocar nele.
              </>
            ),
            photo: photo('android-2', 592, 'Menu do Chrome com Adicionar à tela inicial marcado.'),
          },
          {
            text: (
              <>
                Confirme em <strong>Instalar</strong>.
              </>
            ),
            hint: 'Se o celular perguntar, escolha Instalar (e não Criar atalho).',
            photo: photo(`android-3-${APP_SUFFIX[app]}`, 347, `Janela Instalar aplicativo com ${name} e o botão Instalar marcado.`),
          },
        ],
      };
    }
  }
}

export const GUIDE_TITLE: Record<InstallApp, string> = {
  store: 'Instalar o app da ÉKA',
  admin: 'Instalar o Painel ÉKA',
  reseller: 'Instalar o ÉKA Revenda',
};

const INTRO: Record<InstallApp, string> = {
  store: 'Com o app, a gente fica na sua tela de início: um toque e você vê as peças em tela cheia.',
  admin: 'O painel ganha um ícone próprio na tela de início e abre direto nos pedidos.',
  reseller: 'Seu painel de revendedora fica na tela de início: um toque e você vê a maleta e registra as vendas.',
};

interface InstallGuideProps {
  open: boolean;
  app: InstallApp;
  guide: GuideKind;
  platform: InstallPlatform;
  /** Link that "Copiar link" copies (the page to open in Safari/Chrome). */
  link: string;
  onClose: () => void;
  /** "Agora não": close and hide the invitation for a while. */
  onDismiss: () => void;
  /** Text at the top (the app's built-in text when not given; empty hides it). */
  intro?: string;
}

export function InstallGuide({ open, app, guide, platform, link, onClose, onDismiss, intro = INTRO[app] }: InstallGuideProps) {
  const { lead, steps, copy } = content(guide, platform, app);

  const copyLink = async () => {
    if (await copyText(link)) toast(`Link copiado. Agora é só colar no ${copy?.browser ?? 'navegador'}.`, { tone: 'success' });
    else toast('Não deu para copiar. Toque e segure o link abaixo para copiar.', { tone: 'error' });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={GUIDE_TITLE[app]}
      side="bottom"
      className="md-center text-ink"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={onDismiss}>
            Agora não
          </Button>
          {copy ? (
            <Button onClick={() => void copyLink()}>
              <Copy size={18} strokeWidth={1.75} aria-hidden="true" /> Copiar link
            </Button>
          ) : (
            <Button onClick={onClose}>Entendi</Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5" data-install-guide={guide}>
        {intro && <p className="text-ink-muted">{intro}</p>}
        {lead && <p>{lead}</p>}
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-champagne font-medium text-copper">
                {i + 1}
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
                <span>{step.text}</span>
                {step.hint && <span className="text-sm text-ink-muted">{step.hint}</span>}
                {step.photo && (
                  <img
                    src={step.photo.src}
                    alt={step.photo.alt}
                    width={step.photo.width}
                    height={step.photo.height}
                    loading="lazy"
                    decoding="async"
                    className="mt-2 h-auto w-full max-w-[320px] rounded-[12px] border border-line bg-champagne/40"
                  />
                )}
              </span>
            </li>
          ))}
        </ol>
        {copy && (
          <div className="flex flex-col gap-1.5">
            <p className="text-sm text-ink-muted">
              {guide === 'ios-other' ? `Se a opção não aparecer, abra no ${copy.browser}. Copie o link:` : `Se preferir, copie o link e cole no ${copy.browser}:`}
            </p>
            <p className="rounded-[10px] border border-line bg-white px-3 py-2 text-sm break-all select-all">{link}</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
