/**
 * The sensing layer: what the controller actually observes.
 *
 * The engine computes ground truth. A controller never sees it. Everything a
 * policy is allowed to condition on passes through this module, which adds
 * the noise, quantisation, latency and outright bias of the instruments a
 * real device would carry.
 *
 * Three of these degradations are not incidental detail. They change what the
 * optimal policy is:
 *
 *  - **Non-invasive blood pressure is intermittent.** A cuff cycling every
 *    minute means the controller is acting on a pressure reading that is on
 *    average thirty seconds old, and during a rapid decompensation it is
 *    acting on a number that is no longer true.
 *
 *  - **Electrical capture is not mechanical capture.** A transcutaneous
 *    pacing stimulus produces a wide complex on the monitor whether or not
 *    the ventricle actually ejected, because the pacing artefact and the
 *    pectoral muscle response both look like capture. In prehospital series
 *    the large majority of apparent capture was false, in patients who had a
 *    palpated pulse at the time. A controller that trusts the capture
 *    indicator will believe it has rescued a patient it has not.
 *
 *  - **Heart-rate variability carries the information the controller most
 *    needs.** Vagally mediated bradycardia has high beat-to-beat variability;
 *    a subsidiary escape rhythm has almost none. That difference is visible
 *    at the sensor and is the strongest observable correlate of whether a
 *    muscarinic antagonist can work at all - which is the central decision.
 */

import { Rng } from './rng.ts';
import type { CardiacModel } from './model.ts';
import type { PacingConfig } from './conduction.ts';

export interface SensorParams {
  /** Standard deviation of R-peak detection jitter, s. */
  rPeakJitter: number;
  /** Probability that a beat is missed by the detector. */
  missedBeatRate: number;
  /** Probability of a spurious detection (motion artefact). */
  falseBeatRate: number;
  /** Non-invasive cuff interval, s. Zero for a continuous arterial line. */
  cuffIntervalSeconds: number;
  /** Standard deviation of the cuff pressure measurement, mmHg. */
  cuffNoise: number;
  /** Standard deviation of continuous arterial pressure noise, mmHg. */
  arterialNoise: number;
  /** Standard deviation of the QRS duration estimate, s. */
  qrsNoise: number;
  /** Probability that a paced beat without ejection is reported as captured. */
  falseCaptureRate: number;
  /** Relative noise on the perfusion index. */
  perfusionNoise: number;
}

export const WEARABLE_SENSORS: SensorParams = {
  rPeakJitter: 0.012,
  missedBeatRate: 0.012,
  falseBeatRate: 0.006,
  cuffIntervalSeconds: 60,
  cuffNoise: 5.5,
  arterialNoise: 0,
  qrsNoise: 0.018,
  falseCaptureRate: 0.55,
  perfusionNoise: 0.14,
};

export const CRITICAL_CARE_SENSORS: SensorParams = {
  rPeakJitter: 0.006,
  missedBeatRate: 0.004,
  falseBeatRate: 0.002,
  cuffIntervalSeconds: 0,
  cuffNoise: 0,
  arterialNoise: 1.6,
  qrsNoise: 0.010,
  falseCaptureRate: 0.35,
  perfusionNoise: 0.08,
};

/** Everything the controller is allowed to see at one decision point. */
export interface Observation {
  /** Estimated heart rate from detected R peaks, bpm. */
  heartRate: number;
  /** Change in estimated heart rate over the previous minute, bpm. */
  heartRateTrend: number;
  /**
   * Root mean square of successive RR differences, ms. High in vagally
   * mediated bradycardia, near zero in an escape rhythm.
   */
  rrVariability: number;
  /** Most recent mean arterial pressure available to the controller, mmHg. */
  map: number;
  /** Age of that pressure reading, s. */
  mapAgeSeconds: number;
  /** Change in the reported pressure over the previous two minutes, mmHg. */
  mapTrend: number;
  /** Peripheral perfusion index, arbitrary units normalised to 1 at baseline. */
  perfusionIndex: number;
  /** Estimated QRS duration, s. */
  qrsWidth: number;
  /** Estimated fraction of atrial impulses reaching the ventricle. */
  conductionRatio: number;
  /** Estimated atrial rate from P waves, bpm. */
  atrialRate: number;
  /** Whether pacing is being delivered, and whether it appears to capture. */
  pacingOn: boolean;
  pacingOutputMa: number;
  pacingRate: number;
  apparentCapture: boolean;
  /** Therapy accounting - exact, because the device administered it. */
  atropineTotalMg: number;
  secondsSinceAtropine: number;
  /**
   * Fraction of the administered atropine whose effect has already been
   * expressed, from the device's own pharmacokinetic model. This is the
   * quantity the closed-loop guidance asks a controller to track: drug that
   * has been delivered but that the body has not yet responded to.
   */
  atropineEffectRealised: number;
  dopamineRate: number;
  epinephrineRate: number;
  isoproterenolRate: number;
  /** Elapsed episode time, s. */
  elapsedSeconds: number;
  /** Charted context available before the episode begins. */
  knownDenervated: boolean;
  knownInfranodal: boolean;
  ageYears: number;
  weightKg: number;
}

