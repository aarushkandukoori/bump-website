/**
 * Unit conventions for the BUMP cardiac in-silico platform.
 *
 * The entire engine works in a single coherent unit system so that no
 * conversion factors are ever needed inside the derivative evaluation:
 *
 *   pressure    mmHg
 *   volume      mL
 *   time        s
 *   flow        mL/s
 *   elastance   mmHg/mL
 *   compliance  mL/mmHg
 *   resistance  mmHg*s/mL      (a.k.a. "Wood-like" units scaled to seconds)
 *   drug mass   mg  (atropine)  /  mcg (catecholamines)
 *   drug conc.  mg/L or mcg/L in the corresponding compartment
 *
 * Clinical reporting units are produced only at the metric boundary.
 */

/** mL/s -> L/min */
export const ML_PER_S_TO_L_PER_MIN = 60 / 1000;

/**
 * mmHg*s/mL -> dyn*s*cm^-5 (the unit used in clinical SVR tables).
 *
 * 1 mmHg = 1333.22 dyn/cm^2 and 1 mL = 1 cm^3, so the conversion factor is
 * 1333.22 exactly. The familiar clinical constant of 80 is this same number
 * divided by 60, and applies only when cardiac output is expressed in L/min
 * rather than mL/s.
 */
export const MMHG_S_PER_ML_TO_DYNE = 1333.22;

/** Convert an SVR expressed in mmHg*s/mL to the clinical dyn*s*cm^-5. */
export function svrToClinical(rMmHgSPerMl: number): number {
  return rMmHgSPerMl * MMHG_S_PER_ML_TO_DYNE;
}

/** Convert a flow in mL/s to cardiac output in L/min. */
export function flowToCardiacOutput(mlPerS: number): number {
  return mlPerS * ML_PER_S_TO_L_PER_MIN;
}

/** Body surface area, Du Bois formula. height in cm, weight in kg -> m^2. */
export function bodySurfaceArea(heightCm: number, weightKg: number): number {
  return 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
}
