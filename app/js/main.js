// ReefScan-ID app: state, routing and the screens of wireframe v3 (Beranda, Sesi baru, Proses, Ringkasan, Detail foto, Tentang).
// The models run in js/worker.js; every number shown comes from that run or from data/analysis.json (notebook 13).
import { icon, marker, CLASS, LABEL_KEYS } from "./icons.js";
import { markA, markB, markC, wordmark } from "./logo.js";
import { catOf, pct, num, dec, esc, badge, catScale, nearEdge, waffle, composition, spreadChart, camImage } from "./charts.js";
import { healthNumbers, kepmenlhCategory } from "./engine.js";
import { readExif, formatCoord, osmLink } from "./exif.js";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app");
const MAX_PHOTOS = 50;
const MIN_LIVE_FOR_P = 5;
const LOW_RES_HEIGHT = 512;

let analysis = null;
let modelsInfo = null;
let samples = null;
let hero = null;
let worker = null;
let nextId = 1;

const state = {
  model: { status: "idle", loaded: 0, total: 0, error: null, cached: false },
  session: newSession(),
  run: null,
  compare: null,
  ui: { filter: "all", howread: true, point: null, showPoints: true, showArea: false, showOther: false, paused: false, notice: null },
};

function localDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function newSession() {
  return { name: "", date: localDate(), dateTouched: false, points: 60, photos: [], sample: false, location: { mode: null, lat: "", lon: "" } };
}

// ---------------------------------------------------------------- worker and analysis run
function ensureWorker() {
  if (worker) return;
  worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.onmessage = onWorkerMessage;
  worker.onerror = (event) => {
    state.model = { ...state.model, status: "error", error: event.message || "Worker gagal dimuat" };
    refresh();
  };
  state.model.status = "loading";
  worker.postMessage({ type: "init", modelBase: new URL("../models/", import.meta.url).href, threshold: analysis.titik_ragu.threshold });
}

function photoById(id) {
  return state.session.photos.find((p) => p.id === id);
}

function onWorkerMessage(event) {
  const m = event.data;
  if (m.type === "model-progress") {
    state.model.loaded = m.loaded;
    state.model.total = m.total;
    const el = $("#model-status");
    if (el) el.innerHTML = modelStatus();
    return;
  }
  if (m.type === "ready") {
    state.model.status = "ready";
    state.model.cached = m.cached;
    const el = $("#model-status");
    if (route().name === "sesi" && el) el.innerHTML = modelStatus();
    else refresh();
    pump();
    return;
  }
  if (m.type === "fatal" && m.id === null) {
    state.model.status = "error";
    state.model.error = m.message;
    refresh();
    return;
  }
  const photo = photoById(m.id);
  if (!photo) return;
  if (m.type === "stage") {
    photo.stage = m.stage;
  } else if (m.type === "result") {
    photo.result = m.result;
    photo.status = m.result.seabed > 0 ? "done" : "skipped";
    photo.stage = "done";
    state.run?.times.push(m.result.timing.total);
    pump();
  } else if (m.type === "error" || m.type === "fatal") {
    photo.status = "error";
    photo.error = m.code === "too-large" ? "Foto terlalu besar (lebih dari 50 megapiksel)." : m.code === "decode" ? "Format foto ini belum bisa dibaca browser. Ubah ke JPG atau PNG." : m.message || "Analisis gagal.";
    pump();
  }
  if (route().name === "proses") refresh();
}

function startRun() {
  const ready = state.session.photos.filter((p) => p.status === "ready");
  if (!ready.length) return;
  ready.forEach((p) => { p.status = "queued"; p.stage = null; });
  state.run = { start: performance.now(), times: [], cancelled: false, finished: false };
  ensureWorker();
  go("#/proses");
  pump();
}

function pump() {
  const run = state.run;
  if (!run || run.cancelled || state.model.status !== "ready") return;
  if (state.session.photos.some((p) => p.status === "running")) return;
  const next = state.session.photos.find((p) => p.status === "queued");
  if (!next) {
    if (!run.finished) {
      run.finished = true;
      const done = state.session.photos.filter((p) => p.status === "done").length;
      announce(`Analisis selesai: ${done} foto dianalisis.`);
    }
    refresh();
    return;
  }
  next.status = "running";
  next.stage = "prepare";
  const index = state.session.photos.indexOf(next);
  worker.postMessage({ type: "analyse", id: next.id, file: next.file, photoIndex: index, seed: next.seed ?? index, points: state.session.points });
}

function cancelRun() {
  if (!state.run) return;
  state.run.cancelled = true;
  state.session.photos.forEach((p) => { if (p.status === "queued") p.status = "ready"; });
  refresh();
}

// ---------------------------------------------------------------- numbers (with manual corrections and exclusions)
function photoNumbers(photo) {
  const points = photo.result.points;
  const labels = points.map((p, i) => photo.corrections[i] ?? p.label);
  const counts = [0, 0, 0, 0, 0];
  labels.forEach((l) => counts[l]++);
  const ragu = points.filter((p, i) => p.ragu && photo.corrections[i] === undefined).length;
  return { labels, counts, ...healthNumbers(counts), ragu, raguShare: points.length ? ragu / points.length : 0, corrected: Object.keys(photo.corrections).length };
}

const lowConfidence = (n) => n.raguShare > analysis.low_confidence_photo.ragu_share_above;

function summary() {
  const photos = state.session.photos;
  const analysed = photos.filter((p) => p.status === "done");
  const used = analysed.filter((p) => !p.excluded);
  const rows = used.map((p) => ({ photo: p, n: photoNumbers(p) }));
  const t = rows.map((r) => r.n.tLive).filter(Number.isFinite);
  const pb = rows.map((r) => r.n.pBleached).filter(Number.isFinite);
  const mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
  const counts = [0, 0, 0, 0, 0];
  rows.forEach((r) => r.n.counts.forEach((c, i) => (counts[i] += c)));
  const tLive = mean(t);
  return {
    rows, used: used.length, analysed: analysed.length,
    skipped: photos.filter((p) => p.status === "skipped").length,
    failed: photos.filter((p) => p.status === "error").length,
    excluded: analysed.length - used.length,
    tLive, pBleached: mean(pb), photosP: pb.length,
    tMin: t.length ? Math.min(...t) : NaN, tMax: t.length ? Math.max(...t) : NaN,
    category: Number.isFinite(tLive) ? kepmenlhCategory(tLive) : null,
    counts, pooled: healthNumbers(counts),
    points: rows.reduce((a, r) => a + r.photo.result.points.length, 0),
    ragu: rows.reduce((a, r) => a + r.n.ragu, 0),
    lowConf: rows.filter((r) => lowConfidence(r.n)),
    corrected: rows.reduce((a, r) => a + r.n.corrected, 0),
  };
}

// ---------------------------------------------------------------- adding photos
function addFiles(files, { sample = null } = {}) {
  const photos = state.session.photos;
  const incoming = [...files];
  const room = MAX_PHOTOS - photos.length;
  if (incoming.length > room) {
    state.ui.notice = { kind: "err", title: `Maksimal ${MAX_PHOTOS} foto per sesi`, body: `Anda memilih ${photos.length + incoming.length} foto. ${room > 0 ? `Hanya ${room} foto pertama yang ditambahkan.` : "Hapus beberapa foto dulu."} Bagi menjadi beberapa sesi supaya analisis tetap cepat.` };
  }
  for (const file of incoming.slice(0, Math.max(0, room))) {
    if (photos.some((p) => p.name === file.name && p.file.size === file.size)) continue;
    const info = sample ? samples.photos.find((s) => s.file === file.name) : null;
    const photo = {
      id: nextId++, file, name: file.name, url: URL.createObjectURL(file), status: "checking", stage: null, error: null,
      width: 0, height: 0, lowRes: false, result: null, corrections: {}, excluded: false,
      seed: info ? info.validation_index : null, sample: info,
    };
    photos.push(photo);
    readExif(file).then((exif) => {
      photo.exif = exif;
      const s = state.session;
      if (exif.date && !s.dateTouched && !s.sample) {
        const dates = s.photos.map((p) => p.exif?.date).filter(Boolean).sort();
        if (dates.length) s.date = dates[0];
      }
      if (exif.gps || exif.date) scheduleRefresh();
    });
    const img = new Image();
    img.onload = () => {
      photo.width = img.naturalWidth;
      photo.height = img.naturalHeight;
      photo.lowRes = img.naturalHeight < LOW_RES_HEIGHT;
      if (photo.status === "checking") photo.status = "ready";
      queueThumb(photo);
      scheduleRefresh();
    };
    img.onerror = () => {
      photo.status = "error";
      photo.error = /\.(heic|heif)$/i.test(file.name) ? "Format HEIC belum didukung browser ini. Ubah ke JPG atau PNG, lalu unggah ulang." : "File ini tidak bisa dibuka sebagai foto.";
      scheduleRefresh();
    };
    img.src = photo.url;
  }
  refresh();
}

// Lists show small JPEG thumbnails instead of the full photo, so 50 large photos are not decoded on every screen
let thumbQueue = Promise.resolve();
function queueThumb(photo) {
  thumbQueue = thumbQueue.then(async () => {
    if (!state.session.photos.includes(photo)) return;
    try {
      const bitmap = await createImageBitmap(photo.file, { resizeWidth: 320, resizeQuality: "medium", imageOrientation: "from-image" });
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      canvas.getContext("2d").drawImage(bitmap, 0, 0);
      bitmap.close();
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
      if (blob) photo.thumb = URL.createObjectURL(blob);
      scheduleRefresh();
    } catch { /* the list shows an empty tile */ }
  });
}
const thumbImg = (p) => `<img ${p.thumb ? `src="${p.thumb}"` : ""} alt="" decoding="async">`;

async function addSamples() {
  state.session = newSession();
  state.session.name = "Contoh: foto validasi Coralscapes";
  state.session.sample = true;
  state.ui.notice = null;
  try {
    const files = await Promise.all(samples.photos.map(async (s) => {
      const response = await fetch("samples-demo/" + s.file);
      if (!response.ok) throw new Error(s.file);
      return new File([await response.blob()], s.file, { type: "image/jpeg" });
    }));
    addFiles(files, { sample: true });
  } catch {
    state.session.sample = false;
    state.session.name = "";
    state.ui.notice = { kind: "err", title: "Foto contoh belum tersedia", body: "File foto contoh tidak ditemukan di server ini (lihat app/README.md, langkah 3). Anda tetap bisa mengunggah foto sendiri." };
  }
}

// Session position: the mean of the photos' GPS, or typed by the user, or none. Only recorded, never used by the model.
function sessionLocation() {
  const s = state.session;
  const gpsPhotos = s.photos.filter((p) => p.exif?.gps);
  const mode = s.location.mode ?? (gpsPhotos.length ? "gps" : "skip");
  if (mode === "gps" && gpsPhotos.length) {
    const lat = gpsPhotos.reduce((a, p) => a + p.exif.gps.lat, 0) / gpsPhotos.length;
    const lon = gpsPhotos.reduce((a, p) => a + p.exif.gps.lon, 0) / gpsPhotos.length;
    return { mode, lat, lon, source: `rata-rata GPS ${gpsPhotos.length} foto`, gpsPhotos: gpsPhotos.length };
  }
  if (mode === "manual") {
    const lat = Number(String(s.location.lat).replace(",", "."));
    const lon = Number(String(s.location.lon).replace(",", "."));
    const filled = String(s.location.lat).trim() !== "" && String(s.location.lon).trim() !== "";
    if (filled && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { mode, lat, lon, source: "diisi manual", gpsPhotos: gpsPhotos.length };
    return { mode, invalid: filled, gpsPhotos: gpsPhotos.length };
  }
  return { mode: "skip", gpsPhotos: gpsPhotos.length };
}

function locationStatus(loc) {
  if (Number.isFinite(loc.lat)) return `${icon("check", "#00664A", 14, 2.6)} ${formatCoord(loc.lat, loc.lon)} (${loc.source}) · <a href="${osmLink(loc.lat, loc.lon)}" target="_blank" rel="noopener">Lihat di peta</a>`;
  if (loc.mode === "manual") return loc.invalid ? `${icon("alert", "#7A4B00", 14)} Angkanya belum valid. Lintang −90 sampai 90, bujur −180 sampai 180.` : "Salin koordinat dari Google Maps atau OpenStreetMap (klik kanan di peta), misalnya −8,45 dan 115,60.";
  return loc.gpsPhotos ? "" : "Tidak ada foto dengan GPS (kamera bawah air jarang menyimpannya). Lokasi boleh dilewati.";
}

function removePhoto(id) {
  const photo = photoById(id);
  if (!photo) return;
  URL.revokeObjectURL(photo.url);
  if (photo.thumb) URL.revokeObjectURL(photo.thumb);
  state.session.photos = state.session.photos.filter((p) => p !== photo);
  refresh();
}

function resetSession() {
  state.session.photos.forEach((p) => { URL.revokeObjectURL(p.url); if (p.thumb) URL.revokeObjectURL(p.thumb); });
  state.session = newSession();
  state.run = null;
  state.compare = null;
  state.ui.notice = null;
}

// ---------------------------------------------------------------- routing
function route() {
  const hash = location.hash || "#/";
  const [, name = "", arg] = hash.split("/");
  return { name: name || "home", arg };
}
function go(hash) {
  if (location.hash === hash) refresh();
  else location.hash = hash;
}
function announce(text) {
  $("#live").textContent = text;
}

let lastRoute = "";
let pending = 0;
let heroObserver = null;
function scheduleRefresh() {
  // a short timer, not requestAnimationFrame, so background tabs still update
  if (!pending) pending = setTimeout(() => { pending = 0; refresh(); }, 30);
}
function refresh() {
  const r = route();
  const key = r.name + "/" + (r.arg || "");
  const view = { home: viewHome, sesi: viewSession, proses: viewProcess, ringkasan: viewSummary, foto: viewPhoto, tentang: viewAbout, logo: viewLogo, laporan: viewReport }[r.name] || viewHome;
  const scroll = window.scrollY;
  // keep the focus (and the caret of a text field) when the same screen is drawn again
  const active = document.activeElement;
  const activeId = key === lastRoute && active && active.id && app.contains(active) ? active.id : null;
  const caret = activeId && typeof active.selectionStart === "number" ? [active.selectionStart, active.selectionEnd] : null;
  document.body.className = r.name === "home" ? "" : r.name === "laporan" ? "report-page" : "app-page";
  app.innerHTML = view(r.arg);
  afterRender(r);
  if (key !== lastRoute) {
    window.scrollTo(0, 0);
    app.focus({ preventScroll: true });
    lastRoute = key;
  } else {
    window.scrollTo(0, scroll);
    const el = activeId && document.getElementById(activeId);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret) try { el.setSelectionRange(...caret); } catch { /* date inputs */ }
    }
  }
}

