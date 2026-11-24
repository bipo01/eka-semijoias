import { useMemo, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { encode } from 'uqr';
import { useUi } from '../../store/ui';
import { Button } from '../ui/Button';
import { cx } from '../ui/cx';

/** QR Code drawn as one SVG path (no innerHTML; crisp at any size). */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { path, size } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => row.forEach((dark, x) => dark && (d += `M${x} ${y}h1v1h-1z`)));
    return { path: d, size: qr.size };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={cx('rounded-[10px] bg-white', className)}>
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={path} fill="#2B1D18" />
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

/** The "Pix Copia e Cola" code with a copy button (and the code visible, for manual copy). */
export function PixCopyField({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const toast = useUi((s) => s.toast);

  const copy = async () => {
    const ok = await copyText(code, area.current);
    if (ok) {
      setCopied(true);
      toast('Código copiado', { tone: 'success' });
      window.setTimeout(() => setCopied(false), 4000);
    } else {
      toast('Não foi possível copiar. Selecione o código e copie.', { tone: 'error' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Button variant={copied ? 'secondary' : 'primary'} size="lg" onClick={() => void copy()} block>
        {copied ? <Check size={19} strokeWidth={1.75} /> : <Copy size={18} strokeWidth={1.5} />}
        {copied ? 'Código copiado' : 'Copiar código Pix'}
      </Button>
      <label htmlFor={id} className="sr-only">
        Pix Copia e Cola
      </label>
      <textarea
        id={id}
        ref={area}
        readOnly
        rows={5}
        value={code}
        onFocus={(e) => e.currentTarget.select()}
        className="w-full resize-none rounded-[10px] border border-line bg-ivory px-3 py-2 font-mono text-xs leading-relaxed break-all text-ink-muted [field-sizing:content] focus:border-copper focus:outline-none"
      />
    </div>
  );
}
