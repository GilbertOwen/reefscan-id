// Gate W1: the JavaScript engine (onnxruntime-web, WASM, the runtime the browser uses) against the Python reference
// built from notebook 12. Run `python -I -X utf8 test/make_reference.py samples models test/reference` first.
//
// Checks
//   1. numpy default_rng doubles: bit for bit;
//   2. Pillow bilinear resize (working photo, stage 1 input): byte for byte;
//   3. points: exactly the same;
//   4. stage 1 and final labels: same on at least 99.9% of points (the notebook 12 gate), differences listed;
//   5. T_live, P_bleached and the category per photo and grid.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import * as ort from "onnxruntime-web";
import { NumpyRandom, photoPoints } from "../js/numpy-random.js";
import { resizeRGB } from "../js/pil-resize.js";
import { analysePhoto, loadModels, workingSize, segSize, PROTOCOL } from "../js/engine.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const refDir = path.join(here, "reference");
const reference = JSON.parse(fs.readFileSync(path.join(refDir, "reference.json"), "utf8"));
const GATE = 0.999;
let failures = 0;
const fail = (message) => { failures++; console.log("  FAIL " + message); };

function readRGB(file) {
  const png = PNG.sync.read(fs.readFileSync(file));
  const rgb = new Uint8Array(png.width * png.height * 3);
  for (let i = 0, j = 0; i < png.width * png.height * 4; i += 4, j += 3) {
    rgb[j] = png.data[i]; rgb[j + 1] = png.data[i + 1]; rgb[j + 2] = png.data[i + 2];
  }
  return { rgb, width: png.width, height: png.height };
}

// 1. random numbers
{
  let seeds = 0, mismatched = 0;
  for (const [seed, values] of Object.entries(reference.rng)) {
    const rng = new NumpyRandom(Number(seed));
    seeds++;
    for (const value of values) if (rng.random() !== value) { mismatched++; break; }
  }
  console.log(`1. numpy default_rng: ${seeds - mismatched} of ${seeds} seeds give the same 120 doubles`);
  if (mismatched) fail(`${mismatched} seeds differ`);
}

// 2. resize
{
  let images = 0, bytes = 0, differ = 0, maxDiff = 0;
  for (const result of reference.results) {
    const folder = result.input.folder === "samples" ? path.join(root, "samples") : path.join(refDir, "inputs");
    const input = readRGB(path.join(folder, result.input.file));
    const work = workingSize(input.width, input.height);
    const seg = segSize(work.width);
    if (work.width !== result.working[0] || seg.width !== result.seg[0]) fail(`${result.input.file}: sizes ${work.width}/${seg.width} vs ${result.working[0]}/${result.seg[0]}`);
    const working = result.resized.working ? resizeRGB(input.rgb, input.width, input.height, work.width, work.height) : input.rgb;
    const checks = [["seg", resizeRGB(working, work.width, work.height, seg.width, seg.height)]];
    if (result.resized.working) checks.push(["working", working]);
    for (const [kind, mine] of checks) {
      const expected = readRGB(path.join(refDir, "resized", result.resized[kind])).rgb;
      images++; bytes += expected.length;
      for (let i = 0; i < expected.length; i++) {
        if (mine[i] !== expected[i]) { differ++; maxDiff = Math.max(maxDiff, Math.abs(mine[i] - expected[i])); }
      }
    }
  }
  console.log(`2. Pillow bilinear resize: ${images} images, ${differ} of ${bytes} bytes differ (largest difference ${maxDiff})`);
  if (differ) fail("resize is not byte-exact");
}

// 3-5. full pipeline
ort.env.wasm.numThreads = 1;
const models = await loadModels(ort, fs.readFileSync(path.join(root, "models/stage1_segformer_b0.onnx")),
  fs.readFileSync(path.join(root, "models/stage2_efficientnet_b0.onnx")));
