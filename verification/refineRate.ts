/**
 * One-dimensional refinement of the intrinsic sinus rate.
 *
 * The simplex calibration runs with beat-to-beat variability and respiratory
 * sinus arrhythmia switched off, so that its objective is deterministic. Both
 * modulate cycle *length* multiplicatively, and because rate is the reciprocal
 * of length, that leaves the mean rate slightly lower than the deterministic
 * fit predicts. Rather than re-running the whole simplex against a noisy
 * objective, the intrinsic rate - which is very nearly orthogonal to every
 * other fitted parameter - is solved for on its own under the full model.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defaultModelConfig } from '../src/rlfda/engine/model.ts';
import { measureConfig } from './measure.ts';
import { applyCalibration, loadFitted } from './applyCalibration.ts';

const here = dirname(fileURLToPath(import.meta.url));

function hrAt(rate: number, fitted: Record<string, number>): number {
  const cfg = applyCalibration(defaultModelConfig(3), fitted);
  cfg.conduction.intrinsicSinusRate = rate;
  // Average over several seeds so the search is not chasing one noise draw.
  let total = 0;
  for (let s = 0; s < 3; s++) {
    const c = applyCalibration(defaultModelConfig(11 + s * 7), fitted);
    c.conduction.intrinsicSinusRate = rate;
    total += measureConfig(c, { settleSeconds: 50, measureSeconds: 30 }).heartRate;
  }
  return total / 3;
}

function main(): void {
  const fitted = loadFitted();
  const target = 70;
  let lo = 70;
  let hi = 140;
  for (let i = 0; i < 22; i++) {
    const mid = 0.5 * (lo + hi);
    const hr = hrAt(mid, fitted);
    if (hr < target) lo = mid;
    else hi = mid;
    if (Math.abs(hr - target) < 0.15) {
      lo = mid;
      hi = mid;
      break;
    }
  }
  const solved = 0.5 * (lo + hi);
  console.log(`intrinsic sinus rate ${solved.toFixed(3)} bpm -> measured HR ${hrAt(solved, fitted).toFixed(2)} bpm`);
  fitted.sinusRate = solved;
  const raw = JSON.parse(readFileSync(join(here, 'calibrated.json'), 'utf8'));
  raw.fitted = fitted;
  raw.rateRefined = new Date().toISOString();
  writeFileSync(join(here, 'calibrated.json'), JSON.stringify(raw, null, 2));
  console.log('updated verification/calibrated.json');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
