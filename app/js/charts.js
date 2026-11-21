// Small SVG/HTML charts of the wireframe: KepMenLH scale, per-photo spread, bleaching waffle, composition bar.
import { CLASS, LABEL_KEYS, marker } from "./icons.js";

export const CATS = [
  { name: "Buruk", range: "0–24,9", bg: "#E4EEF3", fg: "#0F2233", low: 0, high: 25 },
  { name: "Sedang", range: "25–49,9", bg: "#9CCFE0", fg: "#0F2233", low: 25, high: 50 },
  { name: "Baik", range: "50–74,9", bg: "#23779C", fg: "#FFFFFF", low: 50, high: 75 },
  { name: "Baik sekali", range: "75–100", bg: "#0B5F86", fg: "#FFFFFF", low: 75, high: 100 },
];
export const catOf = (name) => CATS.find((c) => c.name === name) || CATS[0];

export const pct = (v, digits = 0) => (Number.isFinite(v) ? v.toLocaleString("id-ID", { maximumFractionDigits: digits, minimumFractionDigits: digits }) + "%" : "—");
export const num = (v) => v.toLocaleString("id-ID");
// fixed decimals with the Indonesian comma and a true minus sign
export const dec = (v, d = 1) => (v < 0 ? "−" : "") + Math.abs(v).toLocaleString("id-ID", { minimumFractionDigits: d, maximumFractionDigits: d });
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function badge(category) {
  if (!category) return "";
  const c = catOf(category);
  return `<span class="badge-cat" style="background:${c.bg};color:${c.fg}">${esc(c.name)}</span>`;
}

export function catScale(value, { dark = false } = {}) {
  const segs = CATS.map((c) => `<div class="cseg${Number.isFinite(value) && value >= c.low && (value < c.high || c.high === 100) ? " on" : ""}" style="background:${c.bg};color:${c.fg}">${c.name}</div>`).join("");
  const markColour = dark ? "#FFFFFF" : "#0F2233";
  const mark = Number.isFinite(value)
    ? `<div class="cmark" style="left:${Math.min(100, Math.max(0, value))}%"><svg width="18" height="12" viewBox="0 0 18 12" aria-hidden="true"><path d="M9 12L0 0h18z" fill="${markColour}"/></svg></div>` : "";
  const ticks = [0, 25, 50, 75, 100].map((v) => `<span class="ctick" style="left:${v}%">${v}</span>`).join("");
  return `<div class="cscale" role="img" aria-label="Skala KepMenLH, nilai ${pct(value)}">${mark}<div class="csegs">${segs}</div><div class="cticks">${ticks}</div></div>`;
}

// distance to the nearest band edge (25, 50, 75), for the "dekat batas" note
export function nearEdge(value) {
  if (!Number.isFinite(value)) return null;
  const edges = [25, 50, 75];
  let best = edges[0];
  for (const e of edges) if (Math.abs(value - e) < Math.abs(value - best)) best = e;
  return { edge: best, distance: Math.abs(value - best) };
}

export function waffle(percent, cells = 25) {
  const on = Number.isFinite(percent) ? Math.round((percent / 100) * cells) : 0;
  return `<div class="waffle" role="img" aria-label="${on} dari ${cells} kotak karang hidup sedang bleaching">${Array.from({ length: cells }, (_, i) =>
    `<span class="wf" style="background:${i < on ? CLASS.bleached.colour : CLASS.healthy.colour}"></span>`).join("")}</div>`;
}

// counts: [healthy, bleached, dead, substrate, other]; the bar and legend use seabed points only
export function composition(counts) {
  const seabed = counts[0] + counts[1] + counts[2] + counts[3];
  const bar = LABEL_KEYS.slice(0, 4).map((k, i) => seabed ? `<div style="width:${(counts[i] / seabed) * 100}%;background:${CLASS[k].colour}"></div>` : "").join("");
  const rows = LABEL_KEYS.slice(0, 4).map((k, i) => `<div class="lrow">${marker(k, { size: 18, light: true })}<span>${CLASS[k].name}</span>
    <span class="lval">${num(counts[i])} titik</span><span class="lpct">${seabed ? pct((counts[i] / seabed) * 100) : "—"}</span></div>`).join("");
  return `<div class="cbar">${bar}</div><div class="legend">${rows}</div>`;
}

