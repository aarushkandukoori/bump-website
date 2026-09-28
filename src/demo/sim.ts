/** Client-side ECG / bradycardia scenario for the /demo page. */

export type Phase = 'warmup' | 'normal' | 'brady' | 'alert' | 'recover';

export interface SimSample {
  t: number;
  ecg: number;
  hr: number;
  phase: Phase;
  bradycardia: boolean;
  alert: boolean;
  latencyMs: number;
  classLabel: 'Normal' | 'Bradycardia' | 'Other';
}

export const FS = 60;
export const SCENARIO_DURATION_SEC = 22;
export const LATENCY_BUDGET_MS = 250;

export const PHASE_MARKERS: { id: Phase; at: number; label: string }[] = [
  { id: 'warmup', at: 0, label: 'Warmup' },
  { id: 'normal', at: 2, label: 'Normal' },
  { id: 'brady', at: 8, label: 'Drop' },
  { id: 'alert', at: 11, label: 'Alert' },
  { id: 'recover', at: 18, label: 'Recover' },
];

function qrsShape(phase: number): number {
  if (phase < 0.12) return Math.sin((phase / 0.12) * Math.PI) * 0.15;
  if (phase < 0.16) return -0.12;
  if (phase < 0.2) return ((phase - 0.16) / 0.04) * 1.35;
  if (phase < 0.24) return 1.35 - ((phase - 0.2) / 0.04) * 1.7;
  if (phase < 0.28) return -0.35 + ((phase - 0.24) / 0.04) * 0.35;
  if (phase < 0.45) return Math.sin(((phase - 0.28) / 0.17) * Math.PI) * 0.28;
  return 0;
}

function scriptedHr(elapsed: number): { hr: number; phase: Phase } {
  if (elapsed < 2) return { hr: 72, phase: 'warmup' };
  if (elapsed < 8) return { hr: 72, phase: 'normal' };
  if (elapsed < 11) {
    const u = (elapsed - 8) / 3;
    return { hr: 72 - u * 30, phase: 'brady' };
  }
  if (elapsed < 18) return { hr: 42, phase: 'alert' };
  if (elapsed < 22) {
    const u = (elapsed - 18) / 4;
    return { hr: 42 + u * 30, phase: 'recover' };
  }
  return { hr: 72, phase: 'normal' };
}

/**
 * Beats elapsed since the start of the scenario: the integral of the rate,
 * phi(t) = the integral of hr(tau)/60 from 0 to t.
 *
 * Dividing the absolute clock by the *instantaneous* RR interval is only
 * correct while the rate is constant. Across the two scripted ramps it
 * decouples from the rate badly — the phase runs backwards during the fall and
 * draws roughly 200 bpm during the recovery — so the waveform ends up
 * contradicting the heart rate displayed beside it. Integrating fixes both.
 *
 * scriptedHr is piecewise constant/linear, so each segment integrates in closed
 * form and this stays pure and seekable.
 */
function beatsElapsed(loopT: number): number {
  let phi = 0;

  // [0, 8): steady 72 bpm.
  phi += (72 * Math.min(loopT, 8)) / 60;
  if (loopT > 8) {
    // [8, 11): 72 -> 42, i.e. 10 bpm/s.
    const u = Math.min(loopT, 11) - 8;
    phi += (72 * u - 5 * u * u) / 60;
  }
  if (loopT > 11) {
    // [11, 18): steady 42 bpm.
    phi += (42 * (Math.min(loopT, 18) - 11)) / 60;
  }
  if (loopT > 18) {
    // [18, 22): 42 -> 72, i.e. 7.5 bpm/s.
    const u = Math.min(loopT, SCENARIO_DURATION_SEC) - 18;
    phi += (42 * u + 3.75 * u * u) / 60;
  }

  // One scenario is 21.15 beats, so the loop would otherwise wrap mid-beat and
  // put a visible step in the trace. Stretching by 21/21.15 lands the seam on a
  // beat boundary; it slows the drawn rate by 0.7% (72 bpm draws as 71.5),
  // which is far below what the eye or the readout can resolve.
  return phi * (21 / 21.15);
}

/** Forced-brady overlay: hold ~40 bpm for `holdSec` after inject. */
export function sampleAt(
  elapsedSec: number,
  forcedUntil: number | null = null,
): SimSample {
  const loopT = ((elapsedSec % SCENARIO_DURATION_SEC) + SCENARIO_DURATION_SEC) % SCENARIO_DURATION_SEC;
  let { hr, phase } = scriptedHr(loopT);

  const forced = forcedUntil != null && elapsedSec < forcedUntil;
  if (forced) {
    hr = 40;
    phase = 'alert';
  }

  // The forced hold is a constant 40 bpm, where the instantaneous form is exact;
  // the scripted path has ramps, so it needs the integrated phase.
  const beatPhase = forced
    ? (loopT % (60 / 40)) / (60 / 40)
    : beatsElapsed(loopT) - Math.floor(beatsElapsed(loopT));
  const noise = Math.sin(loopT * 37.1) * 0.015 + Math.sin(loopT * 11.3) * 0.01;
  const ecg = qrsShape(beatPhase) + noise;

  const bradycardia = hr < 60 && (phase === 'brady' || phase === 'alert' || forced);
  const alert = phase === 'alert' || forced;
  const latencyMs = alert
    ? 38 + Math.abs(Math.sin(loopT * 3)) * 42
    : phase === 'brady'
      ? 55 + Math.abs(Math.sin(loopT * 2)) * 30
      : 28 + Math.abs(Math.sin(loopT)) * 20;

  return {
    t: loopT,
    ecg,
    hr,
    phase,
    bradycardia,
    alert,
    latencyMs,
    classLabel: bradycardia ? 'Bradycardia' : 'Normal',
  };
}

export function phaseCopy(phase: Phase): string {
  switch (phase) {
    case 'warmup':
      return 'Pipeline warming up — streaming synthetic ECG.';
    case 'normal':
      return 'Stable sinus ~72 bpm. R-peaks → RR intervals → instantaneous HR.';
    case 'brady':
      return 'Rate falling. Sustained-rate monitor arms (HR < 60).';
    case 'alert':
      return 'Bradycardia alert — the decision that would trigger a dose.';
    case 'recover':
      return 'Rate recovering. Sustain condition clears.';
  }
}
