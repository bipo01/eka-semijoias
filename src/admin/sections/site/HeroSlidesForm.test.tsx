import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../../data/seed';
import { processImage } from '../../../lib/image';
import { useCatalog } from '../../../store/catalog';
import { mockServer } from '../../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../../testUtils';

const PHOTO = 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAAfQ//73/w==';

// jsdom has no canvas: the pipeline itself is covered in src/lib/image.test.ts.
vi.mock('../../../lib/image', async (original) => ({
  ...(await original<typeof import('../../../lib/image')>()),
  processImage: vi.fn(async () => ({ ok: true, src: PHOTO, thumb: PHOTO, bytes: 100 })),
}));

polyfillDialog();
resetStores();

const file = () => new File([new Uint8Array(10)], 'foto.jpg', { type: 'image/jpeg' });

async function openEditor() {
  unlockSession();
  const catalog = createCatalogSeed();
  mockServer.catalog = catalog;
  useCatalog.setState({ data: catalog, version: 1, status: 'ready' });
  renderAdmin('/admin/site?secao=inicio');
  // The first render also loads the admin chunk (slow on a busy machine).
  const dialog = await screen.findByRole('dialog', { name: 'Página inicial' }, { timeout: 5000 });
  const list = within(dialog).getByRole('region', { name: 'Fotos do topo' });
  return { dialog, list, slide: (i: number) => within(list).getAllByRole('listitem')[i]! };
}

async function save(dialog: HTMLElement) {
  await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
  await screen.findByText(/Página inicial: alterações salvas/, undefined, { timeout: 5000 });
  return mockServer.catalog.content!.inicio!.hero;
}

const savedSlide = (i: number) => mockServer.catalog.content!.inicio!.hero.slides[i]!;

