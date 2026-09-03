/**
 * Program A: closed-loop chronotropic rescue.
 *
 * The clinical problem. A patient is bradycardic and haemodynamically
 * compromised. The controller has a muscarinic antagonist, three adrenergic
 * infusions and a transcutaneous pacemaker, and must restore and hold
 * perfusion. What makes this a genuine control problem rather than a lookup
 * table is that the single most important fact - where in the conduction
 * system the lesion sits - is not directly observable. It has to be inferred
 * from the rate, the beat-to-beat variability, the QRS width, the conducted
 * fraction, and above all from how the patient responded to what was already
 * given. And the response takes seven to eight minutes to appear, while the
 * guideline permits re-dosing every three.
 *
 * Decision interval is thirty seconds and the horizon is forty-five minutes,
 * which is the window in which this is actually decided at the bedside.
 */

import { CardiacModel } from '../engine/model.ts';
import { PACING_OFF, type PacingConfig } from '../engine/conduction.ts';
import { DRUGS } from '../engine/pharmacology.ts';
import { SensorSuite, WEARABLE_SENSORS, CRITICAL_CARE_SENSORS, type SensorParams, type Observation } from '../engine/sensors.ts';
import { Rng } from '../engine/rng.ts';
import type { VirtualSubject } from '../engine/patient.ts';
import { PHENOTYPE_BY_ID } from '../engine/patient.ts';
import { encode, N_FEATURES, type Environment, type StepResult } from './common.ts';
import { ShieldLog, type ShieldDecision } from './shield.ts';

export const ACTIONS = [
  'observe',
  'atropine 0.5 mg',
  'atropine 1.0 mg',
  'start pacing',
  'pacing output +20 mA',
  'pacing rate +10',
  'stop pacing',
  'dopamine +5 mcg/kg/min',
  'dopamine -5 mcg/kg/min',
  'epinephrine +2 mcg/min',
  'epinephrine -2 mcg/min',
  'isoproterenol +2 mcg/min',
  'isoproterenol -2 mcg/min',
] as const;

export const A_OBSERVE = 0;
export const A_ATROPINE_HALF = 1;
export const A_ATROPINE_FULL = 2;
export const A_PACE_START = 3;
export const A_PACE_OUTPUT_UP = 4;
export const A_PACE_RATE_UP = 5;
export const A_PACE_STOP = 6;
export const A_DOPA_UP = 7;
export const A_DOPA_DOWN = 8;
export const A_EPI_UP = 9;
export const A_EPI_DOWN = 10;
export const A_ISO_UP = 11;
export const A_ISO_DOWN = 12;

/** Clinical targets. */
export const MAP_TARGET_LOW = 65;
export const MAP_TARGET_HIGH = 110;
export const MAP_SEVERE = 50;
export const HR_TARGET_LOW = 50;
export const HR_TARGET_HIGH = 110;
export const HR_EXCESS = 120;
/**
 * Control set point for the closed-loop performance metrics, mmHg.
 *
 * The physiologic closed-loop control standard asks for response time,
 * settling time, relative overshoot, steady-state deviation and tracking
 * error, all of which are defined against a set point rather than against a
 * band. Eighty is used because it sits comfortably inside the acceptable
 * range and above the sixty-five threshold at which organ injury accumulates.
 */
export const MAP_SETPOINT = 80;

export interface ChronotropicOptions {
  /** Seconds between decisions. */
  controlInterval?: number;
  /** Episode duration, s. */
  horizon?: number;
  sensors?: SensorParams;
  /**
   * Design mode uses a coarser integration step and omits the rare
   * catastrophic hazards, so that training is tractable and the policy is not
   * shaped by events it can neither predict nor influence. Evaluation mode
   * runs the full-fidelity model with every hazard enabled. The closed-loop
   * control guidance asks that the model used to design a controller and the
   * model used to evaluate it be distinct and separately assessed; this flag
   * is where that separation is implemented.
   */
  mode?: 'design' | 'evaluation';
  /** Apply the deterministic safety shield to proposed actions. */
  useShield?: boolean;
}

