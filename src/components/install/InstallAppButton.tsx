import { useState } from 'react';
import { createPortal } from 'react-dom';
import { MonitorDown, Smartphone } from 'lucide-react';
import { useInstallPrompt } from '../../hooks/useInstallPrompt';
import type { InstallApp, InstallGuide as InstallGuideKind } from '../../lib/install';
import { cx } from '../ui/cx';
import { InstallGuide } from './InstallGuide';

export type InstallButtonVariant = 'menu' | 'footer' | 'list';

const VARIANT: Record<InstallButtonVariant, { className: string; icon: number }> = {
  /** Pill, like the WhatsApp/Instagram buttons in the store menu. */
  menu: { className: 'inline-flex min-h-11 items-center gap-2 rounded-full border border-line px-4 text-sm hover:border-copper', icon: 18 },
  /** Text link on the dark footer. */
  footer: { className: 'inline-flex min-h-11 items-center gap-2.5 text-on-dark/90 hover:text-rose-light', icon: 20 },
  /** Full-width row, like the items of the admin side menu. */
  list: { className: 'flex min-h-12 w-full items-center gap-3 rounded-[10px] px-2 text-left hover:bg-champagne', icon: 20 },
};

const LABEL: Record<InstallApp, string> = {
  store: 'Instalar o app',
  admin: 'Instalar o Painel ÉKA',
};

interface InstallAppButtonProps {
  /** Which app to install: the store (default) or the owner's panel (use on /admin pages). */
  app?: InstallApp;
  variant?: InstallButtonVariant;
  className?: string;
}

/**
 * Discreet "Instalar o app" entry point. Opens the browser's install prompt where there is one
 * (Android, desktop Chrome/Edge) or a step-by-step guide (iPhone, in-app browsers, Safari on Mac).
 * Renders nothing when the app is installed, the browser cannot install it, or the visitor chose
 * "Agora não" in the last 30 days.
 */
export function InstallAppButton({ app = 'store', variant = 'menu', className }: InstallAppButtonProps) {
  const { platform, method, promptInstall, dismiss } = useInstallPrompt(app);
  const [guideOpen, setGuideOpen] = useState(false);
  // The guide stays mounted once opened, so it can play its closing transition.
  const [guide, setGuide] = useState<InstallGuideKind | null>(null);

  if (method.kind === 'none' && !guideOpen) return null;

  const style = VARIANT[variant];
  const Icon = platform.kind === 'desktop' || platform.kind === 'mac-safari' ? MonitorDown : Smartphone;
  const link = app === 'admin' ? `${window.location.origin}/admin` : window.location.href;

  const onClick = () => {
    if (method.kind === 'prompt') void promptInstall();
    else if (method.kind === 'guide') {
      setGuide(method.guide);
      setGuideOpen(true);
    }
  };

  return (
    <>
      {method.kind !== 'none' && (
        <button type="button" onClick={onClick} className={cx(style.className, className)}>
          <Icon size={style.icon} strokeWidth={1.5} aria-hidden="true" />
          {LABEL[app]}
        </button>
      )}
      {/* Portaled: the footer is dark and a <dialog> inherits its text color. */}
      {guide &&
        createPortal(
          <InstallGuide
            open={guideOpen}
            app={app}
            guide={guide}
            platform={platform}
            link={link}
            onClose={() => setGuideOpen(false)}
            onDismiss={() => {
              setGuideOpen(false);
              dismiss();
            }}
          />,
          document.body,
        )}
    </>
  );
}
