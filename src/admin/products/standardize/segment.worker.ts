/// <reference lib="webworker" />
/*
 * Background-removal worker: downloads the model from the Hugging Face Hub
 * (first use; the browser cache keeps it), runs it with ONNX Runtime Web on
 * WebGPU when possible and on WebAssembly otherwise, and answers with an 8-bit
 * matte at the model's input size. Running here keeps the admin responsive and
 * lets the page free all of the model's memory by terminating the worker.
 */
import { AutoModel, Tensor, env, type PreTrainedModel } from '@huggingface/transformers';
import { toMatte, toModelInput } from './geometry';
import type { Device, ModelSpec } from './models';
import { classifyError, type FromWorker, type ToWorker, type WasmAssets } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

let spec: ModelSpec | null = null;
let model: PreTrainedModel | null = null;
let device: Device = 'wasm';

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

async function fetchWasm(assets: WasmAssets): Promise<ArrayBuffer> {
  const res = await fetch(assets.binaryUrl, { credentials: 'same-origin' });
  if (!res.ok) throw new Error(`Failed to fetch the runtime (status ${res.status})`);
  const bytes = await res.arrayBuffer();
  // Inflate only real gzip data: a server that already decoded it (Content-Encoding) hands over plain wasm.
  if (!assets.gzip || !isGzip(bytes)) return bytes;
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}

function isGzip(bytes: ArrayBuffer): boolean {
  const head = new Uint8Array(bytes, 0, Math.min(2, bytes.byteLength));
  return head[0] === 0x1f && head[1] === 0x8b;
}

/** Points ONNX Runtime at this site's files; never at the CDN Transformers.js defaults to. */
async function configureRuntime(assets: WasmAssets) {
  env.allowLocalModels = false; // our origin answers unknown paths with the SPA page
  env.allowRemoteModels = true;
  env.useBrowserCache = true;
  const onnx = env.backends.onnx;
  if (!onnx.wasm) throw new Error('WebAssembly backend unavailable');
  onnx.wasm.wasmPaths = assets.glueUrl ? { mjs: assets.glueUrl } : {};
  onnx.wasm.wasmBinary = await fetchWasm(assets);
  onnx.wasm.proxy = false;
  onnx.wasm.numThreads = 1; // no cross-origin isolation, so no SharedArrayBuffer threads
}

async function loadModel(target: Device): Promise<PreTrainedModel> {
  const s = spec!;
  const files = new Map<string, { loaded: number; total: number }>();
  return AutoModel.from_pretrained(s.id, {
    revision: s.revision,
    device: target,
    dtype: s.dtype[target],
    progress_callback: (info) => {
      if (info.status !== 'progress') return;
      files.set(info.file, { loaded: info.loaded, total: info.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      post({ type: 'progress', loaded, total });
    },
  });
}

async function init(msg: Extract<ToWorker, { type: 'init' }>) {
  const t0 = performance.now();
  spec = msg.model;
  await configureRuntime(msg.wasm);
  let fellBack = false;
  if (msg.device === 'webgpu') {
    try {
      model = await loadModel('webgpu');
      device = 'webgpu';
    } catch (err) {
      if (classifyError(err) === 'network') throw err;
      fellBack = true;
    }
  }
  if (!model) {
    model = await loadModel('wasm');
    device = 'wasm';
  }
  post({ type: 'ready', device, ms: performance.now() - t0, fellBack });
}

async function infer(rgba: Uint8ClampedArray): Promise<Uint8ClampedArray> {
  const s = spec!;
  const input = new Tensor('float32', toModelInput(rgba, s.size, s.size, s.norm), [1, 3, s.size, s.size]);
  const outputs = (await model!({ [s.inputName]: input })) as Record<string, Tensor>;
  const out = outputs[s.outputName] ?? Object.values(outputs)[0];
  if (!out) throw new Error('model returned no output');
  const data = out.data as Float32Array;
  const matte = toMatte(data, s.output);
  input.dispose();
  out.dispose();
  return matte;
}

async function segment(msg: Extract<ToWorker, { type: 'segment' }>) {
  if (!model || !spec) throw new Error('model not loaded');
  const t0 = performance.now();
  let matte: Uint8ClampedArray;
  try {
    matte = await infer(msg.rgba);
  } catch (err) {
    if (device !== 'webgpu') throw err;
    // A GPU that loads the model may still fail to run it (limits, lost device): retry on the CPU.
    await model.dispose().catch(() => undefined);
    model = await loadModel('wasm');
    device = 'wasm';
    matte = await infer(msg.rgba);
  }
  post({ type: 'matte', id: msg.id, matte, ms: performance.now() - t0, device }, [matte.buffer]);
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data;
  const job = msg.type === 'init' ? init(msg) : segment(msg);
  job.catch((err: unknown) => {
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    post({ type: 'error', id: msg.type === 'segment' ? msg.id : undefined, code: classifyError(err), detail });
  });
};
