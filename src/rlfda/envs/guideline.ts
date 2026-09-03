/**
 * The comparator: the 2020 adult bradycardia algorithm, implemented as a
 * deterministic controller.
 *
 * This is what the learned policy has to beat, and it is implemented
 * faithfully rather than as a straw man. It follows the published algorithm:
 * treat when the bradycardia is causing compromise; atropine 1 mg, repeated
 * every three to five minutes to a maximum of 3 mg; if atropine is
 * ineffective, transcutaneous pacing and/or a dopamine or epinephrine
 * infusion. It also honours the two guideline contraindications the algorithm
 * card does not itself carry but the bradycardia guideline does - no atropine
 * in a denervated heart, caution in wide-complex infranodal block - because
 * comparing against a controller that ignores them would flatter the learned
 * policy for avoiding mistakes a competent clinician would not make either.
 *
 * It also serves as the fallback controller in the runtime-assurance
 * architecture: if the learned policy is failing, control reverts to this.
 */

import {
  A_ATROPINE_FULL, A_DOPA_DOWN, A_DOPA_UP, A_EPI_DOWN, A_EPI_UP, A_ISO_DOWN,
  A_ISO_UP, A_OBSERVE, A_PACE_OUTPUT_UP, A_PACE_RATE_UP, A_PACE_START,
  HR_TARGET_LOW, MAP_TARGET_LOW,
} from './chronotropic.ts';
import type { Observation } from '../engine/sensors.ts';

export interface GuidelineState {
  lastAtropine: number;
  atropineTotal: number;
  pacingStarted: boolean;
}

/**
 * One decision of the guideline algorithm.
 *
 * `elapsed` is episode time in seconds; `weightKg` and `ischaemic` are used
 * for the labelled cumulative dose limit in coronary disease.
 */
export function guidelineAction(
  o: Observation,
  st: GuidelineState,
  opts: { weightKg: number; ischaemic: boolean },
): number {
  const compromised = o.map < MAP_TARGET_LOW || o.heartRate < 45;
  const bradycardic = o.heartRate < HR_TARGET_LOW;

  // "Assess appropriateness for clinical condition." No compromise, no
  // treatment: the algorithm's first branch is monitor and observe.
  if (!compromised && !bradycardic) {
    // Wean support once the patient is stable and well above target.
    if (o.map > 95 && o.heartRate > 75) {
      if (o.epinephrineRate > 0) return A_EPI_DOWN;
      if (o.dopamineRate > 0) return A_DOPA_DOWN;
      if (o.isoproterenolRate > 0) return A_ISO_DOWN;
    }
    return A_OBSERVE;
  }

  const atropineCap = opts.ischaemic ? Math.min(3, 0.04 * opts.weightKg) : 3;
  const atropineAvailable =
    !o.knownDenervated &&
    !o.knownInfranodal &&
    st.atropineTotal + 1 <= atropineCap + 1e-9 &&
    o.elapsedSeconds - st.lastAtropine >= 180;

  if (atropineAvailable) return A_ATROPINE_FULL;

  /*
   * Atropine given and not yet due again. The algorithm reassesses at three
   * to five minutes before repeating or escalating, so the controller waits
   * rather than stacking therapy - unless the patient is profoundly
   * compromised, in which case pacing is started without waiting.
   */
  const atropineStillPossible =
    !o.knownDenervated && !o.knownInfranodal && st.atropineTotal + 1 <= atropineCap + 1e-9;
  const profound = o.map < 50 || o.heartRate < 35;
  if (atropineStillPossible && !profound && !o.pacingOn) return A_OBSERVE;

  // Atropine ineffective, unavailable or contraindicated: pace and/or infuse.
  if (!o.pacingOn) return A_PACE_START;
  if (!o.apparentCapture && o.pacingOutputMa < 140) return A_PACE_OUTPUT_UP;
  if (o.map < MAP_TARGET_LOW) {
    // Escalate a chronotropic infusion alongside pacing.
    if (o.knownDenervated && o.isoproterenolRate < 10) return A_ISO_UP;
    if (o.dopamineRate < 20) return A_DOPA_UP;
    if (o.epinephrineRate < 10) return A_EPI_UP;
  }
  if (o.heartRate < HR_TARGET_LOW && o.pacingRate < 90) return A_PACE_RATE_UP;
  return A_OBSERVE;
}

/**
 * Reconstruct the guideline's internal state from an observation.
 *
 * Everything the algorithm needs to remember - cumulative atropine, when the
 * last dose was given, whether pacing is running - is already something the
 * device knows and reports. Deriving the state rather than carrying it makes
 * the comparator a pure function of the observation, which means it can be
 * evaluated at any state, including states reached under a different policy.
 * That is what allows it to serve simultaneously as the trial comparator, the
 * exploration behaviour during training, and the anchor the learned policy is
 * regularised towards.
 */
export function guidelineStateFrom(o: Observation): GuidelineState {
  return {
    lastAtropine: o.elapsedSeconds - o.secondsSinceAtropine,
    atropineTotal: o.atropineTotalMg,
    pacingStarted: o.pacingOn,
  };
}

/** The guideline action at an arbitrary state, with no carried state. */
export function guidelineActionAt(
  o: Observation,
  opts: { weightKg: number; ischaemic: boolean },
): number {
  return guidelineAction(o, guidelineStateFrom(o), opts);
}

/** Track guideline state across a run. */
export function newGuidelineState(): GuidelineState {
  return { lastAtropine: -1e9, atropineTotal: 0, pacingStarted: false };
}

export function updateGuidelineState(st: GuidelineState, action: number, elapsed: number): void {
  if (action === A_ATROPINE_FULL) {
    st.lastAtropine = elapsed;
    st.atropineTotal += 1;
  }
  if (action === A_PACE_START) st.pacingStarted = true;
}
