// Copies the three onnxruntime-web browser files the app loads into vendor/ (run automatically after npm install).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(app, "node_modules", "onnxruntime-web", "dist");
const out = path.join(app, "vendor");
fs.mkdirSync(out, { recursive: true });
for (const file of ["ort.wasm.min.mjs", "ort-wasm-simd-threaded.mjs", "ort-wasm-simd-threaded.wasm"]) {
  fs.copyFileSync(path.join(dist, file), path.join(out, file));
}
console.log("onnxruntime-web files copied to vendor/");
