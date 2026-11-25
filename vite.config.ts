/// <reference types="vitest/config" />
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { gzipSync } from 'node:zlib';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * `virtual:ort-webgpu-wasm` → `{ url, gzip }` of ONNX Runtime's WebGPU-capable build for the admin
 * photo standardizer. The binary (25.6 MiB) is over the 25 MiB per-file cap of Workers Static
 * Assets, so the build ships it gzipped (~6.3 MiB) in /assets and the browser inflates it.
 * The runtime's own `new URL('ort-wasm-*.wasm', import.meta.url)` fallbacks are unhooked so Vite
 * does not also emit the raw binaries (the standardizer always hands the runtime its binary).
 */
function ortWebgpuWasm(): Plugin {
  const id = 'virtual:ort-webgpu-wasm';
  const file = createRequire(import.meta.url).resolve('onnxruntime-web/ort-wasm-simd-threaded.asyncify.wasm');
  const runtimeUrl = /new URL\((["'`])(ort-wasm-simd-threaded[\w.]*\.wasm)\1,\s*import\.meta\.url\)/g;
  let serve = false;
  return {
    name: 'eka:ort-webgpu-wasm',
    enforce: 'pre',
    configResolved(config) {
      serve = config.command === 'serve';
    },
    transform(code, module) {
      if (!/[\\/]onnxruntime-web[\\/]dist[\\/]/.test(module)) return null;
      const out = code.replace(runtimeUrl, 'new URL($1$2$1, self.location.href)');
      return out === code ? null : { code: out, map: null };
    },
    resolveId: (source) => (source === id ? `\0${id}` : null),
    load(resolved) {
      if (resolved !== `\0${id}`) return null;
      if (serve) return `export default { url: ${JSON.stringify(`/@fs${file}`)}, gzip: false };`;
      const ref = this.emitFile({ type: 'asset', name: 'ort-wasm-simd-threaded.asyncify.wasm.gz', source: gzipSync(readFileSync(file), { level: 9 }) });
      return `export default { url: import.meta.ROLLUP_FILE_URL_${ref}, gzip: true };`;
    },
  };
}

export default defineConfig({
  // Served at the root of the Cloudflare Worker (VITE_BASE overrides, e.g. for a sub-path host).
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), ortWebgpuWasm()],
  build: { target: 'es2022', assetsInlineLimit: 0 },
  // The admin's background-removal worker bundles ONNX Runtime too.
  worker: { format: 'es', plugins: () => [ortWebgpuWasm()] },
  // `npm run dev` talks to the local Worker (`npx wrangler dev`, port 8787) for the API, photos and live updates.
  server: {
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', ws: true, changeOrigin: false },
      '/media': { target: 'http://127.0.0.1:8787' },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    // Admin screens rendered in jsdom with user-event (lazy admin chunk, many fields) take a few seconds
    // when the whole suite runs in parallel; 5 s timed out under load while each passes alone in ~1 s.
    testTimeout: 15_000,
  },
});