export interface EpisodeMetrics {
  /** Fraction of episode time with mean arterial pressure in target. */
  timeInTarget: number;
  /** Time-weighted average pressure below 65, mmHg. */
  twaBelow65: number;
  /** Time-weighted average pressure below 55, mmHg. */
  twaBelow55: number;
  /** Cumulative seconds with mean arterial pressure under 55. */
  secondsUnder55: number;
  /** Fraction of episode with heart rate at or above 50. */
  timeRateAdequate: number;
  /** Fraction of episode with heart rate above 120. */
  timeTachycardic: number;
  /** Total atropine administered, mg. */
  atropineMg: number;
  /** Fraction of the episode spent pacing. */
  pacingFraction: number;
  /** Fraction of delivered pacing stimuli that produced real ejection. */
  captureFraction: number;
  /** Peak infusion rates reached. */
  peakDopamine: number;
  peakEpinephrine: number;
  peakIsoproterenol: number;
  /** Seconds from episode start until pressure first held above 65 for 120 s. */
  timeToStability: number;
  /** True if the subject arrested. */
  arrest: boolean;
  /** True if an atropine-induced conduction collapse occurred. */
  atropineCollapse: boolean;
  /**
   * Response at thirty minutes: pressure at or above 65 and rate at or above
   * 50 without an increase in support in the preceding five minutes.
   */
  respondedAt30Min: boolean;
  /** Number of times the shield corrected the policy. */
  shieldInterventions: number;
  steps: number;

  /*
   * Closed-loop control performance, in the terms the physiologic
   * closed-loop control standard uses. These are reported alongside the
   * clinical endpoints because they are what a device reviewer assesses a
   * controller against, and because a controller can look good on
   * time-in-range while oscillating badly.
   */
  /** Seconds until the pressure first reaches the set point band, or -1. */
  responseTime: number;
  /** Seconds until it enters that band and stays there, or -1. */
  settlingTime: number;
  /** Largest excursion above the set point after first reaching it, mmHg. */
  overshoot: number;
  /** Mean signed deviation from the set point over the final ten minutes. */
  steadyStateDeviation: number;
  /** Root mean square deviation from the set point over the episode. */
  trackingError: number;
  /** Number of therapy changes; a proxy for control effort and oscillation. */
  therapyChanges: number;
}

/**
 * Baseline screening simulation.
 *
 * Runs a candidate untreated for two minutes and reports the mean arterial
 * pressure and heart rate they present with. Used by the enrolment criterion,
 * and reported as the trial's baseline characteristics.
 */
export function screenSubject(subject: VirtualSubject): { map: number; hr: number } {
  const cfg = { ...subject.cfg, dt: 0.002 };
  const m = new CardiacModel(cfg);
  m.advance(90);
  const dt = cfg.dt;
  const n = Math.round(60 / dt);
  let sumMap = 0;
  let beats = 0;
  let sumRr = 0;
  let last = m.beatCount;
  for (let i = 0; i < n; i++) {
    m.step();
    sumMap += m.map;
    if (m.beatCount !== last) {
      last = m.beatCount;
      beats++;
      sumRr += 60 / Math.max(m.heartRate, 1);
    }
  }
  return { map: sumMap / n, hr: beats > 0 ? 60 / (sumRr / beats) : 0 };
}

export class ChronotropicEnv implements Environment {
  readonly nActions = ACTIONS.length;
  readonly nObs = N_FEATURES;
  readonly actionLabels = ACTIONS;

  readonly subject: VirtualSubject;
  readonly controlInterval: number;
  readonly horizon: number;
  readonly mode: 'design' | 'evaluation';
  readonly useShield: boolean;

  model!: CardiacModel;
  sensors!: SensorSuite;
  pacing!: PacingConfig;
  shieldLog = new ShieldLog();

  private rng: Rng;
  private sensorParams: SensorParams;
  private obsBuf = new Float64Array(N_FEATURES);
  /** The most recent observation, also used by the guideline comparator. */
  lastObservation!: Observation;
  private episodeStart = 0;
  private stepIndex = 0;
  private lastAtropineTime = -1e9;
  private secondsUnder50 = 0;
  private dopamine = 0;
  private epinephrine = 0;
  private isoproterenol = 0;
  private lastEscalationTime = -1e9;
  private stableSince = -1;