// ---------------------------------------------------------------- shared pieces
function topbar(step) {
  const steps = ["Unggah foto", "Analisis", "Hasil"];
  const items = steps.map((s, i) => {
    const cls = step < 0 ? "st-up" : i < step ? "st-done" : i === step ? "st-act" : "st-up";
    const circle = cls === "st-done" ? icon("check", "#fff", 14, 3) : i + 1;
    return `<div class="st ${cls}"><span class="stc">${circle}</span><span class="st-l">${s}</span></div>${i < 2 ? '<span class="st-line"></span>' : ""}`;
  }).join("");
  return `<header class="topbar"><a class="brand" href="#/">${markC({ size: 34 })}${wordmark()}</a>
    <nav class="stepper" aria-label="Langkah">${step >= 0 ? items : ""}</nav>
    <div class="tb-right"><a class="tlink" href="#/tentang">${icon("book", "#0A6A8C", 18)}<span class="tl-text">Tentang &amp; batasan</span></a></div></header>
    <div class="brandline"></div>`;
}

function alertBox(kind, title, body, extra = "") {
  const ic = { err: ["x", "#A3221B"], warn: ["alert", "#7A4B00"], info: ["info", "#0A5470"], ok: ["check", "#00664A"] }[kind];
  return `<div class="alert alert-${kind}" role="${kind === "err" ? "alert" : "status"}">${icon(ic[0], ic[1], 20)}<div><b>${title}</b> ${body}${extra}</div></div>`;
}

function chip(text, kind = "neutral", ic = null, spin = false) {
  const colour = { ok: "#00664A", warn: "#7A4B00", err: "#A3221B", info: "#0A5470", neutral: "#4A5E6E" }[kind];
  return `<span class="chip chip-${kind}">${ic ? icon(ic, colour, 14, 2.6, spin ? "spin" : "") : ""}${text}</span>`;
}

function modelStatus() {
  const m = state.model;
  if (m.status === "ready") return `<div class="note-inline">${icon("check", "#00664A", 18, 2.6)}<span>Model siap${m.cached ? " (dari cache browser)" : ""}. Analisis berjalan di perangkat ini.</span></div>`;
  if (m.status === "error") return alertBox("err", "Model gagal dimuat.", esc(m.error || ""), `<div><button class="btn btn-secondary btn-sm" data-action="retry-model">Coba lagi</button></div>`);
  if (m.status === "loading") {
    const share = m.total ? Math.min(100, (m.loaded / m.total) * 100) : 0;
    return `<div class="kpi-l">${icon("spinner", "#0A5470", 16, 2.6, "spin")}Menyiapkan model (±31 MB, sekali saja)</div>
      <div class="prog" aria-hidden="true"><div class="prog-f" style="width:${share.toFixed(0)}%"></div></div>
      <div class="help" style="margin-top:6px">${(m.loaded / 1e6).toFixed(1)} dari ${m.total ? (m.total / 1e6).toFixed(1) : "±31"} MB. Kunjungan berikutnya memakai cache.</div>`;
  }
  return `<div class="help">Model (±31 MB) diunduh saat Anda masuk ke halaman ini, lalu disimpan di cache browser.</div>`;
}

// ---------------------------------------------------------------- Beranda
// 10 dots: how many of 10 seabed points are live coral
function iconArray(percent, { dark = false } = {}) {
  const on = Number.isFinite(percent) ? Math.round(percent / 10) : 0;
  return `<div class="iarr${dark ? " iarr-dark" : ""}" role="img" aria-label="${on} dari 10 titik dasar adalah karang hidup">${Array.from({ length: 10 }, (_, i) =>
    i < on ? `<span style="background:${CLASS.healthy.colour}"></span>` : '<span class="off"></span>').join("")}</div>`;
}

function viewHome() {
  const marks = hero.points.filter((p) => p.label !== 4).map((p) =>
    `<span class="hmark" style="left:${p.x * 100}%;top:${p.y * 100}%">${marker(p.label, { size: 16 })}</span>`).join("");
  const states = [
    ["healthy", "Karang sehat", "Berwarna cokelat, hijau, atau ungu. Di dalam jaringannya hidup alga kecil yang memberi makan dan warna."],
    ["bleached", "Bleaching (memutih)", "Saat laut terlalu panas, alga itu keluar dan karang jadi putih. Karangnya masih hidup dan bisa pulih kalau suhu kembali normal."],
    ["dead", "Karang mati", "Kalau stres terlalu lama, karang mati. Kerangkanya tertinggal dan lama-lama ditumbuhi alga atau lumut."],
  ].map(([k, t, p]) => `<div class="state" style="--accent:${CLASS[k].colour}">
      <div class="state-h">${marker(k, { size: 22, light: true })}<span>${t}</span></div><p>${p}</p></div>`).join("");
  return `
  <section class="vhero${state.ui.paused ? " paused" : ""}">
    <video class="vh-video" id="hero-video" src="media/dive_reef_720.mp4" autoplay muted loop playsinline preload="auto" aria-hidden="true"></video>
    <div class="vh-shade" aria-hidden="true"></div>
    <div class="hero-inner vh-inner">
      <nav class="hnav"><a class="brand brand-dark" href="#/">${markC({ size: 38 })}${wordmark(true)}</a>
        <div class="hlinks"><a href="#terumbu">Terumbu karang</a><a href="#cara-kerja">Cara kerja</a><a href="#/tentang">Tentang</a><a class="btn btn-aqua btn-sm" href="#/sesi">Mulai sesi</a></div></nav>
      <div class="vh-text">
        <div class="eyebrow">Untuk petugas survei, NGO, peneliti, dan penyelam</div>
        <h1 class="h1">Selami fotomu, kenali kondisi terumbunya</h1>
        <p class="hsub">Unggah foto dari satu kali menyelam. ReefScan-ID memeriksa titik-titik di foto seperti cara ahli menghitung karang, lalu memberi tahu seberapa banyak karang yang masih hidup.</p>
        <div class="hcta"><a class="btn btn-aqua" href="#/sesi">Mulai sesi baru ${icon("arrowR", "#062236", 18)}</a>
          <button class="btn btn-ghost" data-action="try-samples">Coba dengan foto contoh</button></div>
        <div class="htrust">${icon("lock", "#A9D6E8", 16)}<span>Foto tidak dikirim ke mana-mana · Gratis · Hasilnya estimasi, bukan survei resmi</span></div>
      </div>
      <a class="scrollcue" href="#terumbu">${icon("chevD", "#fff", 20)}<span>Kenali terumbu karang</span></a>
    </div>
    <button class="hpause" data-action="toggle-anim" aria-pressed="${state.ui.paused}">${icon(state.ui.paused ? "play" : "pause", "#fff", 14)}<span>${state.ui.paused ? "Putar video" : "Jeda video"}</span></button>
    <span class="vh-credit">Video: Jun Ho Lee · Pexels</span>
    <svg class="wave" viewBox="0 0 1440 72" preserveAspectRatio="none" aria-hidden="true"><path d="M0 40 C 259 4, 518 72, 792 32 S 1224 7, 1440 36 L 1440 72 L 0 72 Z" fill="#F3F8FB"/></svg>
  </section>

  <div class="depth">
  <section class="sec" id="terumbu">
    <div class="sec-kicker">Kenali terumbu karang</div>
    <h2 class="sec-h">Karang itu hewan, dan warnanya memberi tahu kesehatannya</h2>
    <p class="sec-p">Terumbu karang dibangun oleh hewan kecil bernama polip karang. Terumbu jadi rumah bagi banyak ikan dan menahan ombak sebelum sampai ke pantai. Di foto, kondisi karang terlihat dari warnanya:</p>
    <div class="states">${states}</div>
    <div class="sub-note">${marker("substrate", { size: 20, light: true })}<span><b>Substrat</b> adalah pasir, pecahan karang, dan batu. Bukan karang, tetapi tetap dihitung sebagai bagian dari dasar laut.</span></div>
  </section>

  <section class="sec sec-tint" id="cara-kerja">
    <div class="sec-kicker">Cara kerja</div>
    <h2 class="sec-h">Dari satu foto jadi satu angka</h2>
    <p class="sec-p">Ini foto contoh asli dari data Coralscapes, diproses oleh model yang sama dengan yang berjalan di aplikasi.</p>
    <div class="howstrip">
      <figure class="how"><div class="how-img"><img src="${hero.image}" alt="Foto penyelam di atas terumbu" loading="lazy"></div>
        <figcaption><span class="how-n">1</span><div><b>Unggah foto</b><span>Foto dari satu kali menyelam di satu lokasi.</span></div></figcaption></figure>
      <figure class="how"><div class="how-img"><img src="img/how_area_101.jpg" alt="Bagian karang ditandai biru" loading="lazy"></div>
        <figcaption><span class="how-n">2</span><div><b>Cari bagian karang</b><span><i class="sw" style="background:#38D3F0"></i>karang <i class="sw" style="background:#CDBB8A"></i>substrat <i class="sw" style="background:#0B3550"></i>tidak dihitung</span></div></figcaption></figure>
      <figure class="how"><div class="how-img"><img src="${hero.image}" alt="Titik pemeriksaan di atas foto" loading="lazy">${marks}</div>
        <figcaption><span class="how-n">3</span><div><b>Periksa titik</b><span>Setiap titik di atas karang dicek: sehat, bleaching, atau mati.</span></div></figcaption></figure>
      <figure class="how how-result"><div class="how-img how-num"><div class="hn-big">${pct(hero.t_live)}</div>${badge(hero.category)}${iconArray(hero.t_live)}<div class="help">±${Math.round(hero.t_live / 10)} dari 10 titik dasar adalah karang hidup</div></div>
        <figcaption><span class="how-n">4</span><div><b>Baca hasilnya</b><span>Rata-rata semua foto jadi kondisi lokasi.</span></div></figcaption></figure>
    </div>
  </section>

  <section class="sec">
    <div class="sec-kicker">Arti kategorinya</div>
    <h2 class="sec-h">Empat tingkat kondisi menurut KepMenLH No. 4/2001</h2>
    <div class="cats4">
      ${[["Buruk", "0–24,9%", "Karang hidup sedikit. Perlu perhatian."], ["Sedang", "25–49,9%", "Sebagian masih hidup."], ["Baik", "50–74,9%", "Lebih dari separuh dasar laut karang hidup."], ["Baik sekali", "75–100%", "Hampir seluruh dasar laut karang hidup."]]
        .map(([n2, r2, d]) => { const c = catOf(n2); return `<div class="cat4" style="background:linear-gradient(160deg, color-mix(in srgb, ${c.bg} 80%, #FFFFFF) 0%, ${c.bg} 70%);color:${c.fg}"><b>${n2}</b><span class="cat4-r">${r2}</span><span>${d}</span></div>`; }).join("")}
    </div>
    <p class="help" style="margin-top:12px">Persentase = berapa bagian dasar laut yang tertutup karang hidup (karang sehat + bleaching).</p>
  </section>

  <section class="sec" style="padding-top:0">
    <div class="limits"><div class="lim-h">${icon("info", "#0A5470", 22)}<span>Sebelum memakai hasilnya</span></div>
      <ul class="lim-l">
        <li>Model belajar dari foto Laut Merah dan Hawaii, belum dari perairan Indonesia.</li>
        <li>Bleaching cenderung terbaca lebih sedikit dari kenyataan.</li>
        <li>Foto gelap, sangat biru, atau buram membuat hasil kurang tepat.</li>
      </ul>
      <a class="btn btn-text" href="#/tentang">Baca batasan lengkap ${icon("chevR", "#0A6A8C", 18)}</a></div>
  </section>
  </div>
  <footer class="footer"><svg class="wave-top" viewBox="0 0 1440 56" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0 H1440 V22 C 1180 54, 900 0, 640 26 S 220 44, 0 18 Z" fill="#EEF7FB"/></svg><div class="footer-inner"><span class="brand brand-dark">${markC({ size: 34 })}${wordmark(true)}</span>
    <span>Data: Coralscapes (EPFL, Apache-2.0) · NOAA PIFSC ESD (Public Domain) · Video: Jun Ho Lee, Pexels. Proyek akhir COMP6826001 Deep Learning, BINUS University. <a href="#/logo" style="color:#9CCFE0">Konsep logo</a></span></div></footer>`;
}

