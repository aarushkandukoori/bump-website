/**
 * Statistics for the in-silico trial.
 *
 * Everything here operates on *paired* data, because an in-silico trial can
 * do something no clinical trial can: give the same patient both treatments.
 * Each virtual subject is run once under the learned controller and once
 * under the guideline comparator from an identical initial state with an
 * identical noise realisation, so the only difference between the two arms is
 * the policy. That removes between-subject variance from the comparison
 * entirely and is worth roughly an order of magnitude in sample size.
 *
 * It is also the point at which an in-silico result stops being comparable to
 * a parallel-group clinical trial, and that has to be said plainly rather
 * than quietly banked. What the paired design estimates is the effect of the
 * controller within this model. What a clinical trial estimates is the effect
 * in patients. The first is evidence about the second only to the extent that
 * the model is credible for the question, which is what the credibility
 * assessment exists to establish.
 *
 * Confidence intervals are bias-corrected and accelerated bootstrap
 * intervals, which do not assume the differences are normal - they are not,
 * because the endpoints are bounded proportions and heavily censored times.
 */

import { Rng } from '../engine/rng.ts';

export function mean(x: readonly number[]): number {
  if (x.length === 0) return Number.NaN;
  let s = 0;
  for (const v of x) s += v;
  return s / x.length;
}

export function sd(x: readonly number[]): number {
  if (x.length < 2) return Number.NaN;
  const m = mean(x);
  let s = 0;
  for (const v of x) s += (v - m) * (v - m);
  return Math.sqrt(s / (x.length - 1));
}

export function median(x: readonly number[]): number {
  if (x.length === 0) return Number.NaN;
  const s = [...x].sort((a, b) => a - b);
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : 0.5 * (s[h - 1] + s[h]);
}

export function quantile(x: readonly number[], q: number): number {
  if (x.length === 0) return Number.NaN;
  const s = [...x].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (pos - lo) * (s[hi] - s[lo]);
}

/** Standard normal cumulative distribution, Abramowitz-Stegun 26.2.17. */
export function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327 * Math.exp((-z * z) / 2);
  const p =
    d * t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  return z > 0 ? 1 - p : p;
}

/** Inverse standard normal, Acklam's rational approximation. */
export function normalQuantile(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number;
  let r: number;
  if (p < pl) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export interface Estimate {
  estimate: number;
  low: number;
  high: number;
  n: number;
}

/**
 * Bias-corrected and accelerated bootstrap interval for a statistic of a
 * single paired-difference sample.
 */
export function bootstrapBca(
  x: readonly number[],
  stat: (s: readonly number[]) => number,
  seed: number,
  replicates = 4000,
  alpha = 0.05,
): Estimate {
  const n = x.length;
  const theta = stat(x);
  if (n < 3) return { estimate: theta, low: Number.NaN, high: Number.NaN, n };
  const rng = new Rng(seed);
  const boots = new Float64Array(replicates);
  const buf = new Array<number>(n);
  for (let b = 0; b < replicates; b++) {
    for (let i = 0; i < n; i++) buf[i] = x[rng.int(n)];
    boots[b] = stat(buf);
  }
  const sorted = Array.from(boots).sort((a, b) => a - b);

  // Bias correction from the proportion of replicates below the estimate.
  let below = 0;
  for (const v of sorted) if (v < theta) below++;
  const prop = Math.min(Math.max(below / replicates, 1 / (2 * replicates)), 1 - 1 / (2 * replicates));
  const z0 = normalQuantile(prop);

  // Acceleration from the jackknife skewness.
  const jack = new Array<number>(n);
  const loo = new Array<number>(n - 1);
  for (let i = 0; i < n; i++) {
    let k = 0;
    for (let j = 0; j < n; j++) if (j !== i) loo[k++] = x[j];
    jack[i] = stat(loo);
  }
  const jm = mean(jack);
  let num = 0;
  let den = 0;
  for (const v of jack) {
    const d = jm - v;
    num += d * d * d;
    den += d * d;
  }
  const a = den === 0 ? 0 : num / (6 * Math.pow(den, 1.5));

  const zA = normalQuantile(alpha / 2);
  const zB = normalQuantile(1 - alpha / 2);
  const adj = (z: number): number => {
    const denom = 1 - a * (z0 + z);
    return normalCdf(z0 + (z0 + z) / (Math.abs(denom) < 1e-12 ? 1e-12 : denom));
  };
  const pick = (p: number): number => sorted[Math.min(replicates - 1, Math.max(0, Math.round(p * (replicates - 1))))];
  return { estimate: theta, low: pick(adj(zA)), high: pick(adj(zB)), n };
}

/** Paired difference estimate with a bootstrap interval. */
export function pairedDifference(a: readonly number[], b: readonly number[], seed: number): Estimate {
  const d: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) d.push(a[i] - b[i]);
  return bootstrapBca(d, mean, seed);
}

export interface WilcoxonResult {
  statistic: number;
  z: number;
  p: number;
  n: number;
  /** Number of non-zero differences actually contributing. */
  effectiveN: number;
}

