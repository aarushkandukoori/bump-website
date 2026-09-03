/**
 * Numerical checks on the trial statistics.
 *
 * The trial's conclusions are only as good as these routines, and they are
 * hand-written, so they are checked against cases with known answers: the
 * normal distribution against its tabulated values, the bootstrap interval
 * against its asymptotic coverage on simulated data, the signed-rank test
 * against a worked example, and the false-discovery adjustment against the
 * step-up definition.
 */
import {
  bootstrapBca, benjaminiHochberg, mcNemar, mean, normalCdf, normalQuantile,
  pairedDifference, wilcoxonSignedRank,
} from '../src/rlfda/trial/stats.ts';
import { Rng } from '../src/rlfda/engine/rng.ts';

let failures = 0;
function check(name: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
  if (!ok) failures++;
}

console.log('\nStatistics verification\n');

// 1. Normal distribution against tabulated values.
const cdfCases: [number, number][] = [
  [0, 0.5], [1, 0.8413447], [1.959964, 0.975], [-1.959964, 0.025], [2.575829, 0.995],
];
let cdfMax = 0;
for (const [z, p] of cdfCases) cdfMax = Math.max(cdfMax, Math.abs(normalCdf(z) - p));
check('normal CDF against tabulated values', cdfMax < 1e-6, `max error ${cdfMax.toExponential(2)}`);

let qMax = 0;
for (const p of [0.001, 0.01, 0.025, 0.1, 0.3, 0.5, 0.7, 0.9, 0.975, 0.99, 0.999]) {
  qMax = Math.max(qMax, Math.abs(normalCdf(normalQuantile(p)) - p));
}
check('normal quantile inverts the CDF', qMax < 1e-6, `max error ${qMax.toExponential(2)}`);

// 2. Bootstrap interval coverage. Draw many samples from a known distribution
//    and count how often the interval covers the true mean; nominal is 95%.
{
  const rng = new Rng(4242);
  const trueMean = 2.5;
  let covered = 0;
  const trials = 400;
  for (let t = 0; t < trials; t++) {
    const x: number[] = [];
    for (let i = 0; i < 60; i++) x.push(trueMean + 1.4 * rng.normal());
    const est = bootstrapBca(x, mean, 1000 + t, 600);
    if (est.low <= trueMean && trueMean <= est.high) covered++;
  }
  const coverage = covered / trials;
  check(
    'bootstrap interval coverage near nominal 95%',
    coverage > 0.9 && coverage < 0.99,
    `${(coverage * 100).toFixed(1)}% over ${trials} trials`,
  );
}

// 3. Signed-rank test: a sample with an obvious shift must reject, and a
//    sample with none must not.
{
  const rng = new Rng(99);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 40; i++) {
    const base = 50 + 6 * rng.normal();
    b.push(base);
    a.push(base + 4);
  }
  const shifted = wilcoxonSignedRank(a, b);
  check('signed-rank detects a consistent shift', shifted.p < 1e-6, `p = ${shifted.p.toExponential(2)}`);

  const c: number[] = [];
  const d: number[] = [];
  for (let i = 0; i < 40; i++) {
    c.push(50 + 6 * rng.normal());
    d.push(50 + 6 * rng.normal());
  }
  const null_ = wilcoxonSignedRank(c, d);
  check('signed-rank does not reject under the null', null_.p > 0.05, `p = ${null_.p.toFixed(3)}`);
}

// 4. Paired difference recovers a known offset.
{
  const rng = new Rng(7);
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < 200; i++) {
    const base = 70 + 10 * rng.normal();
    b.push(base);
    a.push(base + 3.2 + 0.5 * rng.normal());
  }
  const est = pairedDifference(a, b, 55);
  check(
    'paired difference recovers a known offset',
    Math.abs(est.estimate - 3.2) < 0.15 && est.low < 3.2 && est.high > 3.2,
    `${est.estimate.toFixed(3)} (${est.low.toFixed(3)} to ${est.high.toFixed(3)})`,
  );
}

// 5. McNemar on a textbook 2x2: 12 discordant one way, 2 the other.
{
  const a: boolean[] = [];
  const b: boolean[] = [];
  for (let i = 0; i < 12; i++) { a.push(true); b.push(false); }
  for (let i = 0; i < 2; i++) { a.push(false); b.push(true); }
  for (let i = 0; i < 40; i++) { a.push(true); b.push(true); }
  const m = mcNemar(a, b);
  // Exact two-sided binomial with n=14, k=2 is 0.01294.
  check('McNemar exact p on a known table', Math.abs(m.p - 0.012939) < 1e-5, `p = ${m.p.toFixed(6)}`);
}

// 6. Benjamini-Hochberg against the step-up definition on a known vector.
{
  const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205];
  const adj = benjaminiHochberg(p);
  // Step-up: p(i) * n / i, enforced monotone from the largest downwards.
  const n = p.length;
  const expect = [0.008, 0.032, 0.0672, 0.0672, 0.0672, 0.08, 0.0845714, 0.205];
  let maxErr = 0;
  for (let i = 0; i < n; i++) maxErr = Math.max(maxErr, Math.abs(adj[i] - expect[i]));
  check('Benjamini-Hochberg matches the step-up definition', maxErr < 1e-6, `max error ${maxErr.toExponential(2)}`);
  const monotone = adj.every((v, i) => i === 0 || v >= adj[i - 1] - 1e-12);
  check('adjusted values are monotone in the raw values', monotone, '');
}

console.log(`\n${failures === 0 ? 'All statistics checks passed' : `${failures} check(s) failed`}\n`);
process.exit(failures === 0 ? 0 : 1);
