# ReefScan-ID app (static web, inference in the browser)

Status: **W1 done** (the JavaScript engine), **W2 done** (the screens of wireframe v3) and **W3 done** (PDF report, CSV columns of board 10, demo photos with bleaching, comparison with a previous session, self-hosted fonts). W4 (deploy, timing on a phone) is next.

The app runs the frozen E4 cascade in the browser with `onnxruntime-web`. Photos never leave the device.

## Layout

| Path | What it is |
|---|---|
| `index.html`, `css/app.css` | The page and the styles (tokens of the Figma visual guide: ocean gradients, Okabe-Ito class colours with shapes) |
| `js/main.js` | State, hash routing and the screens: Beranda, Sesi baru, Proses, Ringkasan, Detail foto, Tentang |
| `js/worker.js` | Web worker: downloads the models once (Cache API), decodes each photo (EXIF orientation, no colour conversion) and runs the engine |
| `js/charts.js`, `js/icons.js` | KepMenLH scale, per-photo spread, bleaching waffle, composition bar, CAM colours; icons and class markers |
| `data/analysis.json` | Numbers the app shows or uses, from notebooks 10 and 13: titik ragu threshold 0.65, E4 test results with intervals, robustness |
| `data/hero.json`, `img/hero_val_101.jpg` | The Beranda photo with the real 60-point result of sample 101 |
| `img/how_area_101.jpg` | The same photo with the real stage 1 map (coral, substrate, not counted), for the "Cara kerja" strip |
| `media/dive_reef_720.mp4` | Looping hero video, 1280×720, 8 s, 2.3 MB: "Scuba Diver Exploring Vibrant Coral Reef Underwater" by Jun Ho Lee on Pexels (Pexels License: free to use, no attribution required; credited anyway) |
| `js/logo.js` | Logo: concept C, a submarine porthole without bolts with a sonar sweep finding a point on the reef (chosen by the team designer); concepts A and B on `#/logo` |
| `vendor/` | `onnxruntime-web` 1.31.1 browser files, copied by `npm install` (not in git) |
| `fonts/` | Inter and Plus Jakarta Sans, variable, latin subset (OFL-1.1) |
| `coi-sw.js` | Service worker that adds cross-origin isolation, so the models can use several threads on GitHub Pages |
| `js/engine.js` | The cascade per photo and the session summary: working photo 1024 px high, stage 1 at 512 px high, E4 points, stage 1 read at the points, 128 px patches, stage 2, T_live, P_bleached, KepMenLH |
| `js/pil-resize.js` | Pillow's `resize(..., Image.BILINEAR)` ported from `libImaging/Resample.c`, so the browser gets the notebooks' pixels |
| `js/numpy-random.js` | numpy's `default_rng(seed).random()` (SeedSequence + PCG64), so the app places the E4 points |
| `models/` | The ONNX files from `Checkpoints/onnx` (not committed) |
| `samples/` | 10 Coralscapes validation photos, original PNG bytes, for the parity test (Apache-2.0, see `samples/ATTRIBUTION.md`) |
| `samples-demo/` | 10 lighter JPEG validation photos for "Coba dengan foto contoh", 4 with bleaching (see `samples-demo/ATTRIBUTION.md`) |
| `test/make_reference.py` | Python reference from notebook 12's code: runs ONNX Runtime on the samples in 5 shapes |
| `test/parity.mjs` | Gate W1: the JS engine (onnxruntime-web, WASM) against the Python reference |

## Protocol (same as notebooks 10 to 12)

- The photo is scaled to 1024 px high, aspect ratio kept (`round(1024 * w / h)` wide, Python rounding); stage 1 sees it at 512 px high.
- Points: a 5 x 6 grid (30 points) or 6 x 10 (60), one random point per cell, `np.random.default_rng(0 + photo index)`, 128 px border.
- Stage 1 is read at the points with the bilinear formula of `F.interpolate(align_corners=False)`; notebook 12 showed this equals the full map.
- Coral points go to stage 2 (healthy, bleached, dead); substrate counts as substrate; other is not counted.
- T_live = (healthy + bleached) / seabed; P_bleached = bleached / (healthy + bleached); KepMenLH 4/2001 bands 25 / 50 / 75.
- Session summary: both the mean of the photos (as in E4 and UPT) and the pooled points are returned. Which one the app shows is open for the team.

## Set up and run locally

Model files and photos are not in git (team rule: no data or checkpoints in the repo), so after cloning:

1. `cd app && npm install` (also copies the onnxruntime-web files into `vendor/`).
2. Copy `stage1_segformer_b0.onnx` and `stage2_efficientnet_b0.onnx` from Drive `ReefScan-ID/Checkpoints/onnx` into `app/models/` (`models.json` is already here; the worker checks nothing else, so keep the three files of one export together).
3. Optional, for "Coba dengan foto contoh" and the parity test: `python -I -X utf8 test/fetch_samples.py samples 5` (10 original validation PNGs, about 23 MB read from Hugging Face), then `python -I -X utf8 scripts/make_demo_samples.py` (the 10 lighter demo JPEGs, 4 of them with bleaching).
4. From the repository root: `python -I tools/serve_app.py 5173` (sets the `.mjs`/`.wasm`/`.woff2` MIME types), then open http://localhost:5173. `?debug` exposes the state as `window.reefscanState` for checks.

`img/hero_val_101.jpg` and `img/how_area_101.jpg` are small UI images made from Coralscapes validation photo 101 (Apache-2.0), with the real model output.

Checked in the browser on 2026-11-21 with the 10 sample photos, 60 points: the same 600 points, the same stage 1 and final label at every point, and the same T_live, P_bleached and category on all 10 photos as `test/make_reference.py`; about 2.1 s per photo (Chrome, WASM, 1 thread), 24 s for the 10.

