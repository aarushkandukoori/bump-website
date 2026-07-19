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

  const rrSec = 60 / Math.max(hr, 25);
  const beatPhase = (loopT % rrSec) / rrSec;
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
