import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL, ISNET, MODELS } from './models';
import { dataUrlToBlob } from './photoSource';
import { downloadMb, markTipsSeen, tipsSeen, weightsUrl } from './prefs';
import { classifyError } from './protocol';

describe('classifyError', () => {
  it('recognizes out-of-memory failures from the runtime', () => {
    expect(classifyError(new Error('failed to call OrtRun(). ERROR_CODE: 6, ERROR_MESSAGE: std::bad_alloc'))).toBe('memory');
    expect(classifyError(new RangeError('Array buffer allocation failed'))).toBe('memory');
  });

  it('recognizes download failures', () => {
    expect(classifyError(new TypeError('Failed to fetch'))).toBe('network');
    expect(classifyError(new TypeError('Load failed'))).toBe('network');
  });

  it('falls back to unknown', () => {
    expect(classifyError(new Error('shader compilation'))).toBe('unknown');
  });
});

describe('dataUrlToBlob', () => {
  it('decodes a base64 image without fetch', async () => {
    const blob = dataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
    expect(blob?.type).toBe('image/png');
    expect(Array.from(new Uint8Array(await blob!.arrayBuffer()))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('rejects anything that is not a base64 image', () => {
    expect(dataUrlToBlob('data:text/html;base64,PGI+')).toBeNull();
    expect(dataUrlToBlob('https://example.com/a.png')).toBeNull();
  });
});

describe('prefs', () => {
  it('remembers that the tips were seen', () => {
    expect(tipsSeen()).toBe(false);
    markTipsSeen();
    expect(tipsSeen()).toBe(true);
  });

  it('survives corrupt storage', () => {
    localStorage.setItem('eka:standardizer:v1', '{');
    expect(tipsSeen()).toBe(false);
  });

  it('builds the pinned Hub URL Transformers.js caches the weights under', () => {
    expect(weightsUrl(ISNET, 'wasm')).toBe(`https://huggingface.co/Ko033/isnet-general-use-onnx/resolve/${ISNET.revision}/onnx/model_quantized.onnx`);
    expect(weightsUrl(ISNET, 'webgpu')).toMatch(/\/onnx\/model_fp16\.onnx$/);
    expect(downloadMb(DEFAULT_MODEL, 'wasm')).toBeGreaterThan(10);
  });
});

describe('models', () => {
  it('pins every model to a commit and uses only permissive licenses', () => {
    for (const m of Object.values(MODELS)) {
      expect(m.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(['MIT', 'Apache-2.0']).toContain(m.license);
      expect(m.id).not.toMatch(/briaai|RMBG|imgly|onnx-community\/ISNet-ONNX/i);
    }
  });

  it('ships the ONNX Runtime files of the version Transformers.js was built against', () => {
    // runtimeAssets.ts imports the .wasm/.mjs from the hoisted onnxruntime-web; a mismatch would break at runtime.
    const transformers = JSON.parse(readFileSync('node_modules/@huggingface/transformers/package.json', 'utf8'));
    const ort = JSON.parse(readFileSync('node_modules/onnxruntime-web/package.json', 'utf8'));
    expect(ort.version).toBe(transformers.dependencies['onnxruntime-web']);
  });
});
