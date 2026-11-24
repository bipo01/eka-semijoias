import { clampStrength, DEFAULT_ENHANCE } from './enhance';
import type { Device, Dtype, ModelSpec } from './models';

/**
 * Per-device conveniences only: whether the photo tips were already shown, and the
 * colour-filter strength she last used (the default for her next photos).
 */
const KEY = 'eka:standardizer:v1';

interface Prefs {
  tips?: boolean;
  realce?: number;
}

function read(): Prefs {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value && typeof value === 'object' ? (value as Prefs) : {};
  } catch {
    return {};
  }
}

/** False when storage is unavailable (private mode, blocked site data): the value just isn't remembered. */
function write(patch: Prefs): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
    return true;
  } catch {
    return false;
  }
}

export function tipsSeen(): boolean {
  return read().tips === true;
}

export function markTipsSeen() {
  write({ tips: true });
}

/** The strength (0–100 %) her next photo starts with. */
export function enhanceStrength(): number {
  const saved = read().realce;
  return saved === undefined ? DEFAULT_ENHANCE : clampStrength(saved);
}

export function saveEnhanceStrength(strength: number): boolean {
  return write({ realce: clampStrength(strength) });
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
