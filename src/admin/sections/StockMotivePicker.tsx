import { useEffect, useRef } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { Chip } from '../../components/ui/Misc';
import { builtInMotiveFor, MOTIVE_LABEL, MOTIVE_LABEL_MAX, MOTIVE_LABEL_MIN, motiveKey, tidyMotiveLabel } from '../../data/stock';
import { MOTIVES, type MoveKind } from '../lib/stock';

/*
 * The motive of an entry or exit: the built-in ones, then the ones she created, then "Outra
 * entrada" / "Outra saída", which opens a field to say what it was. What she writes there is saved
 * by the server with the move and comes back as a chip of its own next time.
 */

/** A built-in motive (incl. 'outro', the one that asks for her words) or one she saved before. */
export type MotiveChoice = { type: 'builtIn'; id: string } | { type: 'own'; label: string } | null;

const plural = (kind: MoveKind) => (kind === 'entrada' ? 'entradas' : 'saídas');

/** What the field below "Outra entrada" means right now: a motive that already exists, or a new one. */
export function ownMotiveMatch(kind: MoveKind, text: string, saved: readonly string[]): { builtIn: string } | { saved: string } | null {
  const builtIn = builtInMotiveFor(kind, text);
  if (builtIn && builtIn !== 'outro') return { builtIn };
  const key = motiveKey(text);
  const match = key ? saved.find((m) => motiveKey(m) === key) : undefined;
  return match ? { saved: match } : null;
}

/** The motive fields of the request, or why the choice cannot be sent yet. */
export function motiveToSend(kind: MoveKind, choice: MotiveChoice, text: string, saved: readonly string[]): { motive: string; motiveLabel?: string } | { error: string; focusText?: true } {
  if (!choice) return { error: 'Escolha o motivo.' };
  if (choice.type === 'own') return { motive: 'outro', motiveLabel: choice.label };
  if (choice.id !== 'outro') return { motive: choice.id };
  const label = tidyMotiveLabel(text);
  if (!label) return { error: `Escreva qual foi o motivo da ${kind === 'entrada' ? 'entrada' : 'saída'}.`, focusText: true };
  const match = ownMotiveMatch(kind, label, saved);
  if (match && 'builtIn' in match) return { motive: match.builtIn };
  if (match) return { motive: 'outro', motiveLabel: match.saved };
  if (label.length < MOTIVE_LABEL_MIN) return { error: 'Escreva o motivo com pelo menos 2 letras.', focusText: true };
  return { motive: 'outro', motiveLabel: label };
}

function hintFor(kind: MoveKind, text: string, saved: readonly string[]): string {
  const match = ownMotiveMatch(kind, text, saved);
  if (match && 'builtIn' in match) return `“${(MOTIVE_LABEL[kind] as Record<string, string>)[match.builtIn]}” já está na lista. Vamos usar ele.`;
  if (match) return `Você já tem “${match.saved}” salvo. Vamos usar ele.`;
  return `Fica salvo para as próximas ${plural(kind)}. Sem nomes de clientes.`;
}

export function MotivePicker({
  kind,
  saved,
  choice,
  onChoice,
  text,
  onText,
  onForget,
  forgetting,
  textRef,
}: {
  kind: MoveKind;
  saved: readonly string[];
  choice: MotiveChoice;
  onChoice: (choice: MotiveChoice) => void;
  text: string;
  onText: (text: string) => void;
  onForget: (label: string) => void;
  forgetting: boolean;
  textRef: React.RefObject<HTMLInputElement>;
}) {
  const writing = choice?.type === 'builtIn' && choice.id === 'outro';
  const ownKey = choice?.type === 'own' ? motiveKey(choice.label) : null;
  const opened = useRef(false);

  // Opening the field puts the cursor in it (not on the first render of a form reopened with it).
  useEffect(() => {
    if (writing && opened.current) textRef.current?.focus({ preventScroll: true });
    opened.current = true;
  }, [writing, textRef]);

  return (
    <div>
      <p id="move-motive-title" className="mb-2 font-medium">
        Motivo
      </p>
      <div role="group" aria-labelledby="move-motive-title" className="flex flex-wrap gap-2">
        {MOTIVES[kind]
          .filter((m) => m.id !== 'outro')
          .map((m) => (
            <Chip key={m.id} selected={choice?.type === 'builtIn' && choice.id === m.id} onClick={() => onChoice({ type: 'builtIn', id: m.id })}>
              {m.label}
            </Chip>
          ))}
        {saved.map((label) => (
          <Chip key={label} selected={ownKey === motiveKey(label)} onClick={() => onChoice({ type: 'own', label })}>
            {label}
          </Chip>
        ))}
        <Chip selected={writing} aria-expanded={writing} aria-controls="move-own-motive-panel" onClick={() => onChoice({ type: 'builtIn', id: 'outro' })}>
          <Plus size={15} strokeWidth={1.5} aria-hidden="true" className={writing ? 'text-white' : 'text-copper'} />
          {(MOTIVE_LABEL[kind] as Record<string, string>).outro}
        </Chip>
      </div>

      {choice?.type === 'own' && (
        <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-ink-muted">
          <Sparkles size={13} strokeWidth={1.5} aria-hidden="true" className="text-rose" />
          Motivo criado por você.
          <button
            type="button"
            disabled={forgetting}
            onClick={() => onForget(choice.label)}
            className="inline-flex min-h-9 items-center font-medium text-copper underline decoration-rose-light underline-offset-4 hover:decoration-copper disabled:opacity-50"
          >
            {forgetting ? 'Tirando…' : 'Tirar da lista'}
          </button>
        </p>
      )}

      {/* Rows 0fr → 1fr: the card unfolds under the chips; closed, its field is disabled (out of the tab order). */}
      <div
        id="move-own-motive-panel"
        aria-hidden={!writing}
        className="grid transition-[grid-template-rows,opacity] duration-[280ms] ease-[var(--ease)] motion-reduce:transition-none"
        style={{ gridTemplateRows: writing ? '1fr' : '0fr', opacity: writing ? 1 : 0 }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="pt-3">
            <div className="rounded-[14px] border border-rose-light/70 bg-[linear-gradient(180deg,var(--c-champagne)_0%,var(--c-ivory)_100%)] p-4">
              <div className="flex items-baseline justify-between gap-3">
                <label htmlFor="move-own-motive" className="text-sm font-medium">
                  Qual foi o motivo?
                </label>
                <span aria-hidden="true" className="price text-xs text-ink-muted">
                  {text.length}/{MOTIVE_LABEL_MAX}
                </span>
              </div>
              <input
                ref={textRef}
                id="move-own-motive"
                value={text}
                disabled={!writing}
                maxLength={MOTIVE_LABEL_MAX}
                autoComplete="off"
                autoCapitalize="sentences"
                enterKeyHint="done"
                onChange={(e) => onText(e.target.value)}
                placeholder={kind === 'entrada' ? 'Ex.: Feira de artesanato' : 'Ex.: Doação para bazar'}
                aria-describedby="move-own-motive-hint"
                className="mt-2 min-h-12 w-full rounded-[10px] border border-line bg-white px-3 text-base placeholder:text-ink-muted/80 focus:border-copper focus:outline-none focus-visible:outline-2 focus-visible:outline-copper"
              />
              <p id="move-own-motive-hint" aria-live="polite" className="mt-2 flex items-start gap-1.5 text-xs leading-snug text-ink-muted">
                <Sparkles size={13} strokeWidth={1.5} aria-hidden="true" className="mt-px shrink-0 text-rose" />
                {hintFor(kind, text, saved)}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
