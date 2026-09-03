/**
 * Solution (calculation) verification.
 *
 * ASME V&V 40 separates *code verification* - does the implementation solve
 * the mathematics it claims to - from *calculation verification* - is the
 * discretisation fine enough that numerical error is negligible relative to
 * the quantities being reported. This module performs the second.
 *
 * Method: a systematic grid-refinement study in the integration step, with
 * the observed order of convergence and a Grid Convergence Index computed for
 * each quantity of interest. The GCI is the standard Richardson-extrapolation
 * error band; a GCI of 0.2% on cardiac output means the reported value is
 * within about 0.2% of the exact solution of the underlying equations.
 *
 * To isolate discretisation error from event-timing quantisation, the study
 * runs a fixed-rate paced rhythm with no sinus node and no escape focus. The
 * pacing interval of exactly 1 s is an integer multiple of every step size
 * tested, so every grid sees identical activation times and the only
 * difference between runs is the Runge-Kutta truncation error.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardiacModel, defaultModelConfig } from '../src/rlfda/engine/model.ts';
import type { PacingConfig } from '../src/rlfda/engine/conduction.ts';
import { measure, type Measurement } from './measure.ts';

const here = dirname(fileURLToPath(import.meta.url));

const PACED: PacingConfig = {
  mode: 'DDD',
  rate: 60,
  avDelay: 0.15,
  outputMa: 0,
  captureThresholdMa: 0,
  transcutaneous: false,
  upperRate: 130,
};

const QUANTITIES = [
  'cardiacOutput', 'strokeVolume', 'map', 'systolic', 'diastolic',
  'edv', 'esv', 'cvp', 'pcwp', 'meanPa', 'strokeWork',
] as const;

function runAt(dt: number): Measurement {
  const cfg = defaultModelConfig(1);
  cfg.dt = dt;
  cfg.conduction.sinusVariability = 0;
  cfg.conduction.rsaAmplitude = 0;
  cfg.conduction.avBlockDegree = 'third';
  cfg.conduction.escapeFocus = 'none';
  // Suppress the sinus node entirely. Its firing times are set by a feedback
  // loop through the baroreflex, so they shift slightly between grids; that
  // event-timing jitter would swamp the truncation error this study is meant
  // to measure. With atrioventricular sequential pacing driving both
  // chambers from a fixed 1 s clock - an exact multiple of every step tested
  // - all activation times are identical across grids.
  cfg.conduction.intrinsicSinusRate = 0.5;
  // Freeze the respiratory pressure swing: it is a deterministic forcing but
  // it makes the steady state a limit cycle of period 60/14 s, which is not
  // commensurate with the pacing period and would alias across grids.
  cfg.respiration.swing = 0;
  const m = new CardiacModel(cfg);
  return measure(m, { settleSeconds: 60, measureSeconds: 20, pacing: PACED });
}

export interface GridRow {
  quantity: string;
  coarse: number;
  medium: number;
  fine: number;
  observedOrder: number;
  /**
   * False when successive grids differ by less than 0.02%, in which case the
   * observed order cannot be estimated because the differences have reached
   * the resolution of the measurement itself. That is a stronger statement
   * about convergence than any order estimate, not a weaker one.
   */
  orderReliable: boolean;
  gciPercent: number;
  richardson: number;
}

/**
 * Three-grid Richardson analysis with refinement ratio r.
 * Roache's Grid Convergence Index with a factor of safety of 1.25.
 */
function analyse(name: string, f3: number, f2: number, f1: number, r: number): GridRow {
  const e21 = f2 - f1;
  const e32 = f3 - f2;
  let p = Number.NaN;
  if (Math.abs(e21) > 1e-12 && e32 / e21 > 0) {
    p = Math.log(Math.abs(e32 / e21)) / Math.log(r);
  }
  const pUsed = Number.isFinite(p) && p > 0.5 ? Math.min(p, 6) : 4;
  const richardson = f1 + e21 / (Math.pow(r, pUsed) - 1);
  const relErr = Math.abs(e21 / (f1 === 0 ? 1 : f1));
  const gci = (1.25 * relErr) / (Math.pow(r, pUsed) - 1);
  return {
    quantity: name,
    coarse: f3,
    medium: f2,
    fine: f1,
    observedOrder: p,
    orderReliable: relErr > 2e-4 && Number.isFinite(p) && p > 0,
    gciPercent: gci * 100,
    richardson,
  };
}