function viewLogo() {
  const concepts = [
    [markC, "C · Jendela kapal selam (dipakai)", "Kita melihat laut dari balik jendela kapal selam: itu makna menyelam. Di balik kaca, sapuan sonar sedang memindai, persis yang dilakukan aplikasi pada setiap foto. Tanpa gambar karang, hanya bentuk sederhana dengan gradasi laut, supaya tetap jelas sampai ukuran 16 px."],
    [markA, "A · Kapal selam bermata (alternatif)", "Badan kapal selam digambar sebagai mata, dengan menara, periskop, sonar, dan karang kecil. Paling kaya makna, tetapi detailnya hilang di ukuran kecil dan bisa terbaca seperti ikan."],
    [markB, "B · Periskop bermata (alternatif)", "Periskop menembus permukaan laut dengan lensa berbentuk mata, karang di bawah ombak. Unsur kapal selamnya kurang terasa."],
  ];
  return `${topbar(-1)}<main class="page page-narrow"><h1 class="h2">Konsep logo ReefScan-ID</h1>
    <p class="psub">Makna yang dicari: menyelam (kapal selam) dan memindai. Diuji di ukuran kecil, di latar gelap dan terang.</p>
    ${concepts.map(([fn, title, text]) => `<div class="card" style="margin-top:20px"><h2 class="h3">${title}</h2><p class="help" style="font-size:15px;margin-top:6px">${text}</p>
      <div class="logo-row">${[128, 64, 32, 20].map((sz) => `<div class="logo-cell">${fn({ size: sz })}<span>${sz}px</span></div>`).join("")}
        <div class="logo-cell logo-dark">${fn({ size: 48 })}<span>gelap</span></div></div></div>`).join("")}
    <div class="card" style="margin-top:20px"><h2 class="h3">Dengan nama</h2><div class="logo-row">
      <span class="brand">${markC({ size: 44 })}${wordmark()}</span>
      <span class="brand brand-dark logo-dark" style="padding:14px;border-radius:12px">${markC({ size: 44 })}${wordmark(true)}</span></div></div>
  </main>`;
}

// ---------------------------------------------------------------- Sesi baru
function viewSession() {
  const s = state.session;
  const photos = s.photos;
  const ready = photos.filter((p) => p.status === "ready");
  const errors = photos.filter((p) => p.status === "error");
  const warns = photos.filter((p) => p.status === "ready" && p.lowRes);
  const checking = photos.some((p) => p.status === "checking");
  const issues = [
    state.ui.notice ? alertBox(state.ui.notice.kind, state.ui.notice.title + ".", state.ui.notice.body) : "",
    ...errors.map((p) => alertBox("err", `${esc(p.name)}:`, esc(p.error) + " Foto ini tidak ikut dianalisis.")),
    ...warns.map((p) => alertBox("warn", `${esc(p.name)} beresolusi rendah (${p.width}×${p.height}).`, "Di uji ketahanan, foto seperempat resolusi menaikkan kesalahan ±3 poin. Tetap ikut dianalisis.")),
  ].join("");
  const thumbs = photos.map((p) => {
    const b = p.status === "error" ? `<span class="tb tb-err">${icon("x", "#fff", 12, 3)}</span>` : p.lowRes ? `<span class="tb tb-warn">${icon("alert", "#2A1A00", 12, 2.6)}</span>` : p.status === "ready" ? `<span class="tb tb-ok">${icon("check", "#fff", 12, 3)}</span>` : "";
    return `<div class="thumb">${thumbImg(p)}${b}
      <button class="tx" data-action="remove" data-id="${p.id}" aria-label="Hapus ${esc(p.name)}">${icon("x", "#0F2233", 12, 2.6)}</button>
      <div class="tname" title="${esc(p.name)}">${esc(p.name)}</div></div>`;
  }).join("");
  const tips = [
    ["sun", "Ambil foto dari dekat dan cukup terang. Foto gelap dan ber-noise menaikkan kesalahan ±8 poin."],
    ["droplet", "Jaga warna: pakai senter atau white balance bawah air. Foto yang sangat kebiruan paling merusak hasil."],
    ["camera", "Tahan kamera supaya tidak buram, dan arahkan ke dasar terumbu."],
    ["check", "Foto kiriman WhatsApp dan resolusi setengahnya (±1024 px) masih aman."],
  ].map(([ic, t]) => `<div class="tip">${icon(ic, "#0A6A8C", 18)}<span>${t}</span></div>`).join("");
  const pointsHelp = s.points === 60
    ? "Lebih teliti, dan hanya sedikit lebih lama. Disarankan."
    : "Lebih cepat, sama dengan standar survei UPT, tetapi sedikit kurang teliti.";
  return `${topbar(0)}
  <main class="page">
    <div class="ph"><div><h1 class="h2">Sesi selam baru</h1><p class="psub">Unggah semua foto dari satu penyelaman di satu lokasi. Hasilnya dirata-rata per sesi, seperti survei transek foto.</p></div></div>
    <div class="cols">
      <div class="col-main">
        <div class="drop" id="drop">${icon("upload", "#0A6A8C", 36)}
          <div class="drop-t">Seret foto ke sini atau <label for="file-input">pilih dari perangkat</label></div>
          <input id="file-input" class="sr-only" type="file" multiple accept="image/jpeg,image/png,image/webp,image/heic,.heic">
          <div class="help">JPG, PNG, atau WebP · maksimal ${MAX_PHOTOS} foto per sesi · arahkan kamera ke dasar terumbu</div>
          ${photos.length ? "" : `<button class="btn btn-text" data-action="try-samples">${icon("image", "#0A6A8C", 18)}Atau coba dengan 10 foto contoh</button>`}
        </div>
        ${photos.length ? `<div class="fl-h"><div><b>${photos.length} foto dipilih</b> · ${ready.length} siap${errors.length ? ` · ${errors.length} tidak bisa dibaca` : ""}${checking ? " · memeriksa…" : ""}
          <div class="help">Disarankan minimal 20 foto per sesi supaya rata-rata lebih stabil.</div></div>
          <button class="btn btn-text" data-action="clear">${icon("trash", "#0A6A8C", 18)}Kosongkan</button></div>` : ""}
        ${issues ? `<div style="display:grid;gap:10px">${issues}</div>` : ""}
        ${photos.length ? `<div class="tgrid">${thumbs}</div>` : ""}
      </div>
      <aside class="col-side">
        <div class="card"><h2 class="h3">Info sesi</h2>
          <div class="field"><label for="s-name">Nama sesi</label><input id="s-name" class="input" value="${esc(s.name)}" placeholder="mis. Pulau Badi — Stasiun 2" data-bind="name"><div class="help">Muncul di file CSV.</div></div>
          <div class="field"><label for="s-date">Tanggal selam</label><input id="s-date" class="input" type="date" value="${esc(s.date)}" data-bind="date">
            <div class="help">${s.photos.some((p) => p.exif?.date) ? "Terisi dari data foto (EXIF). Boleh diubah." : "Diisi otomatis kalau foto menyimpan tanggalnya."}</div></div>
          ${locationField()}
          <div class="field"><span class="flabel">Titik per foto</span>
            <div class="seg" role="group" aria-label="Titik per foto">${[60, 30].map((v) => `<button data-action="points" data-value="${v}" aria-pressed="${s.points === v}">${v} titik</button>`).join("")}</div>
            <div class="help">${pointsHelp}</div></div>
        </div>
        <div class="card"><h2 class="h3">Tips foto</h2><div class="tips">${tips}</div></div>
        <div class="card" id="model-status">${modelStatus()}</div>
      </aside>
    </div>
  </main>
  <div class="actionbar"><div class="ab-l">${icon("info", "#4A5E6E", 18)}<span>${ready.length} foto akan dianalisis${errors.length ? ` · ${errors.length} dilewati` : ""}</span></div>
    <div class="ab-r"><a class="btn btn-secondary" href="#/">Batal</a>
      <button class="btn btn-primary" data-action="start" ${ready.length && !checking ? "" : "disabled"}>Analisis ${ready.length || ""} foto ${icon("arrowR", "#fff", 18)}</button></div></div>`;
}

function locationField() {
  const loc = sessionLocation();
  const option = (mode, label, disabled = false) => `<button data-action="loc-mode" data-value="${mode}" aria-pressed="${loc.mode === mode}" ${disabled ? "disabled" : ""}>${label}</button>`;
  const manual = loc.mode === "manual"
    ? `<div class="loc-grid"><input id="loc-lat" class="input" inputmode="decimal" placeholder="Lintang" aria-label="Lintang" value="${esc(state.session.location.lat)}" data-loc="lat">
        <input id="loc-lon" class="input" inputmode="decimal" placeholder="Bujur" aria-label="Bujur" value="${esc(state.session.location.lon)}" data-loc="lon"></div>` : "";
  return `<div class="field"><span class="flabel">Lokasi (opsional)</span>
    <div class="seg" role="group" aria-label="Sumber lokasi">${option("gps", "Dari foto (GPS)", !loc.gpsPhotos)}${option("manual", "Isi manual")}${option("skip", "Lewati")}</div>
    ${manual}<div class="help" id="loc-status">${locationStatus(loc)}</div>
    <div class="help">Hanya dicatat di ringkasan dan CSV. Tidak mengubah hasil model.</div></div>`;
}

// ---------------------------------------------------------------- Proses
const STAGES = [["prepare", "Persiapan foto"], ["stage1", "Tahap 1: pisahkan karang"], ["points", "Ambil titik"], ["stage2", "Tahap 2: periksa titik"], ["done", "Hitung tutupan"]];
function stageIndex(stage) {
  return { prepare: 0, stage1: 1, stage2: 3, done: 5 }[stage] ?? 0;
}

function viewProcess() {
  const photos = state.session.photos.filter((p) => p.status !== "ready" || p.result);
  if (!state.run || !photos.length) return emptyState("Belum ada analisis yang berjalan", "Pilih foto dulu di halaman Sesi baru.", "#/sesi", "Ke Sesi baru");
  const total = photos.length;
  const finished = photos.filter((p) => ["done", "skipped", "error"].includes(p.status)).length;
  const share = total ? (finished / total) * 100 : 0;
  const current = photos.find((p) => p.status === "running");
  const run = state.run;
  const avg = run.times.length ? run.times.reduce((a, b) => a + b, 0) / run.times.length : null;
  const left = photos.filter((p) => ["queued", "running"].includes(p.status)).length;
  const eta = avg ? Math.max(1, Math.round((left * avg) / 1000)) : null;
  const doneNow = photos.filter((p) => p.status === "done").map(photoNumbers).map((n) => n.tLive).filter(Number.isFinite);
  const interim = doneNow.length ? doneNow.reduce((a, b) => a + b, 0) / doneNow.length : NaN;
  const si = current ? stageIndex(current.stage) : run.finished ? 5 : -1;
  const pipe = STAGES.map(([, label], i) => {
    const st = i < si ? "d" : i === si ? "r" : "w";
    const circle = st === "d" ? `<span class="pc pc-d">${icon("check", "#fff", 14, 3)}</span>` : st === "r" ? `<span class="pc pc-r">${icon("spinner", "#062236", 14, 2.8, "spin")}</span>` : '<span class="pc"></span>';
    return `<div class="pp${st === "r" ? " pp-a" : ""}">${circle}<span>${i === 2 ? `Ambil ${state.session.points} titik` : label}</span></div>${i < 4 ? `<span class="pp-line${st === "d" ? " done" : ""}"></span>` : ""}`;
  }).join("");
  const rows = photos.map((p) => {
    let c;
    if (p.status === "done") c = chip(`Selesai · ${pct(photoNumbers(p).tLive)} karang hidup`, "ok", "check");
    else if (p.status === "skipped") c = chip("Dilewati · dasar laut tidak terlihat", "err", "x");
    else if (p.status === "error") c = chip("Tidak bisa dibaca", "err", "x");
    else if (p.status === "running") c = chip(STAGES[Math.min(4, stageIndex(p.stage))][1], "info", "spinner", true);
    else c = chip("Menunggu", "neutral", "clock");
    const link = p.status === "done" ? `<a class="tlink" href="#/foto/${p.id}">Lihat ${icon("chevR", "#0A6A8C", 16)}</a>` : "";
    return `<div class="prow${p.status === "running" ? " prow-a" : ""}">${thumbImg(p)}<span class="pname">${esc(p.name)}</span>${c}${link}</div>`;
  }).join("");
  const waitingModel = state.model.status !== "ready";
  const head = run.finished
    ? alertBox("ok", "Analisis selesai.", `${photos.filter((p) => p.status === "done").length} foto dianalisis${photos.filter((p) => p.status !== "done").length ? `, ${photos.filter((p) => p.status !== "done").length} dilewati` : ""}. Ringkasan sesi siap.`, `<div><a class="btn btn-primary" href="#/ringkasan">Lihat ringkasan ${icon("arrowR", "#fff", 18)}</a></div>`)
    : run.cancelled ? alertBox("warn", "Analisis dibatalkan.", "Foto yang sudah selesai tetap ada di ringkasan.", `<div><a class="btn btn-primary" href="#/ringkasan">Lihat ringkasan</a></div>`) : "";
  return `${topbar(1)}
  <main class="page">
    <div class="ph"><div><h1 class="h2">${run.finished ? "Analisis selesai" : `Menganalisis ${total} foto`}</h1>
      <p class="psub">${icon("clock", "#4A5E6E", 18)}<span>${run.finished ? "Semua foto sudah diproses." : waitingModel ? "Menunggu model siap." : eta ? `Sekitar ${eta < 60 ? eta + " detik" : Math.round(eta / 60) + " menit"} lagi. Hasil foto yang sudah selesai bisa langsung dilihat.` : "Menghitung perkiraan waktu…"}</span></p></div>
      ${!run.finished && !run.cancelled ? `<button class="btn btn-text" data-action="cancel">Batalkan analisis</button>` : ""}</div>
    ${head ? `<div style="margin-top:20px">${head}</div>` : ""}
    ${waitingModel ? `<div class="card" style="margin-top:20px" id="model-status">${modelStatus()}</div>` : ""}
    <div class="card" style="margin-top:20px">
      <div class="prog-h"><b>${finished} dari ${total} foto selesai</b><span class="num">${share.toFixed(0)}%</span></div>
      <div class="prog" role="progressbar" aria-valuenow="${share.toFixed(0)}" aria-valuemin="0" aria-valuemax="100"><div class="prog-f" style="width:${share}%"></div></div>
      ${current ? `<div class="help" style="margin-top:10px">Sedang diproses: <b>${esc(current.name)}</b></div>` : ""}
      <div class="pipe">${pipe}</div>
    </div>
    <div class="cols">
      <div class="col-main"><div class="card card-flush"><div class="list-h">Foto dalam sesi ini</div>${rows}</div></div>
      <aside class="col-side">
        <div class="card kpi-dark"><h2 class="h3">Hasil sementara</h2>
          <div class="kpi-s">${pct(interim)}</div><div class="kpi-f">Rata-rata tutupan karang hidup dari ${doneNow.length} foto</div>
          ${catScale(interim, { dark: true })}<div class="help" style="margin-top:12px">Angka bisa berubah sampai semua foto selesai.</div></div>
        <div class="note-inline">${icon("lock", "#0A5470", 18)}<span>Foto diproses di perangkat Anda dan tidak diunggah ke server.</span></div>
        ${run.finished ? "" : alertBox("warn", "Biarkan tab ini terbuka.", "Menutup atau memuat ulang halaman menghentikan analisis, dan hasil yang sudah selesai ikut hilang.")}
      </aside>
    </div>
  </main>`;
}

