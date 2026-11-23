import { useCallback, useEffect, useState } from 'react';
import { BellRing, Smartphone, Trash2 } from 'lucide-react';
import { Button, IconButton } from '../../components/ui/Button';
import { api, ApiError, errorMessage } from '../../lib/api';
import { toast } from '../../store/ui';
import { formatDateTime } from '../lib/contact';
import { signalSessionLost } from '../lib/session';

/*
 * Painel → Configurações → "Avisos no celular": turns Web Push on for this
 * device (permission + subscription stored on the server), lists the devices
 * that get notices, removes them and sends a test. Hidden while the server
 * has no VAPID key. On iPhone it only works from the installed Painel ÉKA.
 */

interface Device {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  lastError: string | null;
}
interface PushStatus {
  available: boolean;
  publicKey: string | null;
  devices: Device[];
}

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function deviceLabel(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Celular Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Computador Windows';
  return 'Este aparelho';
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64url.length % 4)) % 4);
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function sha24(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 24);
}

/** The site's service worker (registered at startup in production; registered here when missing). */
async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration('/');
  if (!existing) await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  return navigator.serviceWorker.ready;
}

function sameKey(sub: PushSubscription, publicKey: string): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true; // some browsers do not expose it: keep the subscription
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function handleError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'unauthenticated') signalSessionLost();
  return error instanceof ApiError ? errorMessage(error) : 'Não foi possível ativar os avisos neste aparelho. Tente de novo.';
}

/** The server's view plus which listed device is this one. */
async function fetchStatus(): Promise<{ status: PushStatus; thisId: string | null }> {
  const status = await api<PushStatus>('/api/admin/push', { retries: 2 });
  let thisId: string | null = null;
  if (supported()) {
    const reg = await navigator.serviceWorker.getRegistration('/');
    const sub = await reg?.pushManager.getSubscription();
    if (sub) thisId = await sha24(sub.endpoint);
  }
  return { status, thisId };
}

