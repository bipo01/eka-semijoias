import { useState } from 'react';
import { Clock, MapPin } from 'lucide-react';
import { PageHeader } from '../components/layout/PageHeader';
import { ButtonAnchor } from '../components/ui/Button';
import { TextArea } from '../components/ui/Field';
import { InstagramIcon, WhatsAppIcon } from '../components/ui/Icons';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useMessages } from '../hooks/useMessages';
import { whatsappUrl } from '../lib/whatsapp';

export function ContactPage() {
  useDocumentTitle('Contato');
  const biz = useBusiness();
  const contactMessage = useMessages()('contato');
  const [message, setMessage] = useState('');
  return (
    <div className="pb-16">
      <PageHeader eyebrow="Contato" title={<>Fale com a <em className="font-medium italic">gente</em></>} intro="Tire dúvidas, peça ajuda para escolher ou faça seu pedido. A gente responde pelo WhatsApp." />
      <div className="container-x grid gap-6 lg:grid-cols-2 lg:gap-10">
        <div className="flex flex-col gap-4">
          <ButtonAnchor href={whatsappUrl(biz.whatsapp, contactMessage)} size="lg" className="w-full sm:w-fit">
            <WhatsAppIcon size={22} /> Chamar no WhatsApp
          </ButtonAnchor>
          {biz.instagramUrl && (
            <ButtonAnchor href={biz.instagramUrl} variant="secondary" size="lg" className="w-full sm:w-fit">
              <InstagramIcon size={22} /> @{biz.instagram}
            </ButtonAnchor>
          )}
          {(biz.showroom || biz.openingHours || biz.city) && (
            <ul className="mt-2 flex flex-col gap-3 rounded-[12px] border border-line bg-white p-5">
              {(biz.showroom || biz.city) && (
                <li className="flex gap-3"><MapPin size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />{biz.showroom ?? biz.city}</li>
              )}
              {biz.openingHours && (
                <li className="flex gap-3"><Clock size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-copper" aria-hidden="true" />{biz.openingHours}</li>
              )}
            </ul>
          )}
        </div>
        <form
          className="flex flex-col gap-4 rounded-[12px] bg-champagne/70 p-5 lg:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            window.open(whatsappUrl(biz.whatsapp, message.trim() || contactMessage), '_blank', 'noopener,noreferrer');
          }}
        >
          <h2 className="font-display text-display-m">Mensagem rápida</h2>
          <TextArea label="Sua mensagem" rows={4} maxLength={600} placeholder="Olá! Queria saber…" value={message} onChange={(e) => setMessage(e.target.value)} />
          <button type="submit" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-copper px-6 font-medium text-white hover:bg-copper-dark">
            <WhatsAppIcon size={20} /> Enviar pelo WhatsApp
          </button>
        </form>
      </div>
    </div>
  );
}