// ---------------------------------------------------------------- Ringkasan
function viewSummary() {
  const s = state.session;
  const sum = summary();
  if (!sum.analysed) {
    const allSkipped = s.photos.length && s.photos.every((p) => ["skipped", "error"].includes(p.status));
    return emptyState("Belum ada hasil untuk sesi ini", allSkipped ? "Semua foto dilewati karena dasar laut tidak terlihat atau foto tidak bisa dibaca. Unggah foto yang mengarah ke dasar terumbu." : "Analisis foto dulu di halaman Sesi baru.", "#/sesi", "Unggah foto");
  }
  const t = sum.tLive;
  const edge = nearEdge(t);
  const mae = s.points === 60 ? analysis.e4_test.points_60.cascade_mae_t_live : analysis.e4_test.points_30.cascade_mae_t_live;
  const near = edge && edge.distance < mae ? `<div class="kpi-cs" style="max-width:none;margin-top:10px">${icon("alert", "#FFE3A3", 14)} ${dec(edge.distance)} poin dari batas ${edge.edge}%. Kesalahan rata-rata per foto ±${dec(mae)} poin, jadi kategorinya bisa bergeser satu tingkat.</div>` : "";
  const liveTotal = sum.counts[0] + sum.counts[1];
  const bleachedShare = sum.pBleached;
  const ratio = Number.isFinite(bleachedShare) && bleachedShare > 0 ? Math.max(1, Math.round(100 / bleachedShare)) : null;
  const filter = state.ui.filter;
  const all = s.photos.filter((p) => p.result || p.status === "error");
  const check = (p) => p.status === "done" && (lowConfidence(photoNumbers(p)) || p.lowRes);
  const lists = {
    all, check: all.filter(check), skipped: all.filter((p) => p.status === "skipped" || p.status === "error"), excluded: all.filter((p) => p.excluded),
  };
  const shown = lists[filter] || all;
  const rows = shown.map((p) => {
    if (p.status !== "done") return `<tr><td><div class="tf">${thumbImg(p)}<span>${esc(p.name)}</span></div></td><td class="n">—</td><td class="n hide-sm">—</td><td class="n hide-sm">—</td><td colspan="2">${chip(p.status === "skipped" ? "Dilewati · tanpa dasar laut" : "Tidak bisa dibaca", "err", "x")}</td></tr>`;
    const n = photoNumbers(p);
    const notes = [p.excluded ? chip("Dikecualikan", "neutral", "x") : "", lowConfidence(n) ? chip("Keyakinan rendah", "warn", "alert") : n.ragu ? chip(`${n.ragu} titik ragu`, "neutral") : "",
      p.lowRes ? chip("Resolusi rendah", "warn", "alert") : "", n.corrected ? chip(`${n.corrected} dikoreksi`, "info", "edit") : ""].join(" ");
    return `<tr class="clickable" data-action="open-photo" data-id="${p.id}"><td><div class="tf">${thumbImg(p)}<span>${esc(p.name)}</span></div></td>
      <td class="n">${pct(n.tLive)}</td><td class="n hide-sm">${n.live >= MIN_LIVE_FOR_P ? pct(n.pBleached) : "—"}</td><td class="n hide-sm">${n.seabed}</td><td>${notes || "—"}</td>
      <td><a class="tlink" href="#/foto/${p.id}">Lihat ${icon("chevR", "#0A6A8C", 16)}</a></td></tr>`;
  }).join("");
  const filterBtn = (key, label) => `<button class="fchip" data-action="filter" data-value="${key}" aria-pressed="${filter === key}">${label} (${lists[key].length})</button>`;
  const lowConfCount = sum.lowConf.length;
  const raguShare = sum.points ? sum.ragu / sum.points : 0;
  const level = sum.used < 5 || lowConfCount / Math.max(1, sum.used) > 0.3 ? "rendah" : "sedang";
  const trust = [
    rel(raguShare <= analysis.titik_ragu.flagged_share ? "ok" : "warn", `Titik ragu ${raguShare <= analysis.titik_ragu.flagged_share ? "wajar" : "lebih banyak dari biasa"}`,
      `${num(sum.ragu)} dari ${num(sum.points)} titik (${pct(raguShare * 100)}). Di foto validasi yang jernih sekitar ${pct(analysis.titik_ragu.flagged_share * 100)}.`),
    rel(sum.used >= 20 ? "ok" : "warn", `${sum.used} foto dihitung`, sum.used >= 20 ? "Cukup untuk rata-rata sesi." : "Disarankan minimal 20 foto. UPT memakai 50 frame per transek, jadi rata-rata ini lebih kasar."),
    lowConfCount ? rel("warn", `${lowConfCount} foto keyakinan rendah`, "Lebih dari 30% titiknya ragu, biasanya karena keruh, gelap, atau kebiruan. Periksa, lalu kecualikan kalau perlu.") : rel("ok", "Tidak ada foto berkeyakinan rendah", "Semua foto di bawah batas 30% titik ragu."),
    rel("warn", "Belum diuji di perairan Indonesia", "Model dilatih dengan foto Laut Merah dan Hawaii."),
    rel("warn", "Bleaching cenderung terbaca lebih rendah", `Di data uji, rata-rata ${dec(-analysis.e4_test.cascade_bias_p_bleached)} poin lebih rendah dari kenyataan. Anggap angkanya batas bawah.`),
    sum.skipped + sum.failed ? rel("ok", "Foto yang dilewati tidak dihitung", `${sum.skipped + sum.failed} foto tanpa dasar laut atau tidak bisa dibaca.`) : "",
    sum.excluded ? rel("ok", `${sum.excluded} foto dikecualikan`, "Tidak masuk rata-rata sesi.") : "",
    sum.corrected ? rel("ok", `${sum.corrected} titik dikoreksi manual`, "Ikut dihitung dengan label baru, dan ditandai di CSV.") : "",
  ].join("");
  const story = Number.isFinite(t)
    ? `Di sesi ini, sekitar <b>${Math.round(t / 10)} dari 10 titik dasar</b> berupa karang hidup (${pct(t)}). Itu masuk kategori <b>${esc(sum.category)}</b> menurut KepMenLH No. 4/2001.
       ${Number.isFinite(bleachedShare) ? (ratio ? `Dari karang yang masih hidup, sekitar <b>1 dari ${ratio}</b> terbaca memutih (bleaching), dan angka sebenarnya bisa lebih tinggi.` : "Tidak ada karang hidup yang terbaca memutih (bleaching), tetapi bleaching cenderung terbaca lebih rendah dari kenyataan.") : ""}
       ${sum.used > 1 ? `Kondisi antar foto ${sum.tMax - sum.tMin > 30 ? "cukup beragam" : "cukup seragam"}, dari ${pct(sum.tMin)} sampai ${pct(sum.tMax)}.` : ""}` : "Tidak ada titik dasar di foto yang dihitung.";
  const spread = sum.rows.filter((r) => Number.isFinite(r.n.tLive)).map((r) => ({ id: r.photo.id, name: r.photo.name, value: r.n.tLive }));
  const firstCheck = lists.check[0];
  return `${topbar(2)}
  <main class="page">
    <div class="ph"><div><div class="crumb">Sesi selam${s.sample ? " · contoh" : ""}</div><h1 class="h2">${esc(s.name || "Sesi tanpa nama")}</h1>
      <div class="meta"><span>${icon("calendar", "#4A5E6E", 16)}${esc(formatDate(s.date))}</span><span class="dot"></span><span>${icon("image", "#4A5E6E", 16)}${sum.used} foto dihitung${sum.skipped + sum.failed ? `, ${sum.skipped + sum.failed} dilewati` : ""}${sum.excluded ? `, ${sum.excluded} dikecualikan` : ""}</span><span class="dot"></span><span>${icon("grid", "#4A5E6E", 16)}${num(sum.pooled.seabed)} titik dasar dari ${num(sum.points)} titik</span></div></div>
      <div class="ph-r"><button class="btn btn-secondary" data-action="new-session">${icon("plus", "#0A6A8C", 18)}Sesi baru</button>
        <button class="btn btn-secondary" data-action="csv-points">${icon("download", "#0A6A8C", 18)}CSV per titik</button>
        <button class="btn btn-secondary" data-action="csv-photos">${icon("download", "#0A6A8C", 18)}CSV per foto</button>
        <a class="btn btn-primary" href="#/laporan">${icon("file", "#fff", 18)}Laporan PDF</a></div></div>
    ${alertBox("info", "Ini estimasi kasar dari foto penyelam.", `Kategori KepMenLH dirancang untuk survei transek dengan foto tegak lurus. Pakai sebagai penyaring awal, bukan pengganti survei resmi. <a href="#/tentang">Pelajari batasannya</a>`).replace('class="alert', 'class="alert alert-wide')}
    ${s.sample ? `<div style="margin-top:12px">${alertBox("info", "Foto contoh.", "10 foto validasi Coralscapes (Laut Merah), 4 di antaranya ada karang yang memutih. Titiknya diletakkan sama seperti di notebook tim; fotonya versi JPEG, jadi angkanya bisa beda tipis dari notebook.")}</div>` : ""}
    <div class="kpis">
      <div class="card kpi-main kpi-dark"><div class="kpi-l">Tutupan karang hidup</div>
        <div class="kpi-row"><div class="kpi-b">${pct(t)}</div><div>${badge(sum.category)}<div class="kpi-cs">kondisi menurut KepMenLH No. 4/2001</div></div></div>
        <div class="big-sentence">${Number.isFinite(t) ? `±${Math.round(t / 10)} dari 10 titik di dasar laut adalah karang hidup` : "Belum ada titik dasar laut yang dihitung"}</div>
        <div style="margin-top:8px">${iconArray(t, { dark: true })}</div>
        ${catScale(t, { dark: true })}${near}
        <div class="kpi-f">Rata-rata ${sum.rows.filter((r) => Number.isFinite(r.n.tLive)).length} foto · tiap foto antara ${pct(sum.tMin)} dan ${pct(sum.tMax)}</div></div>
      <div class="card"><div class="kpi-l">Karang memutih (bleaching)</div>
        <div class="big-sentence">${!Number.isFinite(bleachedShare) ? "Tidak ada karang hidup terbaca" : ratio ? `±1 dari ${ratio} karang hidup memutih` : "Tidak terlihat karang yang memutih"}</div>
        ${waffle(bleachedShare)}
        <div class="kpi-f"><b>${pct(bleachedShare)}</b> dari karang hidup (${num(sum.counts[1])} dari ${num(liveTotal)} titik)</div>
        <div class="help" style="margin-top:8px">${icon("alert", "#7A4B00", 14)} Bisa lebih banyak dari ini: model sering melewatkan bleaching.</div></div>
      <div class="card"><div class="kpi-l">Isi dasar laut (${num(sum.pooled.seabed)} titik)</div>${composition(sum.counts)}
        <div class="help" style="margin-top:8px">Karang mati sering terbaca sebagai substrat, jadi angka karang mati kurang pasti.</div></div>
    </div>
    ${state.ui.howread ? `<div class="howread"><div class="hr-h"><b>Cara membaca angka di atas</b><button class="btn btn-text" data-action="howread">Sembunyikan</button></div>
      <div class="hr-steps">
        <div class="hr-s"><span class="hr-n">1</span><div><div class="hr-t">${s.points} titik di tiap foto</div><div class="hr-p">Titik yang jatuh di air, ikan, atau alat tidak dihitung.</div></div></div>
        <div class="hr-s"><span class="hr-n">2</span><div><div class="hr-t">Tiap titik diberi label</div><div class="hr-p">${marker("healthy", { size: 16, light: true })} sehat ${marker("bleached", { size: 16, light: true })} memutih ${marker("dead", { size: 16, light: true })} mati ${marker("substrate", { size: 16, light: true })} substrat</div></div></div>
        <div class="hr-s"><span class="hr-n">3</span><div><div class="hr-t">Dihitung jadi persen</div><div class="hr-p">Titik karang hidup ÷ titik di dasar laut. Angka sesi = rata-rata semua foto.</div></div></div>
      </div></div>` : `<div style="margin-top:12px"><button class="btn btn-text" data-action="howread">${icon("info", "#0A6A8C", 18)}Cara membaca angka</button></div>`}
    <div class="cols">
      <div class="col-main">
        <div class="card"><h2 class="h3">Ringkasan dalam kalimat</h2><p class="story">${story}</p>
          <div class="h3" style="font-size:16px;margin-top:16px">Langkah yang bisa Anda lakukan</div>
          <div class="next">
            ${lists.check.length ? `<div class="nx">${icon("eye", "#0A6A8C", 18)}<span>Periksa ${lists.check.length} foto yang ditandai “Perlu dicek” sebelum memakai angkanya${firstCheck ? ` (mulai dari <a href="#/foto/${firstCheck.id}">${esc(firstCheck.name)}</a>)` : ""}.</span></div>` : ""}
            <div class="nx">${icon("download", "#0A6A8C", 18)}<span>Unduh CSV per foto, lalu unggah lagi di sesi berikutnya di lokasi yang sama untuk melihat perubahannya.</span></div>
            <div class="nx">${icon("book", "#0A6A8C", 18)}<span>Untuk laporan resmi, lanjutkan dengan survei UPT atau LIT.</span></div>
          </div></div>
        ${spread.length > 1 ? `<div class="card"><h2 class="h3">Sebaran tutupan per foto</h2><div class="help">Satu titik = satu foto. Klik titik untuk membuka fotonya.</div>${spreadChart(spread, t)}</div>` : ""}
        <div class="card card-flush"><div class="tbl-h"><h2 class="h3">Hasil per foto</h2>
          <div class="filters">${filterBtn("all", "Semua")}${filterBtn("check", "Perlu dicek")}${filterBtn("skipped", "Dilewati")}${sum.excluded ? filterBtn("excluded", "Dikecualikan") : ""}</div></div>
          <div style="overflow-x:auto"><table class="table"><thead><tr><th>Foto</th><th class="n">Karang hidup<br><span class="th-s">% titik dasar</span></th><th class="n hide-sm">Bleaching<br><span class="th-s">% karang hidup</span></th><th class="n hide-sm">Titik dasar</th><th>Catatan</th><th></th></tr></thead>
          <tbody>${rows || `<tr><td colspan="6" class="muted">Tidak ada foto di filter ini.</td></tr>`}</tbody></table></div></div>
      </div>
      <aside class="col-side">
        <div class="card"><h2 class="h3">Seberapa bisa dipercaya?</h2>
          <div class="meter" aria-hidden="true"><span class="${level === "rendah" ? "on-1" : "on-2"}"></span><span class="${level === "sedang" ? "on-2" : ""}"></span><span></span></div>
          <div class="meter-l"><span>Rendah</span><span style="text-align:center">Sedang</span><span style="text-align:right">Tinggi</span></div>
          <div class="big-sentence" style="font-size:16px">Keyakinan hasil: ${level}</div>
          <div class="help">${level === "rendah" ? "Pakai angkanya dengan sangat hati-hati." : "Cukup untuk gambaran awal, belum untuk laporan resmi."} “Tinggi” belum dipakai karena model belum diuji di perairan Indonesia.</div>
          <details class="more"><summary>Lihat alasannya ${icon("chevD", "#0A6A8C", 16)}</summary>${trust}</details></div>
        <div class="card"><h2 class="h3">Lokasi</h2>${(() => { const loc = sessionLocation(); return Number.isFinite(loc.lat)
          ? `<div class="big-sentence" style="font-size:16px">${formatCoord(loc.lat, loc.lon)}</div><div class="help">${loc.source}</div><a class="btn btn-secondary btn-sm" style="margin-top:10px" href="${osmLink(loc.lat, loc.lon)}" target="_blank" rel="noopener">${icon("eye", "#0A6A8C", 16)}Lihat di OpenStreetMap</a>`
          : `<p class="help" style="margin-top:6px">Lokasi tidak diisi. Bisa dicatat lewat GPS foto atau diisi manual saat membuat sesi.</p>`; })()}</div>
        ${compareCard(sum)}
      </aside>
    </div>
  </main>`;
}

