/**
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
  stressedVolume: 2600,
  aoElastance: 0.3113822225282298,
  vcElastance: 0.010148370768566383,
  paElastance: 0.36135616571611395,
  puElastance: 0.010495953868154046,
  rSys: 0.9394733220236962,
  rPul: 0.05727783372799834,
  lvEes: 2.0013677003207917,
  lvP0: 0.13527671370904276,
  lvLambda: 0.033103612294812956,
  rvEes: 1.3971579140115795,
  laP0: 0.7210393937406394,
  raP0: 0.6430675628861657,
  pericardiumP0: 0.45395880247853604,
  intrinsicSinusRate: 97.34375,
} as const;