/**
 * Stateful sensor front end. One instance per simulated episode.
 */
export class SensorSuite {
  private p: SensorParams;
  private rng: Rng;
  private rr: number[] = [];
  private lastBeat = 0;
  private hrHistory: { t: number; hr: number }[] = [];
  private mapHistory: { t: number; map: number }[] = [];
  private lastCuffTime = -1e9;
  private lastCuffValue = 90;
  private lastModelBeat = 0;
  private hrEstimate = 70;
  private capturedBeats = 0;
  private pacedBeats = 0;

  constructor(params: SensorParams, rng: Rng) {
    this.p = params;
    this.rng = rng;
  }

  /**
   * Advance the sensor state. Call once per integration step so that beat
   * detection sees every ventricular event.
   */
  update(model: CardiacModel): void {
    const t = model.t;
    const p = this.p;

    if (model.beatCount !== this.lastModelBeat) {
      this.lastModelBeat = model.beatCount;
      // Beat detection: jitter, dropouts and artefactual extra detections.
      if (!this.rng.bernoulli(p.missedBeatRate)) {
        const detected = t + p.rPeakJitter * this.rng.normal();
        if (this.lastBeat > 0) {
          const interval = detected - this.lastBeat;
          if (interval > 0.2) {
            this.rr.push(interval);
            if (this.rr.length > 40) this.rr.shift();
          }
        }
        this.lastBeat = detected;
      }
      if (this.rng.bernoulli(p.falseBeatRate) && this.rr.length > 0) {
        // A motion artefact splits the current interval in two.
        const last = this.rr[this.rr.length - 1];
        this.rr[this.rr.length - 1] = last * 0.45;
        this.rr.push(last * 0.55);
        if (this.rr.length > 40) this.rr.shift();
      }
      // Track mechanical capture separately from the electrical appearance.
      if (model.conduction.lastSource === 'paced') {
        this.pacedBeats++;
        if (model.strokeVolume > 12) this.capturedBeats++;
      }
    }

    // Rate estimate from the trailing RR intervals.
    if (this.rr.length >= 3) {
      const recent = this.rr.slice(-8);
      const mean = recent.reduce((a, b) => a + b, 0) / recent.length;
      this.hrEstimate = 60 / Math.max(mean, 0.2);
    }

    // Blood pressure.
    if (p.cuffIntervalSeconds > 0) {
      if (t - this.lastCuffTime >= p.cuffIntervalSeconds) {
        this.lastCuffTime = t;
        this.lastCuffValue = model.map + p.cuffNoise * this.rng.normal();
      }
    } else {
      this.lastCuffTime = t;
      this.lastCuffValue = model.map + p.arterialNoise * this.rng.normal();
    }

    // Trend buffers, sampled once a second.
    const lastHr = this.hrHistory[this.hrHistory.length - 1];
    if (!lastHr || t - lastHr.t >= 1) {
      this.hrHistory.push({ t, hr: this.hrEstimate });
      if (this.hrHistory.length > 240) this.hrHistory.shift();
      this.mapHistory.push({ t, map: this.lastCuffValue });
      if (this.mapHistory.length > 240) this.mapHistory.shift();
    }
  }

