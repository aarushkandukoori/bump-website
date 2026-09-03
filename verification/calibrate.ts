/**
 * Model calibration.
 *
 * Fits a small set of structural parameters so that the intact closed loop
 * reproduces published normal adult haemodynamics. This is a legitimate and
 * declared step of model development, not a fudge: the parameters adjusted
 * are the ones whose values are genuinely subject-specific or which changed
 * meaning when the atria were added to the underlying minimal model, the
 * targets are stated in advance in targets.ts, and roughly a third of the
 * reference quantities are held out of the objective entirely so that
 * agreement on them is independent evidence.
 *
 * Optimiser: Nelder-Mead simplex in log-parameter space, with restarts. All
 * fitted parameters are strictly positive, so working in logs keeps them
 * positive without constraints and makes the search scale-invariant.
 *
 * Run with `npm run calibrate`.
 */

import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultModelConfig, type ModelConfig } from '../src/rlfda/engine/model.ts';
import { measureConfig, type Measurement } from './measure.ts';
import { NORMAL_ADULT } from './targets.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** A fitted parameter: how to read it from and write it into a config. */
interface Knob {
  name: string;
  get: (c: ModelConfig) => number;
  set: (c: ModelConfig, v: number) => void;
  min: number;
  max: number;
}

export const KNOBS: Knob[] = [
  { name: 'stressedVolume', get: (c) => c.stressedVolume, set: (c, v) => { c.stressedVolume = v; }, min: 900, max: 2600 },
  { name: 'ao.e', get: (c) => c.circulation.ao.e, set: (c, v) => { c.circulation.ao.e = v; }, min: 0.3, max: 2.0 },
  { name: 'vc.e', get: (c) => c.circulation.vc.e, set: (c, v) => { c.circulation.vc.e = v; }, min: 0.002, max: 0.05 },
  { name: 'pa.e', get: (c) => c.circulation.pa.e, set: (c, v) => { c.circulation.pa.e = v; }, min: 0.1, max: 1.2 },
  { name: 'pu.e', get: (c) => c.circulation.pu.e, set: (c, v) => { c.circulation.pu.e = v; }, min: 0.003, max: 0.08 },
  { name: 'rSys', get: (c) => c.circulation.rSys, set: (c, v) => { c.circulation.rSys = v; }, min: 0.4, max: 2.0 },
  { name: 'rPul', get: (c) => c.circulation.rPul, set: (c, v) => { c.circulation.rPul = v; }, min: 0.02, max: 0.5 },
  { name: 'lv.eEs', get: (c) => c.circulation.lv.eEs, set: (c, v) => { c.circulation.lv.eEs = v; }, min: 1.0, max: 6.0 },
  { name: 'lv.p0', get: (c) => c.circulation.lv.p0, set: (c, v) => { c.circulation.lv.p0 = v; }, min: 0.01, max: 1.5 },
  { name: 'lv.lambda', get: (c) => c.circulation.lv.lambda, set: (c, v) => { c.circulation.lv.lambda = v; }, min: 0.008, max: 0.06 },
  { name: 'rv.eEs', get: (c) => c.circulation.rv.eEs, set: (c, v) => { c.circulation.rv.eEs = v; }, min: 0.2, max: 1.6 },
  { name: 'la.p0', get: (c) => c.circulation.la.p0, set: (c, v) => { c.circulation.la.p0 = v; }, min: 0.02, max: 3.0 },
  { name: 'ra.p0', get: (c) => c.circulation.ra.p0, set: (c, v) => { c.circulation.ra.p0 = v; }, min: 0.02, max: 3.0 },
  { name: 'pericardium.p0', get: (c) => c.circulation.pericardium.p0, set: (c, v) => { c.circulation.pericardium.p0 = v; }, min: 0.02, max: 2.5 },
  { name: 'sinusRate', get: (c) => c.conduction.intrinsicSinusRate, set: (c, v) => { c.conduction.intrinsicSinusRate = v; }, min: 70, max: 135 },
];

function configFrom(x: number[], seed: number, dt: number): ModelConfig {
  const c = defaultModelConfig(seed);
  c.dt = dt;
  // Remove beat-to-beat noise during calibration so the objective is
  // deterministic and the simplex is not chasing sampling variability.
  c.conduction.sinusVariability = 0;
  c.conduction.rsaAmplitude = 0;
  for (let i = 0; i < KNOBS.length; i++) {
    const k = KNOBS[i];
    k.set(c, Math.min(Math.max(Math.exp(x[i]), k.min), k.max));
  }
  return c;
}

