import { useEffect, useState } from 'react';
import { ImageOff, RefreshCw } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { api, ApiError, errorMessage } from '../../lib/api';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { signalSessionLost } from '../lib/session';

/*
 * Painel → Backup → "Fotos guardadas": what the uploaded photos take on the server and how many of them
 * nothing uses any more. Those are erased by themselves once a day; "Apagar agora" does it at once.
 * Photos uploaded or let go in the last day are kept: "Desfazer", another phone about to save them.
 */

export interface MediaUsage {
  stored: number;
  storedBytes: number;
  unused: number;
  unusedBytes: number;
  recent: number;
}

const mb = (bytes: number) => (bytes < 100_000 && bytes > 0 ? 'menos de 0,1 MB' : `${(bytes / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: bytes ? 1 : 0 })} MB`);
const photos = (n: number) => (n === 1 ? '1 foto' : `${n} fotos`);

type Load = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; usage: MediaUsage };

export function StoredPhotos() {
  const version = useCatalog((s) => s.version);
  const [load, setLoad] = useState<Load>({ status: 'loading' });
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  /** Bumped to read the numbers again ("Tentar de novo", after "Apagar agora"). */
  const [reads, setReads] = useState(0);
  const refresh = () => setReads((n) => n + 1);

  // Again after every catalog change: a save may have just erased photos.
  useEffect(() => {
    let active = true;
    api<MediaUsage>('/api/admin/media/usage', { retries: 1, timeoutMs: 15_000 }).then(
      (usage) => active && setLoad({ status: 'ready', usage }),
      (error: unknown) => {
        if (!active) return;
        if (error instanceof ApiError && error.code === 'unauthenticated') return signalSessionLost();
        setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'error', message: errorMessage(error) }));
      },
    );
    return () => {
      active = false;
    };
  }, [version, reads]);

  async function sweep() {
    setConfirm(false);
    setBusy(true);
    try {
      const result = await api<{ deleted: number; deletedBytes: number; busy?: boolean }>('/api/admin/media/sweep', { method: 'POST', json: {}, timeoutMs: 30_000 });
      if (result.busy) toast('O catálogo acabou de mudar. Toque em “Apagar agora” de novo.', { tone: 'error' });
      else toast(result.deleted ? `${photos(result.deleted)} sem uso ${result.deleted === 1 ? 'apagada' : 'apagadas'} (${mb(result.deletedBytes)}).` : 'Nenhuma foto sem uso para apagar.', { tone: 'success' });
    } catch (error) {
      if (error instanceof ApiError && error.code === 'unauthenticated') return signalSessionLost();
      toast(errorMessage(error), { tone: 'error' });
    } finally {
      setBusy(false);
      refresh();
    }
  }

  return (
    <section aria-labelledby="stored-photos-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
      <h2 id="stored-photos-title" className="font-display text-title">
        Fotos guardadas
      </h2>
      {load.status === 'loading' && <p className="text-sm text-ink-muted">Contando as fotos…</p>}
      {load.status === 'error' && (
        <div className="flex flex-col items-start gap-2">
          <p role="alert" className="text-sm text-danger">
            {load.message}
          </p>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setLoad({ status: 'loading' });
              refresh();
            }}
          >
            <RefreshCw size={16} strokeWidth={1.5} aria-hidden="true" /> Tentar de novo
          </Button>
        </div>
      )}
      {load.status === 'ready' && (
        <>
          <p className="text-sm text-ink-muted">
            {load.usage.stored ? `${photos(load.usage.stored)} ${load.usage.stored === 1 ? 'enviada' : 'enviadas'} por você (${mb(load.usage.storedBytes)}).` : 'Nenhuma foto enviada por você ainda.'} Fotos que saem das peças e do site são apagadas sozinhas um dia depois.
          </p>
          {load.usage.unused > 0 ? (
            <>
              <p className="text-sm text-ink">
                {photos(load.usage.unused)} sem uso há mais de um dia ({mb(load.usage.unusedBytes)}): {load.usage.unused === 1 ? 'não aparece' : 'não aparecem'} em nenhuma peça nem no site.
              </p>
              <Button variant="secondary" onClick={() => setConfirm(true)} disabled={busy} aria-busy={busy} className="self-start">
                <ImageOff size={18} strokeWidth={1.5} aria-hidden="true" /> {busy ? 'Apagando…' : 'Apagar agora'}
              </Button>
            </>
          ) : (
            load.usage.stored > 0 && load.usage.recent === 0 && <p className="text-sm text-ink">Todas as fotos guardadas estão em uso.</p>
          )}
          {load.usage.recent > 0 && (
            <p className="text-sm text-ink-muted">
              {load.usage.recent === 1 ? '1 foto sem uso há menos de um dia fica guardada' : `${load.usage.recent} fotos sem uso há menos de um dia ficam guardadas`} até completar um dia, para dar tempo de desfazer uma mudança.
            </p>
          )}
        </>
      )}
      <ConfirmDialog
        open={confirm}
        title="Apagar fotos sem uso?"
        confirmLabel="Apagar fotos"
        tone="danger"
        onConfirm={() => void sweep()}
        onCancel={() => setConfirm(false)}
      >
        {load.status === 'ready' && load.usage.unused === 1 ? 'A foto que não aparece em nenhuma peça nem no site.' : `${load.status === 'ready' ? photos(load.usage.unused) : 'As fotos'} que não aparecem em nenhuma peça nem no site.`} Não dá para desfazer (um backup baixado antes guarda as fotos que tinha).
      </ConfirmDialog>
    </section>
  );
}
