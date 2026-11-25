import { useState, type ChangeEvent } from 'react';
import { Download, RotateCcw, Upload } from 'lucide-react';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { imageSourcesOf } from '../../data/changes';
import { mapSectionImages, SECTION_IDS, type SectionId, type SiteContent } from '../../data/content';
import { migrateCatalog } from '../../data/integrity';
import { MEDIA_KEY_PATTERN, type Catalog, type CatalogState } from '../../data/schema';
import { createCatalogSeed } from '../../data/seed';
import { LEGACY_CATALOG_KEY, LEGACY_CORRUPT_PREFIX, listLegacyCatalogKeys, readRaw, removeKey } from '../../data/storage';
import { api, apiUrl, ApiError, errorMessage } from '../../lib/api';
import { useCatalog } from '../../store/catalog';
import { toast } from '../../store/ui';
import { formatDateTime } from '../lib/contact';
import { downloadText, fileDate } from '../lib/download';
import { save } from '../lib/persist';
import { signalSessionLost } from '../lib/session';

/** Backups embed every uploaded photo (base64), so they can be large; anything far larger is not a backup. */
const MAX_BACKUP_BYTES = 200 * 1024 * 1024;

export const backupFilename = (date = new Date()) => `eka-catalogo-${fileDate(date)}.json`;

/** Uploaded photos embedded in a backup, by key ("media/<sha256>.webp" → data URL). */
export type MediaMap = Record<string, string>;

export function exportCatalog(data: CatalogState, media: MediaMap = {}): string {
  return JSON.stringify(Object.keys(media).length ? { ...data, media } : data);
}

const DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$/;

/** The embedded photos of a backup file (invalid entries are ignored). */
export function mediaOf(json: unknown): MediaMap {
  const media = (json as { media?: unknown } | null)?.media;
  if (!media || typeof media !== 'object') return {};
  const out: MediaMap = {};
  for (const [key, value] of Object.entries(media as Record<string, unknown>)) {
    if (MEDIA_KEY_PATTERN.test(key) && typeof value === 'string' && DATA_URL.test(value)) out[key] = value;
  }
  return out;
}

/**
 * Points uploaded photos at the copies embedded in the backup, so saving
 * re-uploads them (the server stores each photo once, under the same key).
 * Restores onto a fresh database keep every photo.
 */
export function withEmbeddedMedia(catalog: Catalog, media: MediaMap, alreadyStored: ReadonlySet<string> = new Set()): Catalog {
  if (!Object.keys(media).length) return catalog;
  // Photos the live catalog already uses are on the server: no need to send them again.
  const swap = (src: string) => (alreadyStored.has(src) ? src : (media[src] ?? src));
  return {
    ...catalog,
    products: catalog.products.map((p) => ({ ...p, images: p.images.map((i) => ({ ...i, src: swap(i.src), ...(i.thumb ? { thumb: swap(i.thumb) } : {}) })) })),
    collections: catalog.collections.map((c) => (c.heroImage ? { ...c, heroImage: swap(c.heroImage) } : c)),
    ...(catalog.content ? { content: swapContent(catalog.content, swap) } : {}),
  };
}

/** The site content with every image source passed through `swap`. */
function swapContent(content: SiteContent, swap: (src: string) => string): SiteContent {
  const out: SiteContent = {};
  for (const sid of SECTION_IDS) {
    const data = content[sid];
    if (data === undefined) continue;
    (out as Record<SectionId, unknown>)[sid] = mapSectionImages(sid, data, (img) => ({ ...img, src: swap(img.src), ...(img.thumb ? { thumb: swap(img.thumb) } : {}) }));
  }
  return out;
}

/** What a backup holds of the site texts ("3 partes do site com texto editado" / "textos originais do site"). */
export function contentSummary(catalog: Pick<Catalog, 'content'>): string {
  const edited = Object.keys(catalog.content ?? {}).length;
  return edited === 0 ? 'textos originais do site' : edited === 1 ? '1 parte do site com texto editado' : `${edited} partes do site com texto editado`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsDataURL(blob);
  });
}