/**
 * Wilcoxon signed-rank test on paired differences, with a normal
 * approximation, a continuity correction and tie correction. Chosen over a
 * paired t test because these endpoints are bounded and skewed.
 */
export function wilcoxonSignedRank(a: readonly number[], b: readonly number[]): WilcoxonResult {
  const diffs: number[] = [];
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const d = a[i] - b[i];
    if (d !== 0) diffs.push(d);
  }
  const n = diffs.length;
  if (n < 6) return { statistic: Number.NaN, z: Number.NaN, p: Number.NaN, n: a.length, effectiveN: n };

  const order = diffs.map((d, i) => ({ i, abs: Math.abs(d), sign: Math.sign(d) }))
    .sort((x, y) => x.abs - y.abs);
  // Mid-ranks for ties.
  const ranks = new Array<number>(n);
  let i = 0;
  const tieGroups: number[] = [];
  while (i < n) {
    let j = i;
    while (j + 1 < n && order[j + 1].abs === order[i].abs) j++;
    const r = (i + j + 2) / 2;
    for (let k = i; k <= j; k++) ranks[k] = r;
    if (j > i) tieGroups.push(j - i + 1);
    i = j + 1;
  }
  let wPlus = 0;
  for (let k = 0; k < n; k++) if (order[k].sign > 0) wPlus += ranks[k];

  const meanW = (n * (n + 1)) / 4;
  let varW = (n * (n + 1) * (2 * n + 1)) / 24;
  for (const t of tieGroups) varW -= (t * t * t - t) / 48;
  const cc = Math.sign(wPlus - meanW) * 0.5;
  const z = varW <= 0 ? 0 : (wPlus - meanW - cc) / Math.sqrt(varW);
  const p = 2 * (1 - normalCdf(Math.abs(z)));
  return { statistic: wPlus, z, p: Math.min(1, Math.max(0, p)), n: a.length, effectiveN: n };
}

/**
 * Non-inferiority assessment on a paired difference.
 *
 * `margin` is expressed in the endpoint's own units and in the direction that
 * counts as worse. Non-inferiority is declared when the whole confidence
 * interval lies on the acceptable side of the margin - the interval is the
 * conclusion, not the point estimate.
 */
export interface NonInferiority {
  estimate: Estimate;
  margin: number;
  higherIsBetter: boolean;
  nonInferior: boolean;
  superior: boolean;
}

export function nonInferiority(
  a: readonly number[], b: readonly number[], margin: number, higherIsBetter: boolean, seed: number,
): NonInferiority {
  const est = pairedDifference(a, b, seed);
  const nonInferior = higherIsBetter ? est.low > -margin : est.high < margin;
  const superior = higherIsBetter ? est.low > 0 : est.high < 0;
  return { estimate: est, margin, higherIsBetter, nonInferior, superior };
}

/** McNemar's exact-ish test for paired binary outcomes. */
export interface McNemarResult {
  discordantAB: number;
  discordantBA: number;
  p: number;
  oddsRatio: number;
}

export function mcNemar(a: readonly boolean[], b: readonly boolean[]): McNemarResult {
  let ab = 0;
  let ba = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] && !b[i]) ab++;
    else if (!a[i] && b[i]) ba++;
  }
  const n = ab + ba;
  if (n === 0) return { discordantAB: 0, discordantBA: 0, p: 1, oddsRatio: Number.NaN };
  // Exact binomial two-sided p under p = 0.5.
  const logC = (k: number): number => {
    let s = 0;
    for (let i = 1; i <= k; i++) s += Math.log(i);
    return s;
  };
  const pmf = (k: number): number =>
    Math.exp(logC(n) - logC(k) - logC(n - k) - n * Math.LN2);
  const observed = pmf(Math.min(ab, ba));
  let p = 0;
  for (let k = 0; k <= n; k++) {
    const v = pmf(k);
    if (v <= observed * (1 + 1e-9)) p += v;
  }
  return {
    discordantAB: ab,
    discordantBA: ba,
    p: Math.min(1, p),
    oddsRatio: ba === 0 ? Infinity : ab / ba,
  };
}

/**
 * Benjamini-Hochberg step-up adjustment.
 *
 * The trial reports one primary endpoint and a family of secondary and
 * subgroup comparisons. Reporting the secondary family unadjusted would
 * guarantee spurious findings, so the family is controlled at a false
 * discovery rate of 5 per cent and the adjusted values are what is displayed.
 */
export function benjaminiHochberg(pValues: readonly number[]): number[] {
  const adj = new Array<number>(pValues.length).fill(Number.NaN);
  // A test that could not be computed - too few discordant pairs, say - is
  // not a null result and must not be counted in the family size, or it would
  // silently make every other adjusted value more conservative.
  const usable = pValues
    .map((p, i) => ({ p, i }))
    .filter((x) => Number.isFinite(x.p))
    .sort((a, b) => a.p - b.p);
  const n = usable.length;
  let prev = 1;
  for (let k = n - 1; k >= 0; k--) {
    const v = Math.min(prev, (usable[k].p * n) / (k + 1));
    adj[usable[k].i] = Math.min(1, v);
    prev = v;
  }
  return adj;
}
