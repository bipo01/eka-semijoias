import type { ReactNode } from 'react';
import { Copy, Ellipsis, EllipsisVertical, Share, SquarePlus } from 'lucide-react';
import type { InstallApp, InstallGuide as GuideKind, InstallPlatform } from '../../lib/install';
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

interface Step {
  text: ReactNode;
  hint?: ReactNode;
}

interface GuideContent {
  lead?: ReactNode;
  steps: Step[];
  /** Offer "Copiar link" (the page cannot be installed from this browser). */
  copy?: { browser: string };
}

function content(guide: GuideKind, platform: InstallPlatform): GuideContent {
  switch (guide) {
    case 'ios-safari':
      return {
        steps: [
          {
            text: (
              <>
                Toque em <Share {...icon} /> <strong>Compartilhar</strong>, na barra do Safari.
              </>
            ),
            hint: (
              <>
                Não achou? Toque antes em <MoreButton />.
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
          { text: <>Toque em <strong>Adicionar</strong>, no canto de cima.</> },
        ],
      };
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
    case 'android-manual':
      return {
        steps: [
          {
            text: (
              <>
                Toque em <MenuButton />, no canto de cima do navegador.
              </>
            ),
          },
          {
            text: (
              <>
                Toque em <strong>Instalar app</strong> ou <strong>Adicionar à tela inicial</strong>.
              </>
            ),
          },
          { text: <>Confirme em <strong>Instalar</strong>.</> },
        ],
      };
  }
}

export const GUIDE_TITLE: Record<InstallApp, string> = {
  store: 'Instalar o app da ÉKA',
  admin: 'Instalar o Painel ÉKA',
};

const INTRO: Record<InstallApp, string> = {
  store: 'Com o app, a gente fica na sua tela de início: um toque e você vê as peças em tela cheia.',
  admin: 'O painel ganha um ícone próprio na tela de início e abre direto nos pedidos.',
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
}

export function InstallGuide({ open, app, guide, platform, link, onClose, onDismiss }: InstallGuideProps) {
  const { lead, steps, copy } = content(guide, platform);

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
        <p className="text-ink-muted">{INTRO[app]}</p>
        {lead && <p>{lead}</p>}
        <ol className="flex flex-col gap-4">
          {steps.map((step, i) => (
            <li key={i} className="flex gap-3">
              <span aria-hidden="true" className="flex size-7 shrink-0 items-center justify-center rounded-full bg-champagne font-medium text-copper">
                {i + 1}
              </span>
              <span className="flex flex-col gap-0.5 pt-0.5">
                <span>{step.text}</span>
                {step.hint && <span className="text-sm text-ink-muted">{step.hint}</span>}
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
