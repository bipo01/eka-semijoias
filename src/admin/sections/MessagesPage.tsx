import { Fragment, useRef, useState, type ReactNode } from 'react';
import { Check, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { TextField } from '../../components/ui/Field';
import { Sheet } from '../../components/ui/Sheet';
import { cx } from '../../components/ui/cx';
import {
  activeTemplate,
  MAX_CUSTOM_TEMPLATES,
  MAX_TEMPLATE_CHARS,
  MESSAGE_TYPE_INFO,
  MESSAGE_TYPES,
  missingRequired,
  PRESET_TEMPLATES,
  renderTemplate,
  sampleVars,
  templatesFor,
  unknownVariables,
  VARIABLES,
  type MessageSettings,
  type MessageType,
  type TemplateOption,
} from '../../data/messages';
import { useCatalog } from '../../store/catalog';
import { save } from '../lib/persist';

/*
 * Painel → Mensagens: every WhatsApp message of the store, each with built-in
 * variations and the owner's own. She picks the default variation, edits texts
 * with one-tap variables and sees a live preview with example data.
 */

const EMPTY: MessageSettings = { active: {}, edited: {}, custom: [] };

/** WhatsApp-style formatting for the preview: *negrito* and _itálico_ (React nodes, no HTML injection). */
function WhatsAppText({ text }: { text: string }) {
  return (
    <>
      {/* Keep "R$ 289,90" together when the bubble wraps. */}
      {text.replace(/R\$ /g, 'R$\u00a0').split('\n').map((line, i) => (
        <Fragment key={i}>
          {i > 0 && <br />}
          {line.split(/(\*[^*\n]+\*|_[^_\n]+_)/g).map((part, j) =>
            /^\*[^*]+\*$/.test(part) ? (
              <strong key={j} className="font-semibold">
                {part.slice(1, -1)}
              </strong>
            ) : /^_[^_]+_$/.test(part) ? (
              <em key={j}>{part.slice(1, -1)}</em>
            ) : (
              <Fragment key={j}>{part}</Fragment>
            ),
          )}
        </Fragment>
      ))}
    </>
  );
}

/** A chat bubble like WhatsApp's, in the brand colors. */
function Bubble({ text, side, clamp }: { text: string; side: 'cliente' | 'loja'; clamp?: boolean }) {
  return (
    <div className={cx('flex', side === 'loja' ? 'justify-end' : 'justify-start')}>
      <div
        className={cx(
          'relative max-w-[92%] min-w-0 rounded-[14px] px-3.5 py-2.5 text-[0.875rem] leading-relaxed [overflow-wrap:anywhere] text-ink shadow-[0_1px_1px_rgb(43_29_24/0.08)]',
          side === 'loja' ? 'rounded-tr-[4px] bg-champagne' : 'rounded-tl-[4px] bg-white',
          clamp && 'max-h-40 overflow-hidden [mask-image:linear-gradient(to_bottom,black_70%,transparent)]',
        )}
      >
        <WhatsAppText text={text || ' '} />
        <span className="mt-1 block text-right text-[0.6875rem] text-ink-muted">10:42</span>
      </div>
    </div>
  );
}

const typesOf = (group: 'cliente' | 'loja' | 'revenda') => MESSAGE_TYPES.filter((t) => MESSAGE_TYPE_INFO[t].group === group);

function MessageCard({ type, settings, onEdit }: { type: MessageType; settings: MessageSettings; onEdit: () => void }) {
  const info = MESSAGE_TYPE_INFO[type];
  const active = activeTemplate(settings, type);
  const count = templatesFor(settings, type).length;
  return (
    <li className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{info.label}</h3>
          <p className="text-sm text-ink-muted">{info.description}</p>
        </div>
        <span className="shrink-0 rounded-full bg-champagne px-2.5 py-1 text-xs whitespace-nowrap text-ink">{active.name}</span>
      </div>
      <div className="rounded-[12px] bg-[#efe7df] p-3">
        <Bubble text={renderTemplate(active.text, sampleVars(type))} side={info.group === 'cliente' || type === 'mostruario' ? 'cliente' : 'loja'} clamp />
      </div>
      <Button variant="secondary" onClick={onEdit} className="self-start" size="sm">
        <Sparkles size={16} strokeWidth={1.5} /> Personalizar · {count} {count === 1 ? 'variação' : 'variações'}
      </Button>
    </li>
  );
}

const newId = () => `custom.${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

function TemplateEditor({ type, settings, onClose }: { type: MessageType; settings: MessageSettings; onClose: () => void }) {
  const info = MESSAGE_TYPE_INFO[type];
  const [draft, setDraft] = useState<MessageSettings>(() => structuredClone(settings));
  const options = templatesFor(draft, type);
  const [selectedId, setSelectedId] = useState(() => activeTemplate(settings, type).id);
  const selected = options.find((t) => t.id === selectedId) ?? options[0]!;
  const activeId = activeTemplate(draft, type).id;
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  const unknown = unknownVariables(selected.text, type);
  const missing = missingRequired(selected.text, type);
  const invalid = options.filter((t) => missingRequired(t.text, type).length || !t.text.trim());
  const preview = renderTemplate(selected.text, sampleVars(type));
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);
  const customCount = draft.custom.length;

  const setText = (option: TemplateOption, text: string) =>
    setDraft((d) => {
      if (!option.preset) return { ...d, custom: d.custom.map((c) => (c.id === option.id ? { ...c, text } : c)) };
      const edited = { ...d.edited };
      if (text === option.original) delete edited[option.id];
      else edited[option.id] = text;
      return { ...d, edited };
    });

  const insert = (name: string) => {
    const el = area.current;
    const token = `{${name}}`;
    const start = el?.selectionStart ?? selected.text.length;
    const end = el?.selectionEnd ?? selected.text.length;
    const text = (selected.text.slice(0, start) + token + selected.text.slice(end)).slice(0, MAX_TEMPLATE_CHARS);
    setText(selected, text);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  const addVariation = () => {
    if (customCount >= MAX_CUSTOM_TEMPLATES) return;
    const id = newId();
    const mine = draft.custom.filter((c) => c.type === type).length;
    setDraft((d) => ({ ...d, custom: [...d.custom, { id, type, name: `Minha variação ${mine + 1}`, text: selected.text }] }));
    setSelectedId(id);
  };

  const removeVariation = () => {
    setDraft((d) => {
      const active = { ...d.active };
      if (active[type] === selected.id) delete active[type];
      return { ...d, active, custom: d.custom.filter((c) => c.id !== selected.id) };
    });
    setSelectedId(options[0]!.id);
    setConfirmDelete(false);
  };

  async function submit() {
    if (busy || invalid.length) return;
    setBusy(true);
    const ok = await save(
      (d) => {
        // Merge only this type into the latest settings: edits of other types (maybe from another
        // device) are kept. Only what differs from the built-in defaults is stored.
        const current = d.settings.messages ?? EMPTY;
        const presetIds = new Set(PRESET_TEMPLATES.filter((p) => p.type === type).map((p) => p.id));
        const defaultId = PRESET_TEMPLATES.find((p) => p.type === type)?.id;
        const active = { ...current.active };
        const chosen = draft.active[type];
        if (chosen && chosen !== defaultId) active[type] = chosen;
        else delete active[type];
        const edited = Object.fromEntries([
          ...Object.entries(current.edited).filter(([id]) => !presetIds.has(id)),
          ...Object.entries(draft.edited).filter(([id]) => presetIds.has(id)),
        ]);
        const custom = [
          ...current.custom.filter((c) => c.type !== type),
          ...draft.custom.filter((c) => c.type === type).map((c) => ({ ...c, name: c.name.trim() || 'Sem nome' })),
        ];
        const next: MessageSettings = { active, edited, custom };
        // Cleared explicitly (an empty object): a missing field means "keep" for the server (worker/catalog.ts).
        return { ...d, settings: { ...d.settings, messages: next } };
      },
      'Mensagens salvas. O site já usa o texto novo.',
    );
    setBusy(false);
    if (ok) onClose();
  }

  const varNames = info.vars;
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-ink-muted">{info.description}</p>

      <div>
        <p className="mb-2 text-sm font-medium">Variações</p>
        <div role="group" aria-label="Variações" className="flex flex-wrap gap-2">
          {options.map((t) => (
            <button
              key={t.id}
              type="button"
              aria-pressed={t.id === selected.id}
              onClick={() => setSelectedId(t.id)}
              className={cx(
                'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors',
                t.id === selected.id ? 'border-copper bg-copper text-white' : 'border-line bg-white text-ink hover:border-copper',
              )}
            >
              {t.id === activeId && <Check size={14} strokeWidth={2} aria-label="Em uso" />}
              {t.name}
              {t.edited && <span className={cx('text-xs', t.id === selected.id ? 'text-white/80' : 'text-ink-muted')}>· editada</span>}
            </button>
          ))}
          <button
            type="button"
            onClick={addVariation}
            disabled={customCount >= MAX_CUSTOM_TEMPLATES}
            className="inline-flex min-h-10 items-center gap-1 rounded-full border border-dashed border-copper px-3.5 text-sm text-copper hover:bg-champagne disabled:opacity-50"
          >
            <Plus size={15} strokeWidth={1.75} /> Nova variação
          </button>
        </div>
      </div>

      {!selected.preset && (
        <TextField
          label="Nome da variação"
          maxLength={40}
          value={selected.name}
          onChange={(e) => setDraft((d) => ({ ...d, custom: d.custom.map((c) => (c.id === selected.id ? { ...c, name: e.target.value } : c)) }))}
        />
      )}

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={`tpl-${type}`} className="text-sm font-medium">
            Texto
          </label>
          <span className="price text-xs text-ink-muted">
            {selected.text.length}/{MAX_TEMPLATE_CHARS}
          </span>
        </div>
        <div role="group" aria-label="Inserir informação" className="flex flex-wrap gap-1.5">
          {varNames.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => insert(n)}
              title={`Insere {${n}}`}
              className="inline-flex min-h-8 items-center rounded-full bg-champagne px-2.5 text-xs text-ink hover:bg-rose-light/60"
            >
              + {VARIABLES[n].label}
            </button>
          ))}
        </div>
        <textarea
          id={`tpl-${type}`}
          ref={area}
          value={selected.text}
          maxLength={MAX_TEMPLATE_CHARS}
          onChange={(e) => setText(selected, e.target.value)}
          rows={9}
          className="w-full resize-y rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3.5 font-mono text-[0.8125rem] leading-relaxed text-ink focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
        />
        {missing.length > 0 && (
          <p role="alert" className="text-sm text-danger">
            Esta mensagem precisa de {missing.map((m) => `{${m}}`).join(', ')}: sem isso ela não cumpre o papel dela.
          </p>
        )}
        {unknown.length > 0 && <p className="text-sm text-copper">Não reconhecemos {unknown.map((u) => `{${u}}`).join(', ')} aqui: vai sair escrito assim.</p>}
        <details className="text-sm text-ink-muted">
          <summary className="min-h-9 cursor-pointer content-center text-copper">Como funciona</summary>
          <ul className="mt-1 flex list-disc flex-col gap-1 pl-5">
            <li>
              <code>{'{nome}'}</code> e as outras informações são trocadas pelos dados de cada pedido.
            </li>
            <li>
              Uma linha cuja informação estiver vazia some sozinha (ex.: <code>Frete: {'{frete}'}</code> sem frete).
            </li>
            <li>
              Entre colchetes, uma parte opcional: <code>{'Oi[, {primeiro_nome}]!'}</code> vira “Oi, Ana!” ou só “Oi!”.
            </li>
            <li>
              Formatação do WhatsApp: <code>*negrito*</code> e <code>_itálico_</code>.
            </li>
          </ul>
        </details>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Prévia com dados de exemplo</p>
        <div className="rounded-[14px] bg-[#efe7df] p-3">
          <Bubble text={preview} side={info.group === 'cliente' || type === 'mostruario' ? 'cliente' : 'loja'} />
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-3">
        {selected.id === activeId ? (
          <p className="flex items-center gap-2 text-sm text-success">
            <Check size={17} strokeWidth={2} aria-hidden="true" /> Esta é a variação em uso.
          </p>
        ) : (
          <Button variant="secondary" size="sm" className="self-start" onClick={() => setDraft((d) => ({ ...d, active: { ...d.active, [type]: selected.id } }))}>
            <Check size={16} strokeWidth={1.75} /> Usar esta variação
          </Button>
        )}
        <div className="flex flex-wrap gap-x-4">
          {selected.preset && selected.edited && (
            <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-copper underline underline-offset-4" onClick={() => setText(selected, selected.original!)}>
              <RotateCcw size={14} strokeWidth={1.75} /> Restaurar texto original
            </button>
          )}
          {!selected.preset && (
            <button type="button" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-danger underline underline-offset-4" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} strokeWidth={1.75} /> Excluir variação
            </button>
          )}
        </div>
      </div>

      {invalid.length > 0 && (
        <p role="alert" className="rounded-[10px] bg-danger-tint px-4 py-3 text-sm text-danger">
          Corrija {invalid.map((t) => `“${t.name}”`).join(', ')} antes de salvar.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button size="lg" block disabled={busy || !dirty || invalid.length > 0} aria-busy={busy} onClick={() => void submit()}>
          {busy ? 'Salvando…' : 'Salvar mensagens'}
        </Button>
        <Button variant="ghost" block onClick={onClose}>
          {dirty ? 'Descartar' : 'Fechar'}
        </Button>
      </div>

      <ConfirmDialog open={confirmDelete} title={`Excluir “${selected.name}”?`} confirmLabel="Excluir" tone="danger" onConfirm={removeVariation} onCancel={() => setConfirmDelete(false)}>
        A variação sai da lista quando você salvar. Se ela estava em uso, volta a valer a Clássica.
      </ConfirmDialog>
    </div>
  );
}

function Group({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="font-display text-[1.625rem] leading-tight">{title}</h2>
        <p className="text-sm text-ink-muted">{intro}</p>
      </div>
      <ul className="grid gap-3 md:grid-cols-2">{children}</ul>
    </section>
  );
}

export function MessagesPage() {
  const stored = useCatalog((s) => s.data.settings.messages);
  const settings = stored ?? EMPTY;
  const [editing, setEditing] = useState<MessageType | null>(null);
  return (
    <div className="flex flex-col gap-8">
      <p className="text-sm text-ink-muted">
        Cada mensagem tem variações prontas e aceita as suas. Os dados do pedido entram sozinhos.
      </p>
      <Group title="Mensagens das clientes" intro="Saem dos botões do site, já escritas, no WhatsApp da cliente.">
        {typesOf('cliente').map((t) => (
          <MessageCard key={t} type={t} settings={settings} onEdit={() => setEditing(t)} />
        ))}
      </Group>
      <Group title="Suas mensagens" intro="Prontas no painel para você copiar ou enviar.">
        {typesOf('loja').map((t) => (
          <MessageCard key={t} type={t} settings={settings} onEdit={() => setEditing(t)} />
        ))}
      </Group>
      <Group title="Revendedoras" intro="No painel e no mostruário de cada revendedora.">
        {typesOf('revenda').map((t) => (
          <MessageCard key={t} type={t} settings={settings} onEdit={() => setEditing(t)} />
        ))}
      </Group>
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? MESSAGE_TYPE_INFO[editing].label : 'Mensagem'} side="right">
        {editing && <TemplateEditor key={editing} type={editing} settings={settings} onClose={() => setEditing(null)} />}
      </Sheet>
    </div>
  );
}
