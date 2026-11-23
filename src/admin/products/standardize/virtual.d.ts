/** ONNX Runtime's WebGPU-capable WebAssembly build (see `ortWebgpuWasm` in vite.config.ts). */
declare module 'virtual:ort-webgpu-wasm' {
  const asset: { url: string; gzip: boolean };
  export default asset;
}
