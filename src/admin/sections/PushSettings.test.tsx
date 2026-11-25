import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitForTestNotice } from './PushSettings';

/*
 * "Enviar aviso de teste" waits for the service worker to say the notice reached this device
 * (public/sw.js posts { type: 'eka-push', tag, shown }), so the panel can tell a notice the phone
 * hides from one that never arrived.
 */

class FakeContainer extends EventTarget {}

describe('waitForTestNotice', () => {
  let container: FakeContainer;
  beforeEach(() => {
    vi.useFakeTimers();
    container = new FakeContainer();
    Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    delete (navigator as unknown as Record<string, unknown>).serviceWorker;
  });
  const post = (data: unknown) => container.dispatchEvent(new MessageEvent('message', { data }));

  it('says the notice arrived when the service worker reports the test notice', async () => {
    const wait = waitForTestNotice(20_000);
    post({ type: 'eka-push', tag: 'novo-pedido', shown: true }); // another notice: ignored
    post({ type: 'other' });
    post({ type: 'eka-push', tag: 'teste', shown: true });
    await expect(wait.result).resolves.toBe('arrived');
  });

  it('says the phone refused to show it when the system blocked the notification', async () => {
    const wait = waitForTestNotice(20_000);
    post({ type: 'eka-push', tag: 'teste', shown: false });
    await expect(wait.result).resolves.toBe('refused');
  });

  it('says it never arrived after the wait, and stops listening', async () => {
    const remove = vi.spyOn(container, 'removeEventListener');
    const wait = waitForTestNotice(20_000);
    vi.advanceTimersByTime(20_000);
    await expect(wait.result).resolves.toBe('missing');
    expect(remove).toHaveBeenCalledWith('message', expect.any(Function));
    // A late notice changes nothing.
    post({ type: 'eka-push', tag: 'teste', shown: true });
  });
});
