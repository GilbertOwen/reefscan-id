// Web worker: loads the two ONNX models once, then decodes and analyses one photo per message, so the page stays smooth.
// Photos never leave the device: they are read here from the File the page passes in.
import * as ort from "../vendor/ort.wasm.min.mjs";
import { analysePhoto, loadModels } from "./engine.js";
import { rgbaToRGB } from "./pil-resize.js";

ort.env.wasm.wasmPaths = new URL("../vendor/", import.meta.url).href;
ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 1) : 1;

let models = null;
let raguThreshold = null;
const MAX_PIXELS = 50e6;

async function fetchWithProgress(url, cacheName, onProgress) {
  let cache = null;
  let response = null;
  try {
    cache = await caches.open(cacheName);
    response = await cache.match(url);
  } catch {
    cache = null;
  }
  const cached = Boolean(response);
  if (!response) {
    response = await fetch(url);
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  }
  const total = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress(loaded, total);
  }
  const bytes = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  if (cache && !cached) {
    try { await cache.put(url, new Response(bytes, { headers: { "Content-Type": "application/octet-stream" } })); } catch { /* storage full: fine */ }
  }
  return { bytes, cached };
}

async function init({ modelBase, threshold }) {
  raguThreshold = threshold;
  const manifest = await (await fetch(modelBase + "models.json", { cache: "no-cache" })).json();
  const files = ["stage1", "stage2"].map((stage) => manifest.models[stage]);
  const cacheName = "reefscan-models-" + files.map((f) => f.sha256.slice(0, 8)).join("-");
  const progress = files.map(() => ({ loaded: 0, total: 0 }));
  const sizes = files.map((f) => f.bytes || 0);
  const report = () => {
    const loaded = progress.reduce((a, p) => a + p.loaded, 0);
    const total = progress.reduce((a, p, i) => a + (p.total || sizes[i]), 0);
    postMessage({ type: "model-progress", loaded, total });
  };
  const downloads = await Promise.all(files.map((file, i) => fetchWithProgress(modelBase + file.file, cacheName, (loaded, total) => {
    progress[i] = { loaded, total };
    report();
  })));
  models = await loadModels(ort, downloads[0].bytes, downloads[1].bytes);
  postMessage({ type: "ready", cached: downloads.every((d) => d.cached), versions: manifest.versions || null, threads: ort.env.wasm.numThreads });
}

async function decode(blob) {
  const bitmap = await createImageBitmap(blob, { imageOrientation: "from-image", colorSpaceConversion: "none", premultiplyAlpha: "none" });
  const { width, height } = bitmap;
  if (width * height > MAX_PIXELS) {
    bitmap.close();
    throw Object.assign(new Error("too large"), { code: "too-large", width, height });
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { rgb: rgbaToRGB(context.getImageData(0, 0, width, height).data, width, height), width, height };
}

async function analyse({ id, file, photoIndex, seed, points }) {
  const start = performance.now();
  let image;
  try {
    image = await decode(file);
  } catch (error) {
    postMessage({ type: "error", id, code: error.code || "decode", width: error.width, height: error.height });
    return;
  }
  const decodeMs = performance.now() - start;
  const result = await analysePhoto({
    ort, models, ...image, photoIndex, seed, points, raguThreshold,
    onStage: (stage) => postMessage({ type: "stage", id, stage }),
  });
  delete result.stage1Values;
  result.timing.decode = decodeMs;
  result.timing.total = performance.now() - start;
  const transfer = [result.stage1Map.data.buffer];
  if (result.cam) transfer.push(result.cam.data.buffer);
  postMessage({ type: "result", id, result }, transfer);
}

let queue = Promise.resolve();
self.onmessage = (event) => {
  const message = event.data;
  queue = queue.then(async () => {
    try {
      if (message.type === "init") await init(message);
      else if (message.type === "analyse") await analyse(message);
    } catch (error) {
      postMessage({ type: "fatal", id: message.id ?? null, message: String(error && error.message || error) });
    }
  });
};