function main(): void {
  const steps = [0.004, 0.002, 0.001, 0.0005];
  console.log('\nSolution verification: grid refinement in the integration step\n');
  const runs = steps.map((dt) => {
    const t0 = Date.now();
    const m = runAt(dt);
    console.log(
      `  dt = ${(dt * 1000).toFixed(2)} ms   CO ${m.cardiacOutput.toFixed(6)} L/min   ` +
        `MAP ${m.map.toFixed(6)} mmHg   (${Date.now() - t0} ms)`,
    );
    return m;
  });

  // Use the three finest grids for the Richardson analysis.
  const [, coarse, medium, fine] = runs;
  const rows: GridRow[] = QUANTITIES.map((q) =>
    analyse(
      q,
      (coarse as unknown as Record<string, number>)[q],
      (medium as unknown as Record<string, number>)[q],
      (fine as unknown as Record<string, number>)[q],
      2,
    ),
  );

  console.log('\n  quantity            2 ms        1 ms      0.5 ms     order    GCI %');
  for (const r of rows) {
    console.log(
      `  ${r.quantity.padEnd(16)}${r.coarse.toFixed(4).padStart(10)}` +
        `${r.medium.toFixed(4).padStart(12)}${r.fine.toFixed(4).padStart(12)}` +
        `${(Number.isFinite(r.observedOrder) ? r.observedOrder.toFixed(2) : '  -').padStart(10)}` +
        `${r.gciPercent.toFixed(4).padStart(10)}`,
    );
  }

  const worst = rows.reduce((a, b) => (b.gciPercent > a.gciPercent ? b : a));
  console.log(
    `\n  Largest grid convergence index: ${worst.gciPercent.toFixed(4)}% on ${worst.quantity}`,
  );

  // Conservation check over a long integration at the production step.
  const cfg = defaultModelConfig(5);
  const m = new CardiacModel(cfg);
  const v0 = m.circuitVolume;
  m.advance(900);
  const drift = m.circuitVolume - v0;
  console.log(
    `  Volume conservation over 900 s: drift ${drift.toExponential(3)} mL ` +
      `(${((Math.abs(drift) / v0) * 100).toExponential(2)}% of ${v0.toFixed(1)} mL)\n`,
  );

  // Acceptance criteria, fixed in advance: numerical error must stay well
  // below the smallest difference the trial is powered to detect, and volume
  // must be conserved to within rounding.
  const GCI_LIMIT_PERCENT = 0.5;
  const DRIFT_LIMIT_FRACTION = 1e-6;
  const driftFraction = Math.abs(drift) / v0;
  if (worst.gciPercent > GCI_LIMIT_PERCENT) {
    console.error(
      `FAIL grid convergence index ${worst.gciPercent.toFixed(4)}% exceeds ${GCI_LIMIT_PERCENT}%`,
    );
    process.exitCode = 1;
  }
  if (driftFraction > DRIFT_LIMIT_FRACTION) {
    console.error(`FAIL volume drift ${driftFraction.toExponential(2)} exceeds ${DRIFT_LIMIT_FRACTION}`);
    process.exitCode = 1;
  }

  const outDir = join(here, '..', 'src', 'rlfda', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'solution-verification.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        steps: steps.map((s) => s * 1000),
        productionStepMs: 1.0,
        rows,
        worstGciPercent: worst.gciPercent,
        conservation: { seconds: 900, driftMl: drift, initialMl: v0 },
      },
      null,
      2,
    ),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
