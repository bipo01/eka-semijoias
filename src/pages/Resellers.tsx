import { useRef, useState, type FormEvent } from 'react';
import { CheckCircle2, ChevronRight, Headset, MapPin, PiggyBank, Sparkles, User, Wallet } from 'lucide-react';
import { AccordionItem } from '../components/ui/Accordion';
import { ButtonAnchor, Button } from '../components/ui/Button';
import { SelectField, TextArea, TextField } from '../components/ui/Field';
import { InstagramIcon, WhatsAppIcon } from '../components/ui/Icons';
import { cx } from '../components/ui/cx';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { bannerSources } from '../lib/assets';
import { apiUrl } from '../lib/api';
import { leadFormSchema, leadVars, maskPhone, UFS, type LeadForm } from '../lib/lead';
import { useMessages } from '../hooks/useMessages';
import { whatsappUrl } from '../lib/whatsapp';

const STEPS = [
  { title: 'Cadastro', text: 'Preencha o pré-cadastro aqui embaixo, de forma rápida e simples.' },
  { title: 'Conversa e aprovação', text: 'A gente entra em contato pelo WhatsApp, tira suas dúvidas e aprova o seu cadastro.' },
  { title: 'Receba seu mostruário', text: 'Você recebe um mostruário ÉKA com as nossas principais peças e coleções.' },
  { title: 'Venda e ganhe', text: 'Apresente as semijoias, faça suas vendas e receba a sua comissão.' },
];

type Errors = Partial<Record<keyof LeadForm, string>>;