  /** Accumulated episode metrics. */
  private acc = {
    inTarget: 0, below65: 0, below55: 0, under55: 0, rateOk: 0, tachy: 0,
    pacing: 0, total: 0, timeToStability: -1, peakDopa: 0, peakEpi: 0, peakIso: 0,
    responseTime: -1, settlingTime: -1, inBandSince: -1, overshoot: 0,
    sqErr: 0, sqN: 0, tailErr: 0, tailN: 0, changes: 0,
  };

  constructor(subject: VirtualSubject, opts: ChronotropicOptions = {}) {
    this.subject = subject;
    this.controlInterval = opts.controlInterval ?? 30;
    this.horizon = opts.horizon ?? 2700;
    this.mode = opts.mode ?? 'evaluation';
    this.useShield = opts.useShield ?? true;
    this.sensorParams = opts.sensors ?? (this.mode === 'design' ? CRITICAL_CARE_SENSORS : WEARABLE_SENSORS);
    this.rng = new Rng(subject.seed ^ 0x5bf03635);
  }

  reset(): Float64Array {
    const cfg = { ...this.subject.cfg };
    cfg.circulation = { ...this.subject.cfg.circulation };
    // The design model runs at a coarser step; the grid-refinement study
    // shows the difference in every reported quantity is under a tenth of a
    // per cent, but the two are nonetheless separate models by construction.
    cfg.dt = this.mode === 'design' ? 0.002 : 0.001;
    if (this.mode === 'design') {
      // Hazards that a policy can neither anticipate nor influence are
      // withheld from training and retained for evaluation.
      cfg.conduction = { ...cfg.conduction, atropineCollapseRisk: 0 };
    }
    this.model = new CardiacModel(cfg);
    this.sensors = new SensorSuite(this.sensorParams, this.rng);
    this.pacing = { ...PACING_OFF, captureThresholdMa: this.subject.captureThresholdMa };
    this.shieldLog = new ShieldLog();
    this.stepIndex = 0;
    this.lastAtropineTime = -1e9;
    this.secondsUnder50 = 0;
    this.dopamine = 0;
    this.epinephrine = 0;
    this.isoproterenol = 0;
    this.lastEscalationTime = -1e9;
    this.stableSince = -1;
    this.acc = {
      inTarget: 0, below65: 0, below55: 0, under55: 0, rateOk: 0, tachy: 0,
      pacing: 0, total: 0, timeToStability: -1, peakDopa: 0, peakEpi: 0, peakIso: 0,
      responseTime: -1, settlingTime: -1, inBandSince: -1, overshoot: 0,
      sqErr: 0, sqN: 0, tailErr: 0, tailN: 0, changes: 0,
    };

    // Settle the subject into their presenting state before the clock starts.
    const settle = Math.round(75 / cfg.dt);
    for (let i = 0; i < settle; i++) {
      this.model.step(this.pacing, {});
      this.sensors.update(this.model);
    }
    this.episodeStart = this.model.t;
    this.lastObservation = this.buildObservation();
    return encode(this.lastObservation, this.obsBuf);
  }

  buildObservation(): Observation {
    const ph = PHENOTYPE_BY_ID[this.subject.phenotype];
    return this.sensors.observe(this.model, this.pacing, {
      atropineTotalMg: this.model.drugs.atropine.cumulative,
      secondsSinceAtropine: this.model.t - this.lastAtropineTime,
      atropineEffectRealised: this.atropineEffectRealised(),
      dopamineRate: this.dopamine,
      epinephrineRate: this.epinephrine,
      isoproterenolRate: this.isoproterenol,
      episodeStart: this.episodeStart,
      // Charted context. Denervation is known from the transplant history.
      // Infranodal disease is charted when the presenting complex is wide or
      // the block has been localised, which is the realistic level of
      // knowledge - not the model's internal ground truth.
      knownDenervated: ph.lesion === 'denervated',
      knownInfranodal: ph.lesion === 'infranodal' && this.model.conduction.lastQrsWidth > 0.12,
      ageYears: this.subject.ageYears,
      weightKg: this.subject.weightKg,
    });
  }

