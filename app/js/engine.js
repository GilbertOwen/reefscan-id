// ReefScan-ID cascade in JavaScript, mirroring notebooks 10 (E4) and 12 (ONNX parity).
// Works in the browser (onnxruntime-web) and in Node (the same package), so the parity test runs the code the app runs.
//
// Per photo:
//   1. scale the photo to 1024 px high, keeping its aspect ratio (Pillow bilinear) -> the "working photo";
//   2. stage 1 (SegFormer-B0) on the working photo scaled to 512 px high;
//   3. one random point per grid cell (numpy's default_rng(0 + photo index)), 128 px border;
//   4. stage 1 read at the points only, with the bilinear formula of F.interpolate(align_corners=False);
//   5. coral points: 128 px patch from the working photo -> stage 2 (EfficientNet-B0) healthy / bleached / dead;
//   6. substrate points count as substrate, other points are not counted;
//   7. T_live = (healthy + bleached) / seabed, P_bleached = bleached / (healthy + bleached), KepMenLH category.

import { resizeRGB } from "./pil-resize.js";
import { photoPoints } from "./numpy-random.js";

export const PROTOCOL = Object.freeze({
  photoHeight: 1024,
  segHeight: 512,
  margin: 128,
  patch: 128,
  seed: 0,
  grids: Object.freeze({ 30: [5, 6], 60: [6, 10] }),
  stage1Classes: Object.freeze(["coral", "substrate", "other"]),
  labels: Object.freeze(["healthy", "bleached", "dead", "substrate", "other"]),
  kepmenlh: Object.freeze([
    ["Buruk", 0, 25],
    ["Sedang", 25, 50],
    ["Baik", 50, 75],
    ["Baik sekali", 75, 100],
  ]),
});

export const HEALTHY = 0, BLEACHED = 1, DEAD = 2, SUBSTRATE = 3, OTHER = 4;

