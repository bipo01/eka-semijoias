import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createCatalogSeed } from '../../data/seed';
import { useCatalog } from '../../store/catalog';
import { mockServer } from '../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { installmentOptions } from './LojaSettings';
import { DONE_WHEN } from './SettingsPage';

polyfillDialog();
resetStores();

const seed = createCatalogSeed();
const loja = { hypoallergenic: null, shipsNationwide: null, installments: 0, plating: '', consignment: null, noUpfrontInvestment: null };

describe('“O que a loja oferece”', { timeout: 20_000 }, () => {
  it('saves the facts as the loja section, without touching the settings', async () => {
    unlockSession();
    const messages = { active: { contato: 'contato.curta' }, edited: {}, custom: [] };
    mockServer.catalog = { ...seed, settings: { ...seed.settings, messages } };
    useCatalog.setState({ data: mockServer.catalog, version: 1, status: 'ready' });
    renderAdmin('/admin/configuracoes?aba=oferta');
    const card = (await screen.findByRole('heading', { name: 'O que a loja oferece' })).closest('form')!;
    const save = within(card).getByRole('button', { name: 'Salvar o que a loja oferece' });
    expect(within(card).getByText(/Você ainda não confirmou estas respostas/)).toBeInTheDocument();
    expect(save).toBeDisabled();

    const hypo = within(card).getByRole('group', { name: 'Peças antialérgicas' });
    await userEvent.click(within(hypo).getByRole('radio', { name: 'Sim' }));
    const consignment = within(card).getByRole('group', { name: 'Revenda em consignado' });
    await userEvent.click(within(consignment).getByRole('radio', { name: 'Não' }));
    await userEvent.selectOptions(within(card).getByRole('combobox', { name: /Parcelamento sem juros/ }), '3');
    await userEvent.type(within(card).getByRole('textbox', { name: /Banho das peças/ }), 'banho de ouro 18k');
    await userEvent.click(save);
    await screen.findByText('Pronto: o site já mostra o que a loja oferece.');

    expect(mockServer.catalog.content?.loja).toMatchObject({ hypoallergenic: true, consignment: false, installments: 3, plating: 'banho de ouro 18k' });
    expect(Date.parse(mockServer.catalog.content?.loja?.updatedAt ?? '')).not.toBeNaN();
    expect(mockServer.catalog.settings).toEqual({ ...seed.settings, messages });
    await waitFor(() => expect(save).toBeDisabled());

    // The checklist (tab Loja) marks what was answered.
    await userEvent.click(screen.getByRole('button', { name: 'Loja' }));
    const checklist = await screen.findByRole('region', { name: 'Complete as informações da loja' });
    const item = (label: string) => within(checklist).getAllByRole('listitem').find((li) => li.textContent?.includes(label));
    expect(item('Se as peças são antialérgicas/sem níquel')).toHaveTextContent(/^Feito:/);
    expect(item('Material e especificação do banho das peças')).toHaveTextContent(/^Feito:/);
    // Shipping was shown as “Sim” (the starting value) and saved with the card: now it is her answer.
    expect(mockServer.catalog.content?.loja?.shipsNationwide).toBe(true);
    expect(item('Formas de envio e frete')).toHaveTextContent(/^Feito:/);
    expect(item('Regras do programa de revendedoras (consignado, comissão)')).toHaveTextContent(/^A fazer:/); // “sem investimento” still “Não informar”
  });

  it('offers “Não mostrar” and 2x to 12x, keeping a stored value outside that range', () => {
    expect(installmentOptions(0)).toEqual([0, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(installmentOptions(18).at(-1)).toBe(18);
  });
});

describe('checklist', () => {
  const done = (key: string, content: Parameters<NonNullable<(typeof DONE_WHEN)[string]>>[1]) => DONE_WHEN[key]!(seed.settings, content);

  it('counts the store facts only once she answered them', () => {
    expect(done('shipping', undefined)).toBe(false); // the unconfirmed starting value does not count
    expect(done('shipping', { loja: { ...loja, shipsNationwide: false } })).toBe(true);
    expect(done('hypoallergenic', { loja })).toBe(false);
    expect(done('plating', { loja: { ...loja, plating: '  ' } })).toBe(false);
    expect(done('reseller', { loja: { ...loja, consignment: true } })).toBe(false);
    expect(done('reseller', { loja: { ...loja, consignment: true, noUpfrontInvestment: false } })).toBe(true);
  });

  it('counts testimonials when at least one is on the site, and Sobre once it was edited', () => {
    const t = { id: 'd1', text: 'Amei', name: 'Ana', city: '', authorized: true as const };
    expect(done('testimonials', { depoimentos: { items: [] } })).toBe(false);
    expect(done('testimonials', { depoimentos: { items: [t] } })).toBe(true);
    expect(done('about', undefined)).toBe(false);
    const sobre = { header: { eyebrow: '', title: 'Oi', highlight: '', intro: '' }, story: 'História', signature: '', image: null, valuesTitle: 'Valores', values: [] };
    expect(done('about', { sobre })).toBe(true);
  });

  it('never overwrites answers another device saved while this form had changes', async () => {
    unlockSession();
    mockServer.catalog = { ...seed, content: { loja } };
    useCatalog.setState({ data: mockServer.catalog, version: 1, status: 'ready' });
    renderAdmin('/admin/configuracoes?aba=oferta');
    const card = (await screen.findByRole('heading', { name: 'O que a loja oferece' })).closest('form')!;
    await userEvent.click(within(within(card).getByRole('group', { name: 'Peças antialérgicas' })).getByRole('radio', { name: 'Sim' }));
    // Another device saves "envio = Sim" meanwhile (live refresh).
    const other = { ...loja, shipsNationwide: true, updatedAt: new Date().toISOString() };
    mockServer.catalog = { ...mockServer.catalog, content: { loja: other } };
    useCatalog.setState({ data: mockServer.catalog, version: 2 });
    await userEvent.click(within(card).getByRole('button', { name: 'Salvar o que a loja oferece' }));
    await screen.findByText(/Outro aparelho salvou estas respostas/);
    expect(mockServer.catalog.content?.loja).toEqual(other);
    const envio = within(card).getByRole('group', { name: 'Envio para todo o Brasil' });
    expect(within(envio).getByRole('radio', { name: 'Sim' })).toBeChecked();
  });
});