## Speed and weight (checked 2026-11-21)

- `coi-sw.js` adds the cross-origin isolation headers (COOP/COEP) through a service worker, because GitHub Pages cannot set headers. The page then has SharedArrayBuffer and onnxruntime-web uses up to 4 threads. In Chrome on the 6-core laptop: 10 sample photos in 7.1 s (0.6 to 0.9 s per photo) instead of 24 s, with the same 600 labels as the Python reference.
- First visit to Sesi baru downloads the models (31 MB, then kept in the Cache API) and the onnxruntime wasm (14.8 MB, cached by the browser; GitHub Pages compresses it). The Beranda video is 2.3 MB. The sample photos (23 MB) load only on "Coba dengan foto contoh".
- Scrolling: lists show 320 px JPEG thumbnails made once per photo (not the full photo); the hero video pauses when it is off screen; no `backdrop-filter`; lighter shadows; `content-visibility` on the Beranda sections.

## W3 additions

- **Laporan PDF** (`#/laporan`): one A4 page (board 10) with the session, the three main numbers, the plain summary, composition, spread, up to 12 photos, method, limits and the model version. "Simpan sebagai PDF" uses the browser's print dialog, so no PDF library is needed; the page title gives the file name.
- **CSV** columns follow board 10 in Indonesian (`nama_sesi`, `tanggal`, `lat`, `lon`, `file_foto`, `status`, `alasan`, `titik_*`, `tutupan_hidup_pct`, `bleaching_pct` (empty under 5 live points), `kategori`, `titik_ragu`, `dikoreksi_manual`, `versi_model`, ...) with a last `RATA-RATA SESI` row; the point file has `tahap1`, `label_model`, `label`, `dikoreksi_manual`, `dihitung`, `ragu`, `keyakinan`.
- **Demo photos** (`samples-demo/`, 3.5 MB instead of 23 MB): validation 101, 141, 159, 154, 135, 102, 103, 4, 100, 0 as JPEG. 135, 141, 154 and 159 contain bleached coral in the expert labels (notebook 10) and come from the Hugging Face dataset viewer; the row order was checked against the parquet (photo 101: mean difference 1.9 against the original PNG, 52.5 against photo 102). The PNG originals in `samples/` stay for the parity test.
- **Compare with a previous session**: upload that session's "CSV per foto" on Ringkasan; the change in live cover is called real only when it is larger than the per-photo error of the model (±5.6 points at 60 points).

## Location

Optional and only recorded (Ringkasan, CSV), never used by the model: the mean GPS of the photos from EXIF (`js/exif.js`, also fills the dive date), or typed coordinates, with a link to OpenStreetMap. No map is embedded, so the page makes no third-party requests.

## Decisions taken in W2 (tell the team)

- Default 60 points per photo (notebook 13: more accurate than 30, −0.94 points MAE, CI −1.70 to −0.18), 30 as an option.
- Titik ragu: label score below 0.65 (notebook 13 rule). Ragu points are marked but still counted (leaving them out raised the MAE).
- Session numbers are the mean of the photos (as E4 and UPT); the composition bar uses the pooled points.
- Per-photo bleaching is shown only with at least 5 live coral points (wireframe rule); the session mean keeps the E4 definition.
- A photo with more than 30% ragu points is flagged "keyakinan rendah"; "keyakinan hasil" is never shown as high, because the model was not tested on Indonesian photos.

## Run the parity test

Needs Node 22 and Python 3.11 or newer with `numpy`, `Pillow`, `onnxruntime` and `pyarrow` (the sample scripts also use `pyarrow`). Exporting the models again with `tools/export_onnx.py` needs `torch`, `torchvision`, `transformers`, `onnx` and `onnxruntime`, plus the two checkpoints from Drive.

```
npm install
python -I -X utf8 test/make_reference.py samples models test/reference
npm test
```

Result on 2026-11-21 (onnxruntime-web 1.31.1 against onnxruntime 1.32.0, 10 photos, shapes 2:1, 4:3 crop, 4:3 phone 1600 x 1200, portrait 3:4, small 1000 x 500, grids of 30 and 60):

- numpy random numbers: 202 of 202 seeds bit for bit;
- Pillow resize: 70 images, 0 bytes differ;
- points: 100% the same; stage 1 and final labels: 100% the same (6,000 points); largest difference 3.6e-6 (stage 1) and 5.7e-5 (stage 2 logit);
- T_live, P_bleached and category: 100 of 100 photo runs equal;
- time: about 2.1 s per 2:1 photo in Node on the laptop (WASM, 1 thread), 1.9 s of it stage 1.

If `test/reference/onnx_parity_points.csv` (from `Processed/onnx_parity` in Drive) is present, the test also compares the JS labels with the notebook 12 Colab output for these photos.

With that file present (2026-11-21): 1,555 of 1,555 points of these photos (2:1 and 4:3, 30 and 60 points) have the same final label in JS as in notebook 12's ONNX run and its PyTorch run in Colab.

## Notes for W3 and W4

- Decode photos with `createImageBitmap(file, { imageOrientation: "from-image", colorSpaceConversion: "none" })`: EXIF orientation applied, no colour profile conversion (Pillow ignores profiles too).
- The ONNX files are 15 and 16 MB; GitHub Pages serves them, but the team rule is not to commit checkpoints, so the deploy may load them from a release asset or Hugging Face instead (decide in W4).
- The same rule touches the photos: only `samples-demo/` (3.5 MB) is needed for the deployed app; `samples/` (23 MB) is only for the parity test. Decide in W4.
