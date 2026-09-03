/**
 * Parity between the two ways the environment can be driven.
 *
 * The trial steps whole control intervals; the live display steps a few
 * milliseconds at a time so it can draw a waveform. Both go through the same
 * begin/advance/end sequence, and this checks that they produce identical
 * trajectories rather than merely similar ones. If they ever diverge, the
 * simulator on the site would stop being evidence of anything.
 */
import { sampleCohort } from '../src/rlfda/engine/patient.ts';
import { ChronotropicEnv } from '../src/rlfda/envs/chronotropic.ts';
import { guidelineActionAt } from '../src/rlfda/envs/guideline.ts';
import type { EpisodeMetrics } from '../src/rlfda/envs/chronotropic.ts';

function runWhole(subjIdx: number, cohort: ReturnType<typeof sampleCohort>): EpisodeMetrics {
  const s = cohort[subjIdx];
  const env = new ChronotropicEnv(s, { mode: 'evaluation', useShield: true });
  env.reset();
  let done = false;
  while (!done) {
    const a = guidelineActionAt(env.lastObservation, { weightKg: s.weightKg, ischaemic: s.ischaemic });
    done = env.step(a).done;
  }
  return env.metrics();
}

function runSliced(subjIdx: number, cohort: ReturnType<typeof sampleCohort>, slice: number): EpisodeMetrics {
  const s = cohort[subjIdx];
  const env = new ChronotropicEnv(s, { mode: 'evaluation', useShield: true });
  env.reset();
  let done = false;
  while (!done) {
    const a = guidelineActionAt(env.lastObservation, { weightKg: s.weightKg, ischaemic: s.ischaemic });
    env.beginInterval(a);
    while (!env.advanceInterval(slice)) {
      /* accumulate the interval in slices, as the live display does */
    }
    done = env.endInterval().done;
  }
  return env.metrics();
}

const cohort = sampleCohort(6, 24680);
const keys: (keyof EpisodeMetrics)[] = [
  'timeInTarget', 'twaBelow65', 'twaBelow55', 'timeRateAdequate', 'atropineMg',
  'pacingFraction', 'trackingError', 'therapyChanges',
];

let worst = 0;
let worstKey = '';
for (let i = 0; i < cohort.length; i++) {
  const a = runWhole(i, cohort);
  const b = runSliced(i, cohort, 0.02);
  for (const k of keys) {
    const va = a[k] as number;
    const vb = b[k] as number;
    const d = Math.abs(va - vb) / Math.max(1e-9, Math.abs(va));
    if (d > worst) {
      worst = d;
      worstKey = `subject ${i} ${String(k)}: ${va} vs ${vb}`;
    }
  }
}
console.log(
  worst < 1e-12
    ? `PASS  whole-interval and 20 ms-sliced execution are bit-identical across ${cohort.length} subjects`
    : `FAIL  largest relative difference ${worst.toExponential(3)} (${worstKey})`,
);
process.exit(worst < 1e-12 ? 0 : 1);
