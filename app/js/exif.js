// Minimal EXIF reader for JPEG: GPS position and the date the photo was taken. No library, nothing leaves the device.
// Underwater cameras rarely store GPS, so the app also lets the user type the position.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export async function readExif(file) {
  try {
    if (!/jpe?g$/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return {};
    const view = new DataView(await file.slice(0, 512 * 1024).arrayBuffer());
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
    let offset = 2;
    while (offset + 10 < view.byteLength) {
      const marker = view.getUint16(offset);
      const size = view.getUint16(offset + 2);
      if ((marker & 0xff00) !== 0xff00) break;
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) return parseTiff(view, offset + 10);
      offset += 2 + size;
    }
  } catch {
    /* unreadable EXIF: treat as none */
  }
  return {};
}

function parseTiff(view, tiff) {
  const little = view.getUint16(tiff) === 0x4949;
  const u16 = (o) => view.getUint16(o, little);
  const u32 = (o) => view.getUint32(o, little);
  const entries = (ifd) => {
    const out = {};
    const count = u16(ifd);
    for (let i = 0; i < count; i++) {
      const e = ifd + 2 + i * 12;
      out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
    }
    return out;
  };
  const value = (entry) => {
    const total = (TYPE_SIZE[entry.type] || 1) * entry.count;
    const p = total <= 4 ? entry.at : tiff + u32(entry.at);
    if (p + total > view.byteLength) return null;
    if (entry.type === 2) {
      let s = "";
      for (let i = 0; i < entry.count; i++) { const c = view.getUint8(p + i); if (c) s += String.fromCharCode(c); }
      return s;
    }
    if (entry.type === 5) return Array.from({ length: entry.count }, (_, i) => u32(p + i * 8) / (u32(p + i * 8 + 4) || 1));
    if (entry.type === 3) return Array.from({ length: entry.count }, (_, i) => u16(p + i * 2));
    if (entry.type === 4) return Array.from({ length: entry.count }, (_, i) => u32(p + i * 4));
    return null;
  };
  const result = {};
  const ifd0 = entries(tiff + u32(tiff + 4));
  if (ifd0[0x8769]) {
    const exif = entries(tiff + value(ifd0[0x8769])[0]);
    const date = exif[0x9003] && value(exif[0x9003]);
    const m = date && /^(\d{4}):(\d{2}):(\d{2})/.exec(date);
    if (m) result.date = `${m[1]}-${m[2]}-${m[3]}`;
  }
  if (ifd0[0x8825]) {
    const gps = entries(tiff + value(ifd0[0x8825])[0]);
    if (gps[2] && gps[4]) {
      const dms = (a) => a[0] + a[1] / 60 + a[2] / 3600;
      let lat = dms(value(gps[2]));
      let lon = dms(value(gps[4]));
      if (gps[1] && String(value(gps[1])).startsWith("S")) lat = -lat;
      if (gps[3] && String(value(gps[3])).startsWith("W")) lon = -lon;
      if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0)) result.gps = { lat, lon };
    }
  }
  return result;
}

export function formatCoord(lat, lon) {
  const f = (v, pos, neg) => `${Math.abs(v).toLocaleString("id-ID", { maximumFractionDigits: 5 })}° ${v >= 0 ? pos : neg}`;
  return `${f(lat, "LU", "LS")}, ${f(lon, "BT", "BB")}`;
}

export function osmLink(lat, lon) {
  const la = lat.toFixed(5), lo = lon.toFixed(5);
  return `https://www.openstreetmap.org/?mlat=${la}&mlon=${lo}#map=15/${la}/${lo}`;
}