export function PushSettings() {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [thisId, setThisId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => (supported() ? Notification.permission : 'unsupported'));
  const [busy, setBusy] = useState<'on' | 'off' | 'test' | string | null>(null);

  const apply = useCallback((r: { status: PushStatus; thisId: string | null }) => {
    setStatus(r.status);
    setThisId(r.thisId);
    setLoadError(null);
  }, []);
  const fail = useCallback((error: unknown) => setLoadError(handleError(error)), []);
  const load = () => fetchStatus().then(apply, fail);

  useEffect(() => {
    let alive = true;
    fetchStatus().then(
      (r) => alive && apply(r),
      (e: unknown) => alive && fail(e),
    );
    return () => {
      alive = false;
    };
  }, [apply, fail]);

  if (loadError) {
    return (
      <section className="flex flex-col gap-3 rounded-[12px] border border-line bg-white p-4" aria-labelledby="push-title">
        <h2 id="push-title" className="font-display text-title">Avisos no celular</h2>
        <p role="alert" className="text-sm text-danger">{loadError}</p>
        <Button variant="secondary" className="self-start" onClick={() => void load()}>
          Tentar de novo
        </Button>
      </section>
    );
  }
  if (!status?.available || !status.publicKey) return null;
  const publicKey = status.publicKey;
  const thisDevice = status.devices.find((d) => d.id === thisId) ?? null;
  const iosNeedsInstall = isIos() && !isStandalone();

  async function enable() {
    if (busy) return;
    setBusy('on');
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') {
        toast(result === 'denied' ? 'As notificações estão bloqueadas para o painel neste navegador. Libere nas configurações do navegador e tente de novo.' : 'Sem permissão, os avisos não chegam.', { tone: 'error', duration: 9000 });
        return;
      }
      const reg = await registration();
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub, publicKey)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const { id } = await api<{ id: string }>('/api/admin/push/subscribe', { json: { endpoint: json.endpoint, keys: json.keys, label: deviceLabel() }, retries: 2 });
      setThisId(id);
      toast('Avisos ativados neste aparelho.', { tone: 'success' });
      await load();
    } catch (error) {
      toast(handleError(error), { tone: 'error', duration: 9000 });
    } finally {
      setBusy(null);
    }
  }

  async function remove(device: Device) {
    if (busy) return;
    setBusy(device.id);
    try {
      if (device.id === thisId) {
        const reg = await navigator.serviceWorker.getRegistration('/');
        await (await reg?.pushManager.getSubscription())?.unsubscribe();
        setThisId(null);
      }
      await api(`/api/admin/push/${device.id}`, { method: 'DELETE', retries: 1 });
      toast(device.id === thisId ? 'Avisos desligados neste aparelho.' : 'Aparelho removido dos avisos.', { tone: 'success' });
      await load();
    } catch (error) {
      toast(handleError(error), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy('test');
    try {
      const r = await api<{ sent: number; removed: number; failed: number }>('/api/admin/push/test', { json: {}, timeoutMs: 20_000 });
      if (r.sent) toast(`Aviso de teste enviado para ${r.sent} ${r.sent === 1 ? 'aparelho' : 'aparelhos'}.`, { tone: 'success' });
      else toast('Nenhum aparelho recebeu o aviso. Ative os avisos de novo no celular.', { tone: 'error' });
      await load();
    } catch (error) {
      toast(handleError(error), { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-[12px] border border-line bg-white p-4" aria-labelledby="push-title">
      <div className="flex items-start gap-3">
        <BellRing size={22} strokeWidth={1.5} aria-hidden="true" className="mt-1 shrink-0 text-copper" />
        <div>
          <h2 id="push-title" className="font-display text-title">Avisos no celular</h2>
          <p className="text-sm text-ink-muted">Um aviso chega quando entra um pedido pelo site ou um comprovante de Pix. Só aparecem o número do pedido e o valor.</p>
        </div>
      </div>

      {permission === 'unsupported' ? (
        <p className="rounded-[10px] bg-champagne/60 p-3 text-sm">
          {iosNeedsInstall
            ? 'No iPhone, os avisos funcionam com o Painel ÉKA instalado na tela de início (iOS 16.4 ou mais novo): no Safari, toque em Compartilhar → Adicionar à Tela de Início, abra o Painel por lá e ative aqui.'
            : 'Este navegador não recebe avisos. Use o Chrome no Android ou o Painel ÉKA instalado no iPhone.'}
        </p>
      ) : thisDevice ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-success">Avisos ativados neste aparelho.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={!!busy} aria-busy={busy === 'test'} onClick={() => void test()}>
              {busy === 'test' ? 'Enviando…' : 'Enviar aviso de teste'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {iosNeedsInstall && (
            <p className="rounded-[10px] bg-champagne/60 p-3 text-sm">
              No iPhone, os avisos só chegam pelo Painel ÉKA instalado na tela de início (Compartilhar → Adicionar à Tela de Início). Abra o Painel por lá e ative aqui.
            </p>
          )}
          {permission === 'denied' && (
            <p className="text-sm text-danger">As notificações estão bloqueadas para o painel neste navegador. Libere nas configurações do site e toque em ativar de novo.</p>
          )}
          <Button className="self-start" disabled={!!busy} aria-busy={busy === 'on'} onClick={() => void enable()}>
            {busy === 'on' ? 'Ativando…' : 'Ativar avisos neste aparelho'}
          </Button>
        </div>
      )}

      {status.devices.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Aparelhos que recebem os avisos</h3>
          <ul className="divide-y divide-line rounded-[10px] border border-line">
            {status.devices.map((d) => (
              <li key={d.id} className="flex items-center gap-3 p-3">
                <Smartphone size={18} strokeWidth={1.5} aria-hidden="true" className="shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1 text-sm">
                  <p>
                    {d.label || 'Aparelho'}
                    {d.id === thisId && <span className="text-ink-muted"> · este aparelho</span>}
                  </p>
                  <p className="text-ink-muted">
                    {d.lastUsedAt ? `Último aviso ${formatDateTime(d.lastUsedAt)}` : `Ativado ${formatDateTime(d.createdAt)}`}
                    {d.lastError && ' · o último aviso falhou'}
                  </p>
                </div>
                <IconButton label={`Remover ${d.label || 'aparelho'} dos avisos`} disabled={!!busy} onClick={() => void remove(d)}>
                  <Trash2 size={18} strokeWidth={1.5} />
                </IconButton>
              </li>
            ))}
          </ul>
          {!thisDevice && status.devices.length > 0 && (
            <Button variant="ghost" size="sm" className="mt-2" disabled={!!busy} onClick={() => void test()}>
              Enviar aviso de teste
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