function rel(kind, title, detail) {
  const [ic, fg, bg] = kind === "ok" ? ["check", "#00664A", "#E3F4EE"] : ["alert", "#7A4B00", "#FFF4DD"];
  return `<div class="rel"><span class="rel-i" style="background:${bg}">${icon(ic, fg, 14, 2.6)}</span><div><div class="rel-t">${title}</div><div class="rel-d">${detail}</div></div></div>`;
}

function formatDate(iso) {
  if (!iso) return "tanggal belum diisi";
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

function emptyState(title, body, href, action) {
  return `${topbar(-1)}<main class="page page-narrow"><div class="card empty" style="margin-top:40px">${icon("image", "#71879A", 48, 1.6)}
    <h1 class="h3" style="margin-top:12px">${title}</h1><p class="psub" style="justify-content:center">${body}</p>
    <a class="btn btn-primary" href="${href}" style="margin-top:8px">${icon("upload", "#fff", 18)}${action}</a></div></main>`;
}

// ---------------------------------------------------------------- Detail foto
function viewPhoto(arg) {
  const photo = photoById(Number(arg));
  if (!photo || !photo.result) return emptyState("Foto tidak ditemukan", "Hasil analisis hanya ada selama tab ini terbuka.", "#/ringkasan", "Ke ringkasan");
  const done = state.session.photos.filter((p) => p.result);
  const position = done.indexOf(photo);
  const prev = done[position - 1];
  const next = done[position + 1];
  const r = photo.result;
  const n = photoNumbers(photo);
  const W = r.working.width, H = r.working.height;
  const ui = state.ui;
  const sel = ui.point && ui.point.photo === photo.id ? ui.point.index : null;
  const marks = r.points.map((p, i) => {
    const label = n.labels[i];
    if (label === 4 && !ui.showOther) return "";
    const ragu = p.ragu && photo.corrections[i] === undefined;
    const name = CLASS[LABEL_KEYS[label]].name;
    return `<button class="pt${label === 4 ? " pt-other" : ""}" style="left:${(p.x / W) * 100}%;top:${(p.y / H) * 100}%" data-action="point" data-index="${i}" aria-pressed="${sel === i}"
      aria-label="Titik ${i + 1}: ${name}${ragu ? ", ragu" : ""}${photo.corrections[i] !== undefined ? ", dikoreksi" : ""}">${marker(label, { size: 24, ragu })}</button>`;
  }).join("");
  const legend = ["healthy", "bleached", "dead", "substrate"].map((k, i) => `<span>${marker(k, { size: 18 })}${CLASS[k].name} ${n.counts[i]}</span>`).join("")
    + `<span>${marker("ragu", { size: 18 })}Ragu ${n.ragu}</span>`
    + (ui.showOther ? `<span>${marker("other", { size: 14 })}Tidak dihitung ${n.counts[4]}</span>` : "");
  const toggle = (key, label) => `<button class="vt" data-action="toggle" data-value="${key}" aria-pressed="${ui[key]}">${ui[key] ? icon("check", "#062236", 14, 3) : ""}${label}</button>`;
  const status = photo.status === "skipped" ? alertBox("err", "Foto dilewati: dasar laut tidak terlihat.", "Model hanya menemukan kolom air atau objek lain. Gunakan foto yang mengarah ke dasar terumbu.") : "";
  const lowConf = lowConfidence(n) ? alertBox("warn", "Foto ini mungkin di luar kemampuan model.", `${n.ragu} dari ${r.points.length} titik ragu. Biasanya karena foto keruh, terlalu gelap, atau kebiruan. Periksa hasilnya sebelum dipakai.`) : n.ragu ? alertBox("info", `${n.ragu} titik ragu.`, "Penanda bercincin putus-putus = model kurang yakin. Klik untuk melihat kenapa.") : "";
  return `${topbar(2)}
  <main class="page">
    <div class="dh"><div class="crumb2"><a class="tlink" href="#/ringkasan">${icon("chevL", "#0A6A8C", 16)}Ringkasan sesi</a><span class="muted">/</span><span>Foto ${position + 1} dari ${done.length} · <b>${esc(photo.name)}</b></span></div>
      <div class="ph-r">${prev ? `<a class="btn btn-secondary btn-sm" href="#/foto/${prev.id}">${icon("chevL", "#0A6A8C", 16)}Sebelumnya</a>` : ""}${next ? `<a class="btn btn-secondary btn-sm" href="#/foto/${next.id}">Berikutnya${icon("chevR", "#0A6A8C", 16)}</a>` : ""}</div></div>
    <div class="dcols">
      <div class="viewer">
        <div class="vbar"><div class="vtog">${icon("layers", "#fff", 18)}${toggle("showPoints", "Titik")}${toggle("showArea", "Area karang")}${toggle("showOther", "Titik tidak dihitung")}</div>
          <span class="help" style="color:#9FBFD0">${r.size.width}×${r.size.height} px · ${r.points.length} titik</span></div>
        <div class="vimg"><img id="photo-img" src="${photo.url}" alt="${esc(photo.name)}" width="${W}" height="${H}">
          ${ui.showArea ? '<canvas class="area" id="area"></canvas>' : ""}<div class="marks">${ui.showPoints ? marks : ""}</div></div>
        <div class="vleg">${legend}</div>
        <div class="vnote">${ui.showArea ? "Garis putih = batas area karang dari Tahap 1. Area gelap = kolom air dan objek lain yang tidak dihitung." : "Nyalakan “Area karang” untuk melihat bagian yang dianggap karang oleh Tahap 1."}</div>
      </div>
      <aside class="dside">
        ${status}
        <div class="card kpi-dark"><h2 class="h3">Foto ini</h2>
          <div class="dstat"><div><div class="kpi-l">Karang hidup</div><div class="kpi-b3">${pct(n.tLive)}</div><div class="kpi-f">${n.live} dari ${n.seabed} titik dasar</div></div>
            <div><div class="kpi-l">Bleaching</div><div class="kpi-b3">${n.live >= MIN_LIVE_FOR_P ? pct(n.pBleached) : "—"}</div><div class="kpi-f">${n.live >= MIN_LIVE_FOR_P ? `${n.counts[1]} dari ${n.live} karang hidup` : `Hanya ${n.live} titik karang hidup, minimal ${MIN_LIVE_FOR_P} untuk persentase.`}</div></div></div>
          <div style="margin-top:12px">${badge(n.seabed ? kepmenlhCategory(n.tLive) : null)}</div></div>
        ${lowConf}
        ${sel !== null ? pointCard(photo, sel, n) : `<div class="card"><div class="help">${icon("info", "#4A5E6E", 16)} Klik salah satu penanda di foto untuk melihat bagian yang diperiksa model dan seberapa yakin model di titik itu.</div></div>`}
        <div><button class="btn btn-text" data-action="exclude" data-id="${photo.id}">${photo.excluded ? "Masukkan lagi foto ini ke ringkasan" : "Kecualikan foto ini dari ringkasan"}</button></div>
        ${photo.sample ? `<div class="help">Foto contoh: Coralscapes validation #${photo.sample.validation_index} (${esc(photo.sample.original_name)}), Apache-2.0.</div>` : ""}
      </aside>
    </div>
  </main>`;
}

function pointCard(photo, index, n) {
  const p = photo.result.points[index];
  const label = n.labels[index];
  const corrected = photo.corrections[index] !== undefined;
  const ragu = p.ragu && !corrected;
  const name = CLASS[LABEL_KEYS[label]].name;
  const bars = (items) => items.map(([key, name2, value]) => `<div class="prb"><span class="prb-l">${marker(key, { size: 16, light: true })}<span>${name2}</span></span>
    <div class="prb-t" role="img" aria-label="${name2}"><div class="prb-f${key === "substrate" ? " sub-edge" : ""}" style="width:${(value * 100).toFixed(0)}%;background:${CLASS[key].colour}"></div></div></div>`).join("");
  const coral = p.stage1 === 0;
  const probs = coral
    ? bars([["healthy", "Sehat", p.stage2Probs[0]], ["bleached", "Bleaching", p.stage2Probs[1]], ["dead", "Mati", p.stage2Probs[2]]])
    : bars([["healthy", "Karang", p.stage1Probs[0]], ["substrate", "Substrat", p.stage1Probs[1]], ["other", "Lainnya", p.stage1Probs[2]]]);
  const options = [[0, "Sehat"], [1, "Bleaching"], [2, "Mati"], [3, "Substrat"], [4, "Lainnya"]]
    .map(([v, t]) => `<button data-action="relabel" data-index="${index}" data-value="${v}" aria-pressed="${label === v}">${t}</button>`).join("");
  return `<div class="card">
    <div class="pt-h"><h2 class="h3">Titik #${index + 1}</h2>${chip(`${name}${corrected ? " · dikoreksi" : ragu ? " · ragu" : " · yakin"}`, corrected ? "info" : ragu ? "warn" : "ok", corrected ? "edit" : ragu ? "alert" : "check")}</div>
    ${coral ? `<div class="patches"><div><canvas id="patch" width="224" height="224"></canvas><div class="cap">Potongan 128 px di sekitar titik (yang dilihat Tahap 2)</div></div>
      <div><canvas id="cam" width="224" height="224"></canvas><div class="cap">Bagian yang paling dilihat model saat memilih “${CLASS[LABEL_KEYS[p.label]].name}”</div></div></div>
      <div class="camleg"><span>pengaruh rendah</span><div class="camgrad"></div><span>tinggi</span></div>`
      : `<div class="patches"><div><canvas id="patch" width="224" height="224"></canvas><div class="cap">Potongan 128 px di sekitar titik</div></div>
      <div class="help" style="align-self:center">Tahap 1 menilai titik ini bukan karang, jadi Tahap 2 dan CAM tidak dijalankan.</div></div>`}
    <div class="probs-h">${coral ? "Menurut model, karang di titik ini…" : "Menurut model, titik ini…"}</div>${probs}
    <div class="big-sentence" style="font-size:16px">${ragu ? "Model kurang yakin di titik ini." : "Model cukup yakin di titik ini."}</div>
    <details class="more"><summary>Kenapa ${ragu ? "ragu" : "yakin"}? ${icon("chevD", "#0A6A8C", 16)}</summary>
      <p class="help" style="margin-top:6px">Panjang batang = seberapa condong model ke tiap label. Titik ditandai ragu kalau keyakinan gabungannya di bawah ${num(analysis.titik_ragu.threshold)}. Di foto validasi, titik ragu salah ${pct(analysis.titik_ragu.wrong_among_flagged * 100)} kali, titik lain hanya ${pct(analysis.titik_ragu.wrong_among_rest * 100)}. Angka persisnya tidak ditampilkan karena model cenderung terlalu yakin.</p></details>
    <div class="relabel" style="margin-top:16px;border-top:1px solid #EEF2F5;padding-top:14px"><div class="kpi-l">Label salah? Ubah titik #${index + 1} menjadi:</div>
      <div class="seg" role="group" aria-label="Label baru">${options}</div>
      <div class="help" style="margin-top:6px">${corrected ? `Label model: ${CLASS[LABEL_KEYS[p.label]].name}. <button class="btn btn-text" data-action="unrelabel" data-index="${index}">Kembalikan</button>` : "Perubahan ikut dihitung di ringkasan dan ditandai “dikoreksi” di CSV."}</div></div>
  </div>`;
}

function drawPhotoCanvases(photo) {
  const img = $("#photo-img");
  if (!img) return;
  const r = photo.result;
  const draw = () => {
    const area = $("#area");
    if (area) {
      const map = r.stage1Map;
      area.width = map.width;
      area.height = map.height;
      const ctx = area.getContext("2d");
      const data = ctx.createImageData(map.width, map.height);
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) {
          const i = y * map.width + x;
          const v = map.data[i];
          const coral = v === 0;
          const edge = coral && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const xx = x + dx, yy = y + dy;
            return xx >= 0 && yy >= 0 && xx < map.width && yy < map.height && map.data[yy * map.width + xx] !== 0;
          });
          const o = i * 4;
          if (edge) { data.data[o] = 255; data.data[o + 1] = 255; data.data[o + 2] = 255; data.data[o + 3] = 230; }
          else if (v === 2) { data.data[o] = 4; data.data[o + 1] = 24; data.data[o + 2] = 38; data.data[o + 3] = 150; }
        }
      }
      ctx.putImageData(data, 0, 0);
    }
    const sel = state.ui.point;
    if (!sel || sel.photo !== photo.id) return;
    const p = r.points[sel.index];
    const scale = img.naturalHeight / r.working.height;
    const patch = $("#patch");
    if (patch) {
      const ctx = patch.getContext("2d");
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, (p.x - 64) * scale, (p.y - 64) * scale, 128 * scale, 128 * scale, 0, 0, 224, 224);
      ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(112, 112, 6, 0, Math.PI * 2); ctx.stroke();
    }
    const cam = $("#cam");
    if (cam && p.camIndex >= 0 && r.cam) {
      const ctx = cam.getContext("2d");
      ctx.drawImage(img, (p.x - 64) * scale, (p.y - 64) * scale, 128 * scale, 128 * scale, 0, 0, 224, 224);
      const [, classes, ch, cw] = r.cam.dims;
      const offset = (p.camIndex * classes + p.label) * ch * cw;
      const values = Array.from(r.cam.data.subarray(offset, offset + ch * cw));
      const small = document.createElement("canvas");
      small.width = cw; small.height = ch;
      small.getContext("2d").putImageData(new ImageData(camImage(values), cw, ch), 0, 0);
      ctx.globalAlpha = 0.55;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(small, 0, 0, 224, 224);
      ctx.globalAlpha = 1;
    }
  };
  if (img.complete && img.naturalWidth) draw();
  else img.addEventListener("load", draw, { once: true });
}

// ---------------------------------------------------------------- Tentang
function viewAbout() {
  const e = analysis.e4_test;
  const a60 = e.points_60, a30 = e.points_30;
  const ci = (v) => `${dec(v[0])}–${dec(v[1])}`;
  const rob = analysis.robustness_validation_30_points;
  const maxMae = Math.max(...rob.conditions.map((c) => c.mae));
  const robRows = rob.conditions.map((c) => `<div class="rob"><span>${c.name}</span><div class="rob-t"><div class="rob-f" style="width:${(c.mae / maxMae) * 100}%;background:${c.worse ? "#C27C00" : "#9CCFE0"}"></div><span class="rob-c" style="left:${(rob.clean / maxMae) * 100}%"></span></div><b class="num">${dec(c.mae)}</b></div>`).join("");
  const pipebox = (t, s, dark) => `<div class="pbx${dark ? " pbx-d" : ""}"><div class="pbx-t">${t}</div><div class="pbx-s">${s}</div></div>`;
  return `${topbar(-1)}
  <main class="page page-narrow">
    <h1 class="h2">Tentang ReefScan-ID</h1>
    <p class="psub" style="max-width:820px">ReefScan-ID meniru cara ahli menghitung titik pada metode transek foto bawah air (UPT), tetapi dikerjakan oleh dua model deep learning secara berurutan, langsung di browser Anda.</p>
    <h2 class="h3 mt">Cara kerja</h2>
    <div class="pipeflow">${pipebox("Foto sesi", "diubah ke tinggi 1024 px")}${pipebox("Tahap 1 · SegFormer-B0", "karang / substrat / lainnya", true)}${pipebox("Ambil titik", "1 titik acak per sel grid (30 atau 60)")}${pipebox("Tahap 2 · EfficientNet-B0", "sehat / bleaching / mati", true)}${pipebox("Ringkasan", "tutupan + kategori")}</div>
    <div class="two">
      <div class="card"><h2 class="h3">Cara angka dihitung</h2>
        <div class="formula"><b>Tutupan karang hidup</b> = (titik sehat + titik bleaching) ÷ titik dasar × 100%</div>
        <div class="formula"><b>Bleaching</b> = titik bleaching ÷ titik karang hidup × 100%</div>
        <div class="formula"><b>Angka sesi</b> = rata-rata angka semua foto; kategori dari rata-rata tutupan</div>
        <div class="help" style="margin-top:12px">Titik dasar = titik di karang atau substrat. Bleaching dihitung sebagai karang hidup karena masih hidup, tetapi ditampilkan terpisah sebagai peringatan.</div></div>
      <div class="card"><h2 class="h3">Kategori KepMenLH No. 4/2001</h2>
        ${[["Buruk", "0–24,9", "#E4EEF3", "#0F2233"], ["Sedang", "25–49,9", "#9CCFE0", "#0F2233"], ["Baik", "50–74,9", "#23779C", "#fff"], ["Baik sekali", "75–100", "#0B5F86", "#fff"]]
          .map(([n2, r2, bg, fg]) => `<div class="kt"><span class="kt-c" style="background:${bg};color:${fg}">${n2}</span><span>${r2}% tutupan karang hidup</span></div>`).join("")}</div>
    </div>
    <div class="card" style="margin-top:20px"><h2 class="h3">Seberapa tepat?</h2>
      <p class="help" style="font-size:15px;margin-top:4px">Diuji pada 392 foto yang tidak pernah dilihat model saat belajar, dibandingkan dengan label ahli.</p>
      <div class="next" style="margin-top:12px">
        <div class="nx">${icon("check", "#00664A", 18, 2.6)}<span>Angka karang hidup per foto rata-rata meleset sekitar <b>${Math.round(a60.cascade_mae_t_live)} poin</b>. Contoh: kalau aslinya 30%, biasanya terbaca antara ${30 - Math.round(a60.cascade_mae_t_live)}% dan ${30 + Math.round(a60.cascade_mae_t_live)}%.</span></div>
        <div class="nx">${icon("check", "#00664A", 18, 2.6)}<span>Kategori KepMenLH tepat di <b>${Math.round(a60.cascade_category_agreement * 100)} dari 100 foto</b>. Yang salah hampir selalu cuma meleset satu tingkat.</span></div>
        <div class="nx">${icon("alert", "#7A4B00", 18, 2.6)}<span>Bleaching rata-rata terbaca <b>${Math.round(-e.cascade_bias_p_bleached)} poin lebih rendah</b> dari kenyataan.</span></div>
      </div>
      <details class="more"><summary>Detail teknis (untuk penguji) ${icon("chevD", "#0A6A8C", 16)}</summary>
      <div class="perf"><span>Kesalahan tutupan karang hidup per foto, 60 titik</span><b>±${dec(a60.cascade_mae_t_live)} poin (95% CI ${ci(a60.cascade_mae_t_live_ci)})</b></div>
      <div class="perf"><span>Kesalahan tutupan karang hidup per foto, 30 titik</span><b>±${dec(a30.cascade_mae_t_live)} poin (95% CI ${ci(a30.cascade_mae_t_live_ci)})</b></div>
      <div class="perf"><span>Kategori KepMenLH sama dengan label ahli, 60 titik</span><b>${pct(a60.cascade_category_agreement * 100, 1)}</b></div>
      <div class="perf"><span>Kategori yang salah, meleset hanya satu tingkat</span><b>${e.category_wrong_one_band} dari ${e.category_wrong_photos} foto</b></div>
      <div class="perf"><span>Kesalahan bleaching per foto, 60 titik</span><b>±${dec(a60.cascade_mae_p_bleached)} poin, rata-rata ${dec(-e.cascade_bias_p_bleached)} poin terlalu rendah</b></div>
      <div class="perf"><span>Dibanding model langsung 5 kelas, 60 titik</span><b>tutupan ${dec(-a60.difference_t_live)} poin lebih akurat (CI ${dec(-a60.difference_t_live_ci[1])}–${dec(-a60.difference_t_live_ci[0])})</b></div>
      <div class="help" style="margin-top:10px">Dari notebook 10 (E4) dan 13, interval 95% dari bootstrap per foto. Di 30 titik, cascade ${dec(-a30.difference_t_live)} poin lebih akurat, tetapi intervalnya (${dec(-a30.difference_t_live_ci[1])} sampai ${dec(-a30.difference_t_live_ci[0])}) masih mencakup 0, jadi belum pasti; kategorinya tetap lebih sering benar. Hasil Tahap 1 (mIoU) dan Tahap 2 (Macro-F1) di data uji menyusul.</div></details></div>
    <div class="card" style="margin-top:20px"><h2 class="h3">Foto seperti apa yang aman?</h2>
      <p class="help" style="font-size:15px;margin-top:4px">Foto kiriman WhatsApp dan foto setengah resolusi masih aman. Foto yang sangat biru, gelap, atau buram membuat hasil jauh meleset; yang paling parah foto sangat biru.</p>
      <div class="help" style="margin:10px 0 10px">Kesalahan tutupan karang hidup di 166 foto validasi yang diberi efek buatan (garis hitam = foto jernih, ${dec(rob.clean)} poin). Oranye = lebih buruk secara nyata. Ini simulasi, bukan foto perairan Indonesia.</div>${robRows}</div>
    <div class="card" style="margin-top:20px"><h2 class="h3">Batasan</h2>
      <div class="lim2">
        <div><b>Bias geografis.</b> Data latih dari Laut Merah (Coralscapes) dan Hawaii (NOAA), bukan Indonesia.</div>
        <div><b>Bukan pengganti survei.</b> Foto miring tidak setara frame UPT tegak lurus.</div>
        <div><b>Bleaching terbaca lebih rendah.</b> Di data uji, hanya ${pct(e.true_bleached_points_read_correctly.cascade * 100)} titik bleaching yang terbaca benar; kebanyakan salahnya di Tahap 2.</div>
        <div><b>Karang mati sering jadi substrat.</b> ${pct(e.true_dead_points_called_substrate.cascade * 100)} titik karang mati terbaca substrat. Tutupan karang hidup tidak terpengaruh, tetapi angka karang mati kurang akurat.</div>
        <div><b>Kesalahan berantai.</b> Karang yang terlewat di Tahap 1 tidak dicek di Tahap 2.</div>
        <div><b>Kondisi foto.</b> Foto sangat kebiruan, gelap, atau buram menaikkan kesalahan jauh (lihat uji ketahanan).</div>
      </div></div>
    <div class="card" style="margin-top:20px"><h2 class="h3">Istilah</h2>
      <div class="gloss">
        <div><b>Titik dasar</b> Titik yang jatuh di karang atau substrat. Kolom air, ikan, dan alat tidak dihitung.</div>
        <div><b>Karang hidup</b> Karang sehat + karang bleaching. Bleaching masih hidup, hanya sedang stres.</div>
        <div><b>Bleaching (pemutihan)</b> Karang kehilangan alga simbionnya sehingga memutih. Bisa pulih kalau stresnya berhenti.</div>
        <div><b>Karang mati</b> Kerangka karang tanpa jaringan hidup, sering tertutup alga.</div>
        <div><b>Substrat</b> Pasir, pecahan karang, dan batuan dasar.</div>
        <div><b>UPT</b> Underwater Photo Transect: foto tiap 1 m di sepanjang transek, lalu dihitung per titik.</div>
        <div><b>Titik ragu</b> Titik yang keyakinan gabungan modelnya di bawah ${num(analysis.titik_ragu.threshold)}. Di data validasi, titik seperti ini salah ${pct(analysis.titik_ragu.wrong_among_flagged * 100)} kali, titik lain ${pct(analysis.titik_ragu.wrong_among_rest * 100)}.</div>
        <div><b>CAM</b> Peta panas yang menunjukkan bagian potongan foto yang paling mendukung keputusan Tahap 2.</div>
      </div></div>
    <div class="card" style="margin-top:20px"><h2 class="h3">Data, lisensi, dan privasi</h2>
      <p class="help" style="font-size:14px;line-height:22px;margin-top:10px">Coralscapes (Sauder et al., 2025), Apache-2.0; 10 foto validasinya dipakai sebagai foto contoh. NOAA PIFSC ESD Coral Bleaching Classification Dataset, Public Domain; ReefScan-ID tidak berafiliasi dengan NOAA. Model dijalankan dengan ONNX Runtime Web (MIT). Foto yang Anda unggah diproses di perangkat ini dan tidak dikirim ke server mana pun; file model disimpan di cache browser supaya kunjungan berikutnya lebih cepat.</p></div>
  </main>`;
}

// ---------------------------------------------------------------- Bandingkan dengan sesi sebelumnya (from its "CSV per foto")
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  text = text.replace(/^﻿/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => v !== ""));
}

