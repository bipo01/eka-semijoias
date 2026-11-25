import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { createCatalogSeed } from '../../data/seed';
import type { PixKeyKind } from '../../lib/pix';
import { useCatalog } from '../../store/catalog';
import { mockServer } from '../../test/mockApi';
import { polyfillDialog, renderAdmin, resetStores, unlockSession } from '../testUtils';
import { PixKeyField, pixKeyStatus } from './PixKeyField';

polyfillDialog();
resetStores();

function Harness({ initialKind = 'cpf', initial = '' }: { initialKind?: PixKeyKind; initial?: string }) {
  const [state, setState] = useState({ kind: initialKind, key: initial });
  return <PixKeyField kind={state.kind} value={state.key} onChange={(kind, key) => setState({ kind, key })} />;
}

const keyBox = () => screen.getByRole('textbox', { name: 'Chave Pix' }) as HTMLInputElement;
const kindBox = () => screen.getByRole('combobox', { name: 'Tipo de chave' }) as HTMLSelectElement;
const paste = (text: string) => fireEvent.paste(keyBox(), { clipboardData: { getData: () => text } });

describe('Pix key field', () => {
  it('types a CPF with its punctuation and never more than 11 numbers', async () => {
    render(<Harness />);
    await userEvent.type(keyBox(), '529982247259999');
    expect(keyBox()).toHaveValue('529.982.247-25');
    expect(screen.getByText('CPF completo.')).toBeInTheDocument();
  });

  it('says how many numbers are missing, and that a complete wrong CPF is wrong', async () => {
    render(<Harness />);
    expect(screen.getByText('11 números: 000.000.000-00.')).toBeInTheDocument();
    await userEvent.type(keyBox(), '5299822');
    expect(keyBox()).toHaveValue('529.982.2');
    expect(screen.getByText('Faltam 4 números.')).toBeInTheDocument();
    await userEvent.type(keyBox(), '4726');
    expect(screen.getByText(/CPF inválido/)).toBeInTheDocument();
  });

  it('backspace on a separator deletes the number before it, and the caret stays in place', () => {
    render(<Harness initial="529.982.2" />);
    const box = keyBox();
    box.focus();
    // The browser deleted the second "." (caret was right after it): "529.9822", caret at 7.
    fireEvent.change(box, { target: { value: '529.9822', selectionStart: 7, selectionEnd: 7 } });
    expect(box).toHaveValue('529.982');
    expect(box.selectionStart).toBe(6); // after "529.98"
    // Typing in the middle keeps the caret after the typed number.
    fireEvent.change(box, { target: { value: '5129.982', selectionStart: 2, selectionEnd: 2 } });
    expect(box).toHaveValue('512.998.2');
    expect(box.selectionStart).toBe(2);
  });

  it('formats CNPJ (with letters), mobile and random keys', async () => {
    render(<Harness initialKind="cnpj" />);
    await userEvent.type(keyBox(), '12abc34501de35');
    expect(keyBox()).toHaveValue('12.ABC.345/01DE-35');
    expect(screen.getByText('CNPJ completo.')).toBeInTheDocument();
    await userEvent.selectOptions(kindBox(), 'random');
    await userEvent.clear(keyBox());
    await userEvent.type(keyBox(), '123E4567E12B12D1A456426655440000');
    expect(keyBox()).toHaveValue('123e4567-e12b-12d1-a456-426655440000');
    expect(screen.getByText('Chave aleatória completa.')).toBeInTheDocument();
    await userEvent.selectOptions(kindBox(), 'phone');
    await userEvent.clear(keyBox());
    await userEvent.type(keyBox(), '65999998888');
    expect(keyBox()).toHaveValue('(65) 99999-8888');
  });

  it('takes a pasted key whole and switches to its kind', () => {
    render(<Harness />);
    paste('+55 (65) 99999-8888');
    expect(kindBox()).toHaveValue('phone');
    expect(keyBox()).toHaveValue('(65) 99999-8888');
    fireEvent.select(keyBox());
    keyBox().setSelectionRange(0, keyBox().value.length);
    paste('Loja@Eka.com.br');
    expect(kindBox()).toHaveValue('email');
    expect(keyBox()).toHaveValue('loja@eka.com.br');
  });

  it('reports the status of each kind', () => {
    expect(pixKeyStatus('email', 'loja')).toEqual({ hint: 'O e-mail cadastrado como chave no banco.' });
    expect(pixKeyStatus('email', 'loja@eka.com.br')).toEqual({ hint: 'E-mail completo.' });
    expect(pixKeyStatus('phone', '(65) 9999')).toEqual({ hint: 'Faltam 5 números.' });
    expect(pixKeyStatus('cnpj', '11.222.333/0001-82').error).toMatch(/CNPJ inválido/);
  });
});

describe('Configurações in tabs', () => {
  const seed = createCatalogSeed();

  it('opens on Loja and shows one subject per tab, with its own address', async () => {
    unlockSession();
    mockServer.catalog = seed;
    useCatalog.setState({ data: seed, version: 1, status: 'ready' });
    renderAdmin('/admin/configuracoes');
    expect(await screen.findByRole('heading', { name: 'Informações da loja' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Pix para receber os pedidos' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('tab', { name: 'Pix' }));
    expect(screen.getByRole('heading', { name: 'Pix para receber os pedidos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Informações da loja' })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Pix' })).toHaveAttribute('aria-selected', 'true');
  });

  it('a pending item of the checklist leads to the tab where it is filled', async () => {
    unlockSession();
    mockServer.catalog = seed;
    useCatalog.setState({ data: seed, version: 1, status: 'ready' });
    renderAdmin('/admin/configuracoes');
    await userEvent.click(await screen.findByRole('link', { name: 'Preencher em Pix' }));
    expect(await screen.findByRole('heading', { name: 'Pix para receber os pedidos' })).toBeInTheDocument();
  });

  it('opens the tab named in the address, and Loja for an unknown one', async () => {
    unlockSession();
    mockServer.catalog = seed;
    useCatalog.setState({ data: seed, version: 1, status: 'ready' });
    const { unmount } = renderAdmin('/admin/configuracoes?aba=pin');
    expect(await screen.findByRole('heading', { name: 'Alterar PIN' })).toBeInTheDocument();
    unmount();
    renderAdmin('/admin/configuracoes?aba=xyz');
    expect(await screen.findByRole('heading', { name: 'Informações da loja' })).toBeInTheDocument();
  });
});