  /**
   * Fraction of the administered atropine whose chronotropic effect has
   * already been expressed, from the device's own kinetic model. The
   * complement of this number is drug that has been given but has not yet
   * acted, which is the quantity the closed-loop guidance requires a
   * controller to account for before giving more.
   */
  private atropineEffectRealised(): number {
    const s = this.model.drugs.atropine;
    if (s.cumulative <= 0) return 1;
    // Effect-site concentration relative to plasma. While drug is still
    // equilibrating into the effect compartment this ratio is well below one,
    // and that shortfall is exactly the drug that has been delivered but not
    // yet acted. Once the effect has peaked the ratio reaches one and stays
    // there as both decline together.
    const cp = s.a1 / DRUGS.atropine.v1;
    const denom = Math.max(s.ce, cp);
    return denom <= 1e-9 ? 1 : Math.min(1, s.ce / denom);
  }

  /**
   * The deterministic safety shield. Returns the action that will actually be
   * executed together with the rule that fired, if any.
   */
  shield(proposed: number, o: Observation): ShieldDecision {
    const s = this.subject;
    const total = this.model.drugs.atropine.cumulative;
    const sinceDose = this.model.t - this.lastAtropineTime;
    const ischaemicCap = 0.04 * s.weightKg;
    const isAtropine = proposed === A_ATROPINE_HALF || proposed === A_ATROPINE_FULL;

    // S8 takes precedence over everything: sustained severe hypotension with
    // no pharmacological option left forces escalation to pacing.
    const pharmExhausted =
      total >= 3 - 1e-9 || o.knownDenervated || o.knownInfranodal;
    if (
      this.secondsUnder50 > 60 &&
      !o.pacingOn &&
      pharmExhausted
    ) {
      return { action: A_PACE_START, intervened: proposed !== A_PACE_START, rule: 'S8-mandatory-escalation' };
    }

    if (isAtropine) {
      if (o.knownDenervated) {
        return { action: A_PACE_START, intervened: true, rule: 'S1-denervated-atropine' };
      }
      if (o.knownInfranodal) {
        return { action: A_PACE_START, intervened: true, rule: 'S6-infranodal-atropine' };
      }
      // S2 is enforced by construction: the smallest atropine action in the
      // action space is 0.5 mg, so a sub-threshold dose cannot be proposed.
      if (sinceDose < 180) {
        return { action: A_OBSERVE, intervened: true, rule: 'S3-dose-interval' };
      }
      const dose = proposed === A_ATROPINE_FULL ? 1.0 : 0.5;
      if (total + dose > 3 + 1e-9) {
        return { action: A_OBSERVE, intervened: true, rule: 'S4-cumulative-limit' };
      }
      if (s.ischaemic && total + dose > ischaemicCap) {
        return { action: A_OBSERVE, intervened: true, rule: 'S5-ischaemic-limit' };
      }
      if (o.heartRate >= 60 && o.map >= MAP_TARGET_LOW) {
        return { action: A_OBSERVE, intervened: true, rule: 'S7-no-indication' };
      }
    }

    if (proposed === A_PACE_OUTPUT_UP && this.pacing.outputMa >= 140) {
      return { action: A_OBSERVE, intervened: true, rule: 'S9-output-limit' };
    }
    if (proposed === A_DOPA_UP && this.dopamine >= 20) {
      return { action: A_OBSERVE, intervened: true, rule: 'S10-infusion-limits' };
    }
    if (proposed === A_EPI_UP && this.epinephrine >= 10) {
      return { action: A_OBSERVE, intervened: true, rule: 'S10-infusion-limits' };
    }
    if (proposed === A_ISO_UP && this.isoproterenol >= 10) {
      return { action: A_OBSERVE, intervened: true, rule: 'S10-infusion-limits' };
    }

    return { action: proposed, intervened: false, rule: null };
  }