async function loadPreviousCsv(file) {
  try {
    const rows = parseCsv(await file.text());
    const head = rows[0] || [];
    const col = (name) => head.indexOf(name);
    if (col("file_foto") < 0 || col("tutupan_hidup_pct") < 0) throw new Error("format");
    const summaryRow = rows.find((r) => r[col("file_foto")] === "RATA-RATA SESI");
    if (!summaryRow) throw new Error("format");
    const number = (v) => (v === "" || v === undefined ? NaN : Number(v));
    const counted = rows.slice(1).filter((r) => r[col("status")] === "dianalisis");
    state.compare = {
      file: file.name, name: summaryRow[col("nama_sesi")] || "", date: summaryRow[col("tanggal")] || "",
      tLive: number(summaryRow[col("tutupan_hidup_pct")]), pBleached: number(summaryRow[col("bleaching_pct")]),
      category: summaryRow[col("kategori")] || null, photos: counted.length, points: summaryRow[col("titik_per_foto")] || "",
    };
  } catch {
    state.compare = { error: `${file.name} bukan file “CSV per foto” dari ReefScan-ID. Pakai file yang namanya berakhiran _per_foto.csv.` };
  }
  refresh();
}

function compareCard(sum) {
  const prev = state.compare;
  const input = `<label class="btn btn-secondary btn-sm" style="margin-top:10px">${icon("upload", "#0A6A8C", 16)}Unggah CSV sesi lama<input id="compare-input" class="sr-only" type="file" accept=".csv,text/csv"></label>`;
  if (!prev) return `<div class="card"><h2 class="h3">Bandingkan dengan sesi lama</h2><p class="help" style="margin-top:6px">Punya hasil dari lokasi yang sama sebelumnya? Unggah file “CSV per foto” dari sesi itu untuk melihat perubahannya.</p>${input}</div>`;
  if (prev.error) return `<div class="card"><h2 class="h3">Bandingkan dengan sesi lama</h2><div style="margin-top:8px">${alertBox("err", "File tidak bisa dibaca.", esc(prev.error))}</div>${input}</div>`;
  const mae = state.session.points === 60 ? analysis.e4_test.points_60.cascade_mae_t_live : analysis.e4_test.points_30.cascade_mae_t_live;
  const row = (label, before, now) => {
    const delta = now - before;
    const ok = Number.isFinite(delta);
    const arrow = !ok ? "" : Math.abs(delta) < 0.5 ? "→" : delta > 0 ? "↑" : "↓";
    return `<div class="cmp-row"><span>${label}</span><span class="num">${pct(before)}</span><span class="num"><b>${pct(now)}</b></span>
      <span class="num cmp-d">${ok ? `${arrow} ${dec(Math.abs(delta))} poin` : "—"}</span></div>`;
  };
  const dT = sum.tLive - prev.tLive;
  const verdict = !Number.isFinite(dT) ? "" : Math.abs(dT) < mae
    ? `Tutupan karang hidup berubah ${dec(Math.abs(dT))} poin, masih di dalam kesalahan model (±${dec(mae)} poin per foto). Belum bisa disebut berubah.`
    : `Tutupan karang hidup ${dT > 0 ? "naik" : "turun"} ${dec(Math.abs(dT))} poin, lebih besar dari kesalahan model (±${dec(mae)} poin per foto). Perlu dicek di lapangan.`;
  return `<div class="card"><h2 class="h3">Bandingkan dengan sesi lama</h2>
    <div class="help" style="margin-top:4px">${esc(prev.name || prev.file)} · ${esc(formatDate(prev.date))} · ${prev.photos} foto</div>
    <div class="cmp-row cmp-h"><span></span><span>Dulu</span><span>Sekarang</span><span>Selisih</span></div>
    ${row("Karang hidup", prev.tLive, sum.tLive)}${row("Memutih", prev.pBleached, sum.pBleached)}
    <div class="cmp-row"><span>Kategori</span><span>${badge(prev.category)}</span><span>${badge(sum.category)}</span><span></span></div>
    <p class="help" style="margin-top:10px">${verdict}${String(prev.points) !== String(state.session.points) && prev.points ? ` Sesi lama memakai ${prev.points} titik per foto.` : ""}</p>
    <button class="btn btn-text" data-action="compare-clear">Hapus perbandingan</button></div>`;
}

