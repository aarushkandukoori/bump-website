/**
 * Writes the fitted parameter set into a source module so the shipped engine
 * has no runtime dependency on the calibration artefacts.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFitted } from './applyCalibration.ts';

const here = dirname(fileURLToPath(import.meta.url));
const f = loadFitted();

const body = `/**
 * Calibrated model parameters.
 *
 * GENERATED FILE - do not edit by hand. Produced by verification/bake.ts from
 * verification/calibrated.json, which is written by the Nelder-Mead fit in
 * verification/calibrate.ts and the rate refinement in refineRate.ts.
 *
 * These are the values that make the intact closed loop reproduce published
 * normal adult haemodynamics. The validation report in
 * src/rlfda/data/validation.json records the agreement achieved, including
 * on the reference quantities that were deliberately held out of the fit.
 */

export const CALIBRATED = {
  stressedVolume: ${f.stressedVolume},
  aoElastance: ${f['ao.e']},
  vcElastance: ${f['vc.e']},
  paElastance: ${f['pa.e']},
  puElastance: ${f['pu.e']},
  rSys: ${f.rSys},
  rPul: ${f.rPul},
  lvEes: ${f['lv.eEs']},
  lvP0: ${f['lv.p0']},
  lvLambda: ${f['lv.lambda']},
  rvEes: ${f['rv.eEs']},
  laP0: ${f['la.p0']},
  raP0: ${f['ra.p0']},
  pericardiumP0: ${f['pericardium.p0']},
  intrinsicSinusRate: ${f.sinusRate},
} as const;
`;
writeFileSync(join(here, '..', 'src', 'rlfda', 'engine', 'calibrated.ts'), body);
console.log('wrote src/rlfda/engine/calibrated.ts');
