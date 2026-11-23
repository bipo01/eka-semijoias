# Photo standardizer: model choice

Measured on 23/11/2026 with `node scripts/measure-standardizer.mjs --photos assets/test-photos --models birefnet-lite-512,isnet,birefnet-lite-webgpu,birefnet-lite --devices webgpu,wasm`. The script runs the admin's real modules (worker, compositing) in headless Chromium 159 on an Apple Silicon Mac, under the production CSPs (the Worker's `/admin` policy on the page, `public/_headers` on static files). Raw numbers: `timings.json`.

Files: `<photo>__compare.jpg` (original, then one column per successful run in the order below), `<photo>__<model>-<device>.jpg` (the standardized 960 × 1200 photo), `<photo>__<model>-<device>__mask.png` (the matte).

Columns in `__compare.jpg`: original · BiRefNet lite 512 (WebGPU) · BiRefNet lite 512 (WASM) · ISNet (WebGPU, fp16) · ISNet (WASM, q8) · BiRefNet lite 1024 WebGPU export.

## Candidates

| Model (Hub repo, pinned commit) | License | Download | WebGPU: cut per photo | WASM: cut per photo | Peak renderer memory | Quality on the 4 test photos |
|---|---|---|---|---|---|---|
| **BiRefNet lite 512** `studioludens/birefnet-lite-512` fp16 **(chosen)** | MIT | 98.5 MB | 0.8–1.5 s | 4.2–4.8 s | ~2.5 GB (both backends) | Good on all 4: thin chain, pearls, ring hole, zirconia drops, bracelet |
| ISNet general-use `Ko033/isnet-general-use-onnx` (fp16 / q8) | Apache-2.0 (rembg MIT export of DIS) | 88.1 / 45.9 MB | 0.3 s | 6.3–7.0 s | ~0.85–1 GB | Fails: keeps the linen inside the chain, the wood inside the ring; pearl studs half transparent |
| BiRefNet lite 1024, WebGPU rewrite `wonfy/BiRefNet_lite-ONNX-webgpu` fp16 | MIT | 123.2 MB | 1.7–1.9 s | `std::bad_alloc` | ~1.1 GB (WebGPU) | Best edges (crisper chain), but runs on WebGPU only |
| BiRefNet lite 1024 `onnx-community/BiRefNet_lite-ONNX` fp16 | MIT | 114.5 MB | shader limit error | `std::bad_alloc` | — | Does not run in the browser |

Excluded by license: `onnx-community/ISNet-ONNX` (published as AGPL-3.0), `@imgly/background-removal` (AGPL), BRIA RMBG-1.4/2.0 (non-commercial).

## Decision

BiRefNet lite 512 fp16 for both backends: one download, the same result on WebGPU and WebAssembly, and the only candidate that cut all four photos well on both. ISNet is lighter and faster on WebGPU but fails exactly the cases that matter (textured background inside a chain loop or a ring, white pearl on white).

Runtime: Transformers.js 4.3.2 (Apache-2.0) with ONNX Runtime Web 1.31.0-dev (MIT). The model files come from the Hub on first use and stay in the browser cache (`transformers-cache`); the ONNX Runtime WebAssembly files are served from `/assets` (plain build 14.3 MB; the WebGPU-capable asyncify build gzipped to 6.6 MB because the raw file is over the 25 MiB static-asset cap).

## Known limits

- **Memory**: ~2.5 GB peak on desktop for the 512 model, on both backends (the WebGPU backend still runs some operators on the CPU). Phones with less memory may kill the worker (the sheet shows "Faltou memória…") or, on iOS, reload the tab. Not measured on a real phone.
- **Thin chains**: at 512 px the matte of a fine chain is a little thicker than the chain, with a faint halo of the original background; the retouch brush fixes stray bits.
- **Transparent stones**: zirconia keeps the colour of whatever is behind it in the original photo (dark granite makes it grey). A plain light background gives the best result.
- **Small pieces**: a piece that is small in the frame is enlarged at most 3× and then looks soft; photograph the piece filling most of the frame.
- Times are desktop numbers; a mid-range phone on WebAssembly will be several times slower.