// ---------------------------------------------------------------- Laporan (A4, saved as PDF with the browser's print dialog)
function trustLevel(sum) {
  return sum.used < 5 || sum.lowConf.length / Math.max(1, sum.used) > 0.3 ? "Rendah" : "Sedang";
}

function storyText(sum) {
  const t = sum.tLive;
  if (!Number.isFinite(t)) return "Tidak ada titik dasar laut di foto yang dihitung.";
  const p = sum.pBleached;
  const ratio = Number.isFinite(p) && p > 0 ? Math.max(1, Math.round(100 / p)) : null;
  return `Sekitar ${Math.round(t / 10)} dari 10 titik di dasar laut berupa karang hidup (${pct(t)}), kategori ${esc(sum.category)} menurut KepMenLH No. 4/2001. `
    + (Number.isFinite(p) ? (ratio ? `Sekitar 1 dari ${ratio} karang hidup terbaca memutih, dan angka sebenarnya bisa lebih tinggi. ` : "Tidak terlihat karang yang memutih, tetapi bleaching cenderung terbaca lebih sedikit dari kenyataan. ") : "")
    + (sum.used > 1 ? `Kondisi antar foto ${sum.tMax - sum.tMin > 30 ? "cukup beragam" : "cukup seragam"} (${pct(sum.tMin)}–${pct(sum.tMax)}).` : "");
}

const REPORT_ROWS = 12;
function viewReport() {
  const s = state.session;
  const sum = summary();
  if (!sum.analysed) return emptyState("Belum ada hasil untuk dilaporkan", "Analisis foto dulu di halaman Sesi baru.", "#/sesi", "Ke Sesi baru");
  const loc = sessionLocation();
  const t = sum.tLive;
  const live = sum.counts[0] + sum.counts[1];
  const all = s.photos.filter((p) => p.result || p.status === "error");
  const shown = all.slice(0, REPORT_ROWS);
  const note = (p, n) => p.status === "skipped" ? "dilewati: tanpa dasar laut" : p.status === "error" ? "dilewati: tidak bisa dibaca"
    : p.excluded ? "dikecualikan" : lowConfidence(n) ? "keyakinan rendah" : n.corrected ? `${n.corrected} titik dikoreksi` : n.ragu ? `${n.ragu} titik ragu` : "—";
  const rows = shown.map((p) => {
    if (p.status !== "done") return `<tr><td>${esc(p.name)}</td><td class="n">—</td><td class="n">—</td><td class="n">—</td><td>${note(p)}</td></tr>`;
    const n = photoNumbers(p);
    return `<tr><td>${esc(p.name)}</td><td class="n">${pct(n.tLive)}</td><td class="n">${n.live >= MIN_LIVE_FOR_P ? pct(n.pBleached) : "—"}</td><td class="n">${n.seabed}</td><td>${note(p, n)}</td></tr>`;
  }).join("");
  const spread = sum.rows.filter((r) => Number.isFinite(r.n.tLive)).map((r) => ({ id: r.photo.id, name: r.photo.name, value: r.n.tLive }));
  const mae = s.points === 60 ? analysis.e4_test.points_60.cascade_mae_t_live : analysis.e4_test.points_30.cascade_mae_t_live;
  const raguShare = sum.points ? sum.ragu / sum.points : 0;
  const m = modelsInfo?.models;
  return `
  <div class="report-bar no-print"><a class="tlink" href="#/ringkasan">${icon("chevL", "#0A6A8C", 16)}Ringkasan sesi</a>
    <span class="help">Di jendela cetak, pilih tujuan <b>Simpan sebagai PDF</b>.</span>
    <button class="btn btn-primary" data-action="print">${icon("download", "#fff", 18)}Simpan sebagai PDF</button></div>
  <article class="report">
    <header class="r-head"><span class="brand">${markC({ size: 40 })}${wordmark()}</span>
      <div class="r-head-r">Laporan sesi selam<br><span>Dibuat ${esc(formatDate(localDate()))} · ReefScan-ID v0.2</span></div></header>
    <div class="r-line"></div>
    <h1 class="r-title">${esc(s.name || "Sesi tanpa nama")}</h1>
    <div class="r-meta">${esc(formatDate(s.date))} · ${Number.isFinite(loc.lat) ? formatCoord(loc.lat, loc.lon) : "lokasi tidak diisi"} · ${sum.used} foto dihitung${sum.skipped + sum.failed ? ` (${sum.skipped + sum.failed} dilewati)` : ""}${sum.excluded ? `, ${sum.excluded} dikecualikan` : ""} · ${num(sum.pooled.seabed)} titik dasar dari ${num(sum.points)} titik (${s.points} per foto)</div>
    <div class="r-kpis">
      <div class="r-k r-kp"><div class="r-kl">Tutupan karang hidup</div><div class="r-kv">${pct(t)} ${badge(sum.category)}</div>${catScale(t)}</div>
      <div class="r-k"><div class="r-kl">Karang memutih (bleaching)</div><div class="r-kv">${pct(sum.pBleached)}</div><div class="r-ks">dari karang hidup (${num(sum.counts[1])} dari ${num(live)} titik). Bisa lebih tinggi dari ini.</div></div>
      <div class="r-k"><div class="r-kl">Keyakinan hasil</div><div class="r-kv r-kv-s">${trustLevel(sum)}</div><div class="r-ks">${sum.used} foto · ${sum.lowConf.length} foto keyakinan rendah · ${pct(raguShare * 100)} titik ragu</div></div>
    </div>
    <h2 class="r-s">Ringkasan</h2><p class="r-p">${storyText(sum)}</p>
    <div class="r-two">
      <div><h2 class="r-s">Isi dasar laut (${num(sum.pooled.seabed)} titik)</h2>${composition(sum.counts)}</div>
      <div><h2 class="r-s">Sebaran tutupan per foto</h2>${spread.length > 1 ? spreadChart(spread, t, null, { width: 400 }) : '<p class="r-p">Hanya satu foto.</p>'}</div>
    </div>
    <h2 class="r-s">Hasil per foto${all.length > shown.length ? ` (${shown.length} dari ${all.length}, lengkap di CSV)` : ""}</h2>
    <table class="r-table"><thead><tr><th>Foto</th><th class="n">Karang hidup<br>(% titik dasar)</th><th class="n">Bleaching<br>(% karang hidup)</th><th class="n">Titik dasar</th><th>Catatan</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="r-two">
      <div><h2 class="r-s">Metode singkat</h2><p class="r-p">${s.points} titik grid di setiap foto, seperti metode transek foto (UPT). Tahap 1 (SegFormer-B0) memisahkan karang, substrat, dan objek lain; Tahap 2 (EfficientNet-B0) memberi label sehat, bleaching, atau mati pada titik karang. Angka sesi adalah rata-rata semua foto. Di 392 foto uji, angka karang hidup per foto rata-rata meleset ±${dec(mae)} poin.</p></div>
      <div><h2 class="r-s">Batasan</h2><p class="r-p">Model belajar dari foto Laut Merah dan Hawaii, belum dari perairan Indonesia. Foto penyelam diambil miring, tidak setara frame UPT. Bleaching cenderung terbaca lebih sedikit, dan karang mati sering terbaca substrat. Foto gelap, sangat biru, atau buram membuat hasil kurang tepat.</p></div>
    </div>
    <footer class="r-foot">Estimasi kasar, bukan pengganti survei resmi. Data latih: Coralscapes (Apache-2.0), NOAA PIFSC ESD Coral Bleaching (Public Domain). Model: Tahap 1 SegFormer-B0${m ? ` (${m.stage1.sha256.slice(0, 8)})` : ""}, Tahap 2 EfficientNet-B0${m ? ` (${m.stage2.sha256.slice(0, 8)})` : ""}. Dihitung di perangkat pengguna; foto tidak dikirim ke server.</footer>
  </article>`;
}