  /** A compact signature of the current therapy state, for change detection. */
  private therapySignature(): string {
    return `${this.pacing.mode}:${this.pacing.rate}:${this.pacing.outputMa}:` +
      `${this.dopamine}:${this.epinephrine}:${this.isoproterenol}:` +
      `${this.model.drugs.atropine.cumulative}`;
  }

  /** Apply an action to the therapy state. */
  private apply(action: number): void {
    const before = this.therapySignature();
    switch (action) {
      case A_ATROPINE_HALF:
        this.model.giveAtropine(0.5, 'iv');
        this.lastAtropineTime = this.model.t;
        this.lastEscalationTime = this.model.t;
        break;
      case A_ATROPINE_FULL:
        this.model.giveAtropine(1.0, 'iv');
        this.lastAtropineTime = this.model.t;
        this.lastEscalationTime = this.model.t;
        break;
      case A_PACE_START:
        if (this.pacing.mode === 'off') {
          this.pacing = {
            ...this.pacing,
            mode: 'VVI',
            rate: 70,
            outputMa: 60,
            transcutaneous: true,
          };
          this.lastEscalationTime = this.model.t;
        }
        break;
      case A_PACE_OUTPUT_UP:
        if (this.pacing.mode !== 'off') {
          this.pacing = { ...this.pacing, outputMa: Math.min(140, this.pacing.outputMa + 20) };
          this.lastEscalationTime = this.model.t;
        }
        break;
      case A_PACE_RATE_UP:
        if (this.pacing.mode !== 'off') {
          this.pacing = { ...this.pacing, rate: Math.min(100, this.pacing.rate + 10) };
        }
        break;
      case A_PACE_STOP:
        this.pacing = { ...this.pacing, mode: 'off', outputMa: 0 };
        break;
      case A_DOPA_UP:
        this.dopamine = Math.min(20, this.dopamine === 0 ? 5 : this.dopamine + 5);
        this.lastEscalationTime = this.model.t;
        break;
      case A_DOPA_DOWN:
        this.dopamine = Math.max(0, this.dopamine - 5);
        break;
      case A_EPI_UP:
        this.epinephrine = Math.min(10, this.epinephrine === 0 ? 2 : this.epinephrine + 2);
        this.lastEscalationTime = this.model.t;
        break;
      case A_EPI_DOWN:
        this.epinephrine = Math.max(0, this.epinephrine - 2);
        break;
      case A_ISO_UP:
        this.isoproterenol = Math.min(10, this.isoproterenol === 0 ? 2 : this.isoproterenol + 2);
        this.lastEscalationTime = this.model.t;
        break;
      case A_ISO_DOWN:
        this.isoproterenol = Math.max(0, this.isoproterenol - 2);
        break;
      default:
        break;
    }
    // Only count adjustments that actually changed the therapy. An action
    // that raises an infusion already at its ceiling, or lowers one that is
    // not running, is a no-op, and counting it would report oscillation that
    // the patient never experienced.
    if (this.therapySignature() !== before) this.acc.changes++;
    this.acc.peakDopa = Math.max(this.acc.peakDopa, this.dopamine);
    this.acc.peakEpi = Math.max(this.acc.peakEpi, this.epinephrine);
    this.acc.peakIso = Math.max(this.acc.peakIso, this.isoproterenol);
  }

  /*
   * A control interval is split into three phases - begin, advance, end - so
   * that the same code can be driven either in whole intervals (training and
   * the trial) or a few milliseconds at a time (the live display). There is
   * one implementation of the therapy logic, the shield and the reward, and
   * every consumer runs it.
   */
  private pendingDecision: { action: number; intervened: boolean; rule: string | null } | null = null;
  private intervalElapsed = 0;
  private intervalAcc = { below65: 0, below55: 0, inTarget: 0, rateOk: 0, tachy: 0 };

  /** Apply the shield to a proposed action and begin a control interval. */
  beginInterval(proposed: number): { action: number; intervened: boolean; rule: string | null } {
    const o = this.lastObservation;
    const decision = this.useShield
      ? this.shield(proposed, o)
      : { action: proposed, intervened: false, rule: null };
    this.shieldLog.record(decision.rule);
    this.apply(decision.action);
    this.pendingDecision = decision;
    this.intervalElapsed = 0;
    this.intervalAcc = { below65: 0, below55: 0, inTarget: 0, rateOk: 0, tachy: 0 };
    return decision;
  }

