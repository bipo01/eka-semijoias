import type { Device, Dtype, ModelSpec } from './models';

/** Per-device convenience only: whether the photo tips were already shown. */
const KEY = 'eka:standardizer:v1';

export function tipsSeen(): boolean {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}')?.tips === true;
  } catch {
    return false;
  }
}

export function markTipsSeen() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ tips: true }));
  } catch {
    // Private mode or blocked storage: the tips just show again next time.
  }
}

const SUFFIX: Record<Dtype, string> = { fp32: '', fp16: '_fp16', q8: '_quantized' };

/** The Hub URL Transformers.js downloads (and caches under) for the model's weights. */
export function weightsUrl(model: ModelSpec, device: Device): string {
  return `https://huggingface.co/${model.id}/resolve/${model.revision}/onnx/model${SUFFIX[model.dtype[device]]}.onnx`;
}

/** Whether the weights are already in the browser cache (so no big download, no Wi-Fi advice). */
export async function isModelCached(model: ModelSpec, device: Device): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open('transformers-cache');
    return (await cache.match(weightsUrl(model, device))) !== undefined;
  } catch {
    return false;
  }
}

/** Download size in MB, rounded, for the first-use message. */
export function downloadMb(model: ModelSpec, device: Device): number {
  return Math.round((model.bytes[model.dtype[device]] ?? 0) / 1_000_000);
}