/** Downloads every uploaded photo the catalog uses, for a self-contained backup. */
async function collectMedia(catalog: Catalog): Promise<MediaMap> {
  const keys = [...new Set(imageSourcesOf(catalog).filter((src) => MEDIA_KEY_PATTERN.test(src)))];
  const media: MediaMap = {};
  for (const key of keys) {
    const response = await fetch(apiUrl(`/${key}`));
    if (!response.ok) throw new ApiError(response.status, 'media_missing', 'Uma das fotos não pôde ser baixada para o backup. Tente de novo.');
    media[key] = await blobToDataUrl(await response.blob());
  }
  return media;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function summarize(state: Catalog & { leads?: unknown[] }): string {
  return [
    plural(state.products.length, 'produto', 'produtos'),
    plural(state.categories.length, 'categoria', 'categorias'),
    ...(state.leads ? [plural(state.leads.length, 'ficha de revendedora', 'fichas de revendedoras')] : []),
  ].join(', ');
}

export type ImportResult = { ok: true; state: CatalogState; media: MediaMap } | { ok: false; error: string };

/** Parses and validates a backup file's text (older formats are upgraded). */
export function parseBackup(text: string): ImportResult {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Este arquivo não é um backup do catálogo (o conteúdo não pôde ser lido).' };
  }
  const result = migrateCatalog(json);
  if (!result.ok) return { ok: false, error: `Não foi possível usar este backup. ${result.error}` };
  return { ok: true, state: result.state, media: mediaOf(json) };
}

/** The catalog part of a backup (leads are managed separately and kept as they are). */
export function catalogOf(state: CatalogState): Catalog {
  const { leads: _leads, ...catalog } = state;
  return catalog;
}

async function exportNow(): Promise<void> {
  try {
    const backup = await api<CatalogState>('/api/admin/backup', { retries: 2, timeoutMs: 30_000 });
    downloadText(backupFilename(), exportCatalog(backup, await collectMedia(backup)), 'application/json');
    toast('Backup baixado. Guarde o arquivo em um lugar seguro.', { tone: 'success' });
  } catch (error) {
    if (error instanceof ApiError && error.code === 'unauthenticated') return signalSessionLost();
    toast(errorMessage(error), { tone: 'error' });
  }
}

