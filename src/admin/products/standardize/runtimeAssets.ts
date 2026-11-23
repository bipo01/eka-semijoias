/*
 * ONNX Runtime Web files, emitted by Vite into /assets (hashed, immutable) so
 * they come from this site: the admin CSP allows scripts and WebAssembly only
 * from 'self'. Imported only by the engine, so the public bundle never sees them.
 *
 * - CPU: the plain build (14 MiB) with its glue.
 * - WebGPU: the asyncify build, gzipped by the `eka:ort-webgpu-wasm` plugin in
 *   vite.config.ts (the raw file is over the 25 MiB static-asset cap). Its glue
 *   ships inside the runtime bundle, so no glue URL is given.
 */
import glueUrl from 'onnxruntime-web/ort-wasm-simd-threaded.mjs?url';
import binaryUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import webgpuWasm from 'virtual:ort-webgpu-wasm';
import type { Device } from './models';
import type { WasmAssets } from './protocol';

export function runtimeAssets(device: Device): WasmAssets {
  return device === 'webgpu' ? { binaryUrl: webgpuWasm.url, gzip: webgpuWasm.gzip } : { binaryUrl, glueUrl, gzip: false };
}
