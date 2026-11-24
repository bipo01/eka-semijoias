import { useState } from 'react';
import { Link2, PencilLine, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { TextField } from '../components/ui/Field';

interface LinkFieldProps {
  /** Path before the slug, e.g. "/produto/". */
  base: string;
  /** "peça" or "categoria", for the copy. */
  noun: string;
  /** The slug that will be saved. */
  slug: string;
  /** What the field shows while she types (her raw text). */
  value: string;
  /** True once the link no longer follows the name (typed by hand, or an existing item). */
  edited: boolean;
  isNew: boolean;
  error?: string | undefined;
  onChange: (value: string) => void;
  onBlur: () => void;
  /** Back to following the name (new items only). */
  onFollowName: () => void;
}

/**
 * The link of a piece or category. It is made from the name automatically (no accents, spaces
 * or symbols) and shown as plain text; typing a link by hand is an explicit, rare choice, so the
 * owner never has to understand or fill in a URL. Existing items keep their link when renamed,
 * so links already shared on WhatsApp keep working.
 */
export function LinkField({ base, noun, slug, value, edited, isNew, error, onChange, onBlur, onFollowName }: LinkFieldProps) {
  const [open, setOpen] = useState(false);
  const showField = open || !!error || (isNew && edited);

  if (!showField) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Link da {noun}</p>
        <p className="flex items-start gap-2 rounded-[10px] border border-line bg-champagne/40 px-3 py-2.5 text-sm">
          <Link2 size={16} strokeWidth={1.5} aria-hidden="true" className="mt-0.5 shrink-0 text-copper" />
          <span className="min-w-0 [overflow-wrap:anywhere]">
            <span className="text-ink-muted">…{base}</span>
            {slug ? <span className="font-medium">{slug}</span> : <span className="text-ink-muted italic">nome-da-{noun === 'peça' ? 'peca' : noun}</span>}
          </span>
        </p>
        <p className="text-sm text-ink-muted">
          {isNew
            ? `Criado sozinho a partir do nome. Não precisa mexer.`
            : `Continua o mesmo se você mudar o nome, para os links já enviados seguirem funcionando.`}
        </p>
        <Button variant="ghost" size="sm" className="-ml-4 self-start" onClick={() => setOpen(true)}>
          <PencilLine size={16} strokeWidth={1.5} aria-hidden="true" /> {isNew ? 'Escolher outro link' : 'Mudar o link'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <TextField
        label={`Link da ${noun}`}
        required
        maxLength={80}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        onBlur={onBlur}
        error={error}
        hint={
          <>
            Fica assim: …{base}
            <span className="font-medium text-ink">{slug || '…'}</span>
            {!isNew && '. Links já enviados com o endereço antigo deixam de abrir esta ' + noun + '.'}
          </>
        }
        autoCapitalize="none"
        autoComplete="off"
        spellCheck={false}
      />
      {isNew && edited && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-4 self-start"
          onClick={() => {
            setOpen(false);
            onFollowName();
          }}
        >
          <RotateCcw size={16} strokeWidth={1.5} aria-hidden="true" /> Voltar a criar pelo nome
        </Button>
      )}
    </div>
  );
}
