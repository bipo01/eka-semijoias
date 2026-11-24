import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Gem, Headset, MapPin, PiggyBank, Sparkles, User, Wallet } from 'lucide-react';
import { Highlighted } from '../components/layout/PageHeader';
import { AccordionItem } from '../components/ui/Accordion';
import { ButtonAnchor, Button } from '../components/ui/Button';
import { SelectField, TextArea, TextField } from '../components/ui/Field';
import { InstagramIcon, WhatsAppIcon } from '../components/ui/Icons';
import { cx } from '../components/ui/cx';
import { useBusiness } from '../hooks/useBusiness';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useSection } from '../hooks/useSection';
import { siteImageSources } from '../lib/assets';
import { apiUrl } from '../lib/api';
import { leadFormSchema, leadVars, maskPhone, UFS, type LeadForm } from '../lib/lead';
import { useMessages } from '../hooks/useMessages';
import { whatsappUrl } from '../lib/whatsapp';

/** Icons of the built-in benefits (by id, so they keep their icon when one is left out by the facts); others by position. */
const BENEFIT_ICON: Record<string, typeof Wallet> = { 'b-investimento': PiggyBank, 'b-comissao': Wallet, 'b-suporte': Headset, 'b-pecas': Sparkles };
const BENEFIT_ICONS = [Wallet, Headset, Sparkles];
const benefitIcon = (id: string, i: number) => BENEFIT_ICON[id] ?? BENEFIT_ICONS[i] ?? Gem;
const ownerText = 'whitespace-pre-line [overflow-wrap:anywhere]';

type Errors = Partial<Record<keyof LeadForm, string>>;