  /**
   * Advance physiology by at most `seconds` within the current interval.
   * Returns true once the interval is complete.
   */
  advanceInterval(seconds: number): boolean {
    const dt = this.model.cfg.dt;
    const remaining = this.controlInterval - this.intervalElapsed;
    const span = Math.min(seconds, remaining);
    const n = Math.max(0, Math.round(span / dt));
    const infusions = {
      dopamine: this.dopamine,
      epinephrine: this.epinephrine,
      isoproterenol: this.isoproterenol,
    };
    const a = this.intervalAcc;

    for (let i = 0; i < n; i++) {
      this.model.step(this.pacing, infusions);
      this.sensors.update(this.model);
      const map = this.model.map;
      const hr = this.model.heartRate;
      if (map < 65) a.below65 += (65 - map) * dt;
      if (map < 55) {
        a.below55 += (55 - map) * dt;
        this.acc.under55 += dt;
      }
      if (map < MAP_SEVERE) this.secondsUnder50 += dt;
      else this.secondsUnder50 = Math.max(0, this.secondsUnder50 - dt * 2);
      if (map >= MAP_TARGET_LOW && map <= MAP_TARGET_HIGH) a.inTarget += dt;
      if (hr >= HR_TARGET_LOW) a.rateOk += dt;
      if (hr > HR_EXCESS) a.tachy += dt;
      if (this.pacing.mode !== 'off') this.acc.pacing += dt;

      // Closed-loop control performance against the set point.
      const err = map - MAP_SETPOINT;
      this.acc.sqErr += err * err * dt;
      this.acc.sqN += dt;
      const elapsedNow = this.model.t - this.episodeStart;
      if (elapsedNow >= this.horizon - 600) {
        this.acc.tailErr += err * dt;
        this.acc.tailN += dt;
      }
      const inBand = Math.abs(err) <= 8;
      if (inBand && this.acc.responseTime < 0) this.acc.responseTime = elapsedNow;
      if (inBand) {
        if (this.acc.inBandSince < 0) this.acc.inBandSince = elapsedNow;
        if (this.acc.settlingTime < 0 && elapsedNow - this.acc.inBandSince >= 300) {
          this.acc.settlingTime = this.acc.inBandSince;
        }
      } else {
        this.acc.inBandSince = -1;
      }
      if (this.acc.responseTime >= 0 && err > this.acc.overshoot) this.acc.overshoot = err;
    }

    this.intervalElapsed += n * dt;
    return this.intervalElapsed >= this.controlInterval - dt * 0.5;
  }

