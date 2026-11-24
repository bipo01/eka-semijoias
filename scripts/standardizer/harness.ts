/*
 * Measurement page for scripts/measure-standardizer.mjs: runs the admin's real
 * standardizer modules (engine worker, compositing) on a list of photos and
 * exposes the results to Playwright. Built by the script, never by the app build.
 */
import { createEngine, type Engine } from '../../src/admin/products/standardize/engine';
import { canvasToBlob, compose, cutOut, loadSource, readAlpha, releaseCanvas } from '../../src/admin/products/standardize/compose';
import { matteBounds } from '../../src/admin/products/standardize/geometry';
import { MODELS, type Device } from '../../src/admin/products/standardize/models';
import { runtimeAssets } from '../../src/admin/products/standardize/runtimeAssets';

interface PhotoResult {
  name: string;
  ms: { decode: number; segment: number; compose: number };
  device: Device;
  bounds: ReturnType<typeof matteBounds>;
  composite: string;
  mask: string;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

declare global {
  interface Window {
    standardizer: {
      init(modelKey: string, device: Device): Promise<{ ms: number; device: Device; downloaded: number }>;
      run(url: string, name: string, strength?: number): Promise<PhotoResult>;
      dispose(): void;
    };
  }
}

let engine: Engine | null = null;

window.standardizer = {
  async init(modelKey, device) {
    const model = MODELS[modelKey];
    if (!model) throw new Error(`unknown model ${modelKey}`);
    let downloaded = 0;
    const t0 = performance.now();
    // The same runtime files the admin ships (WebGPU: the gzipped asyncify build).
    engine = await createEngine({ model, device, wasm: runtimeAssets(device), onProgress: (l) => (downloaded = l) });
    return { ms: performance.now() - t0, device: engine.device, downloaded };
  },
  async run(url, name, strength = 0) {
    if (!engine) throw new Error('init first');
    const t0 = performance.now();
    const blob = await (await fetch(url)).blob();
    const source = await loadSource(blob);
    if (typeof source === 'string') throw new Error(source);
    const t1 = performance.now();
    const mask = await cutOut((rgba) => engine!.segment(rgba), engine.model.size, source);
    const t2 = performance.now();
    const bounds = matteBounds(readAlpha(mask), mask.width, mask.height);
    const out = compose(source, mask, bounds, strength);
    const t3 = performance.now();
    const composite = out ? await blobToDataUrl(await canvasToBlob(out)) : '';
    const maskUrl = await blobToDataUrl(await canvasToBlob(mask));
    releaseCanvas(out);
    releaseCanvas(mask);
    releaseCanvas(source);
    return { name, ms: { decode: t1 - t0, segment: t2 - t1, compose: t3 - t2 }, device: engine.device, bounds, composite, mask: maskUrl };
  },
  dispose() {
    engine?.dispose();
    engine = null;
  },
};
document.getElementById('status')!.textContent = 'pronto';
