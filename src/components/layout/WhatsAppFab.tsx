import { useBusiness } from '../../hooks/useBusiness';
import { useMessages } from '../../hooks/useMessages';
import { whatsappUrl } from '../../lib/whatsapp';
import { useUi } from '../../store/ui';
import { WhatsAppIcon } from '../ui/Icons';

export function WhatsAppFab() {
  const biz = useBusiness();
  const contactMessage = useMessages()('contato');
  const hidden = useUi((s) => s.openDialogs > 0);
  if (hidden) return null;
  return (
    <a
      href={whatsappUrl(biz.whatsapp, contactMessage)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Fale com a gente pelo WhatsApp"
      className="fixed right-[max(16px,env(safe-area-inset-right))] bottom-[calc(16px+var(--safe-bottom))] z-30 inline-flex size-13 items-center justify-center rounded-full bg-copper text-white shadow-[var(--shadow-1)] transition-colors hover:bg-copper-dark"
    >
      <WhatsAppIcon size={26} />
    </a>
  );
}
