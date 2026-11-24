import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast, useUi } from './ui';

describe('toasts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUi.setState({ toasts: [] });
  });
  afterEach(() => vi.useRealTimers());

  it('expire on their own clock, whatever happens to the screen meanwhile', () => {
    toast('Pix salvo.');
    expect(useUi.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(3499);
    expect(useUi.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useUi.getState().toasts).toHaveLength(0);
  });

  it('give errors and actions more time', () => {
    toast('Não foi possível salvar.', { tone: 'error' });
    toast('Adicionado à sacola', { action: { label: 'Ver sacola', to: '/sacola' } });
    vi.advanceTimersByTime(6000);
    expect(useUi.getState().toasts.map((t) => t.tone)).toEqual(['error']);
    vi.advanceTimersByTime(2000);
    expect(useUi.getState().toasts).toHaveLength(0);
  });

  it('a toast closed by hand stays closed', () => {
    const id = toast('Link copiado.');
    useUi.getState().dismissToast(id);
    vi.advanceTimersByTime(4000);
    expect(useUi.getState().toasts).toHaveLength(0);
  });
});
