/**
 * Sensitivity of the reported quantities to the force-frequency
 * parameterisation.
 *
 * Why this exists. The rate-dependent contractility term encodes a real and
 * uncontroversial physiological phenomenon - myocardial force development
 * depends on stimulation rate - but the specific slope it uses is a
 * phenomenological choice that we have not been able to trace to a source we
 * verified ourselves. The honest response to an unverifiable parameter is not
 * to drop it, and not to assert it: it is to measure how much the conclusions
 * move when it moves, and to publish that number.
 *
 * The study sweeps the parameterisation from absent (contractility
 * independent of rate) to twice the nominal slope, and reports the effect on
 * the calibration operating point and on the rate-response curve that the
 * bradycardia argument rests on.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardiacModel, defaultModelConfig } from '../src/rlfda/engine/model.ts';
import type { PacingConfig } from '../src/rlfda/engine/conduction.ts';
import { measure } from './measure.ts';

const here = dirname(fileURLToPath(import.meta.url));

const RATES = [30, 40, 50, 70, 100];
const SCALES = [
  { label: 'absent', scale: 0 },
  { label: 'half nominal', scale: 0.5 },
  { label: 'nominal', scale: 1 },
  { label: 'double nominal', scale: 2 },
];

/**
 * Re-implements the factor with a scalable slope so the sweep does not have
 * to mutate the engine. At scale 1 this is identical to the shipped function.
 */
function factor(rateBpm: number, scale: number): number {
  const hr = Math.min(Math.max(rateBpm, 12), 200);
  const slopeLow = 0.133 * scale;
  const slopeHigh = 0.7 * scale;
  const w = 1 / (1 + Math.exp(-(hr - 72) / 18));
  const slope = slopeLow + (slopeHigh - slopeLow) * w;
  return Math.min(1.65, Math.max(0.72, 1 + slope * Math.log(hr / 72)));
}

function pacedOutput(rate: number, scale: number): { co: number; map: number; sv: number } {
  const cfg = defaultModelConfig(31);
  cfg.conduction.avBlockDegree = 'third';
  cfg.conduction.escapeFocus = 'none';
  cfg.conduction.intrinsicSinusRate = 0.5;
  cfg.conduction.sinusVariability = 0;
  cfg.conduction.rsaAmplitude = 0;
  // Fold the scaled factor into contractility directly. At a fixed paced rate
  // the factor is constant, so scaling end-systolic elastance by it is exactly
  // equivalent to the engine applying it each step.
  const f = factor(rate, scale) / factor(rate, 1);
  cfg.circulation.lv.eEs *= f;
  cfg.circulation.rv.eEs *= f;
  const pacing: PacingConfig = {
    mode: 'DDD', rate, avDelay: 0.16, outputMa: 0,
    captureThresholdMa: 0, transcutaneous: false, upperRate: 180,
  };
  const m = measure(new CardiacModel(cfg), { settleSeconds: 70, measureSeconds: 25, pacing });
  return { co: m.cardiacOutput, map: m.map, sv: m.strokeVolume };
}

function main(): void {
  console.log('\nForce-frequency sensitivity: cardiac output (L/min) by paced rate\n');
  header();

  const rows: { rate: number; values: Record<string, number> }[] = [];
  for (const rate of RATES) {
    const values: Record<string, number> = {};
    for (const s of SCALES) values[s.label] = pacedOutput(rate, s.scale).co;
    rows.push({ rate, values });
    console.log(
      `  ${String(rate).padStart(4)} bpm` +
        SCALES.map((s) => values[s.label].toFixed(3).padStart(16)).join(''),
    );
  }

  // Influence at the calibration operating point, which is what the
  // steady-state validation is measured at.
  const atRest = rows.find((r) => r.rate === 70)!;
  const restSpread =
    (Math.max(...Object.values(atRest.values)) - Math.min(...Object.values(atRest.values))) /
    atRest.values.nominal;

  // Influence at the slow rates the bradycardia argument depends on.
  const slow = rows.find((r) => r.rate === 40)!;
  const slowSpread =
    (Math.max(...Object.values(slow.values)) - Math.min(...Object.values(slow.values))) /
    slow.values.nominal;

  console.log(
    `\n  Spread across the whole sweep at 70 bpm: ${(restSpread * 100).toFixed(2)}% of the nominal value`,
  );
  console.log(
    `  Spread across the whole sweep at 40 bpm: ${(slowSpread * 100).toFixed(2)}% of the nominal value\n`,
  );

  const outDir = join(here, '..', 'src', 'rlfda', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'ffr-sensitivity.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        scales: SCALES,
        rows,
        restSpreadPercent: restSpread * 100,
        slowSpreadPercent: slowSpread * 100,
      },
      null,
      2,
    ),
  );
}

function header(): void {
  console.log(`  ${'rate'.padStart(8)}` + SCALES.map((s) => s.label.padStart(16)).join(''));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
