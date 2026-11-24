import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeed } from '../../data/seed';
import { migrateCatalog } from '../../data/integrity';
import { mockServer } from '../../test/mockApi';
import { useCatalog } from '../../store/catalog';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { backupFilename, catalogOf, exportCatalog, mediaOf, parseBackup, summarize, withEmbeddedMedia } from './BackupPage';

polyfillDialog();
resetStores();

const UPLOADED = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73/w==';

function catalogWithUpload() {
  const seed = createSeed();
  const [first, ...rest] = seed.products;
  return {
    ...seed,
    products: [{ ...first!, images: [...first!.images, { id: 'img-upload', src: UPLOADED, thumb: UPLOADED, alt: 'Foto enviada' }] }, ...rest],
    leads: [{ id: 'lead-1', name: 'Ana', whatsapp: '65999998888', city: 'Várzea Grande', uf: 'MT', alreadySells: true, createdAt: '2026-11-18T10:00:00.000Z' }],
  };
}

describe('backup', () => {
  it('round-trips the whole catalog, uploaded photos included', () => {
    const state = catalogWithUpload();
    const result = migrateCatalog(JSON.parse(exportCatalog(state)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state).toEqual(state);
  });

  it('names the file eka-catalogo-AAAA-MM-DD.json', () => {
    expect(backupFilename(new Date(2026, 10, 9))).toBe('eka-catalogo-2026-11-09.json');
  });

  it('summarizes counts in Portuguese', () => {
    expect(summarize(catalogWithUpload())).toMatch(/^\d+ produtos, 6 categorias, 2 coleções, 1 revendedora$/);
  });

  it('upgrades a v1 backup, dropping the old PIN hash', () => {
    const v1 = { ...createSeed(), schemaVersion: 1, settings: { ...createSeed().settings, pinHash: 'a'.repeat(64) } };
    const result = parseBackup(JSON.stringify(v1));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.state.settings).not.toHaveProperty('pinHash');
  });

  it('rejects malformed JSON and invalid catalogs', () => {
    expect(parseBackup('{"schemaVersion": 1, "products": [').ok).toBe(false);
    const invalid = parseBackup(JSON.stringify({ schemaVersion: 1, products: 'nope' }));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/Não foi possível usar este backup/);
  });

  it('carries uploaded photos inside the backup and points them back on import', () => {
    const key = `media/${'c'.repeat(64)}.webp`;
    const state = createSeed();
    state.products[0]!.images[0] = { ...state.products[0]!.images[0]!, src: key, thumb: key };
    const text = exportCatalog(state, { [key]: UPLOADED, 'media/evil.svg': 'data:image/svg+xml;base64,AAAA' });
    const parsed = parseBackup(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(Object.keys(parsed.media)).toEqual([key]); // invalid entries are dropped
    const restored = withEmbeddedMedia(catalogOf(parsed.state), parsed.media);
    expect(restored.products[0]!.images[0]).toMatchObject({ src: UPLOADED, thumb: UPLOADED });
    // Photos the live catalog already has are not sent again.
    expect(withEmbeddedMedia(catalogOf(parsed.state), parsed.media, new Set([key])).products[0]!.images[0]!.src).toBe(key);
    expect(mediaOf(null)).toEqual({});
  });

  it('imports only the catalog part (leads stay as they are)', () => {
    expect(catalogOf(catalogWithUpload())).not.toHaveProperty('leads');
  });
});

describe('backup page', { timeout: 20_000 }, () => {
  it('shows an error for a malformed file and leaves the catalog unchanged', async () => {
    unlockSession();
    const before = useCatalog.getState().data;
    const user = userEvent.setup();
    renderAdmin('/admin/backup');
    const input = await screen.findByLabelText(/Escolher arquivo de backup/);
    await user.upload(input, new File(['{ isto não é json'], 'backup.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este arquivo não é um backup do catálogo');
    expect(useCatalog.getState().data).toBe(before);
    expect(mockServer.requests.some((r) => r.path === '/api/admin/changes')).toBe(false);
    expect(screen.queryByRole('dialog', { name: 'Substituir o catálogo?' })).not.toBeInTheDocument();
  });

  it('imports a valid backup after confirmation', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/backup');
    const backup = catalogWithUpload();
    await user.upload(await screen.findByLabelText(/Escolher arquivo de backup/), new File([exportCatalog(backup)], 'eka.json', { type: 'application/json' }));
    const dialog = await screen.findByRole('dialog', { name: 'Substituir o catálogo?' });
    expect(dialog).toHaveTextContent('6 categorias');
    await user.click(screen.getByRole('button', { name: 'Substituir' }));
    expect(await screen.findByText(/Backup restaurado/)).toBeInTheDocument();
    const uploaded = useCatalog.getState().data.products[0]!.images.find((i) => i.id === 'img-upload');
    expect(uploaded?.src).toMatch(/^media\//); // the embedded photo was uploaded first
    expect(mockServer.catalog.products[0]!.images.some((i) => i.id === 'img-upload')).toBe(true);
    expect(mockServer.leads).toHaveLength(0);
  });
});