export function ResellersPage() {
  useDocumentTitle('Seja revendedora');
  const biz = useBusiness();
  const page = useSection('revendedoras');
  const hero = siteImageSources(page.hero.image, 'banner');
  const tiers = biz.resellerProgram.commissionTiers;

  return (
    <div className="pb-16">
      <section aria-labelledby="rev-title" className="lg:container-x lg:grid lg:grid-cols-2 lg:items-center lg:gap-12 lg:pt-10">
        <div className="relative lg:order-2">
          <div className="aspect-[4/3] overflow-hidden bg-champagne lg:rounded-[12px]">
            <img src={hero.src} srcSet={hero.srcSet} sizes="(min-width: 1024px) 50vw, 100vw" alt={page.hero.image.alt} width={1536} height={1024} fetchPriority="high" className="h-full w-full object-cover" />
          </div>
        </div>
        <div className="container-x pt-6 lg:order-1 lg:px-0 lg:pt-0">
          {page.hero.eyebrow && <p className="eyebrow mb-2 text-ink-muted">{page.hero.eyebrow}</p>}
          <h1 id="rev-title" className="font-display text-display-l break-words lg:text-display-xl">
            <Highlighted title={page.hero.title} highlight={page.hero.highlight} />
          </h1>
          {page.hero.text && <p className={`mt-4 max-w-lg text-lg text-ink ${ownerText}`}>{page.hero.text}</p>}
          <a href="#pre-cadastro" className="mt-6 inline-flex min-h-13 w-full items-center justify-center gap-2 rounded-full bg-copper px-7 text-[1.0625rem] font-medium text-white hover:bg-copper-dark sm:w-auto">
            {page.hero.cta} <ChevronRight size={18} strokeWidth={1.5} aria-hidden="true" />
          </a>
        </div>
      </section>

      {(page.steps.length > 0 || page.benefits.length > 0) && (
        <div className="container-x mt-12 grid gap-12 lg:mt-20 lg:grid-cols-2 lg:gap-16">
          {page.steps.length > 0 && (
            <section aria-labelledby="como-funciona" className="min-w-0">
              <h2 id="como-funciona" className="font-display text-display-m break-words md:text-display-l">{page.stepsTitle}</h2>
              <ol className="relative mt-6 flex flex-col gap-6 before:absolute before:top-4 before:bottom-4 before:left-[15px] before:w-px before:bg-rose">
                {page.steps.map((s, i) => (
                  <li key={s.id} className="relative flex gap-4">
                    <span className="price relative z-10 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-rose bg-ivory text-sm text-copper">{i + 1}</span>
                    <div className="min-w-0">
                      <h3 className="font-sans text-base font-medium break-words text-copper">{s.title}</h3>
                      {s.text && <p className={`text-ink-muted ${ownerText}`}>{s.text}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          )}
          {page.benefits.length > 0 && (
            <section aria-labelledby="beneficios" className="min-w-0">
              <h2 id="beneficios" className="font-display text-display-m break-words md:text-display-l">{page.benefitsTitle}</h2>
              <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
                {page.benefits.map((b, i) => {
                  const Icon = benefitIcon(b.id, i);
                  return (
                    <li key={b.id} className="flex items-start gap-4 rounded-[12px] bg-champagne/70 p-5 sm:flex-col sm:items-center sm:text-center lg:flex-row lg:items-start lg:text-left">
                      <Icon size={28} strokeWidth={1.25} className="shrink-0 text-copper" aria-hidden="true" />
                      <div className="min-w-0">
                        <h3 className="font-display text-title leading-tight break-words">{b.title}</h3>
                        {b.text && <p className={`mt-1 text-sm text-ink-muted ${ownerText}`}>{b.text}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      )}

      {tiers.length > 0 && (
        <section aria-labelledby="comissao" className="container-x mt-12">
          <h2 id="comissao" className="font-display text-display-m">Comissão</h2>
          <table className="mt-4 w-full max-w-xl text-left">
            <thead><tr className="border-b border-line"><th className="py-2 font-medium">Vendas no mês</th><th className="py-2 font-medium">Comissão</th></tr></thead>
            <tbody>{tiers.map((t) => <tr key={t.label} className="border-b border-line"><td className="py-2">{t.label}</td><td className="price py-2">{t.commission}</td></tr>)}</tbody>
          </table>
        </section>
      )}

      <div className={cx('container-x mt-12 grid gap-12 lg:mt-20 lg:gap-16', page.faq.length ? 'lg:grid-cols-[1fr_1.1fr]' : 'lg:grid-cols-[minmax(0,42rem)] lg:justify-center')}>
        {page.faq.length > 0 && (
          <section aria-labelledby="rev-faq" className="min-w-0">
            <h2 id="rev-faq" className="mb-4 font-display text-display-m break-words md:text-display-l">{page.faqTitle}</h2>
            <div className="flex flex-col gap-2">
              {page.faq.map((item) => (
                <AccordionItem key={item.id} title={item.question}>
                  <p className={ownerText}>{item.answer}</p>
                </AccordionItem>
              ))}
            </div>
          </section>
        )}
        <LeadFormSection whatsapp={biz.whatsapp} title={page.formTitle} intro={page.formIntro} />
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

const EMPTY_LEAD = { name: '', whatsapp: '', city: '', uf: '', instagram: '', alreadySells: null as boolean | null, source: '', consent: false };
/**
 * What she typed, kept in memory while she reads the privacy policy (same tab) and comes back.
 * In memory only: a reload or a new visit starts empty, nothing personal is stored in the browser.
 */
let leadDraft: typeof EMPTY_LEAD | null = null;

function LeadFormSection({ whatsapp, title, intro }: { whatsapp: string | null; title: string; intro: string }) {
  const message = useMessages();
  const [form, setForm] = useState(() => leadDraft ?? EMPTY_LEAD);
  useEffect(() => {
    leadDraft = form;
  }, [form]);
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
    leadDraft = null;
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
      <h2 id="pre-cadastro-title" className="font-display text-display-m break-words md:text-display-l">{title}</h2>
      {intro && <p className={`mt-1 text-ink-muted ${ownerText}`}>{intro}</p>}
      <form ref={formRef} noValidate onSubmit={submit} className="mt-6 flex flex-col gap-4">
        <TextField label="Nome completo" required autoComplete="name" icon={<User size={18} strokeWidth={1.5} />} value={form.name} error={errors.name} onChange={(e) => set('name', e.target.value)} />
        <TextField label="WhatsApp (com DDD)" required type="tel" inputMode="tel" autoComplete="tel-national" placeholder="(65) 99999-9999" icon={<WhatsAppIcon size={18} />} value={form.whatsapp} error={errors.whatsapp} onChange={(e) => set('whatsapp', maskPhone(e.target.value))} />
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
            <span className="text-sm">
              Autorizo a ÉKA a entrar em contato comigo pelo WhatsApp sobre a revenda.<span aria-hidden="true" className="text-copper"> *</span>{' '}
              <span className="text-ink-muted">
                Veja a nossa{' '}
                <Link to="/privacidade" className="text-copper underline underline-offset-4 hover:text-copper-dark">
                  política de privacidade
                </Link>
                .
              </span>
            </span>
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

