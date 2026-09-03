/**
 * Deterministic, seedable pseudo-random number generation.
 *
 * Reproducibility is a regulatory requirement, not a convenience: every
 * in-silico subject, every noise realisation and every exploration decision
 * must be replayable from an integer seed so that a reviewer can regenerate
 * a submitted result bit-for-bit. We therefore never touch Math.random().
 *
 * Algorithm: SplitMix64-seeded xoshiro128** (Blackman & Vigna, 2018),
 * implemented on 32-bit lanes so it behaves identically in every JS engine.
 */

export class Rng {
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private gaussSpare: number | null = null;

  constructor(seed: number) {
    // SplitMix32 expansion of the user seed into the four state words.
    let z = seed >>> 0;
    const next = (): number => {
      z = (z + 0x9e3779b9) >>> 0;
      let t = z;
      t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
      t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.s0 = next();
    this.s1 = next();
    this.s2 = next();
    this.s3 = next();
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) this.s0 = 1;
  }

  /** Raw 32-bit output. */
  nextUint32(): number {
    const rotl = (x: number, k: number): number =>
      ((x << k) | (x >>> (32 - k))) >>> 0;
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (this.s1 << 9) >>> 0;
    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);
    return result;
  }

  /** Uniform on [0, 1). 32 bits of entropy. */
  uniform(): number {
    return this.nextUint32() / 4294967296;
  }

  /** Uniform on [lo, hi). */
  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.uniform();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.uniform() * n) % n;
  }

  /** Standard normal via Marsaglia polar method (cached spare). */
  normal(): number {
    if (this.gaussSpare !== null) {
      const v = this.gaussSpare;
      this.gaussSpare = null;
      return v;
    }
    let u = 0;
    let v = 0;
    let s = 0;
    do {
      u = this.uniform() * 2 - 1;
      v = this.uniform() * 2 - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    const mul = Math.sqrt((-2 * Math.log(s)) / s);
    this.gaussSpare = v * mul;
    return u * mul;
  }

  /** Normal with mean/sd, truncated to [lo, hi] by resampling (max 64 tries). */
  truncNormal(mean: number, sd: number, lo: number, hi: number): number {
    for (let i = 0; i < 64; i++) {
      const x = mean + sd * this.normal();
      if (x >= lo && x <= hi) return x;
    }
    return Math.min(hi, Math.max(lo, mean));
  }

  /** Log-normal with the given median and geometric sd. */
  logNormal(median: number, gsd: number): number {
    return median * Math.exp(Math.log(gsd) * this.normal());
  }

  /** Bernoulli. */
  bernoulli(p: number): boolean {
    return this.uniform() < p;
  }

  /** Sample an index from unnormalised weights. */
  categorical(weights: readonly number[]): number {
    let total = 0;
    for (const w of weights) total += w;
    let x = this.uniform() * total;
    for (let i = 0; i < weights.length; i++) {
      x -= weights[i];
      if (x <= 0) return i;
    }
    return weights.length - 1;
  }

  /** Fisher-Yates shuffle in place. */
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

/** Derive a child seed deterministically from a parent seed and a stream id. */
export function deriveSeed(seed: number, stream: number): number {
  let z = (seed ^ Math.imul(stream + 1, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
  return (z ^ (z >>> 15)) >>> 0;
}
