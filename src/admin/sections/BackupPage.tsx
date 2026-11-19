import { useState, type ChangeEvent } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import type { CatalogState } from '../../data/schema';
import { createSeed } from '../../data/seed';
import { CORRUPT_PREFIX, listCorruptKeys, migrateCatalog, readRaw } from '../../data/storage';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { formatDateTime } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { replaceCatalog } from '../lib/persist';
import { StorageMeter } from '../StorageMeter';

export const backupFilename = (date = new Date()) => `eka-catalogo-${fileDate(date)}.json`;

export function exportCatalog(data: CatalogState): string {
  return JSON.stringify(data);
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function summarize(state: CatalogState): string {
  return [
    plural(state.products.length, 'produto', 'produtos'),
    plural(state.categories.length, 'categoria', 'categorias'),
    plural(state.collections.length, 'coleção', 'coleções'),
    plural(state.leads.length, 'revendedora', 'revendedoras'),
  ].join(', ');
}

export type ImportResult = { ok: true; state: CatalogState } | { ok: false; error: string };

/** Parses and validates a backup file's text; the current PIN is kept. */
export function parseBackup(text: string, currentPinHash: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Este arquivo não é um backup do catálogo (o conteúdo não pôde ser lido).' };
  }
  const result = migrateCatalog(json);
  if (!result.ok) return { ok: false, error: `Não foi possível usar este backup. ${result.error}` };
  return { ok: true, state: { ...result.state, settings: { ...result.state.settings, pinHash: currentPinHash } } };
}

/** The initial catalog with the current PIN. */
export function resetCatalog(currentPinHash: string): CatalogState {
  const seed = createSeed();
  return { ...seed, settings: { ...seed.settings, pinHash: currentPinHash } };
}

function exportNow() {
  downloadText(backupFilename(), exportCatalog(useCatalog.getState().data), 'application/json');
  toast('Backup baixado. Guarde o arquivo em um lugar seguro.', { tone: 'success' });
}

export function BackupPage() {
  const data = useCatalog((s) => s.data);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ state: CatalogState; fileName: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [corruptKeys] = useState(listCorruptKeys);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setImportError('Não foi possível abrir o arquivo.');
    }
    const result = parseBackup(text, useCatalog.getState().data.settings.pinHash);
    if (!result.ok) return setImportError(result.error);
    setPending({ state: result.state, fileName: file.name });
  }

  function confirmImport() {
    if (!pending) return;
    if (replaceCatalog({ ...pending.state, settings: { ...pending.state.settings, pinHash: useCatalog.getState().data.settings.pinHash } }, 'Backup restaurado.')) setPending(null);
  }

  function confirmRestore() {
    if (replaceCatalog(resetCatalog(useCatalog.getState().data.settings.pinHash), 'Catálogo inicial restaurado.')) setConfirmReset(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <StorageMeter />

      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4">
        <h2 className="font-display text-title">Exportar</h2>
        <p className="text-sm text-ink-muted">
          Baixa um arquivo com todo o catálogo: peças, fotos enviadas, categorias, coleções, revendedoras e configurações. Atualmente: {summarize(data)}.
        </p>
        <Button onClick={exportNow} className="self-start">
          <Download size={18} strokeWidth={1.5} /> Exportar backup
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4">
        <h2 className="font-display text-title">Importar</h2>
        <p className="text-sm text-ink-muted">Substitui o catálogo deste navegador pelo de um backup. O PIN atual continua o mesmo.</p>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 self-start rounded-full border border-copper px-6 font-medium text-copper hover:bg-champagne focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper">
          <input type="file" accept="application/json,.json" className="sr-only" onChange={pickFile} />
          <Upload size={18} strokeWidth={1.5} aria-hidden="true" /> Escolher arquivo de backup
        </label>
        {importError && (
          <p role="alert" className="text-sm text-danger">
            {importError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4">
        <h2 className="font-display text-title">Restaurar catálogo inicial</h2>
        <p className="text-sm text-ink-muted">Volta às peças, categorias e coleções originais do site. O PIN atual continua o mesmo; o resto é substituído.</p>
        <Button variant="danger" onClick={() => setConfirmReset(true)} className="self-start">
          <RotateCcw size={18} strokeWidth={1.5} /> Restaurar catálogo inicial
        </Button>
      </section>

      {corruptKeys.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-champagne/50 p-4">
          <h2 className="font-display text-title">Cópias guardadas</h2>
          <p className="text-sm text-ink-muted">
            Estes dados estavam salvos neste navegador mas não puderam ser abertos. Baixe a cópia para recuperar informações dela.
          </p>
          <ul className="flex flex-col gap-2">
            {corruptKeys.map((key) => {
              const ts = Number(key.slice(CORRUPT_PREFIX.length));
              return (
                <li key={key}>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const raw = readRaw(key);
                      if (raw == null) return toast('Esta cópia não está mais disponível.', { tone: 'error' });
                      downloadText(`eka-catalogo-recuperado-${Number.isFinite(ts) ? ts : 'copia'}.json`, raw, 'application/json');
                    }}
                  >
                    <Download size={16} strokeWidth={1.5} /> Baixar cópia {Number.isFinite(ts) ? `de ${formatDateTime(ts)}` : ''}
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog open={!!pending} title="Substituir o catálogo?" confirmLabel="Substituir" tone="danger" onConfirm={confirmImport} onCancel={() => setPending(null)}>
        {pending && (
          <div className="flex flex-col gap-2">
            <p>
              O arquivo <span className="font-medium break-all text-ink">{pending.fileName}</span> tem {summarize(pending.state)}.
            </p>
            <p>O catálogo atual deste navegador ({summarize(data)}) será substituído. Se quiser guardá-lo, exporte um backup antes.</p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar o catálogo inicial?"
        confirmLabel="Restaurar"
        tone="danger"
        onConfirm={confirmRestore}
        onCancel={() => setConfirmReset(false)}
      >
        <div className="flex flex-col gap-3">
          <p>Peças, fotos enviadas, categorias, coleções, revendedoras e informações da loja voltam ao início. Só o PIN continua o mesmo.</p>
          <Button variant="secondary" size="sm" onClick={exportNow} className="self-start">
            <Download size={16} strokeWidth={1.5} /> Exportar backup antes
          </Button>
        </div>
      </ConfirmDialog>
    </div>
  );
}
