import type { PayView, ReceiptType } from '../data/orders';
import { api, apiUrl, ApiError, NETWORK_MESSAGE } from './api';

export const fetchPayView = (token: string) => api<PayView>(`/api/pay/${encodeURIComponent(token)}`, { retries: 2 });

/** Uploads a receipt with progress (XHR: fetch has no upload progress). */
export function uploadReceipt(token: string, blob: Blob, type: ReceiptType, onProgress?: (fraction: number) => void): Promise<void> {
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
