/*
 * Main-thread side of the background remover: starts the worker, reports the
 * model download, and turns worker failures into pt-BR messages. One engine is
 * shared while the admin standardizes several photos and is shut down after a
 * short idle period, which releases the model's memory (important on phones).
 */
import workerUrl from './segment.worker.ts?worker&url';
import { DEFAULT_MODEL, type Device, type ModelSpec } from './models';
import type { ErrorCode, FromWorker, ToWorker, WasmAssets } from './protocol';

export class StandardizeError extends Error {
  constructor(
    readonly code: ErrorCode | 'cancelled',
    readonly detail = '',
  ) {
    super(ERROR_MESSAGES[code]);
    this.name = 'StandardizeError';
  }
}

export const ERROR_MESSAGES: Record<ErrorCode | 'cancelled', string> = {
  network: 'Não conseguimos baixar o recorte inteligente. Confira a internet (de preferência o Wi-Fi) e tente de novo.',
  memory: 'Faltou memória no aparelho para recortar esta foto. Feche outros apps ou abas e tente de novo.',
  unsupported: 'Este navegador não consegue rodar o recorte inteligente. Atualize o navegador ou use o Chrome.',
  unknown: 'Não deu para recortar esta foto. Tente de novo ou mantenha a original.',
  cancelled: 'Cancelado.',
};

export interface Engine {
  readonly model: ModelSpec;
  readonly device: Device;
  /** Runs the model on RGBA pixels of `model.size`² (the buffer is transferred) and returns the 8-bit matte. */
  segment(rgba: Uint8ClampedArray): Promise<Uint8ClampedArray>;
  dispose(): void;
}

export interface EngineOptions {
  model?: ModelSpec;
  /** Byte progress of the model download (also called, quickly, when it comes from the cache). */
  onProgress?: (loaded: number, total: number) => void;
  /** Force a device; by default WebGPU when the browser offers an adapter. */
  device?: Device;
  wasm?: WasmAssets;
  /** Aborting stops the download/start-up and frees the worker. */
  signal?: AbortSignal;
}

/** WebGPU is used only when the browser actually hands out an adapter. */
export async function detectDevice(): Promise<Device> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    if (!gpu) return 'wasm';
    return (await gpu.requestAdapter()) ? 'webgpu' : 'wasm';
  } catch {
    return 'wasm';
  }
}

export async function createEngine(opts: EngineOptions = {}): Promise<Engine> {
  if (typeof WebAssembly !== 'object' || typeof Worker !== 'function') throw new StandardizeError('unsupported');
  const model = opts.model ?? DEFAULT_MODEL;
  const wanted = opts.device ?? (await detectDevice());
  const assets = opts.wasm ?? (await import('./runtimeAssets')).runtimeAssets(wanted);
  // Absolute URLs: inside a blob worker, relative URLs have no usable base.
  const absolute = (url: string) => new URL(url, location.href).href;
  const wasm: WasmAssets = { ...assets, binaryUrl: absolute(assets.binaryUrl), ...(assets.glueUrl ? { glueUrl: absolute(assets.glueUrl) } : {}) };
  /*
   * The worker starts from a blob: URL that imports the bundled worker script. A blob worker inherits
   * the CSP of this /admin page (model hosts in connect-src, 'wasm-unsafe-eval'); a worker started from
   * /assets/*.js would instead get the restrictive CSP public/_headers puts on static files.
   */
  const boot = URL.createObjectURL(new Blob([`import ${JSON.stringify(absolute(workerUrl))};`], { type: 'text/javascript' }));
  const worker = new Worker(boot, { type: 'module', name: 'padronizador' });

  let device: Device = wanted;
  let nextId = 1;
  let dead: StandardizeError | null = null;
  const pending = new Map<number, { resolve: (m: Uint8ClampedArray) => void; reject: (e: unknown) => void }>();
  let ready: { resolve: () => void; reject: (e: unknown) => void } | null = null;

  const fail = (err: StandardizeError) => {
    dead ??= err;
    ready?.reject(err);
    ready = null;
    for (const p of pending.values()) p.reject(err);
    pending.clear();
  };

  worker.onmessage = (e: MessageEvent<FromWorker>) => {
    const msg = e.data;
    switch (msg.type) {
      case 'progress':
        opts.onProgress?.(msg.loaded, msg.total);
        break;
      case 'ready':
        device = msg.device;
        ready?.resolve();
        ready = null;
        break;
      case 'matte': {
        device = msg.device;
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        p?.resolve(msg.matte);
        break;
      }
      case 'error': {
        const err = new StandardizeError(msg.code, msg.detail);
        if (msg.id !== undefined) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          p?.reject(err);
        } else fail(err);
        break;
      }
    }
  };
  // A worker that crashes (often out of memory on phones) fires `error` with no useful detail.
  worker.onerror = (e) => {
    e.preventDefault();
    fail(new StandardizeError(/memory/i.test(e.message ?? '') ? 'memory' : 'unknown', e.message ?? 'worker error'));
  };

  const send = (msg: ToWorker, transfer: Transferable[] = []) => worker.postMessage(msg, transfer);
  const abort = () => fail(new StandardizeError('cancelled'));

  try {
    if (opts.signal?.aborted) throw new StandardizeError('cancelled');
    opts.signal?.addEventListener('abort', abort, { once: true });
    await new Promise<void>((resolve, reject) => {
      ready = { resolve, reject };
      send({ type: 'init', model, device: wanted, wasm });
    });
  } catch (err) {
    worker.terminate();
    throw err;
  } finally {
    opts.signal?.removeEventListener('abort', abort);
    URL.revokeObjectURL(boot);
  }

  return {
    model,
    get device() {
      return device;
    },
    segment(rgba) {
      if (dead) return Promise.reject(dead);
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ type: 'segment', id, rgba }, [rgba.buffer]);
      });
    },
    dispose() {
      fail(new StandardizeError('cancelled'));
      worker.terminate();
    },
  };
}

// ---------------------------------------------------------------------------
// Shared instance with an idle shutdown.
// ---------------------------------------------------------------------------

const IDLE_MS = 90_000;
let shared: { engine: Promise<Engine>; abort: AbortController } | null = null;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let progressListener: EngineOptions['onProgress'];

/** The shared engine, created on first use. `onProgress` follows the latest caller. */
export function getEngine(onProgress?: EngineOptions['onProgress']): Promise<Engine> {
  progressListener = onProgress;
  clearTimeout(idleTimer);
  if (!shared) {
    const abort = new AbortController();
    const engine = createEngine({ onProgress: (l, t) => progressListener?.(l, t), signal: abort.signal });
    const entry = { engine, abort };
    shared = entry;
    engine.catch(() => {
      if (shared === entry) shared = null; // a failed start can be retried
    });
  }
  return shared.engine;
}

/** Shuts the shared engine down after a while without use, or now (which also stops a download in progress). */
export function releaseEngine(now = false) {
  clearTimeout(idleTimer);
  const current = shared;
  if (!current) return;
  const stop = () => {
    if (shared !== current) return;
    shared = null;
    current.abort.abort();
    current.engine.then((e) => e.dispose(), () => undefined);
  };
  if (now) stop();
  else idleTimer = setTimeout(stop, IDLE_MS);
}