const totals = {};
const differences = [];
let worstStage1 = 0, worstStage2 = 0, numberMismatch = 0;
const times = [];
const jsLabels = new Map();  // "case|points|photo" -> Map("y,x" -> final label), for the notebook 12 CSV check
for (const result of reference.results) {
  const folder = result.input.folder === "samples" ? path.join(root, "samples") : path.join(refDir, "inputs");
  const input = readRGB(path.join(folder, result.input.file));
  for (const points of [30, 60]) {
    const expected = result.grids[points];
    const start = performance.now();
    const mine = await analysePhoto({ ort, models, ...input, photoIndex: result.photo_index, points });
    times.push({ case: result.case, points, ms: performance.now() - start, ...mine.timing });
    jsLabels.set(`${result.case}|${points}|${result.photo_index}`, new Map(mine.points.map((p) => [`${p.y},${p.x}`, p.label])));
    const key = `${result.case} / ${points}`;
    const total = totals[key] ??= { points: 0, samePoints: 0, stage1: 0, final: 0, photos: 0 };
    total.photos++;
    let k = 0;
    for (let i = 0; i < expected.ys.length; i++) {
      const p = mine.points[i];
      total.points++;
      if (p.y === expected.ys[i] && p.x === expected.xs[i]) total.samePoints++;
      if (p.stage1 === expected.stage1[i]) total.stage1++;
      if (p.label === expected.final[i]) total.final++;
      else differences.push({ key, photo: result.photo_index, y: p.y, x: p.x, js: PROTOCOL.labels[p.label], python: PROTOCOL.labels[expected.final[i]] });
      for (let c = 0; c < 3; c++) worstStage1 = Math.max(worstStage1, Math.abs(mine.stage1Values[i * 3 + c] - expected.stage1_values[i][c]));
      if (expected.stage1[i] === 0 && p.stage1 === 0) {
        for (let c = 0; c < 3; c++) worstStage2 = Math.max(worstStage2, Math.abs(p.stage2Logits[c] - expected.stage2_logits[k][c]));
      }
      if (expected.stage1[i] === 0) k++;
    }
    const close = (a, b) => (a === null && !Number.isFinite(b)) || (a !== null && Math.abs(a - b) < 1e-9);
    if (!close(expected.t_live, mine.tLive) || !close(expected.p_bleached, mine.pBleached) || expected.category !== mine.category) {
      numberMismatch++;
      console.log(`  numbers differ: ${key}, photo ${result.photo_index}: T_live ${mine.tLive} vs ${expected.t_live}, P_bleached ${mine.pBleached} vs ${expected.p_bleached}, ${mine.category} vs ${expected.category}`);
    }
  }
}

console.log("3-4. points and labels, JS (onnxruntime-web " + ort.env.versions?.web + ") vs Python (onnxruntime " + reference.onnxruntime + "):");
for (const [key, t] of Object.entries(totals)) {
  console.log(`   ${key.padEnd(20)} photos ${t.photos}, points ${t.points}: same points ${(t.samePoints / t.points * 100).toFixed(2)}%, ` +
    `stage 1 ${(t.stage1 / t.points * 100).toFixed(2)}%, final ${(t.final / t.points * 100).toFixed(2)}%`);
  if (t.samePoints !== t.points) fail(`${key}: points differ`);
  if (t.final / t.points < GATE) fail(`${key}: final labels below the ${GATE * 100}% gate`);
}
console.log(`   largest difference: stage 1 value at a point ${worstStage1.toExponential(2)}, stage 2 logit ${worstStage2.toExponential(2)}`);
if (differences.length) {
  console.log(`   points with a different final label: ${differences.length}`);
  for (const d of differences.slice(0, 20)) console.log("    ", JSON.stringify(d));
}
console.log(`5. T_live, P_bleached and category: ${reference.results.length * 2 - numberMismatch} of ${reference.results.length * 2} photo runs equal`);
if (numberMismatch) fail(`${numberMismatch} photo runs give different numbers`);

// 6. optional: the notebook 12 Colab output itself (copy Processed/onnx_parity/onnx_parity_points.csv to test/reference/)
const csvPath = path.join(refDir, "onnx_parity_points.csv");
if (fs.existsSync(csvPath)) {
  const [head, ...lines] = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/);
  const col = Object.fromEntries(head.split(",").map((name, i) => [name, i]));
  let compared = 0, sameOnnx = 0, sameTorch = 0, missing = 0;
  for (const line of lines) {
    const f = line.split(",");
    const labels = jsLabels.get(`${f[col.variant]}|${f[col.points]}|${f[col.photo]}`);
    if (!labels) continue;
    const label = labels.get(`${f[col.y]},${f[col.x]}`);
    if (label === undefined) { missing++; continue; }
    compared++;
    // notebook 12 saved the final labels as names (healthy, bleached, ...)
    const code = (value) => (/^\d+$/.test(value) ? Number(value) : PROTOCOL.labels.indexOf(value));
    if (label === code(f[col.onnx_at_points])) sameOnnx++;
    if (label === code(f[col.torch])) sameTorch++;
  }
  console.log(`6. notebook 12 Colab output: ${compared} points of these photos compared, same as ONNX at points ${sameOnnx}, ` +
    `same as PyTorch ${sameTorch}, points not found ${missing}`);
  if (!compared || missing || sameOnnx / compared < GATE) fail("JS does not reproduce notebook 12");
} else {
  console.log("6. notebook 12 Colab output: skipped (test/reference/onnx_parity_points.csv not found)");
}

const median = (values) => { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
for (const points of [30, 60]) {
  const rows = times.filter((t) => t.points === points && t.case === "2:1");
  console.log(`timing 2:1, ${points} points (Node, WASM, 1 thread): median ${median(rows.map((r) => r.ms)).toFixed(0)} ms per photo ` +
    `(prepare ${median(rows.map((r) => r.prepare)).toFixed(0)}, stage 1 ${median(rows.map((r) => r.stage1)).toFixed(0)}, stage 2 ${median(rows.map((r) => r.stage2)).toFixed(0)})`);
}
fs.mkdirSync(path.join(here, "out"), { recursive: true });
fs.writeFileSync(path.join(here, "out", "parity_result.json"), JSON.stringify({ totals, differences, worstStage1, worstStage2, numberMismatch, times }, null, 1));
console.log(failures ? `W1 GATE NOT PASSED (${failures} failures)` : "W1 GATE PASSED");
process.exit(failures ? 1 : 0);