  /** Close the interval, score it, and produce the next observation. */
  endInterval(): StepResult {
    const decision = this.pendingDecision ?? { action: A_OBSERVE, intervened: false, rule: null };
    const a = this.intervalAcc;
    const interval = this.controlInterval;

    this.acc.inTarget += a.inTarget;
    this.acc.below65 += a.below65;
    this.acc.below55 += a.below55;
    this.acc.rateOk += a.rateOk;
    this.acc.tachy += a.tachy;
    this.acc.total += interval;

    // Time to stability: pressure and rate held adequate for two minutes.
    if (this.model.map >= MAP_TARGET_LOW && this.model.heartRate >= HR_TARGET_LOW) {
      if (this.stableSince < 0) this.stableSince = this.model.t;
      if (this.acc.timeToStability < 0 && this.model.t - this.stableSince >= 120) {
        this.acc.timeToStability = this.stableSince - this.episodeStart;
      }
    } else {
      this.stableSince = -1;
    }

    const atropineGiven =
      decision.action === A_ATROPINE_FULL ? 1.0 : decision.action === A_ATROPINE_HALF ? 0.5 : 0;

    /*
     * Reward.
     *
     * Every term is a clinical quantity, scaled so that one interval of
     * perfect control is worth about one unit. The two hypotension terms use
     * time-weighted average pressure below threshold, which is the exposure
     * measure with a published dose-response to acute kidney and myocardial
     * injury, rather than a simple out-of-range indicator: a pressure of 40
     * for a minute is not equivalent to 64 for a minute, and a reward that
     * treats them alike produces a controller that tolerates profound
     * hypotension.
     */
    const twa65 = a.below65 / interval;
    const twa55 = a.below55 / interval;
    let reward =
      1.0 * (a.inTarget / interval) +
      0.35 * (a.rateOk / interval) -
      0.16 * twa65 -
      0.28 * twa55 -
      0.5 * (a.tachy / interval) -
      0.35 * atropineGiven -
      0.04 * (this.pacing.mode !== 'off' ? 1 : 0) -
      0.02 * (this.dopamine / 5 + this.epinephrine / 2 + this.isoproterenol / 2);

    // The shield firing means the policy proposed something the constraints
    // had to correct. A small penalty teaches the policy the constraints
    // rather than leaving it to lean on the shield.
    if (decision.intervened) reward -= 0.15;

    this.stepIndex++;
    const elapsed = this.model.t - this.episodeStart;
    let done = elapsed >= this.horizon - 1e-9;

    if (this.model.arrested) {
      reward -= 25;
      done = true;
    } else if (done) {
      if (this.model.map >= MAP_TARGET_LOW && this.model.heartRate >= HR_TARGET_LOW) reward += 4;
    }

    this.lastObservation = this.buildObservation();
    this.pendingDecision = null;
    return {
      obs: encode(this.lastObservation, this.obsBuf),
      observation: this.lastObservation,
      reward,
      done,
      shieldIntervened: decision.intervened,
      shieldRule: decision.rule,
      executedAction: decision.action,
    };
  }

  /** One whole control interval. */
  step(proposed: number): StepResult {
    this.beginInterval(proposed);
    while (!this.advanceInterval(this.controlInterval)) {
      /* advance in one call; the loop guards against rounding */
    }
    return this.endInterval();
  }

  /** The encoded feature vector for the current observation. */
  currentFeatures(): Float64Array {
    return encode(this.lastObservation, this.obsBuf);
  }

  /** Episode time elapsed, s. */
  get elapsed(): number {
    return this.model.t - this.episodeStart;
  }

  /** Fraction of the current control interval already simulated. */
  get intervalProgress(): number {
    return this.intervalElapsed / this.controlInterval;
  }

  metrics(): EpisodeMetrics {
    const t = Math.max(this.acc.total, 1e-9);
    const respondedAt30 =
      this.model.map >= MAP_TARGET_LOW &&
      this.model.heartRate >= HR_TARGET_LOW &&
      this.model.t - this.lastEscalationTime >= 300;
    return {
      timeInTarget: this.acc.inTarget / t,
      twaBelow65: this.acc.below65 / t,
      twaBelow55: this.acc.below55 / t,
      secondsUnder55: this.acc.under55,
      timeRateAdequate: this.acc.rateOk / t,
      timeTachycardic: this.acc.tachy / t,
      atropineMg: this.model.drugs.atropine.cumulative,
      pacingFraction: this.acc.pacing / t,
      captureFraction: this.sensors.trueCaptureFraction,
      peakDopamine: this.acc.peakDopa,
      peakEpinephrine: this.acc.peakEpi,
      peakIsoproterenol: this.acc.peakIso,
      timeToStability: this.acc.timeToStability,
      arrest: this.model.arrested,
      atropineCollapse: this.model.atropineCollapse,
      respondedAt30Min: respondedAt30,
      shieldInterventions: this.shieldLog.total,
      steps: this.stepIndex,
      responseTime: this.acc.responseTime,
      settlingTime: this.acc.settlingTime,
      overshoot: this.acc.overshoot,
      steadyStateDeviation: this.acc.tailN > 0 ? this.acc.tailErr / this.acc.tailN : Number.NaN,
      trackingError: this.acc.sqN > 0 ? Math.sqrt(this.acc.sqErr / this.acc.sqN) : Number.NaN,
      therapyChanges: this.acc.changes,
    };
  }
}