  /** Value from a trend buffer `ago` seconds back. */
  private lookback(buf: { t: number; hr?: number; map?: number }[], t: number, ago: number, key: 'hr' | 'map'): number {
    const target = t - ago;
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= target) return (buf[i] as Record<string, number>)[key];
    }
    return buf.length > 0 ? ((buf[0] as Record<string, number>)[key] as number) : 0;
  }

  /** Root mean square of successive RR differences, ms. */
  private rmssd(): number {
    if (this.rr.length < 4) return 0;
    const r = this.rr.slice(-24);
    let sum = 0;
    for (let i = 1; i < r.length; i++) {
      const d = (r[i] - r[i - 1]) * 1000;
      sum += d * d;
    }
    return Math.sqrt(sum / (r.length - 1));
  }

  /** Build the observation the controller acts on. */
  observe(
    model: CardiacModel,
    pacing: PacingConfig,
    ctx: {
      atropineTotalMg: number;
      secondsSinceAtropine: number;
      atropineEffectRealised: number;
      dopamineRate: number;
      epinephrineRate: number;
      isoproterenolRate: number;
      episodeStart: number;
      knownDenervated: boolean;
      knownInfranodal: boolean;
      ageYears: number;
      weightKg: number;
    },
  ): Observation {
    const t = model.t;
    const p = this.p;

    // Perfusion index: a photoplethysmographic surrogate that tracks pulse
    // amplitude, and therefore stroke volume and vascular tone together.
    const pulseAmplitude = Math.max(0, model.systolic - model.diastolic);
    const perfusion =
      (pulseAmplitude / 42) * (1 + p.perfusionNoise * this.rng.normal());

    // Apparent capture. A paced beat that produced no meaningful ejection is
    // still reported as captured most of the time, because the monitor cannot
    // distinguish a captured complex from a pacing artefact plus muscle
    // response. Real mechanical capture is always reported correctly.
    let apparentCapture = false;
    if (pacing.mode !== 'off' && this.pacedBeats > 0) {
      const trueCaptureFraction = this.capturedBeats / this.pacedBeats;
      apparentCapture =
        this.rng.uniform() < trueCaptureFraction ||
        this.rng.bernoulli(p.falseCaptureRate * (1 - trueCaptureFraction));
    }

    return {
      heartRate: this.hrEstimate,
      heartRateTrend: this.hrEstimate - this.lookback(this.hrHistory, t, 60, 'hr'),
      rrVariability: this.rmssd(),
      map: this.lastCuffValue,
      mapAgeSeconds: Math.min(t - this.lastCuffTime, 300),
      mapTrend: this.lastCuffValue - this.lookback(this.mapHistory, t, 120, 'map'),
      perfusionIndex: perfusion,
      qrsWidth: Math.max(0.04, model.conduction.lastQrsWidth + p.qrsNoise * this.rng.normal()),
      conductionRatio: Math.min(
        1,
        Math.max(0, model.conduction.conductionRatio + 0.05 * this.rng.normal()),
      ),
      atrialRate: 60 / Math.min(Math.max(model.conduction.lastAtrialInterval, 0.25), 6),
      pacingOn: pacing.mode !== 'off',
      pacingOutputMa: pacing.outputMa,
      pacingRate: pacing.rate,
      apparentCapture,
      atropineTotalMg: ctx.atropineTotalMg,
      secondsSinceAtropine: Math.min(ctx.secondsSinceAtropine, 3600),
      atropineEffectRealised: ctx.atropineEffectRealised,
      dopamineRate: ctx.dopamineRate,
      epinephrineRate: ctx.epinephrineRate,
      isoproterenolRate: ctx.isoproterenolRate,
      elapsedSeconds: t - ctx.episodeStart,
      knownDenervated: ctx.knownDenervated,
      knownInfranodal: ctx.knownInfranodal,
      ageYears: ctx.ageYears,
      weightKg: ctx.weightKg,
    };
  }

  /** Fraction of delivered pacing stimuli that produced real ejection. */
  get trueCaptureFraction(): number {
    return this.pacedBeats === 0 ? 0 : this.capturedBeats / this.pacedBeats;
  }

  resetCaptureCounters(): void {
    this.capturedBeats = 0;
    this.pacedBeats = 0;
  }
}