// One dot per photo on a 0-100% axis with the KepMenLH bands; dots are buttons that open the photo
export function spreadChart(photos, mean, selectedId = null, { width = 860 } = {}) {
  const w = width, h = 160, padL = 10, padR = 10, top = 34, base = 116;
  const X = (v) => padL + (v / 100) * (w - padL - padR);
  let svg = "";
  CATS.forEach((c) => {
    const x0 = X(c.low), x1 = X(c.high);
    svg += `<rect x="${x0.toFixed(1)}" y="${top}" width="${(x1 - x0 - 2).toFixed(1)}" height="${base - top}" rx="4" fill="${c.bg}" opacity=".38"/>`;
    svg += `<text x="${(x0 + 6).toFixed(1)}" y="${top - 8}" font-size="12" font-weight="600" fill="#4A5E6E">${c.name}</text>`;
  });
  svg += `<path d="M${padL} ${base + 2} H${w - padR}" stroke="#C5D3DD"/>`;
  [0, 25, 50, 75, 100].forEach((v) => {
    svg += `<text x="${X(v).toFixed(1)}" y="${base + 18}" font-size="12" fill="#4A5E6E" text-anchor="${v === 0 ? "start" : v === 100 ? "end" : "middle"}">${v}%</text>`;
  });
  if (Number.isFinite(mean)) {
    svg += `<path d="M${X(mean).toFixed(1)} ${top - 2} V${base + 4}" stroke="#0F2233" stroke-width="2" stroke-dasharray="4 3"/>`;
    // On a narrow chart the label goes under the axis, so it does not run into the band names
    svg += w < 500
      ? `<text x="${Math.min(w - 60, Math.max(60, X(mean))).toFixed(1)}" y="${base + 36}" font-size="12" font-weight="700" fill="#0F2233" text-anchor="middle">rata-rata ${pct(mean)}</text>`
      : `<text x="${(X(mean) + 6).toFixed(1)}" y="${top - 8}" font-size="12" font-weight="700" fill="#0F2233" ${mean > 80 ? 'text-anchor="end" dx="-12"' : ""}>rata-rata ${pct(mean)}</text>`;
  }
  const stacks = new Map();
  [...photos].sort((a, b) => a.value - b.value).forEach((p) => {
    const bucket = Math.round(p.value / 3);
    const k = stacks.get(bucket) || 0;
    stacks.set(bucket, k + 1);
    const cy = Math.max(top + 8, base - 12 - k * 15);
    const sel = p.id === selectedId;
    svg += `<circle cx="${X(p.value).toFixed(1)}" cy="${cy}" r="${sel ? 7 : 6}" fill="#0A6A8C" stroke="${sel ? "#38D3F0" : "#FFFFFF"}" stroke-width="${sel ? 3 : 2}" data-photo="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}: ${pct(p.value)} karang hidup"><title>${esc(p.name)} · ${pct(p.value)} karang hidup</title></circle>`;
  });
  return `<div class="spread"><svg viewBox="0 0 ${w} ${h}" role="group" aria-label="Sebaran tutupan karang hidup per foto">${svg}</svg></div>`;
}

// 7x7 CAM -> RGBA image (inferno-like colormap), values normalised to the map's maximum after ReLU
const STOPS = [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]];
export function camImage(values) {
  const max = Math.max(1e-6, ...values.map((v) => Math.max(0, v)));
  const out = new Uint8ClampedArray(values.length * 4);
  values.forEach((v, i) => {
    const t = Math.max(0, v) / max;
    const s = Math.min(STOPS.length - 2, Math.floor(t * (STOPS.length - 1)));
    const f = t * (STOPS.length - 1) - s;
    for (let c = 0; c < 3; c++) out[i * 4 + c] = STOPS[s][c] + (STOPS[s + 1][c] - STOPS[s][c]) * f;
    out[i * 4 + 3] = 255;
  });
  return out;
}