/** Weighted relative-error objective over the calibration targets. */
export function objective(m: Measurement): number {
  if (m.arrested || !Number.isFinite(m.cardiacOutput) || m.beats < 4) return 1e6;
  let loss = 0;
  for (const r of NORMAL_ADULT) {
    if (r.weight <= 0) continue;
    const v = (m as unknown as Record<string, number>)[r.key];
    if (!Number.isFinite(v)) return 1e6;
    // Normalise by the half-width of the accepted range, so a parameter that
    // lands mid-range contributes nothing and one that lands at the edge
    // contributes about one unit before weighting.
    const halfWidth = Math.max((r.high - r.low) / 2, 1e-6);
    const e = (v - r.target) / halfWidth;
    loss += r.weight * e * e;
  }
  return loss;
}

function evaluate(x: number[], seed: number, dt: number): number {
  try {
    const m = measureConfig(configFrom(x, seed, dt), {
      settleSeconds: 55,
      measureSeconds: 20,
    });
    return objective(m);
  } catch {
    return 1e6;
  }
}

/** Nelder-Mead simplex minimisation. */
export function nelderMead(
  f: (x: number[]) => number,
  x0: number[],
  opts: { step?: number; maxEvals?: number; tol?: number } = {},
): { x: number[]; fx: number; evals: number } {
  const n = x0.length;
  const step = opts.step ?? 0.12;
  const maxEvals = opts.maxEvals ?? 4000;
  const tol = opts.tol ?? 1e-7;
  let evals = 0;
  const call = (x: number[]): number => {
    evals++;
    return f(x);
  };

  const simplex: { x: number[]; fx: number }[] = [];
  simplex.push({ x: x0.slice(), fx: call(x0) });
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] += step;
    simplex.push({ x, fx: call(x) });
  }

  const alpha = 1;
  const gamma = 2;
  const rho = 0.5;
  const sigma = 0.5;

  while (evals < maxEvals) {
    simplex.sort((a, b) => a.fx - b.fx);
    if (Math.abs(simplex[n].fx - simplex[0].fx) < tol * (Math.abs(simplex[0].fx) + tol)) break;

    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i].x[j] / n;
    }

    const worst = simplex[n];
    const reflect = centroid.map((c, j) => c + alpha * (c - worst.x[j]));
    const fr = call(reflect);

    if (fr < simplex[0].fx) {
      const expand = centroid.map((c, j) => c + gamma * (reflect[j] - c));
      const fe = call(expand);
      simplex[n] = fe < fr ? { x: expand, fx: fe } : { x: reflect, fx: fr };
    } else if (fr < simplex[n - 1].fx) {
      simplex[n] = { x: reflect, fx: fr };
    } else {
      const contract = centroid.map((c, j) => c + rho * (worst.x[j] - c));
      const fc = call(contract);
      if (fc < worst.fx) {
        simplex[n] = { x: contract, fx: fc };
      } else {
        for (let i = 1; i <= n; i++) {
          const x = simplex[0].x.map((b, j) => b + sigma * (simplex[i].x[j] - b));
          simplex[i] = { x, fx: call(x) };
        }
      }
    }
  }
  simplex.sort((a, b) => a.fx - b.fx);
  return { x: simplex[0].x, fx: simplex[0].fx, evals };
}

function main(): void {
  const dt = 0.002;
  const base = defaultModelConfig(1);
  let x = KNOBS.map((k) => Math.log(k.get(base)));
  let best = evaluate(x, 11, dt);
  console.log(`initial objective ${best.toFixed(4)}`);

  const t0 = Date.now();
  for (let restart = 0; restart < 6; restart++) {
    const res = nelderMead((v) => evaluate(v, 11, dt), x, {
      step: restart === 0 ? 0.18 : 0.06,
      maxEvals: 2600,
    });
    if (res.fx < best) {
      best = res.fx;
      x = res.x;
    }
    console.log(
      `restart ${restart}: objective ${res.fx.toFixed(4)} after ${res.evals} evals ` +
        `(${((Date.now() - t0) / 1000).toFixed(0)} s elapsed)`,
    );
  }

  const cfg = configFrom(x, 3, 0.001);
  cfg.conduction.sinusVariability = defaultModelConfig(1).conduction.sinusVariability;
  cfg.conduction.rsaAmplitude = defaultModelConfig(1).conduction.rsaAmplitude;

  const fitted: Record<string, number> = {};
  for (const k of KNOBS) fitted[k.name] = k.get(cfg);
  console.log('\nfitted parameters:');
  for (const [k, v] of Object.entries(fitted)) {
    console.log(`  ${k.padEnd(18)} ${v.toPrecision(6)}`);
  }

  writeFileSync(
    join(here, 'calibrated.json'),
    JSON.stringify({ generated: new Date().toISOString(), objective: best, fitted }, null, 2),
  );
  console.log('\nwrote verification/calibrated.json');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
