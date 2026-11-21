// numpy's default_rng(seed).random(), bit for bit: SeedSequence -> PCG64 (XSL-RR 128/64) -> 53-bit doubles.
// The E4 protocol draws its points with np.random.default_rng(0 + photo_index), so the app can place the same
// points as notebooks 10 and 12 when it is given the same photo index.

const INIT_A = 0x43b0d7e5;
const MULT_A = 0x931e8875;
const INIT_B = 0x8b51f9dd;
const MULT_B = 0x58f38ded;
const MIX_MULT_L = 0xca01f9dd;
const MIX_MULT_R = 0x4973f715;
const POOL_SIZE = 4;

const MASK64 = (1n << 64n) - 1n;
const MASK128 = (1n << 128n) - 1n;
const PCG_MULT = (2549297995355413924n << 64n) + 4865540595714422341n;

function hashmix(value, hash) {
  value = (value ^ hash.value) >>> 0;
  hash.value = Math.imul(hash.value, MULT_A) >>> 0;
  value = Math.imul(value, hash.value) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function mix(x, y) {
  const result = (Math.imul(MIX_MULT_L, x) - Math.imul(MIX_MULT_R, y)) >>> 0;
  return (result ^ (result >>> 16)) >>> 0;
}

function seedWords(seed) {
  if (!Number.isSafeInteger(seed) || seed < 0) throw new Error("seed must be a non-negative integer");
  if (seed === 0) return [0];
  const words = [];
  let n = BigInt(seed);
  while (n > 0n) {
    words.push(Number(n & 0xffffffffn));
    n >>= 32n;
  }
  return words;
}

function seedSequencePool(seed) {
  const entropy = seedWords(seed);
  const pool = new Array(POOL_SIZE);
  const hash = { value: INIT_A };
  for (let i = 0; i < POOL_SIZE; i++) pool[i] = hashmix(i < entropy.length ? entropy[i] : 0, hash);
  for (let src = 0; src < POOL_SIZE; src++) {
    for (let dst = 0; dst < POOL_SIZE; dst++) {
      if (src !== dst) pool[dst] = mix(pool[dst], hashmix(pool[src], hash));
    }
  }
  for (let src = POOL_SIZE; src < entropy.length; src++) {
    for (let dst = 0; dst < POOL_SIZE; dst++) pool[dst] = mix(pool[dst], hashmix(entropy[src], hash));
  }
  return pool;
}

function generateState64(pool, words64) {
  let hash = INIT_B;
  const out32 = [];
  for (let i = 0; i < words64 * 2; i++) {
    let value = (pool[i % POOL_SIZE] ^ hash) >>> 0;
    hash = Math.imul(hash, MULT_B) >>> 0;
    value = Math.imul(value, hash) >>> 0;
    out32.push((value ^ (value >>> 16)) >>> 0);
  }
  const out64 = [];
  for (let i = 0; i < words64; i++) out64.push(BigInt(out32[2 * i]) | (BigInt(out32[2 * i + 1]) << 32n));
  return out64;
}

export class NumpyRandom {
  constructor(seed) {
    const [s0, s1, i0, i1] = generateState64(seedSequencePool(seed), 4);
    const initState = (s0 << 64n) | s1;
    const initSeq = (i0 << 64n) | i1;
    this.inc = ((initSeq << 1n) | 1n) & MASK128;
    this.state = 0n;
    this.step();
    this.state = (this.state + initState) & MASK128;
    this.step();
  }

  step() {
    this.state = (this.state * PCG_MULT + this.inc) & MASK128;
  }

  nextUint64() {
    this.step();
    const value = ((this.state >> 64n) ^ this.state) & MASK64;
    const rot = this.state >> 122n;
    return ((value >> rot) | (value << ((64n - rot) & 63n))) & MASK64;
  }

  random() {
    return Number(this.nextUint64() >> 11n) * (1 / 9007199254740992);
  }
}

// Same as notebook 10/12 photo_points: one random point per grid cell inside a border of `margin` px.
export function photoPoints(seed, width, height, rows, cols, margin) {
  const rng = new NumpyRandom(seed);
  const innerHeight = height - 2 * margin;
  const innerWidth = width - 2 * margin;
  const ys = new Int32Array(rows * cols);
  const xs = new Int32Array(rows * cols);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const offY = rng.random();
      const offX = rng.random();
      ys[i] = Math.trunc(margin + ((r + offY) * innerHeight) / rows);
      xs[i] = Math.trunc(margin + ((c + offX) * innerWidth) / cols);
    }
  }
  return { ys, xs };
}
