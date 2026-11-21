// Icons (Feather-style strokes) and the class markers of the Figma visual guide:
// healthy = green circle, bleached = amber triangle, dead = violet cross, substrate = sand square, other = small grey ring.
// Colour and shape both carry the class, so the marks also read for colour-blind users.

const PATHS = {
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M7 12h10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  chevR: '<path d="M9 18l6-6-6-6"/>',
  chevL: '<path d="M15 18l-6-6 6-6"/>',
  chevD: '<path d="M6 9l6 6 6-6"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  x: '<path d="M18 6L6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/>',
  layers: '<path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  play: '<path d="M5 3l14 9-14 9V3z"/>',
  arrowR: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.2-8.6"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  droplet: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.3 0z"/>',
  move: '<path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
};

export function icon(name, color = "currentColor", size = 20, stroke = 2, extraClass = "") {
  return `<svg class="${extraClass}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ""}</svg>`;
}

export const CLASS = {
  healthy: { name: "Sehat", colour: "#009E73" },
  bleached: { name: "Bleaching", colour: "#C27C00" },
  dead: { name: "Mati", colour: "#6250D6" },
  substrate: { name: "Substrat", colour: "#CDBB8A" },
  other: { name: "Lainnya (tidak dihitung)", colour: "#8C8C8C" },
};
export const LABEL_KEYS = ["healthy", "bleached", "dead", "substrate", "other"];

// light = drawn on a light background (dark outline); otherwise a white outline for photos
export function marker(label, { size = 20, ragu = false, light = false } = {}) {
  const key = typeof label === "number" ? LABEL_KEYS[label] : label;
  const stroke = light ? "#0F2233" : "#FFFFFF";
  const sw = light ? 1.3 : 2;
  let shape;
  if (key === "healthy") shape = `<circle cx="12" cy="12" r="6.5" fill="#009E73" stroke="${stroke}" stroke-width="${sw}"/>`;
  else if (key === "bleached") shape = `<path d="M12 4.5l7.5 13h-15z" fill="#C27C00" stroke="${stroke}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  else if (key === "dead") shape = (light ? "" : '<path d="M7 7l10 10M17 7L7 17" stroke="#FFFFFF" stroke-width="6.5" stroke-linecap="round"/>')
    + '<path d="M7 7l10 10M17 7L7 17" stroke="#6250D6" stroke-width="3.2" stroke-linecap="round"/>';
  else if (key === "substrate") shape = `<rect x="7" y="7" width="10" height="10" rx="1.5" fill="#CDBB8A" stroke="${light ? "#8A7748" : "#FFFFFF"}" stroke-width="1.5"/>`;
  else if (key === "ragu") { shape = ""; ragu = true; }
  else shape = `<circle cx="12" cy="12" r="5" fill="rgba(140,140,140,.35)" stroke="${light ? "#6B6B6B" : "#FFFFFF"}" stroke-width="2"/>`;
  const ring = ragu ? `<circle cx="12" cy="12" r="10.6" fill="none" stroke="${stroke}" stroke-width="1.8" stroke-dasharray="3 2.4"/>` : "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true">${shape}${ring}</svg>`;
}

export function logo(dark = false) {
  const bg = dark ? "#38D3F0" : "#0A6A8C";
  const fg = dark ? "#062236" : "#FFFFFF";
  return `<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><rect width="32" height="32" rx="9" fill="${bg}"/>
    <path d="M6 19c2.5 0 2.5-2.2 5-2.2s2.5 2.2 5 2.2 2.5-2.2 5-2.2 2.5 2.2 5 2.2" fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M11 13.5c0-2.2 1.5-4.5 5-4.5s5 2.3 5 4.5" fill="none" stroke="${fg}" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="16" cy="13.5" r="1.8" fill="${fg}"/></svg>`;
}
