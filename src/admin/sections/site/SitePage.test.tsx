import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../../data/seed';
import type { Change } from '../../../data/changes';
import { useCatalog } from '../../../store/catalog';
import { mockServer } from '../../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../../testUtils';

polyfillDialog();
resetStores();

/** Starts with an open session and the given saved sections on the (mock) server. */
function start(content?: ReturnType<typeof createCatalogSeed>['content']) {
  unlockSession();
  const catalog = { ...createCatalogSeed(), ...(content ? { content } : {}) };
  mockServer.catalog = catalog;
  useCatalog.setState({ data: catalog, version: 1, status: 'ready' });
}

// The page region comes first; a list inside may carry the same name.
const editor = async (name: string) => (await screen.findAllByRole('region', { name }))[0]!;
/** The editor is a page of the panel: "Voltar" leads back to the list. */
const back = () => screen.getByRole('link', { name: 'Voltar para Site' });
const sentChanges = () => mockServer.requests.filter((r) => r.path === '/api/admin/changes').flatMap((r) => (r.body as { changes: Change[] }).changes);

describe('Painel → Site', { timeout: 20_000 }, () => {
  it('lists every section in three groups with its state and opens the editor from a deep link', async () => {
    start({ contato: { header: { eyebrow: '', title: 'Fale com a', highlight: 'gente', intro: '' }, quickTitle: 'Oi', updatedAt: '2026-11-24T14:05:00.000Z' } });
    renderAdmin('/admin/site');
    expect(await screen.findByRole('heading', { name: 'Páginas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Listas' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Geral' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Site' })).toHaveAttribute('aria-current', 'page');
    const contato = screen.getByRole('heading', { name: 'Contato' }).closest('li')!;
    expect(within(contato).getByText(/^Editado em 24\/11\/2026/)).toBeInTheDocument();
    const sobre = screen.getByRole('heading', { name: 'Sobre' }).closest('li')!;
    expect(within(sobre).getByText('Texto original')).toBeInTheDocument();
    expect(within(sobre).getByRole('link', { name: /Ver no site/ })).toHaveAttribute('href', '/sobre');
    expect(screen.getByText(/Nenhum depoimento no site ainda/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Sobre' })).not.toBeInTheDocument();

    await userEvent.click(within(sobre).getByRole('button', { name: 'Editar Sobre' }));
    expect(await editor('Sobre')).toBeInTheDocument();
  });

  it('opens the editor from a deep link and ignores unknown sections', async () => {
    start();
    const { router } = renderAdmin('/admin/site?secao=sobre');
    const dialog = await editor('Sobre');
    expect(within(dialog).getByText('Texto original')).toBeInTheDocument();
    // "Remover" exists only where the site works without a photo; the built-in Sobre has none.
    expect(within(dialog).getByText('Sem foto, aparece o emblema da ÉKA.')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/admin/site/sobre');
    await userEvent.click(back());
    await waitFor(() => expect(router.state.location.pathname).toBe('/admin/site'));
    await router.navigate('/admin/site/loja');
    expect(screen.queryByRole('region', { name: 'Loja' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Páginas' })).toBeVisible();
  });

  it('saves a section with the moment of the save, only after the server confirms, and restores the original', async () => {
    start();
    renderAdmin('/admin/site?secao=contato');
    const dialog = await editor('Contato');
    const save = within(dialog).getByRole('button', { name: 'Salvar' });
    expect(save).toBeDisabled();
    const field = within(dialog).getByRole('textbox', { name: /Título da mensagem rápida/ });
    await userEvent.clear(field);
    await userEvent.type(field, 'Chama no Zap');
    expect(within(dialog).getByText('12/60', { exact: false })).toBeInTheDocument();
    await userEvent.click(save);
    await screen.findByText('Contato: alterações salvas. O site já mostra a versão nova.');
    const saved = mockServer.catalog.content?.contato;
    expect(saved?.quickTitle).toBe('Chama no Zap');
    expect(Date.parse(saved?.updatedAt ?? '')).not.toBeNaN();
    expect(within(dialog).getByText(/^Editado em/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeDisabled(); // the draft starts over from what was saved

    await userEvent.click(within(dialog).getByRole('button', { name: /Restaurar o texto original/ }));
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Restaurar o texto original?' })).getByRole('button', { name: 'Restaurar' }));
    await screen.findByText('Contato: o site voltou ao texto original.');
    expect(mockServer.catalog.content).not.toHaveProperty('contato');
    expect(sentChanges().at(-1)).toEqual({ kind: 'content', op: 'delete', id: 'contato' });
    expect(within(dialog).getByRole('textbox', { name: /Título da mensagem rápida/ })).toHaveValue('Mensagem rápida');
  });

  it('puts validation errors next to their fields and focuses the first one', async () => {
    start();
    renderAdmin('/admin/site?secao=contato');
    const dialog = await editor('Contato');
    const title = within(dialog).getByRole('textbox', { name: 'Título' });
    await userEvent.clear(title);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Preencha este campo.')).toBeInTheDocument();
    expect(title).toHaveAttribute('aria-invalid', 'true');
    expect(title.getAttribute('aria-describedby')).toContain('error');
    await waitFor(() => expect(title).toHaveFocus());
    expect(within(dialog).getByText('Falta corrigir 1 campo, destacado abaixo.')).toBeInTheDocument();
    expect(sentChanges()).toHaveLength(0);
    // Typing clears the error.
    await userEvent.type(title, 'Fale com a');
    expect(within(dialog).queryByText('Preencha este campo.')).not.toBeInTheDocument();
  });

  it('shows a text over the limit right away', async () => {
    start();
    renderAdmin('/admin/site?secao=contato');
    const dialog = await editor('Contato');
    const field = within(dialog).getByRole('textbox', { name: /Título da mensagem rápida/ });
    await userEvent.clear(field);
    await userEvent.click(field);
    await userEvent.paste('x'.repeat(61));
    expect(within(dialog).getByText('Use no máximo 60 caracteres (agora são 61).')).toBeInTheDocument();
  });

  it('keeps the draft and the server message on a conflict', async () => {
    start();
    renderAdmin('/admin/site?secao=contato');
    const dialog = await editor('Contato');
    const field = within(dialog).getByRole('textbox', { name: /Título da mensagem rápida/ });
    await userEvent.clear(field);
    await userEvent.type(field, 'Minha versão');
    mockServer.failNext = { status: 409, code: 'conflict', message: '“Contato” foi alterado em outro aparelho.' };
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    const alert = await within(dialog).findByText(/foi alterado em outro aparelho\. O que você escreveu continua aqui\./);
    expect(alert).toHaveAttribute('role', 'alert');
    expect(field).toHaveValue('Minha versão');
    expect(within(dialog).getByRole('button', { name: 'Salvar' })).toBeEnabled();
    expect(mockServer.catalog.content?.contato).toBeUndefined();
    expect(screen.queryByText(/alterações salvas/)).not.toBeInTheDocument();
  });

  it('asks before closing with unsaved changes', async () => {
    start();
    renderAdmin('/admin/site?secao=contato');
    const dialog = await editor('Contato');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /Título da mensagem rápida/ }), '!');
    await userEvent.click(back());
    const confirm = await screen.findByRole('dialog', { name: 'Descartar alterações?' });
    await userEvent.click(within(confirm).getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('region', { name: 'Contato' })).toBeInTheDocument();
    await userEvent.click(back());
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Descartar alterações?' })).getByRole('button', { name: 'Descartar' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Contato' })).not.toBeInTheDocument());
    expect(sentChanges()).toHaveLength(0);
  });

  it('edits lists inside a section (add, then save)', async () => {
    start();
    renderAdmin('/admin/site?secao=perguntas');
    const dialog = await editor('Perguntas frequentes');
    const before = within(dialog).getAllByRole('textbox', { name: /^Pergunta/ }).length;
    await userEvent.click(within(dialog).getByRole('button', { name: 'Adicionar pergunta' }));
    const questions = within(dialog).getAllByRole('textbox', { name: /^Pergunta/ });
    expect(questions).toHaveLength(before + 1);
    await waitFor(() => expect(questions.at(-1)).toHaveFocus());
    await userEvent.type(questions.at(-1)!, 'Vocês fazem embrulho para presente?');
    // The answer is required: saving shows the error on it.
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    const answers = within(dialog).getAllByRole('textbox', { name: /^Resposta/ });
    await waitFor(() => expect(answers.at(-1)).toHaveFocus());
    expect(answers.at(-1)).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(answers.at(-1)!, 'Sim, com carinho.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText(/Perguntas frequentes: alterações salvas/);
    expect(mockServer.catalog.content?.perguntas?.items.at(-1)).toMatchObject({ question: 'Vocês fazem embrulho para presente?', answer: 'Sim, com carinho.' });
  });
});

describe('Depoimentos', { timeout: 20_000 }, () => {
  it('requires the authorization before a testimonial is saved, then counts it on the card', async () => {
    start();
    renderAdmin('/admin/site?secao=depoimentos');
    const dialog = await editor('Depoimentos');
    expect(within(dialog).getByText(/Código de Defesa do Consumidor/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Novo depoimento' }));
    await userEvent.type(within(dialog).getByRole('textbox', { name: /O que a cliente disse/ }), 'As peças são lindas e chegaram rápido.');
    await userEvent.type(within(dialog).getByRole('textbox', { name: /^Nome/ }), 'Ana P.');
    expect(within(dialog).getByRole('figure', { name: 'Prévia do depoimento no site' })).toHaveTextContent('“As peças são lindas e chegaram rápido.”Ana P.');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    const checkbox = within(dialog).getByRole('checkbox', { name: /A cliente autorizou publicar este depoimento/ });
    expect(await within(dialog).findByText('Confirme que a cliente autorizou publicar.')).toBeInTheDocument();
    await waitFor(() => expect(checkbox).toHaveFocus());
    expect(sentChanges()).toHaveLength(0);

    await userEvent.click(checkbox);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByText(/Depoimentos: alterações salvas/);
    expect(mockServer.catalog.content?.depoimentos?.items).toEqual([
      expect.objectContaining({ text: 'As peças são lindas e chegaram rápido.', name: 'Ana P.', city: '', authorized: true }),
    ]);

    // No "hidden" state: the public catalog would still carry it. Leaving the site = deleting.
    expect(within(dialog).queryByRole('switch', { name: /Mostrar no site/ })).not.toBeInTheDocument();
    await userEvent.click(back());
    await waitFor(() => expect(screen.queryAllByRole('region', { name: 'Depoimentos' })).toHaveLength(0));
    expect(screen.getByText('depoimento no site', { exact: false })).toBeInTheDocument();
  });
});