describe('hero slides editor', { timeout: 30_000 }, () => {
  it('shows the built-in slides with the framing of each screen', async () => {
    const { list, slide } = await openEditor();
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(within(list).getByText('3 de 5')).toBeInTheDocument();
    const framing = within(slide(0)).getByRole('group', { name: 'Enquadramento em cada tela' });
    const chips = within(framing).getAllByRole('radio');
    expect(chips.map((c) => c.closest('label')!.textContent)).toEqual([
      expect.stringContaining('Celular'),
      expect.stringContaining('Tablet em pé'),
      expect.stringContaining('Tablet deitado'),
      expect.stringContaining('Computador'),
      expect.stringContaining('Tela grande'),
    ]);
    expect(chips[0]).toBeChecked();
    // The phone preview is a 4:5 box with the area the headline covers drawn on it.
    const preview = within(framing).getByRole('group', { name: /Foto na tela Celular/ });
    expect(preview.style.aspectRatio).toBe('4 / 5');
    expect(within(preview).getByText('Aqui fica o título')).toBeInTheDocument();
    expect(preview.querySelector('img')!.getAttribute('srcset')).toContain('/images/hero/colo-celular-640.webp');
    // Other screens: their own shape, nothing over the photo.
    await userEvent.click(within(framing).getByRole('radio', { name: /Tela grande/ }));
    const wide = within(framing).getByRole('group', { name: /Foto na tela Tela grande/ });
    expect(wide.style.aspectRatio).toBe('16 / 9');
    expect(within(wide).queryByText('Aqui fica o título')).not.toBeInTheDocument();
    expect(wide.querySelector('img')!.getAttribute('srcset')).toContain('/images/hero/colo-amplo-1600.webp');
  });

  it('dragging and the arrow keys move the focus, the zoom grows around it, and both are saved', async () => {
    const { dialog, slide } = await openEditor();
    const framing = within(slide(0)).getByRole('group', { name: 'Enquadramento em cada tela' });
    const preview = within(framing).getByRole('group', { name: /Foto na tela Celular/ });

    // Arrow left moves the photo left: the focus goes right.
    preview.focus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{Shift>}{ArrowUp}{/Shift}');
    expect(preview).toHaveAccessibleName(/foco a 54% da esquerda e 60% do topo/);

    // Zoom 200 %: a 4:5 photo in a 400×500 box has 400 px to spare sideways.
    const zoom = within(framing).getByRole('slider', { name: 'Zoom' });
    fireEvent.change(zoom, { target: { value: '200' } });
    expect(within(framing).getByText('200%')).toBeInTheDocument();
    const img = preview.querySelector('img')!;
    expect(img.style.transform).toBe('scale(2)');
    expect(img.style.transformOrigin).toBe('54% 60%');
    Object.defineProperty(img, 'naturalWidth', { value: 1024 });
    Object.defineProperty(img, 'naturalHeight', { value: 1280 });
    fireEvent.load(img);
    vi.spyOn(preview, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 500, width: 400, height: 500, toJSON: () => ({}) });

    // Dragging the photo 100 px left shows more of its right side (+25 %); only the preview follows until the finger lifts.
    fireEvent.pointerDown(preview, { pointerId: 1, button: 0, clientX: 200, clientY: 250 });
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 150, clientY: 250 });
    expect(img.style.objectPosition).toBe('67% 60%');
    fireEvent.pointerMove(preview, { pointerId: 1, clientX: 100, clientY: 250 });
    fireEvent.pointerUp(preview, { pointerId: 1, clientX: 100, clientY: 250 });
    expect(preview).toHaveAccessibleName(/foco a 79% da esquerda e 60% do topo/);
    // The chip tells which screens were adjusted.
    expect(within(framing).getByRole('radio', { name: /Celular.*ajustado/ })).toBeChecked();

    const hero = await save(dialog);
    expect(hero.slides[0]!.frames.celular).toEqual({ image: { src: 'images/hero/colo-celular', alt: hero.slides[0]!.alt }, x: 79, y: 60, zoom: 2 });
    expect(hero.slides[0]!.frames.tablet).toMatchObject({ x: 50, y: 50, zoom: 1 }); // other screens untouched
  });

  it('"Voltar ao enquadramento automático" brings back the centered photo without zoom', async () => {
    const { dialog, slide } = await openEditor();
    const framing = within(slide(1)).getByRole('group', { name: 'Enquadramento em cada tela' });
    await userEvent.click(within(framing).getByRole('radio', { name: /Computador/ }));
    const preview = within(framing).getByRole('group', { name: /Foto na tela Computador/ });
    expect(within(framing).queryByRole('button', { name: /Voltar ao enquadramento automático/ })).not.toBeInTheDocument();
    preview.focus();
    await userEvent.keyboard('{ArrowDown}');
    fireEvent.change(within(framing).getByRole('slider', { name: 'Zoom' }), { target: { value: '150' } });
    expect(preview).toHaveAccessibleName(/foco a 50% da esquerda e 48% do topo/);
    await userEvent.click(within(framing).getByRole('button', { name: /Voltar ao enquadramento automático/ }));
    expect(preview).toHaveAccessibleName(/foco a 50% da esquerda e 50% do topo/);
    expect(within(framing).getByRole('slider', { name: 'Zoom' })).toHaveValue('100');
    expect(within(framing).queryByRole('button', { name: /Voltar ao enquadramento automático/ })).not.toBeInTheDocument();
    // Nothing changed: there is nothing to save.
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('a screen can get its own photo, and go back to the main one', async () => {
    const { dialog, slide } = await openEditor();
    const framing = within(slide(0)).getByRole('group', { name: 'Enquadramento em cada tela' });
    await userEvent.click(within(framing).getByRole('radio', { name: /Tablet em pé/ }));
    await userEvent.upload(within(framing).getByLabelText(/Trocar a foto desta tela/), file());
    expect(processImage).toHaveBeenLastCalledWith(expect.any(File), { profile: 'wide' });
    expect(within(framing).getByRole('group', { name: /Foto na tela Tablet em pé/ }).querySelector('img')).toHaveAttribute('src', PHOTO);

    // The computer screen goes back to the main photo (its entry disappears: automatic framing).
    await userEvent.click(within(framing).getByRole('radio', { name: /Computador/ }));
    await userEvent.click(within(framing).getByRole('button', { name: /Usar a foto principal/ }));
    expect(within(framing).queryByRole('button', { name: /Usar a foto principal/ })).not.toBeInTheDocument();
    expect(within(framing).getByLabelText(/Usar outra foto só nesta tela/)).toBeInTheDocument();

    await save(dialog);
    const frames = savedSlide(0).frames;
    expect(frames.tablet?.image?.src).toMatch(/^media\/[a-f0-9]{64}\.webp$/);
    expect(frames.tablet).toMatchObject({ x: 50, y: 50, zoom: 1 });
    expect(frames.computador).toBeUndefined();
    expect(savedSlide(0).image.src).toBe('images/hero/colo-computador');
  });

  it('a new main photo starts a new framing; photos can be added (wide profile) and the interval changed', async () => {
    const { dialog, list, slide } = await openEditor();
    const main = within(slide(2)).getByRole('group', { name: 'Foto principal' });
    await userEvent.upload(within(main).getByLabelText(/Enviar outra foto/), file());
    expect(processImage).toHaveBeenLastCalledWith(expect.any(File), { profile: 'wide' });
    await userEvent.type(within(main).getByRole('textbox', { name: /Descrição da foto/ }), 'Colar no colo');

    await userEvent.click(within(list).getByRole('button', { name: 'Adicionar foto' }));
    const add = await screen.findByRole('dialog', { name: 'Adicionar foto ao topo' });
    await userEvent.upload(within(add).getByLabelText(/Enviar foto/), file());
    expect(processImage).toHaveBeenLastCalledWith(expect.any(File), { profile: 'wide' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);

    const interval = within(dialog).getByRole('slider', { name: 'Trocar de foto a cada' });
    expect(interval).toHaveValue('6');
    fireEvent.change(interval, { target: { value: '9' } });
    expect(interval).toHaveAccessibleDescription('A troca para enquanto a cliente mexe nas fotos.');

    const hero = await save(dialog);
    expect(hero.interval).toBe(9);
    expect(hero.slides).toHaveLength(4);
    expect(hero.slides[2]).toMatchObject({ alt: 'Colar no colo', image: { alt: 'Colar no colo' }, frames: {} });
    expect(hero.slides[2]!.image.src).toMatch(/^media\//);
    expect(hero.slides[3]!.image.src).toMatch(/^media\//);
  });

  it('each photo can have her own name: the item title in the panel, saved with the slide', async () => {
    const { dialog, list, slide } = await openEditor();
    expect(within(list).getAllByRole('heading', { level: 4 }).map((h) => h.textContent)).toEqual([
      'Foto 1 · Brinco e colar',
      'Foto 2 · Anel e pulseira',
      'Foto 3 · Pulseira na seda',
    ]);
    const name = within(slide(1)).getByRole('textbox', { name: /Nome da foto/ });
    await userEvent.clear(name);
    expect(within(slide(1)).getByRole('heading', { level: 4 })).toHaveTextContent(/^Foto 2$/);
    await userEvent.type(name, 'Mão com anéis');
    expect(within(slide(1)).getByRole('heading', { level: 4 })).toHaveTextContent('Foto 2 · Mão com anéis');
    const hero = await save(dialog);
    expect(hero.slides.map((s) => s.name)).toEqual(['Brinco e colar', 'Mão com anéis', 'Pulseira na seda']);
  });

  it('"Revezar as fotos" off keeps every photo but shows the first one still; the seconds hide', async () => {
    const { dialog, list } = await openEditor();
    const rotate = within(dialog).getByRole('switch', { name: 'Revezar as fotos' });
    expect(rotate).toBeChecked();
    expect(within(dialog).getByRole('slider', { name: 'Trocar de foto a cada' })).toBeInTheDocument();
    await userEvent.click(rotate);
    expect(rotate).not.toBeChecked();
    expect(within(dialog).getByText(/Só a Foto 1 aparece, parada/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('slider', { name: 'Trocar de foto a cada' })).not.toBeInTheDocument();
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    const hero = await save(dialog);
    expect(hero.rotate).toBe(false);
    expect(hero.slides).toHaveLength(3);
  });

  it('keeps at least one photo and at most five', async () => {
    const { list } = await openEditor();
    await userEvent.click(within(list).getByRole('button', { name: 'Apagar foto 3' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Apagar esta foto?' })).getByRole('button', { name: 'Apagar' }));
    await userEvent.click(within(list).getByRole('button', { name: 'Apagar foto 2' }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Apagar esta foto?' })).getByRole('button', { name: 'Apagar' }));
    expect(within(list).getByRole('button', { name: 'Apagar foto 1' })).toBeDisabled();
    expect(screen.getByText(/Com uma foto só, ela fica parada no topo/)).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: 'Trocar de foto a cada' })).not.toBeInTheDocument();
    for (let i = 0; i < 4; i++) {
      await userEvent.click(within(list).getByRole('button', { name: 'Adicionar foto' }));
      await userEvent.upload(within(await screen.findByRole('dialog', { name: 'Adicionar foto ao topo' })).getByLabelText(/Enviar foto/), file());
    }
    expect(within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(within(list).getByRole('button', { name: 'Adicionar foto' })).toBeDisabled();
  });
});
