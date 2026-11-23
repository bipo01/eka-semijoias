import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { polyfillDialog } from '../../testUtils';
import { StandardizeError } from './engine';

// The canvas/AI side cannot run in jsdom: the engine and the canvas helpers are replaced by fakes,
// so these tests cover the sheet's flow (tips, progress, review, retouch entry, errors, choices).
const engine = vi.hoisted(() => ({
  getEngine: vi.fn(),
  releaseEngine: vi.fn(),
}));
const image = vi.hoisted(() => ({ processImage: vi.fn() }));
const cache = vi.hoisted(() => ({ cached: false }));

vi.mock('./engine', async (orig) => ({ ...(await orig<typeof import('./engine')>()), getEngine: engine.getEngine, releaseEngine: engine.releaseEngine }));
vi.mock('../../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../../lib/image')>()), processImage: image.processImage }));
vi.mock('./prefs', async (orig) => ({ ...(await orig<typeof import('./prefs')>()), isModelCached: async () => cache.cached }));
vi.mock('./compose', () => {
  const canvas = () => ({ width: 40, height: 50 }) as HTMLCanvasElement;
  return {
    loadSource: vi.fn(async () => canvas()),
    cutOut: vi.fn(async (segment: (rgba: Uint8ClampedArray) => Promise<Uint8ClampedArray>) => {
      await segment(new Uint8ClampedArray(4));
      return canvas();
    }),
    readAlpha: vi.fn(() => new Uint8ClampedArray(40 * 50).fill(255)),
    compose: vi.fn(() => canvas()),
    canvasToBlob: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
    releaseCanvas: vi.fn(),
    renderRetouchView: vi.fn(),
    paintStroke: vi.fn(),
    writeAlpha: vi.fn(),
    makeCanvas: vi.fn(canvas),
  };
});

const { default: StandardizeSheet } = await import('./StandardizeSheet');

polyfillDialog();

function fakeEngine() {
  return { model: { size: 512 }, device: 'wasm', segment: vi.fn(async () => new Uint8ClampedArray(512 * 512)), dispose: vi.fn() };
}

beforeEach(() => {
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() }));
  cache.cached = false;
  engine.getEngine.mockReset();
  engine.releaseEngine.mockReset();
  image.processImage.mockReset();
});
afterEach(() => vi.unstubAllGlobals());

function setup() {
  const onApply = vi.fn();
  const onClose = vi.fn();
  const { unmount } = render(<StandardizeSheet source={new Blob(['x'], { type: 'image/jpeg' })} onApply={onApply} onClose={onClose} />);
  return { onApply, onClose, unmount, user: userEvent.setup() };
}

describe('StandardizeSheet', () => {
  it('shows the photo tips and the Wi-Fi advice before the first use, then standardizes', async () => {
    engine.getEngine.mockImplementation(async (onProgress?: (l: number, t: number) => void) => {
      onProgress?.(50_000_000, 98_000_000);
      return fakeEngine();
    });
    image.processImage.mockResolvedValue({ ok: true, src: 'data:image/webp;base64,AAA=', thumb: 'data:image/webp;base64,BBB=', bytes: 3 });
    const { onApply, user } = setup();

    expect(screen.getByRole('heading', { name: 'Antes de padronizar' })).toBeInTheDocument();
    expect(screen.getByText(/Fundo liso/)).toBeInTheDocument();
    expect(screen.getByText(/Sem flash/)).toBeInTheDocument();
    expect(screen.getByText(/Use o Wi-Fi/)).toBeInTheDocument();
    expect(engine.getEngine).not.toHaveBeenCalled(); // nothing downloads before she agrees

    await user.click(screen.getByRole('button', { name: /Padronizar/ }));
    expect(await screen.findByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto original' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Foto padronizada/ })).toBeInTheDocument();
    expect(localStorage.getItem('eka:standardizer:v1')).toContain('tips');

    await user.click(screen.getByRole('button', { name: 'Usar a padronizada' }));
    expect(image.processImage).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/png' }));
    expect(onApply).toHaveBeenCalledWith({ src: 'data:image/webp;base64,AAA=', thumb: 'data:image/webp;base64,BBB=' });
  });

  it('skips the tips once seen and lets her keep the original', async () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ tips: true }));
    cache.cached = true;
    engine.getEngine.mockResolvedValue(fakeEngine());
    const { onApply, onClose, user } = setup();

    expect(await screen.findByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Manter a original' }));
    expect(onClose).toHaveBeenCalled();
    expect(onApply).not.toHaveBeenCalled();
  });

  it('explains a failed model download and offers to try again or keep the original', async () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ tips: true }));
    engine.getEngine.mockRejectedValueOnce(new StandardizeError('network')).mockResolvedValueOnce(fakeEngine());
    const { user } = setup();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Não conseguimos baixar o recorte inteligente/);
    expect(screen.getByRole('button', { name: 'Manter a original' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(await screen.findByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
  });

  it('reports a failed save of the standardized photo and stays on the review', async () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ tips: true }));
    engine.getEngine.mockResolvedValue(fakeEngine());
    image.processImage.mockResolvedValue({ ok: false, reason: 'too-large', message: 'Esta foto é grande demais.' });
    const { onApply, user } = setup();

    await user.click(await screen.findByRole('button', { name: 'Usar a padronizada' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esta foto é grande demais.');
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
  });

  it('opens the retouch brush with labelled controls', async () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ tips: true }));
    engine.getEngine.mockResolvedValue(fakeEngine());
    const { user } = setup();

    await user.click(await screen.findByRole('button', { name: /Retocar/ }));
    expect(screen.getByRole('heading', { name: 'Retocar o recorte' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Apagar/ })).toBeChecked();
    await user.click(screen.getByRole('radio', { name: /Restaurar/ }));
    expect(screen.getByRole('radio', { name: /Restaurar/ })).toBeChecked();
    expect(screen.getByRole('slider', { name: 'Tamanho do pincel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Desfazer/ })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ver resultado' }));
    expect(await screen.findByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
  });

  it('stops a download still running when the sheet closes, and keeps a ready engine warm', async () => {
    localStorage.setItem('eka:standardizer:v1', JSON.stringify({ tips: true }));
    engine.getEngine.mockReturnValue(new Promise(() => undefined));
    const first = setup();
    expect(await screen.findByRole('heading', { name: 'Baixando o padronizador' })).toBeInTheDocument();
    first.unmount();
    expect(engine.releaseEngine).toHaveBeenLastCalledWith(true);

    engine.getEngine.mockResolvedValue(fakeEngine());
    const second = setup();
    expect(await screen.findByRole('heading', { name: 'Antes e depois' })).toBeInTheDocument();
    second.unmount();
    expect(engine.releaseEngine).toHaveBeenLastCalledWith(false);
  });
});