export function ResellersPage() {
  useDocumentTitle('Seja revendedora');
  const biz = useBusiness();
  const hero = bannerSources('images/lifestyle/l02-mostruario-revendedora');
  const benefits = [
    ...(biz.resellerProgram.noUpfrontInvestment ? [{ icon: PiggyBank, title: 'Sem investimento inicial', text: 'Comece sem precisar comprar estoque.' }] : []),
    { icon: Wallet, title: 'Comissão atrativa', text: 'Ganhe em cada venda que você fizer.' },
    { icon: Headset, title: 'Suporte e materiais', text: 'Orientação, catálogo e materiais de divulgação.' },
    { icon: Sparkles, title: 'Peças que encantam', text: 'Acabamento impecável que as clientes notam de longe.' },
  ].slice(0, 3);
  const tiers = biz.resellerProgram.commissionTiers;

  return (
    <div className="pb-16">
      <section aria-labelledby="rev-title" className="lg:container-x lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:pt-10">
        <div className="relative lg:order-2">
          <div className="aspect-[4/3] overflow-hidden bg-champagne lg:rounded-[12px]">
            <img src={hero.src} srcSet={hero.srcSet} sizes="(min-width: 1024px) 50vw, 100vw" alt="Mostruário de semijoias ÉKA aberto, com brincos, colares, anéis e pulseiras" width={1536} height={1024} fetchPriority="high" className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="container-x pt-6 lg:order-1 lg:px-0 lg:pt-0">
          <p className="eyebrow mb-2 text-ink-muted">Seja revendedora</p>
          <h1 id="rev-title" className="font-display text-display-l lg:text-display-xl">
            Renda extra com semijoias que <em className="font-medium italic">encantam</em>
          </h1>
          <p className="mt-4 max-w-lg text-lg text-ink">Torne-se uma revendedora ÉKA e conquiste mais liberdade financeira com peças de alta qualidade.</p>
          <a href="#pre-cadastro" className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-copper px-7 text-[1.0625rem] font-medium text-white hover:bg-copper-dark sm:w-auto">
            Quero ser revendedora <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </div>
      </section>

      <div className="container-x mt-12 grid gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-16">
        <section aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="font-display text-display-m md:text-display-l">Como funciona</h2>
          <ol className="relative mt-6 flex flex-col gap-6 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:w-px before:bg-rose">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative flex gap-4">
                <span className="price relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-rose bg-ivory text-sm text-copper">{i + 1}</span>
                <div>
                  <h3 className="font-sans text-base font-medium text-copper">{s.title}</h3>
                  <p className="text-ink-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section aria-labelledby="beneficios">
          <h2 id="beneficios" className="font-display text-display-m md:text-display-l">Por que revender ÉKA</h2>
          <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {benefits.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4 rounded-[12px] bg-champagne/70 p-5 sm:flex-col sm:items-center sm:text-center lg:flex-row lg:items-start lg:text-left">
                <Icon size={28} strokeWidth={1.25} className="shrink-0 text-copper" aria-hidden="true" />
                <div>
                  <h3 className="font-display text-title leading-tight">{title}</h3>
                  <p className="mt-1 text-sm text-ink-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {tiers.length > 0 && (
        <section aria-labelledby="comissao" className="container-x mt-12">
          <h2 id="comissao" className="font-display text-display-m">Comissão</h2>
          <table className="mt-4 w-full max-w-xl text-left">
            <thead><tr className="border-b border-line"><th className="py-2 font-medium">Vendas no mês</th><th className="py-2 font-medium">Comissão</th></tr></thead>
            <tbody>{tiers.map((t) => <tr key={t.label} className="border-b border-line"><td className="py-2">{t.label}</td><td className="price py-2">{t.commission}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <div className="container-x mt-12 grid gap-12 lg:mt-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <section aria-labelledby="rev-faq">
          <h2 id="rev-faq" className="mb-4 font-display text-display-m md:text-display-l">Dúvidas</h2>
          <div className="flex flex-col gap-2">
            <AccordionItem title="Preciso investir para começar?">
              <p>{biz.resellerProgram.noUpfrontInvestment ? 'Não. Você começa sem precisar comprar estoque.' : 'As condições para começar são explicadas na conversa de aprovação, sem compromisso.'}</p>
            </AccordionItem>
            <AccordionItem title="Como funciona o mostruário?">
              <p>{biz.resellerProgram.consignment ? 'Você recebe as peças em consignado e acerta só o que vender.' : 'Depois da aprovação, a gente combina com você o mostruário ideal para começar, com prazos e condições claros.'}</p>
            </AccordionItem>
            <AccordionItem title="Quanto eu ganho?">
              <p>{tiers.length ? 'Sua comissão aumenta conforme as suas vendas no mês. Veja a tabela acima.' : 'Você ganha uma comissão em cada venda. A gente apresenta os valores na conversa de aprovação.'}</p>
            </AccordionItem>
            {biz.shipsNationwide && (
              <AccordionItem title="Vocês atendem a minha cidade?">
                <p>Enviamos para todo o Brasil. Preencha o pré-cadastro que a gente confirma os detalhes para a sua região.</p>
              </AccordionItem>
            )}
          </div>
        </section>
        <LeadFormSection whatsapp={biz.whatsapp} />
      </div>
    </div>
  );
}

/**
 * Registers the lead on the server. Started before the WhatsApp window opens
 * (popups must open synchronously inside the click), with keepalive so it
 * completes even if the visitor leaves; resolves to whether it was stored.
 */
function sendLead(form: Record<string, unknown>): Promise<boolean> {
  return fetch(apiUrl('/api/leads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(form),
    keepalive: true,
  }).then(
    (res) => res.ok,
    () => false,
  );
}

function LeadFormSection({ whatsapp }: { whatsapp: string | null }) {
  const message = useMessages();
  const [form, setForm] = useState({ name: '', whatsapp: '', city: '', uf: '', instagram: '', alreadySells: null as boolean | null, source: '', consent: false });
  const [errors, setErrors] = useState<Errors>({});
  const [sentUrl, setSentUrl] = useState<string | null>(null);
  /** null while the registration is in flight; false when it could not be stored (the WhatsApp message still has everything). */
  const [stored, setStored] = useState<boolean | null>(null);
  const honeypot = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key as keyof Errors]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = leadFormSchema.safeParse({ ...form, alreadySells: form.alreadySells ?? undefined });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof LeadForm;
        next[key] ??= issue.message;
      }
      setErrors(next);
      // Move focus to the first invalid field so screen readers announce it.
      const first = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]');
      window.setTimeout(() => (formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [data-invalid="true"]') ?? first)?.focus(), 0);
      return;
    }
    const lead = parsed.data;
    // Both channels: the admin list (server) and the WhatsApp message, which carries every field.
    setStored(null);
    void sendLead({ ...form, alreadySells: lead.alreadySells, website: honeypot.current?.value ?? '' }).then(setStored);
    const url = whatsappUrl(whatsapp, message('revendedora', leadVars(lead)));
    window.open(url, '_blank', 'noopener,noreferrer');
    setSentUrl(url);
  };

  if (sentUrl) {
    return (
      <section id="pre-cadastro" aria-live="polite" className="flex flex-col items-center gap-4 rounded-[12px] border border-line bg-white p-8 text-center">
        <CheckCircle2 size={44} strokeWidth={1.25} className="text-success" aria-hidden="true" />
        <h2 className="font-display text-display-m">Pré-cadastro enviado!</h2>
        <p className="max-w-sm text-ink-muted">Agora é só enviar a mensagem que abriu no WhatsApp. A gente responde por lá para continuar o seu cadastro.</p>
        {stored === false && (
          <p className="max-w-sm text-sm text-ink-muted">Não conseguimos registrar o cadastro pelo site agora, mas tudo bem: a mensagem do WhatsApp já leva todos os seus dados.</p>
        )}
        <ButtonAnchor href={sentUrl} variant="secondary">
          <WhatsAppIcon size={20} /> Abrir o WhatsApp de novo
        </ButtonAnchor>
      </section>
    );
  }

  return (
    <section id="pre-cadastro" aria-labelledby="pre-cadastro-title" className="scroll-mt-24 rounded-[12px] border border-line bg-white p-5 lg:p-8">
      <h2 id="pre-cadastro-title" className="font-display text-display-m md:text-display-l">Pré-cadastro</h2>
      <p className="mt-1 text-ink-muted">Preencha seus dados e dê o primeiro passo para se tornar revendedora ÉKA.</p>
      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <TextField label="Nome completo" required autoComplete="name" icon={<User size={18} strokeWidth={1.5} />} value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="WhatsApp (com DDD)" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(67) 99999-9999" icon={<WhatsAppIcon size={18} />} value={form.whatsapp} error={errors.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} />
        <div className="grid grid-cols-[1fr_96px] gap-3">
          <TextField label="Cidade" required autoComplete="address-level2" icon={<MapPin size={18} strokeWidth={1.5} />} value={form.city} error={errors.city} onChange={(e) => set('city', e.target.value)} />
          <SelectField label="UF" required autoComplete="address-level1" value={form.uf} error={errors.uf} onChange={(e) => set('uf', e.target.value)}>
            <option value="">--</option>
            {UFS.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
          </SelectField>
        </div>
        <TextField label="Instagram" optional autoComplete="off" placeholder="@seuperfil" icon={<InstagramIcon size={18} />} value={form.instagram} error={errors.instagram} onChange={(e) => set('instagram', e.target.value)} />
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium">Já revende?<span aria-hidden="true" className="text-copper"> *</span></legend>
          <div role="radiogroup" aria-label="Já revende?" aria-describedby={errors.alreadySells ? 'sells-error' : undefined} data-invalid={errors.alreadySells ? 'true' : undefined} tabIndex={errors.alreadySells ? -1 : undefined} className={cx('grid grid-cols-2 rounded-full border p-1', errors.alreadySells ? 'border-danger' : 'border-line')}>
            {[false, true].map((v) => (
              <button key={String(v)} type="button" role="radio" aria-checked={form.alreadySells === v} onClick={() => set('alreadySells', v)} className={cx('min-h-11 rounded-full transition-colors', form.alreadySells === v ? 'bg-copper text-white' : 'text-ink hover:bg-champagne')}>
                {v ? 'Sim' : 'Não'}
              </button>
            ))}
          </div>
          {errors.alreadySells && <p id="sells-error" role="alert" className="mt-1.5 text-sm text-danger">{errors.alreadySells}</p>}
        </fieldset>
        <TextArea label="Como conheceu a ÉKA?" optional rows={2} maxLength={200} value={form.source} error={errors.source} onChange={(e) => set('source', e.target.value)} />
        <div>
          <label className="flex cursor-pointer items-start gap-3">
            <input type="checkbox" checked={form.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={errors.consent ? true : undefined} aria-describedby={errors.consent ? 'consent-error' : undefined} className="mt-0.5 size-5 shrink-0 accent-copper" />
            <span className="text-sm">Autorizo a ÉKA a entrar em contato comigo pelo WhatsApp sobre a revenda.<span aria-hidden="true" className="text-copper"> *</span></span>
          </label>
          {errors.consent && <p id="consent-error" role="alert" className="mt-1.5 text-sm text-danger">{errors.consent}</p>}
        </div>
        {/* Honeypot for bots: hidden from people and assistive tech. */}
        <div aria-hidden="true" className="absolute -left-[9999px] size-px overflow-hidden">
          <label>
            Site
            <input ref={honeypot} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>
        <Button type="submit" size="lg" block className="mt-2">
          Enviar pré-cadastro <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
        </Button>
      </form>
    </section>
  );
}

