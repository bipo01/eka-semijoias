import type { Normalization, OutputKind } from './geometry';

export type Device = 'webgpu' | 'wasm';
export type Dtype = 'fp32' | 'fp16' | 'q8';

/**
 * A background-removal model on the Hugging Face Hub. Revisions are pinned to a
 * commit so a change in the repository can never swap the weights under us.
 */
export interface ModelSpec {
  key: string;
  /** Hub repository. */
  id: string;
  /** Commit the files are fetched from. */
  revision: string;
  license: string;
  /** Square input side the model expects. */
  size: number;
  inputName: string;
  outputName: string;
  norm: Normalization;
  output: OutputKind;
  /** Weights per device; the first dtype is used. Sizes in bytes, for the download message. */
  dtype: Record<Device, Dtype>;
  bytes: Partial<Record<Dtype, number>>;
}

const IMAGENET: Normalization = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] };

/**
 * ISNet general-use (DIS, Apache-2.0) as exported by rembg (MIT), packaged for
 * Transformers.js with only the final matte output. Note: `onnx-community/ISNet-ONNX`
 * is published under AGPL-3.0 and must not be used.
 */
export const ISNET: ModelSpec = {
  key: 'isnet',
  id: 'Ko033/isnet-general-use-onnx',
  revision: '5349b617911fd60c619b52f32e2b593517b78df3',
  license: 'Apache-2.0',
  size: 1024,
  inputName: 'input_image',
  outputName: 'output_image',
  norm: { mean: [0.5, 0.5, 0.5], std: [1, 1, 1] },
  output: 'probability-minmax',
  dtype: { webgpu: 'fp16', wasm: 'q8' },
  bytes: { fp16: 88_141_111, q8: 45_902_969 },
};

/** BiRefNet lite (MIT), the official Transformers.js export (1024 × 1024). */
export const BIREFNET_LITE: ModelSpec = {
  key: 'birefnet-lite',
  id: 'onnx-community/BiRefNet_lite-ONNX',
  revision: 'de15b22ba131738a16dff04aab8bdf8dc32e3ac1',
  license: 'MIT',
  size: 1024,
  inputName: 'input_image',
  outputName: 'output_image',
  norm: IMAGENET,
  output: 'logits',
  dtype: { webgpu: 'fp16', wasm: 'fp16' },
  bytes: { fp32: 224_005_088, fp16: 114_538_221 },
};

/**
 * BiRefNet lite re-exported at 512 × 512 (a quarter of the memory; runs on WebGPU's default limits and
 * on WebAssembly). MIT: Copyright (c) 2024 ZhengPeng; Copyright (c) 2026 Studio Ludens V.O.F. The
 * browser downloads the weights from the Hub; this site never redistributes them.
 */
export const BIREFNET_LITE_512: ModelSpec = {
  key: 'birefnet-lite-512',
  id: 'studioludens/birefnet-lite-512',
  revision: '962e67969ec6acec9c19fab76acee4f5e22e990c',
  license: 'MIT',
  size: 512,
  inputName: 'input_image',
  outputName: 'logits',
  norm: IMAGENET,
  output: 'logits',
  dtype: { webgpu: 'fp16', wasm: 'fp16' },
  bytes: { fp32: 191_877_254, fp16: 98_484_532 },
};

/** BiRefNet lite at 1024 with the graph rewritten for WebGPU limits (weights unchanged). */
export const BIREFNET_LITE_WEBGPU: ModelSpec = {
  key: 'birefnet-lite-webgpu',
  id: 'wonfy/BiRefNet_lite-ONNX-webgpu',
  revision: 'c40eaa22fb1af9edcf75c7b79d25ed8a8e901140',
  license: 'MIT',
  size: 1024,
  inputName: 'input_image',
  outputName: 'output_image',
  norm: IMAGENET,
  output: 'logits',
  dtype: { webgpu: 'fp16', wasm: 'fp16' },
  bytes: { fp32: 244_836_004, fp16: 123_210_389 },
};

export const MODELS: Record<string, ModelSpec> = Object.fromEntries(
  [ISNET, BIREFNET_LITE, BIREFNET_LITE_512, BIREFNET_LITE_WEBGPU].map((m) => [m.key, m]),
);

/** The model the admin uses (chosen by measurement; see docs/qa/standardizer/README.md). */
export const DEFAULT_MODEL = BIREFNET_LITE_512;
