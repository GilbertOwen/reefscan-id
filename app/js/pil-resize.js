// Pillow's Image.resize(size, Image.BILINEAR) for 8-bit RGB, ported from libImaging/Resample.c so the app gets
// the same pixels as the notebooks: a triangle filter widened by the scale when shrinking (antialiasing),
// a horizontal pass then a vertical pass, fixed-point coefficients with 22 fraction bits, uint8 between passes.

const PRECISION_BITS = 32 - 8 - 2;
const HALF = 1 << (PRECISION_BITS - 1);
const ONE = 1 << PRECISION_BITS;

function bilinearFilter(x) {
  if (x < 0) x = -x;
  return x < 1 ? 1 - x : 0;
}

function precomputeCoeffs(inSize, outSize) {
  const scale = inSize / outSize;
  const filterscale = scale < 1 ? 1 : scale;
  const support = 1 * filterscale;
  const ksize = Math.ceil(support) * 2 + 1;
  const kk = new Int32Array(outSize * ksize);
  const bounds = new Int32Array(outSize * 2);
  const weights = new Float64Array(ksize);
  for (let xx = 0; xx < outSize; xx++) {
    const center = (xx + 0.5) * scale;
    const ss = 1 / filterscale;
    let xmin = Math.trunc(center - support + 0.5);
    if (xmin < 0) xmin = 0;
    let xmax = Math.trunc(center + support + 0.5);
    if (xmax > inSize) xmax = inSize;
    xmax -= xmin;
    let ww = 0;
    for (let x = 0; x < xmax; x++) {
      const w = bilinearFilter((x + xmin - center + 0.5) * ss);
      weights[x] = w;
      ww += w;
    }
    for (let x = 0; x < xmax; x++) {
      const w = ww !== 0 ? weights[x] / ww : weights[x];
      kk[xx * ksize + x] = w < 0 ? Math.trunc(-0.5 + w * ONE) : Math.trunc(0.5 + w * ONE);
    }
    bounds[xx * 2] = xmin;
    bounds[xx * 2 + 1] = xmax;
  }
  return { ksize, kk, bounds };
}

function clip8(value) {
  const v = value >> PRECISION_BITS;
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function horizontal(src, srcWidth, rowFirst, rowCount, outWidth, coeffs) {
  const { ksize, kk, bounds } = coeffs;
  const out = new Uint8Array(outWidth * rowCount * 3);
  for (let yy = 0; yy < rowCount; yy++) {
    const rowIn = (yy + rowFirst) * srcWidth * 3;
    const rowOut = yy * outWidth * 3;
    for (let xx = 0; xx < outWidth; xx++) {
      const xmin = bounds[xx * 2];
      const xmax = bounds[xx * 2 + 1];
      const k = xx * ksize;
      let s0 = HALF, s1 = HALF, s2 = HALF;
      for (let x = 0; x < xmax; x++) {
        const p = rowIn + (x + xmin) * 3;
        const w = kk[k + x];
        s0 += src[p] * w;
        s1 += src[p + 1] * w;
        s2 += src[p + 2] * w;
      }
      const o = rowOut + xx * 3;
      out[o] = clip8(s0);
      out[o + 1] = clip8(s1);
      out[o + 2] = clip8(s2);
    }
  }
  return out;
}

function vertical(src, width, outHeight, coeffs, rowShift) {
  const { ksize, kk, bounds } = coeffs;
  const out = new Uint8Array(width * outHeight * 3);
  const stride = width * 3;
  for (let yy = 0; yy < outHeight; yy++) {
    const ymin = bounds[yy * 2] - rowShift;
    const ymax = bounds[yy * 2 + 1];
    const k = yy * ksize;
    const rowOut = yy * stride;
    for (let xx = 0; xx < width; xx++) {
      let s0 = HALF, s1 = HALF, s2 = HALF;
      for (let y = 0; y < ymax; y++) {
        const p = (y + ymin) * stride + xx * 3;
        const w = kk[k + y];
        s0 += src[p] * w;
        s1 += src[p + 1] * w;
        s2 += src[p + 2] * w;
      }
      const o = rowOut + xx * 3;
      out[o] = clip8(s0);
      out[o + 1] = clip8(s1);
      out[o + 2] = clip8(s2);
    }
  }
  return out;
}

// src: Uint8Array of packed RGB rows (width * height * 3). Returns a new packed RGB array of outWidth x outHeight.
export function resizeRGB(src, width, height, outWidth, outHeight) {
  const needHorizontal = outWidth !== width;
  const needVertical = outHeight !== height;
  if (!needHorizontal && !needVertical) return src.slice();
  const horizCoeffs = precomputeCoeffs(width, outWidth);
  const vertCoeffs = precomputeCoeffs(height, outHeight);
  let image = src;
  let imageWidth = width;
  let rowShift = 0;
  if (needHorizontal) {
    // Like Pillow, only the source rows the vertical pass will read are resampled.
    const first = vertCoeffs.bounds[0];
    const last = vertCoeffs.bounds[outHeight * 2 - 2] + vertCoeffs.bounds[outHeight * 2 - 1];
    const rows = needVertical ? last - first : height;
    rowShift = needVertical ? first : 0;
    image = horizontal(src, width, rowShift, rows, outWidth, horizCoeffs);
    imageWidth = outWidth;
  }
  if (needVertical) image = vertical(image, imageWidth, outHeight, vertCoeffs, rowShift);
  return image;
}

// Canvas ImageData (RGBA) to packed RGB.
export function rgbaToRGB(rgba, width, height) {
  const out = new Uint8Array(width * height * 3);
  for (let i = 0, j = 0; i < width * height * 4; i += 4, j += 3) {
    out[j] = rgba[i];
    out[j + 1] = rgba[i + 1];
    out[j + 2] = rgba[i + 2];
  }
  return out;
}