// ---------------------------------------------------------------- CSV
function download(name, text) {
  const blob = new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = (v) => (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v)) ? "" : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const csv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\n");
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
function fileStem() {
  return (state.session.name || "sesi").replace(/[^\w-]+/g, "_").slice(0, 40) + "_" + state.session.date;
}

const LABEL_ID = ["sehat", "bleaching", "mati", "substrat", "lainnya"];
function modelVersion() {
  const m = modelsInfo?.models;
  return m ? `tahap1 ${m.stage1.sha256.slice(0, 8)} / tahap2 ${m.stage2.sha256.slice(0, 8)}` : "";
}

// One row per photo, with the column names of the wireframe (board 10), plus a last row for the session
function csvPhotos() {
  const s = state.session;
  const loc = sessionLocation();
  const lat = Number.isFinite(loc.lat) ? round(loc.lat, 6) : "", lon = Number.isFinite(loc.lon) ? round(loc.lon, 6) : "";
  const version = modelVersion();
  const rows = [["nama_sesi", "tanggal", "lat", "lon", "file_foto", "status", "alasan", "titik_per_foto", "titik_dasar",
    "titik_sehat", "titik_bleaching", "titik_mati", "titik_substrat", "titik_lainnya", "tutupan_hidup_pct", "bleaching_pct", "kategori",
    "titik_ragu", "dikoreksi_manual", "foto_lat", "foto_lon", "lebar_px", "tinggi_px", "seed_titik", "versi_model"]];
  s.photos.forEach((p) => {
    if (!p.result && p.status !== "error") return;
    const plat = p.exif?.gps ? round(p.exif.gps.lat, 6) : "", plon = p.exif?.gps ? round(p.exif.gps.lon, 6) : "";
    if (!p.result) {
      rows.push([s.name, s.date, lat, lon, p.name, "dilewati", "tidak_bisa_dibaca", s.points, "", "", "", "", "", "", "", "", "", "", "", plat, plon, "", "", "", version]);
      return;
    }
    const n = photoNumbers(p);
    const status = p.status === "skipped" ? "dilewati" : p.excluded ? "dikecualikan" : "dianalisis";
    const reason = p.status === "skipped" ? "tanpa_dasar_laut" : p.excluded ? "dikecualikan_pengguna" : "";
    rows.push([s.name, s.date, lat, lon, p.name, status, reason, p.result.grid, n.seabed, ...n.counts, round(n.tLive, 1),
      n.live >= MIN_LIVE_FOR_P ? round(n.pBleached, 1) : "", n.seabed ? kepmenlhCategory(n.tLive) : "", n.ragu, n.corrected,
      plat, plon, p.result.size.width, p.result.size.height, p.result.seed, version]);
  });
  const sum = summary();
  rows.push([s.name, s.date, lat, lon, "RATA-RATA SESI", "ringkasan", `rata_rata_${sum.used}_foto`, s.points, sum.pooled.seabed, ...sum.counts,
    round(sum.tLive, 1), round(sum.pBleached, 1), sum.category || "", sum.ragu, sum.corrected, "", "", "", "", "", version]);
  download(`reefscan_${fileStem()}_per_foto.csv`, csv(rows));
}

// One row per point, for re-checking in CPCe or CoralNet
function csvPoints() {
  const s = state.session;
  const rows = [["nama_sesi", "file_foto", "titik", "x_px", "y_px", "x_rel", "y_rel", "tahap1", "label_model", "label", "dikoreksi_manual", "dihitung", "ragu", "keyakinan"]];
  const stage1Names = ["karang", "substrat", "lainnya"];
  s.photos.forEach((p) => {
    if (!p.result) return;
    const scale = p.result.size.height / p.result.working.height;
    p.result.points.forEach((pt, i) => {
      const label = p.corrections[i] ?? pt.label;
      rows.push([s.name, p.name, i + 1, Math.round(pt.x * scale), Math.round(pt.y * scale), round(pt.x / p.result.working.width, 4), round(pt.y / p.result.working.height, 4),
        stage1Names[pt.stage1], LABEL_ID[pt.label], LABEL_ID[label], p.corrections[i] !== undefined ? 1 : 0, label !== 4 && !p.excluded && p.status === "done" ? 1 : 0,
        pt.ragu ? 1 : 0, round(pt.score, 3)]);
    });
  });
  download(`reefscan_${fileStem()}_per_titik.csv`, csv(rows));
}

// ---------------------------------------------------------------- events
function afterRender(r) {
  if (r.name === "sesi") {
    ensureWorker();
    const drop = $("#drop");
    const input = $("#file-input");
    input?.addEventListener("change", () => { addFiles(input.files); input.value = ""; });
    if (drop) {
      ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
      ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove("over"); }));
      drop.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));
    }
    app.querySelectorAll("[data-bind]").forEach((el) => el.addEventListener("input", () => {
      state.session[el.dataset.bind] = el.value;
      if (el.dataset.bind === "date") state.session.dateTouched = true;
    }));
    app.querySelectorAll("[data-loc]").forEach((el) => el.addEventListener("input", () => {
      state.session.location[el.dataset.loc] = el.value;
      const status = $("#loc-status");
      if (status) status.innerHTML = locationStatus(sessionLocation());
    }));
  }
  if (r.name === "ringkasan") {
    const input = $("#compare-input");
    input?.addEventListener("change", () => { if (input.files[0]) loadPreviousCsv(input.files[0]); });
  }
  if (r.name === "foto") {
    const photo = photoById(Number(r.arg));
    if (photo?.result) drawPhotoCanvases(photo);
  }
  heroObserver?.disconnect();
  if (r.name === "home") {
    const video = $("#hero-video");
    const still = () => state.ui.paused || matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (video) {
      if (still()) video.pause();
      // decoding a video while the user reads further down makes scrolling heavy, so it pauses off screen
      heroObserver = new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !still()) video.play().catch(() => {});
        else video.pause();
      }, { threshold: 0.15 });
      heroObserver.observe(video);
    }
  }
  const titles = { home: "ReefScan-ID · Estimasi kondisi terumbu karang dari foto selam", sesi: "Sesi baru · ReefScan-ID", proses: "Analisis · ReefScan-ID", ringkasan: "Ringkasan sesi · ReefScan-ID", foto: "Detail foto · ReefScan-ID", tentang: "Tentang & batasan · ReefScan-ID", logo: "Konsep logo · ReefScan-ID" };
  document.title = r.name === "laporan" ? `Laporan ReefScan-ID - ${state.session.name || "sesi"} - ${state.session.date}` : titles[r.name] || titles.home;
}

const actions = {
  "try-samples": async () => { await addSamples(); go("#/sesi"); },
  "toggle-anim": () => { state.ui.paused = !state.ui.paused; refresh(); },
  remove: (el) => removePhoto(Number(el.dataset.id)),
  clear: () => { resetSession(); refresh(); },
  points: (el) => { state.session.points = Number(el.dataset.value); refresh(); },
  "loc-mode": (el) => { state.session.location.mode = el.dataset.value; refresh(); },
  start: () => startRun(),
  "retry-model": () => {
    worker?.terminate();
    worker = null;
    state.session.photos.forEach((p) => { if (p.status === "running") p.status = "queued"; });
    state.model = { status: "idle", loaded: 0, total: 0, error: null };
    ensureWorker();
    refresh();
  },
  cancel: () => confirmDialog("Batalkan analisis?", "Foto yang sudah selesai tetap ada di ringkasan. Foto yang belum diproses tidak akan dianalisis.", "Batalkan analisis", cancelRun),
  "new-session": () => confirmDialog("Mulai sesi baru?", "Hasil sesi ini akan hilang. Unduh CSV dulu kalau ingin menyimpannya.", "Mulai sesi baru", () => { resetSession(); go("#/sesi"); }),
  howread: () => { state.ui.howread = !state.ui.howread; refresh(); },
  filter: (el) => { state.ui.filter = el.dataset.value; refresh(); },
  "open-photo": (el) => go(`#/foto/${el.dataset.id}`),
  "csv-photos": () => csvPhotos(),
  "compare-clear": () => { state.compare = null; refresh(); },
  print: () => window.print(),
  "csv-points": () => csvPoints(),
  toggle: (el) => { state.ui[el.dataset.value] = !state.ui[el.dataset.value]; refresh(); },
  point: (el) => {
    const id = Number(route().arg);
    const index = Number(el.dataset.index);
    state.ui.point = state.ui.point && state.ui.point.photo === id && state.ui.point.index === index ? null : { photo: id, index };
    refresh();
  },
  relabel: (el) => {
    const photo = photoById(Number(route().arg));
    const index = Number(el.dataset.index);
    const value = Number(el.dataset.value);
    if (value === photo.result.points[index].label) delete photo.corrections[index];
    else photo.corrections[index] = value;
    refresh();
  },
  unrelabel: (el) => { const photo = photoById(Number(route().arg)); delete photo.corrections[Number(el.dataset.index)]; refresh(); },
  exclude: (el) => { const photo = photoById(Number(el.dataset.id)); photo.excluded = !photo.excluded; refresh(); },
};

// in-page anchors (#terumbu, #app) scroll instead of changing the route
document.addEventListener("click", (event) => {
  const a = event.target.closest?.('a[href^="#"]');
  const href = a?.getAttribute("href");
  if (!href || href.startsWith("#/") || href === "#") return;
  const target = document.getElementById(href.slice(1));
  if (target) {
    event.preventDefault();
    target.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    target.focus?.({ preventScroll: true });
  }
});

app.addEventListener("click", (event) => {
  const el = event.target.closest("[data-action]");
  if (el && actions[el.dataset.action]) {
    event.preventDefault();
    actions[el.dataset.action](el, event);
    return;
  }
  const dot = event.target.closest("circle[data-photo]");
  if (dot) go(`#/foto/${dot.dataset.photo}`);
});
app.addEventListener("keydown", (event) => {
  const dot = event.target.closest?.("circle[data-photo]");
  if (dot && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); go(`#/foto/${dot.dataset.photo}`); }
});

function confirmDialog(title, body, confirmText, onConfirm) {
  const dialog = $("#dialog");
  dialog.innerHTML = `<h2 class="h3">${title}</h2><p class="psub" style="display:block">${body}</p>
    <div class="dlg-a"><button class="btn btn-secondary" value="cancel">Kembali</button><button class="btn btn-danger" value="ok">${confirmText}</button></div>`;
  dialog.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => { dialog.close(); if (b.value === "ok") onConfirm(); }));
  dialog.showModal();
}

window.addEventListener("hashchange", () => { state.ui.point = null; refresh(); });
window.addEventListener("beforeunload", (event) => {
  if (state.run && !state.run.finished && !state.run.cancelled) { event.preventDefault(); event.returnValue = ""; }
});

// ---------------------------------------------------------------- boot
// ?debug exposes the state for checks in the browser console
if (new URLSearchParams(location.search).has("debug")) window.reefscanState = state;

async function boot() {
  [analysis, samples, hero] = await Promise.all(["data/analysis.json", "samples-demo/manifest.json", "data/hero.json"].map((u) => fetch(u).then((r) => r.json())));
  modelsInfo = await fetch("models/models.json").then((r) => r.json()).catch(() => null);
  refresh();
}
boot().catch((error) => {
  app.innerHTML = `<main class="page"><div class="alert alert-err">${icon("x", "#A3221B", 20)}<div><b>Aplikasi gagal dimuat.</b> ${esc(error.message)}</div></div></main>`;
});