// Python's round(): halves go to the even neighbour (round(682.5) == 682, as in notebooks 11 and 12).
export function roundHalfEven(x) {
  const f = Math.floor(x);
  const d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

export function workingSize(width, height) {
  const h = PROTOCOL.photoHeight;
  return { width: roundHalfEven((h * width) / height), height: h };
}

export function segSize(workingWidth) {
  const h = PROTOCOL.segHeight;
  return { width: roundHalfEven((h * workingWidth) / PROTOCOL.photoHeight), height: h };
}

export function kepmenlhCategory(percent) {
  const bands = PROTOCOL.kepmenlh;
  for (let i = 0; i < bands.length - 1; i++) if (percent < bands[i][2]) return bands[i][0];
  return bands[bands.length - 1][0];
}

// Packed RGB uint8 -> planar float32 in 0..1 (the ONNX graphs normalise inside).
export function toPlanar(rgb, width, height) {
  const n = width * height;
  const out = new Float32Array(3 * n);
  for (let i = 0, p = 0; i < n; i++, p += 3) {
    out[i] = rgb[p] / 255;
    out[n + i] = rgb[p + 1] / 255;
    out[2 * n + i] = rgb[p + 2] / 255;
  }
  return out;
}

// Stage 1 logits (classes x h x w, float32) read at photo pixels (ys, xs) of a photo outHeight x outWidth.
// Same source coordinates and the same float64 arithmetic order as labels_at_points in notebook 12.
export function labelsAtPoints(logits, classes, h, w, ys, xs, outHeight, outWidth) {
  const n = ys.length;
  const labels = new Int32Array(n);
  const values = new Float64Array(n * classes);
  const scaleY = h / outHeight;
  const scaleX = w / outWidth;
  for (let i = 0; i < n; i++) {
    const sy = Math.max((ys[i] + 0.5) * scaleY - 0.5, 0);
    const sx = Math.max((xs[i] + 0.5) * scaleX - 0.5, 0);
    const y0 = Math.min(Math.floor(sy), h - 1);
    const x0 = Math.min(Math.floor(sx), w - 1);
    const y1 = Math.min(y0 + 1, h - 1);
    const x1 = Math.min(x0 + 1, w - 1);
    const ly = sy - y0;
    const lx = sx - x0;
    let best = 0;
    for (let c = 0; c < classes; c++) {
      const base = c * h * w;
      const v = logits[base + y0 * w + x0] * (1 - ly) * (1 - lx) + logits[base + y0 * w + x1] * (1 - ly) * lx
        + logits[base + y1 * w + x0] * ly * (1 - lx) + logits[base + y1 * w + x1] * ly * lx;
      values[i * classes + c] = v;
      if (v > values[i * classes + best]) best = c;
    }
    labels[i] = best;
  }
  return { labels, values };
}

// 128 px patches centred on the points, planar float32 in 0..1: [N, 3, 128, 128].
export function extractPatches(rgb, width, ys, xs, size = PROTOCOL.patch) {
  const half = size >> 1;
  const plane = size * size;
  const out = new Float32Array(ys.length * 3 * plane);
  for (let i = 0; i < ys.length; i++) {
    const base = i * 3 * plane;
    for (let dy = 0; dy < size; dy++) {
      const row = (ys[i] - half + dy) * width;
      for (let dx = 0; dx < size; dx++) {
        const p = (row + xs[i] - half + dx) * 3;
        const q = base + dy * size + dx;
        out[q] = rgb[p] / 255;
        out[q + plane] = rgb[p + 1] / 255;
        out[q + 2 * plane] = rgb[p + 2] / 255;
      }
    }
  }
  return out;
}

export function softmax(values, offset, count) {
  let max = -Infinity;
  for (let c = 0; c < count; c++) max = Math.max(max, values[offset + c]);
  const out = new Array(count);
  let sum = 0;
  for (let c = 0; c < count; c++) sum += out[c] = Math.exp(values[offset + c] - max);
  for (let c = 0; c < count; c++) out[c] /= sum;
  return out;
}

export function healthNumbers(counts) {
  const seabed = counts[HEALTHY] + counts[BLEACHED] + counts[DEAD] + counts[SUBSTRATE];
  const live = counts[HEALTHY] + counts[BLEACHED];
  const tLive = seabed > 0 ? (100 * live) / seabed : NaN;
  const pBleached = live > 0 ? (100 * counts[BLEACHED]) / live : NaN;
  return { seabed, live, tLive, pBleached, category: seabed > 0 ? kepmenlhCategory(tLive) : null };
}

export async function loadModels(ort, stage1Source, stage2Source, options = {}) {
  const [stage1, stage2] = await Promise.all([
    ort.InferenceSession.create(stage1Source, options),
    ort.InferenceSession.create(stage2Source, options),
  ]);
  return { stage1, stage2 };
}

// The cascade's probability of a point's own label (notebook 13): the stage 1 probability for substrate and other,
// the stage 1 coral probability times the stage 2 probability for coral points.
export function labelScore(stage1Probs, stage1, stage2Probs) {
  const p1 = stage1Probs[stage1];
  return stage1 === 0 && stage2Probs ? p1 * Math.max(...stage2Probs) : p1;
}

// rgb: packed RGB uint8 of the photo as decoded (EXIF orientation already applied by the loader).
// photoIndex: position of the photo in the session; the points use seed 0 + photoIndex, as in E4, unless `seed` is given
// (the sample photos pass their Coralscapes validation index, so the app places the notebooks' points).
// raguThreshold: points whose label score is below it are marked "titik ragu" (notebook 13 chose 0.65 on validation).
export async function analysePhoto({ ort, models, rgb, width, height, photoIndex = 0, seed = null, points = 30, raguThreshold = null, onStage }) {
  const grid = PROTOCOL.grids[points];
  if (!grid) throw new Error("points must be 30 or 60");
  const timing = {};
  let tick = performance.now();

  const work = workingSize(width, height);
  const working = work.width === width && work.height === height ? rgb : resizeRGB(rgb, width, height, work.width, work.height);
  const seg = segSize(work.width);
  const segRGB = resizeRGB(working, work.width, work.height, seg.width, seg.height);
  const segInput = new ort.Tensor("float32", toPlanar(segRGB, seg.width, seg.height), [1, 3, seg.height, seg.width]);
  timing.prepare = performance.now() - tick;

  onStage?.("stage1");
  tick = performance.now();
  const s1 = (await models.stage1.run({ image: segInput })).logits;
  timing.stage1 = performance.now() - tick;
  const [, classes, lh, lw] = s1.dims;

  const pointSeed = seed ?? PROTOCOL.seed + photoIndex;
  const { ys, xs } = photoPoints(pointSeed, work.width, work.height, grid[0], grid[1], PROTOCOL.margin);
  const s1Points = labelsAtPoints(s1.data, classes, lh, lw, ys, xs, work.height, work.width);

  const coral = [];
  for (let i = 0; i < ys.length; i++) if (s1Points.labels[i] === 0) coral.push(i);

  onStage?.("stage2");
  tick = performance.now();
  let s2Logits = null;
  let s2Cam = null;
  if (coral.length) {
    const cys = Int32Array.from(coral, (i) => ys[i]);
    const cxs = Int32Array.from(coral, (i) => xs[i]);
    const patches = new ort.Tensor("float32", extractPatches(working, work.width, cys, cxs), [coral.length, 3, PROTOCOL.patch, PROTOCOL.patch]);
    const out = await models.stage2.run({ patches });
    s2Logits = out.logits.data;
    s2Cam = { data: out.cam.data, dims: out.cam.dims };
  }
  timing.stage2 = performance.now() - tick;

  const counts = [0, 0, 0, 0, 0];
  const pointRecords = [];
  let k = 0;
  for (let i = 0; i < ys.length; i++) {
    const stage1 = s1Points.labels[i];
    const record = {
      y: ys[i],
      x: xs[i],
      stage1,
      stage1Probs: softmax(s1Points.values, i * classes, classes),
      label: stage1 === 1 ? SUBSTRATE : OTHER,
      stage2Probs: null,
      stage2Logits: null,
      camIndex: -1,
    };
    if (stage1 === 0) {
      const logits = Array.from(s2Logits.subarray(k * 3, k * 3 + 3));
      let best = 0;
      for (let c = 1; c < 3; c++) if (logits[c] > logits[best]) best = c;
      record.label = best;
      record.stage2Logits = logits;
      record.stage2Probs = softmax(logits, 0, 3);
      record.camIndex = k;
      k++;
    }
    record.score = labelScore(record.stage1Probs, stage1, record.stage2Probs);
    record.ragu = raguThreshold !== null && record.score < raguThreshold;
    counts[record.label]++;
    pointRecords.push(record);
  }

  // Stage 1 label map at its own resolution (h x w), for the "area karang" overlay
  const stage1Map = new Uint8Array(lh * lw);
  for (let i = 0; i < lh * lw; i++) {
    let best = 0;
    for (let c = 1; c < classes; c++) if (s1.data[c * lh * lw + i] > s1.data[best * lh * lw + i]) best = c;
    stage1Map[i] = best;
  }
  // Counted over all points, as in notebook 13 (an "other" point can be coral that stage 1 missed)
  const raguCount = pointRecords.filter((p) => p.ragu).length;

  return {
    photoIndex,
    seed: pointSeed,
    grid: points,
    size: { width, height },
    working: work,
    seg,
    points: pointRecords,
    counts,
    ...healthNumbers(counts),
    raguCount,
    raguShare: pointRecords.length ? raguCount / pointRecords.length : 0,
    cam: s2Cam,
    stage1Map: { data: stage1Map, height: lh, width: lw },
    stage1Values: s1Points.values,
    timing,
  };
}

// Session summary. "photo mean" averages the per-photo numbers (as in E4 and the UPT method, one frame = one photo);
// "pooled" counts all points of the session together. Which one the app shows is a team decision; both are returned.
export function summariseSession(photos) {
  const counts = [0, 0, 0, 0, 0];
  const tValues = [];
  const pValues = [];
  for (const photo of photos) {
    for (let c = 0; c < 5; c++) counts[c] += photo.counts[c];
    if (Number.isFinite(photo.tLive)) tValues.push(photo.tLive);
    if (Number.isFinite(photo.pBleached)) pValues.push(photo.pBleached);
  }
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN);
  const photoMean = { tLive: mean(tValues), pBleached: mean(pValues), photosT: tValues.length, photosP: pValues.length };
  photoMean.category = Number.isFinite(photoMean.tLive) ? kepmenlhCategory(photoMean.tLive) : null;
  return { photos: photos.length, counts, photoMean, pooled: healthNumbers(counts) };
}
