/**
 * Chamber activation (time-varying elastance drivers).
 *
 * Cardiac chambers are represented with the Suga-Sagawa time-varying
 * elastance formalism: a chamber's pressure-volume relationship sweeps
 * between a passive end-diastolic curve and an active end-systolic line
 * under a dimensionless activation function e(t) in [0, 1].
 *
 * Two driver shapes are provided:
 *
 *  - `gaussianDriver`  the single-Gaussian driver used by Smith et al. (2004)
 *    in the minimal haemodynamic model, e(t) = exp(-B (t - C)^2).
 *
 *  - `doubleHillDriver`  the normalised double-Hill elastance curve of
 *    Stergiopulos et al., which reproduces the asymmetric rise/fall of the
 *    measured elastance waveform more faithfully and is the shape we use for
 *    the ventricles.
 *
 * Activation is *event driven*: a chamber begins its contraction when the
 * conduction model depolarises it. This is what allows atrioventricular
 * dissociation, programmable AV delay and pacing to affect stroke volume
 * through the correct physical mechanism (loss or mistiming of the atrial
 * contribution to ventricular filling) rather than through a fitted fudge.
 */

/** Smith et al. single-Gaussian activation, peaking at `centre` seconds. */
export function gaussianDriver(tSinceOnset: number, centre = 0.27, width = 80): number {
  if (tSinceOnset < 0) return 0;
  return Math.exp(-width * (tSinceOnset - centre) * (tSinceOnset - centre));
}

/**
 * Raw (un-normalised) double-Hill shape.
 *
 *   g1 = (t/T1)^m1,  g2 = (t/T2)^m2
 *   s(t) = g1/(1+g1) * 1/(1+g2)
 *
 * Stergiopulos defines T1 and T2 as fractions of the cardiac period. Because
 * mechanical systole scales with sqrt(RR) rather than with RR itself, we
 * instead express T1 and T2 as fractions of the *systole duration* supplied by
 * `systoleDuration()`. The fractions below are the Stergiopulos values
 * rescaled by two, so the activation rises, peaks and returns to baseline
 * within one systole at every simulated heart rate.
 */
export const HILL_M1 = 1.32;
export const HILL_M2 = 21.9;
export const HILL_T1_FRAC = 0.538;
export const HILL_T2_FRAC = 0.904;

export function doubleHillShape(
  tSinceOnset: number,
  systoleDur: number,
  m1 = HILL_M1,
  m2 = HILL_M2,
  t1Frac = HILL_T1_FRAC,
  t2Frac = HILL_T2_FRAC,
): number {
  if (tSinceOnset <= 0) return 0;
  if (tSinceOnset > systoleDur * 1.6) return 0;
  const g1 = Math.pow(tSinceOnset / (t1Frac * systoleDur), m1);
  const g2 = Math.pow(tSinceOnset / (t2Frac * systoleDur), m2);
  return (g1 / (1 + g1)) * (1 / (1 + g2));
}

/** Peak of the raw shape; duration cancels, so this is a universal constant. */
function computeShapePeak(): number {
  let best = 0;
  for (let i = 1; i < 20000; i++) {
    const v = doubleHillShape(i / 20000, 1);
    if (v > best) best = v;
  }
  return best;
}

/** Normalisation constant so that max_t e(t) === 1 and peak elastance = E_es. */
export const DOUBLE_HILL_PEAK = computeShapePeak();

/** Unit-peak activation for a chamber contracting over `systoleDur` seconds. */
export function doubleHillDriver(tSinceOnset: number, systoleDur: number): number {
  return doubleHillShape(tSinceOnset, systoleDur) / DOUBLE_HILL_PEAK;
}

/**
 * Electromechanical systole duration as a function of the preceding cycle
 * length. Follows the classical square-root (Bazett-like) dependence of the
 * QT/mechanical systole interval on RR, floored and capped so that extreme
 * simulated rates stay physiological.
 *
 *   Ts = k * sqrt(RR), k ~ 0.30 s^(1/2)
 *
 * At RR = 0.833 s (72 bpm) this gives 274 ms, consistent with measured
 * left-ventricular ejection plus isovolumic times in normal adults.
 */
export function systoleDuration(rrSeconds: number, k = 0.3): number {
  const rr = Math.min(Math.max(rrSeconds, 0.25), 3.0);
  return Math.min(Math.max(k * Math.sqrt(rr), 0.12), 0.55);
}

/** Atrial systole is short and does not lengthen much at slow rates. */
export function atrialSystoleDuration(rrSeconds: number): number {
  const rr = Math.min(Math.max(rrSeconds, 0.25), 3.0);
  return Math.min(Math.max(0.12 * Math.sqrt(rr / 0.833) + 0.06, 0.09), 0.22);
}
