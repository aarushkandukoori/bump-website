/**
 * Surface electrocardiogram synthesis.
 *
 * This is a display layer, not a model input: nothing in the controller reads
 * it, and no result depends on it. It exists so that a rhythm can be read the
 * way a clinician reads it, because the arrhythmias this platform reasons
 * about are recognised by their appearance on a strip. Atrioventricular
 * dissociation, a dropped beat at the end of a Wenckebach sequence, a wide
 * escape complex marching independently of the P waves, a pacing spike that
 * captured and one that did not - these are the things the model is producing
 * internally, and a trace is the honest way to show them.
 *
 * Each deflection is a Gaussian placed relative to its depolarisation event,
 * with morphology chosen by the origin of the beat: narrow and upright for a
 * supraventricular impulse, broad with discordant repolarisation for a
 * ventricular or paced one.
 */

import type { ActivationEvent, ActivationSource } from './conduction.ts';

export interface EcgEvent {
  time: number;
  chamber: 'atrium' | 'ventricle';
  source: ActivationSource;
  qrsWidth: number;
  nonCapture: boolean;
}

function gaussian(t: number, centre: number, width: number, amplitude: number): number {
  const z = (t - centre) / width;
  if (Math.abs(z) > 4) return 0;
  return amplitude * Math.exp(-0.5 * z * z);
}

/**
 * Rolling electrocardiogram synthesiser.
 *
 * Keeps a short window of depolarisation events and evaluates the summed
 * waveform at any requested instant inside it.
 */
export class EcgSynth {
  private events: EcgEvent[] = [];
  /** Seconds of history retained; long enough for any T wave to complete. */
  private readonly window = 2.5;

  push(e: ActivationEvent): void {
    this.events.push({
      time: e.time,
      chamber: e.chamber,
      source: e.source,
      qrsWidth: e.qrsWidth,
      nonCapture: e.nonCapture,
    });
  }

  prune(now: number): void {
    const cutoff = now - this.window;
    let i = 0;
    while (i < this.events.length && this.events[i].time < cutoff) i++;
    if (i > 0) this.events.splice(0, i);
  }

  /** Millivolts at time `t`, in a lead II-like projection. */
  sample(t: number, noise = 0.012): number {
    let v = 0;
    for (const e of this.events) {
      const dt = t - e.time;
      if (dt < -0.02 || dt > this.window) continue;

      if (e.chamber === 'atrium') {
        // P wave: smooth, low amplitude, slightly ahead of the QRS.
        v += gaussian(dt, 0.035, 0.022, 0.13);
        continue;
      }

      if (e.nonCapture) {
        // A stimulus that failed to capture leaves the spike and nothing else.
        v += gaussian(dt, 0.0, 0.0022, 0.9);
        continue;
      }

      const wide = e.qrsWidth > 0.115;
      if (e.source === 'paced') v += gaussian(dt, -0.004, 0.0022, 0.85);

      if (!wide) {
        // Narrow complex: small septal q, tall R, small S.
        v += gaussian(dt, 0.012, 0.008, -0.09);
        v += gaussian(dt, 0.032, 0.011, 1.15);
        v += gaussian(dt, 0.056, 0.012, -0.22);
        // Concordant T wave.
        v += gaussian(dt, 0.24, 0.055, 0.26);
      } else {
        // Broad complex with discordant repolarisation.
        const w = Math.max(e.qrsWidth, 0.12);
        v += gaussian(dt, 0.018, 0.016, -0.28);
        v += gaussian(dt, 0.018 + w * 0.42, w * 0.30, 1.0);
        v += gaussian(dt, 0.03 + w * 1.05, w * 0.42, -0.34);
        v += gaussian(dt, 0.05 + w * 2.2, 0.075, -0.30);
      }
    }
    // Baseline wander from respiration plus a little instrument noise.
    v += 0.03 * Math.sin(2 * Math.PI * 0.23 * t);
    v += noise * (Math.sin(t * 611.3) * 0.6 + Math.sin(t * 149.7) * 0.4);
    return v;
  }

  get eventCount(): number {
    return this.events.length;
  }
}