export function BackupPage() {
  const data = useCatalog((s) => s.data);
  const [importError, setImportError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ state: CatalogState; media: MediaMap; fileName: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [legacyKeys, setLegacyKeys] = useState(listLegacyCatalogKeys);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function pickFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
    if (file.size > MAX_BACKUP_BYTES) return setImportError('Este arquivo é grande demais para ser um backup do catálogo.');
    let text: string;
    try {
      text = await file.text();
    } catch {
      return setImportError('Não foi possível abrir o arquivo.');
    }
    const result = parseBackup(text);
    if (!result.ok) return setImportError(result.error);
    setPending({ state: result.state, media: result.media, fileName: file.name });
  }

  function importLegacy(key: string) {
    const raw = readRaw(key);
    if (raw == null) return toast('Estes dados não estão mais neste aparelho.', { tone: 'error' });
    const result = parseBackup(raw);
    if (!result.ok) return toast(result.error, { tone: 'error' });
    setPending({ state: result.state, media: result.media, fileName: 'catálogo salvo neste aparelho' });
  }

  async function replaceWith(next: Catalog, success: string): Promise<boolean> {
    if (progress) return false;
    setProgress('Preparando…');
    const ok = await save(() => next, success, { onProgress: setProgress });
    setProgress(null);
    return ok;
  }

  async function confirmImport() {
    if (!pending) return;
    const stored = new Set(imageSourcesOf(useCatalog.getState().data));
    if (await replaceWith(withEmbeddedMedia(catalogOf(pending.state), pending.media, stored), 'Backup restaurado. O site já mostra o catálogo importado.')) setPending(null);
  }

  async function confirmRestore() {
    if (await replaceWith(createCatalogSeed(), 'Catálogo inicial restaurado.')) setConfirmReset(false);
  }

  return (
    <div className="flex flex-col gap-4">
      {progress && (
        <p role="status" className="rounded-[12px] border border-line bg-champagne px-4 py-3 text-sm">
          {progress}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
        <h2 className="font-display text-title">Exportar</h2>
        <p className="text-sm text-ink-muted">
          Baixa um arquivo com o catálogo do site (peças, fotos enviadas, categorias, textos do site e informações da loja) e as fichas de cadastro de revendedoras. Atualmente:{' '}
          {summarize(data)}.
        </p>
        {/* What the file does not carry, so it is never taken for a full copy of the store. */}
        <p className="text-sm text-ink-muted">
          Não inclui pedidos, clientes, comprovantes nem as contas das revendedoras: eles ficam no servidor, que guarda um histórico automático dos últimos 7 dias.
        </p>
        <Button
          onClick={async () => {
            setExporting(true);
            await exportNow();
            setExporting(false);
          }}
          disabled={exporting}
          aria-busy={exporting}
          className="self-start"
        >
          <Download size={18} strokeWidth={1.5} /> {exporting ? 'Preparando…' : 'Exportar backup'}
        </Button>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
        <h2 className="font-display text-title">Importar</h2>
        <p className="text-sm text-ink-muted">Substitui o catálogo e os textos do site pelos de um backup, para todas as clientes. O PIN e os cadastros de revendedoras não mudam.</p>
        <label className="inline-flex min-h-12 cursor-pointer items-center gap-2 self-start rounded-full border border-copper px-6 font-medium text-copper hover:bg-champagne focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-copper">
          <input type="file" accept="application/json,.json" className="sr-only" onChange={pickFile} disabled={!!progress} />
          <Upload size={18} strokeWidth={1.5} aria-hidden="true" /> Escolher arquivo de backup
        </label>
        {importError && (
          <p role="alert" className="text-sm text-danger">
            {importError}
          </p>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-line bg-white shadow-[0_2px_8px_rgb(48_33_28/0.04)] p-4">
        <h2 className="font-display text-title">Restaurar catálogo inicial</h2>
        <p className="text-sm text-ink-muted">Volta às peças, categorias e textos originais do site. O PIN e os cadastros de revendedoras continuam os mesmos.</p>
        <Button variant="danger" onClick={() => setConfirmReset(true)} className="self-start" disabled={!!progress}>
          <RotateCcw size={18} strokeWidth={1.5} /> Restaurar catálogo inicial
        </Button>
      </section>

      {legacyKeys.length > 0 && (
        <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-champagne/50 p-4">
          <h2 className="font-display text-title">Catálogo salvo neste aparelho</h2>
          <p className="text-sm text-ink-muted">
            Antes, as alterações do painel ficavam só no navegador onde eram feitas. Estes dados ainda estão aqui: baixe uma cópia ou envie para o site.
          </p>
          <ul className="flex flex-col gap-2">
            {legacyKeys.map((key) => {
              const ts = key.startsWith(LEGACY_CORRUPT_PREFIX) ? Number(key.slice(LEGACY_CORRUPT_PREFIX.length)) : NaN;
              return (
                <li key={key} className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const raw = readRaw(key);
                      if (raw == null) return toast('Estes dados não estão mais neste aparelho.', { tone: 'error' });
                      downloadText(`eka-catalogo-aparelho-${Number.isFinite(ts) ? ts : fileDate()}.json`, raw, 'application/json');
                    }}
                  >
                    <Download size={16} strokeWidth={1.5} /> Baixar {Number.isFinite(ts) ? `cópia de ${formatDateTime(ts)}` : 'cópia'}
                  </Button>
                  {key === LEGACY_CATALOG_KEY && (
                    <Button variant="secondary" size="sm" onClick={() => importLegacy(key)} disabled={!!progress}>
                      <Upload size={16} strokeWidth={1.5} /> Enviar para o site
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setConfirmDeleteKey(key)}>
                    Apagar deste aparelho
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!confirmDeleteKey}
        title="Apagar estes dados do aparelho?"
        confirmLabel="Apagar"
        tone="danger"
        onConfirm={() => {
          if (confirmDeleteKey) removeKey(confirmDeleteKey);
          setLegacyKeys(listLegacyCatalogKeys());
          setConfirmDeleteKey(null);
          toast('Dados apagados deste aparelho.', { tone: 'success' });
        }}
        onCancel={() => setConfirmDeleteKey(null)}
      >
        <p>Baixe uma cópia antes se ainda precisar de alguma informação. O catálogo do site não muda.</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={!!pending}
        title="Substituir o catálogo?"
        confirmLabel={progress ? 'Enviando…' : 'Substituir'}
        tone="danger"
        onConfirm={() => void confirmImport()}
        onCancel={() => !progress && setPending(null)}
      >
        {pending && (
          <div className="flex flex-col gap-2">
            <p>
              <span className="font-medium break-all text-ink">{pending.fileName}</span>: {summarize(catalogOf(pending.state))}, {contentSummary(pending.state)}.
            </p>
            <p>O catálogo atual do site ({summarize(data)}) será substituído para todas as clientes. Se quiser guardá-lo, exporte um backup antes.</p>
            <p>
              Os textos e as fotos do site (aba Site) e o que a loja oferece também ficam iguais aos do backup.
              {!Object.keys(pending.state.content ?? {}).length && ' Este backup não tem textos do site editados, então o site volta aos textos originais.'}
            </p>
          </div>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Restaurar o catálogo inicial?"
        confirmLabel={progress ? 'Restaurando…' : 'Restaurar'}
        tone="danger"
        onConfirm={() => void confirmRestore()}
        onCancel={() => !progress && setConfirmReset(false)}
      >
        <div className="flex flex-col gap-3">
          <p>Peças, categorias, informações da loja e textos do site voltam ao início, para todas as clientes. O PIN e as revendedoras continuam os mesmos.</p>
          <Button variant="secondary" size="sm" onClick={() => void exportNow()} className="self-start">
            <Download size={16} strokeWidth={1.5} /> Exportar backup antes
          </Button>
        </div>
      </ConfirmDialog>
    </div>
  );
}
