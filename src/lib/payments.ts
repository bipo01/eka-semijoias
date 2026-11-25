import type { PayView, ReceiptType } from '../data/orders';
import { api, apiUrl, ApiError, NETWORK_MESSAGE } from './api';

export const fetchPayView = (token: string) => api<PayView>(`/api/pay/${encodeURIComponent(token)}`, { retries: 2 });

/**
 * Uploads a receipt with progress (XHR: fetch has no upload progress). A request that never got an
 * answer (a phone switching networks, a dropped connection) is sent once more on its own before the
 * customer sees "Sem conexão"; the server answers the same file for the same order as already
 * received, so a retry after a lost answer never stores it twice.
 */
export async function uploadReceipt(token: string, blob: Blob, type: ReceiptType, onProgress?: (fraction: number) => void): Promise<void> {
  try {
    await sendReceipt(token, blob, type, onProgress);
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 0 || error.code !== 'network') throw error;
    await new Promise((r) => setTimeout(r, 1200));
    await sendReceipt(token, blob, type, onProgress);
  }
}

function sendReceipt(token: string, blob: Blob, type: ReceiptType, onProgress?: (fraction: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', apiUrl(`/api/pay/${encodeURIComponent(token)}/receipt`));
    xhr.setRequestHeader('Content-Type', type);
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let error: { code?: string; message?: string } | undefined;
      try {
        error = (JSON.parse(xhr.responseText) as { error?: { code?: string; message?: string } }).error;
      } catch {
        /* not JSON */
      }
      reject(new ApiError(xhr.status, error?.code ?? 'http_error', error?.message ?? 'Não foi possível enviar o comprovante. Tente de novo.'));
    };
    xhr.onerror = () => reject(new ApiError(0, 'network', NETWORK_MESSAGE));
    xhr.ontimeout = () => reject(new ApiError(0, 'timeout', 'O envio demorou demais. Confira a internet e tente de novo.'));
    xhr.send(blob);
  });
}

/** Asks for an automatic Pix (Mercado Pago) for this payment link. */
export const createAutoPix = (token: string, email: string) => api<{ mp: { qr: string; expiresAt: string } }>(`/api/pay/${encodeURIComponent(token)}/pix`, { json: { email }, retries: 1, timeoutMs: 25_000 });

/** "Já paguei": asks the server to check the automatic Pix with Mercado Pago now. */
export const checkAutoPix = (token: string) => api<{ state: 'pago' | 'aguardando' }>(`/api/pay/${encodeURIComponent(token)}/pix/check`, { json: {}, timeoutMs: 20_000 });
