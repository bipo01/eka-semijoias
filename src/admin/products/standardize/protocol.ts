import type { Device, ModelSpec } from './models';

/** Where the ONNX Runtime WebAssembly binary comes from (always this site; CSP allows no other script/wasm host). */
export interface WasmAssets {
  /** URL of the `.wasm` binary, or of a gzip copy of it when `gzip` is true. */
  binaryUrl: string;
  gzip: boolean;
  /** Emscripten glue (`.mjs`) matching the binary; omitted to use the glue bundled with the runtime. */
  glueUrl?: string;
}

export type ErrorCode = 'network' | 'memory' | 'unsupported' | 'unknown';

export type ToWorker =
  | { type: 'init'; model: ModelSpec; device: Device; wasm: WasmAssets }
  | { type: 'segment'; id: number; rgba: Uint8ClampedArray };

export type FromWorker =
  | { type: 'progress'; loaded: number; total: number }
  | { type: 'ready'; device: Device; ms: number; fellBack: boolean }
  | { type: 'matte'; id: number; matte: Uint8ClampedArray; ms: number; device: Device }
  | { type: 'error'; id?: number; code: ErrorCode; detail: string };

/** Classifies a runtime/download error so the UI can say something useful. */
export function classifyError(err: unknown): ErrorCode {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (/out of memory|bad_alloc|allocation|RangeError|Array buffer|memory access out of bounds|Aborted\(\)/i.test(text)) return 'memory';
  if (/Failed to fetch|NetworkError|network|Load failed|ERR_|status 4\d\d|status 5\d\d|Could not locate file|fetch/i.test(text)) return 'network';
  if (/WebAssembly|wasm.*(not supported|unavailable)|no available backend/i.test(text)) return 'unsupported';
  return 'unknown';
}
