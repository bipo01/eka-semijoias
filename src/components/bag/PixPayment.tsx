import { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { encode } from 'uqr';
import type { Settings } from '../../data/schema';
import { formatBRL } from '../../lib/format';
import { buildPixPayload, pixText, pixTxid } from '../../lib/pix';
import { useUi } from '../../store/ui';
import { Button } from '../ui/Button';

/** QR Code drawn as one SVG path (no innerHTML; crisp at any size). */
function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, size: qr.size };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className="size-[196px] rounded-[8px] bg-white">
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={path} fill="#1F1A17" />
    </svg>
  );
}

async function copyText(text: string, fallback: HTMLTextAreaElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older Safari / in-app browsers: select the visible code so it can be copied by hand.
    if (!fallback) return false;
    fallback.focus();
    fallback.select();
    try {
      // Deprecated, but the only option where the Clipboard API is blocked.
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

/** Static Pix for a registered order: "copia e cola", QR Code, amount and recipient. */
export function PixPayment({ pix, amountCents, orderNumber }: { pix: NonNullable<Settings['pix']>; amountCents: number; orderNumber: number }) {
  const payload = useMemo(() => buildPixPayload({ key: pix.key, name: pix.name, city: pix.city, amountCents, txid: pixTxid(orderNumber) }), [pix, amountCents, orderNumber]);
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const toast = useUi((s) => s.toast);

  const copy = async () => {
    const ok = await copyText(payload, area.current);
    if (ok) {
      setCopied(true);
      toast('Código copiado', { tone: 'success' });
      window.setTimeout(() => setCopied(false), 4000);
    } else {
      toast('Não foi possível copiar. Selecione o código e copie.', { tone: 'error' });
    }
  };

  return (
    <section aria-labelledby={`pix-${orderNumber}`} className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id={`pix-${orderNumber}`} className="font-display text-title">Pague com Pix</h3>
        <p className="price text-lg">{formatBRL(amountCents)}</p>
      </div>
      <p className="text-sm text-ink-muted">
        No app do seu banco, escolha <strong className="font-medium text-ink">Pix Copia e Cola</strong> e cole o código, ou leia o QR Code. Depois, mande o comprovante na nossa conversa do WhatsApp.
      </p>
      <div className="flex flex-col gap-2">
        <label htmlFor={`pix-code-${orderNumber}`} className="text-sm font-medium">Pix Copia e Cola</label>
        <textarea
          id={`pix-code-${orderNumber}`}
          ref={area}
          readOnly
          rows={3}
          value={payload}
          onFocus={(e) => e.currentTarget.select()}
          className="price w-full resize-none rounded-[10px] border border-line bg-ivory px-3 py-2 font-mono text-xs leading-relaxed break-all text-ink focus:border-copper focus:outline-none"
        />
        <Button variant="secondary" onClick={() => void copy()} block>
          {copied ? <Check size={18} strokeWidth={1.75} /> : <Copy size={18} strokeWidth={1.5} />}
          {copied ? 'Código copiado' : 'Copiar código Pix'}
        </Button>
      </div>
      <div className="flex flex-col items-center gap-2 border-t border-line pt-4">
        <QrCode value={payload} label={`QR Code Pix de ${formatBRL(amountCents)}`} />
        <p className="text-center text-sm text-ink-muted">
          Para <span className="text-ink">{pixText(pix.name, 25)}</span>
          <br />
          Pedido nº {orderNumber}
        </p>
      </div>
    </section>
  );
}
