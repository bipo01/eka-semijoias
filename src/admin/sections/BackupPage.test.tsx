import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createSeed } from '../../data/seed';
import { migrateCatalog } from '../../data/storage';
import { useCatalog } from '../../store/catalog';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { backupFilename, exportCatalog, parseBackup, resetCatalog, summarize } from './BackupPage';

polyfillDialog();
resetStores();

const UPLOADED = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73/w==';

function catalogWithUpload() {
  const seed = createSeed();
  const [first, ...rest] = seed.products;
  return {
    ...seed,
    products: [{ ...first!, images: [...first!.images, { id: 'img-upload', src: UPLOADED, thumb: UPLOADED, alt: 'Foto enviada' }] }, ...rest],
    leads: [{ id: 'lead-1', name: 'Ana', whatsapp: '67999998888', city: 'Dourados', uf: 'MS', alreadySells: true, createdAt: '2026-11-18T10:00:00.000Z' }],
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

  it('keeps the current PIN when importing', () => {
    const backup = { ...createSeed(), settings: { ...createSeed().settings, pinHash: 'a'.repeat(64) } };
    const result = parseBackup(JSON.stringify(backup), 'b'.repeat(64));
    expect(result.ok && result.state.settings.pinHash).toBe('b'.repeat(64));
  });

  it('rejects malformed JSON and invalid catalogs', () => {
    expect(parseBackup('{"schemaVersion": 1, "products": [', 'b'.repeat(64)).ok).toBe(false);
    const invalid = parseBackup(JSON.stringify({ schemaVersion: 1, products: 'nope' }), 'b'.repeat(64));
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error).toMatch(/Não foi possível usar este backup/);
  });

  it('resets to the seed but keeps the PIN', () => {
    const reset = resetCatalog('c'.repeat(64));
    expect(reset.products).toEqual(createSeed().products);
    expect(reset.leads).toEqual([]);
    expect(reset.settings.pinHash).toBe('c'.repeat(64));
  });
});

describe('backup page', { timeout: 20_000 }, () => {
  it('shows an error for a malformed file and leaves the catalog unchanged', async () => {
    unlockSession();
    const before = useCatalog.getState().data;
    const user = userEvent.setup();
    renderAdmin('/admin/backup');
    const input = screen.getByLabelText(/Escolher arquivo de backup/);
    await user.upload(input, new File(['{ isto não é json'], 'backup.json', { type: 'application/json' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Este arquivo não é um backup do catálogo');
    expect(useCatalog.getState().data).toBe(before);
    expect(screen.queryByRole('dialog', { name: 'Substituir o catálogo?' })).not.toBeInTheDocument();
  });

  it('imports a valid backup after confirmation', async () => {
    unlockSession();
    const user = userEvent.setup();
    renderAdmin('/admin/backup');
    const backup = catalogWithUpload();
    await user.upload(screen.getByLabelText(/Escolher arquivo de backup/), new File([exportCatalog(backup)], 'eka.json', { type: 'application/json' }));
    const dialog = await screen.findByRole('dialog', { name: 'Substituir o catálogo?' });
    expect(dialog).toHaveTextContent('1 revendedora');
    await user.click(screen.getByRole('button', { name: 'Substituir' }));
    expect(useCatalog.getState().data.leads).toHaveLength(1);
    expect(useCatalog.getState().data.products[0]!.images.some((i) => i.id === 'img-upload')).toBe(true);
  });
});
