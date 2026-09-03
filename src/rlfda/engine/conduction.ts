/**
 * Cardiac conduction system: sinus node, AV node, His-Purkinje, escape foci
 * and artificial pacing.
 *
 * This module is the clinical heart of the platform. The therapeutic question
 * the reinforcement-learning agents face - when does a muscarinic antagonist
 * help, when is it useless, and when does it make things worse - is decided
 * entirely by *where* in the conduction system the lesion sits. That
 * behaviour is not scripted here. It emerges from three mechanisms:
 *
 *  1. **The sinus node and the AV node are vagally innervated; the
 *     His-Purkinje system is not.** Atropine acts by blocking muscarinic
 *     receptors, so it accelerates the sinus node and facilitates AV nodal
 *     conduction, and does nothing whatsoever below the node.
 *
 *  2. **AV nodal conduction follows a recovery curve.** Conduction time is a
 *     decaying exponential function of the recovery interval, so as the
 *     atrial rate rises the PR interval lengthens until a beat lands in the
 *     effective refractory period and is dropped. Wenckebach periodicity is
 *     therefore an emergent property, not a special case.
 *
 *  3. **Infranodal block is rate dependent.** Conduction through diseased
 *     His-Purkinje tissue fails *more* often at faster input rates
 *     (phase-3 block). Speeding the atria with atropine in a Mobitz II or
 *     infranodal complete block therefore increases the block ratio, and the
 *     ventricular rate can fall. This is the documented harm mechanism, and
 *     in this model it falls out of the same equations that produce the
 *     benefit in nodal disease.
 *
 * References for the structural choices are recorded in the model
 * credibility record; the AV nodal recovery formalism follows the classical
 * exponential recovery-curve description of AV nodal function.
 */

import { Rng } from './rng.ts';

export type AvBlockDegree = 'none' | 'first' | 'second_type_i' | 'second_type_ii' | 'third';
export type ConductionSite = 'nodal' | 'infranodal';
export type EscapeFocus = 'junctional' | 'ventricular' | 'none';
export type ActivationSource =
  | 'sinus'
  | 'conducted'
  | 'junctional_escape'
  | 'ventricular_escape'
  | 'paced'
  | 'atrial_paced';

export interface ConductionParams {
  /** Intrinsic (fully denervated) sinus rate, bpm. */
  intrinsicSinusRate: number;
  /** Sinus node disease severity in [0, 1]; scales rate and responsiveness. */
  sinusNodeDysfunction: number;
  avBlockDegree: AvBlockDegree;
  /** Anatomical level of the block; decides vagal (and atropine) sensitivity. */
  avBlockSite: ConductionSite;
  escapeFocus: EscapeFocus;
  /** Intrinsic escape rate, bpm. */
  escapeRate: number;
  /** How much the escape focus responds to autonomic tone, in [0, 1]. */
  escapeAutonomicSensitivity: number;
  /** Cardiac denervation (transplant): no vagal or direct sympathetic effect. */
  denervated: boolean;
  /**
   * Resting vagal tone at the sinus and AV nodes, relative to normal.
   *
   * This is the parameter that makes a patient vagally bradycardic, and it is
   * therefore also the parameter that decides how much rate a muscarinic
   * antagonist can recover. A patient whose slow rate is entirely vagal has
   * everything to gain from atropine; a patient whose sinus node is
   * intrinsically diseased has little, even though the two look identical on
   * a rhythm strip.
   */
  restingVagalTone: number;
  /**
   * Probability that atropine precipitates conduction collapse in a
   * denervated heart.
   *
   * In transplant recipients atropine has been observed to produce complete
   * atrioventricular block or sinus arrest - in the reported series, in one
   * in five patients, with no ventricular escape appearing within ten seconds
   * in four of the five affected, and with no relationship to dose and no
   * identifiable predictor. The corresponding guideline
   * recommendation is Class III: Harm.
   *
   * It is modelled as a genuinely unpredictable event because that is what
   * the evidence says it is. A controller cannot learn to titrate around it;
   * the only safe policy is never to give the drug to this patient, which is
   * exactly what the safety shield enforces.
   */
  atropineCollapseRisk: number;
  /** Minimum AV nodal conduction time, s (the A term of the recovery curve). */
  avMinDelay: number;
  /** Amplitude of the recovery-curve exponential, s (the B term). */
  avRecoveryAmplitude: number;
  /** Time constant of the AV nodal recovery curve, s. */
  avRecoveryTau: number;
  /** AV nodal effective refractory period at neutral autonomic tone, s. */
  avErp: number;
  /** Baseline probability that an impulse traverses the His-Purkinje system. */
  hisConductionProb: number;
  /**
   * Rate sensitivity of infranodal conduction, 1/bpm. Larger values mean the
   * diseased His-Purkinje system fails more steeply as the input rate rises.
   */
  hisRateSensitivity: number;
  /** Standard deviation of beat-to-beat sinus interval noise, fraction. */
  sinusVariability: number;
  /** Respiratory sinus arrhythmia amplitude, fraction of cycle length. */
  rsaAmplitude: number;
  /** QRS duration of a supraventricular beat, s. */
  qrsNarrow: number;
  /** QRS duration of a ventricular-origin beat, s. */
  qrsWide: number;
}

export const BASELINE_CONDUCTION: ConductionParams = {
  intrinsicSinusRate: 100,
  sinusNodeDysfunction: 0,
  avBlockDegree: 'none',
  avBlockSite: 'nodal',
  escapeFocus: 'junctional',
  escapeRate: 45,
  escapeAutonomicSensitivity: 0.45,
  denervated: false,
  restingVagalTone: 1.0,
  atropineCollapseRisk: 0,
  avMinDelay: 0.09,
  avRecoveryAmplitude: 0.35,
  avRecoveryTau: 0.18,
  avErp: 0.28,
  hisConductionProb: 1.0,
  hisRateSensitivity: 0.0,
  sinusVariability: 0.02,
  rsaAmplitude: 0.04,
  qrsNarrow: 0.09,
  qrsWide: 0.15,
};

/** Autonomic and pharmacological inputs to the conduction system. */
export interface ConductionDrive {
  /**
   * Effective vagal tone at the sinus and AV nodes, arbitrary units where 1.0
   * is normal resting tone. Muscarinic blockade by atropine reduces this;
   * the low-dose paradoxical effect increases it.
   */
  vagalTone: number;
  /** Sympathetic tone, 1.0 = normal resting. */
  sympatheticTone: number;
  /** Direct beta-adrenergic chronotropy from circulating drug, unitless. */
  betaChronotropy: number;
  /** Fractional muscarinic receptor blockade in [0, 1]. */
  muscarinicBlockade: number;
  /** Respiratory phase in [0, 1) for respiratory sinus arrhythmia. */
  respiratoryPhase: number;
}

export interface PacingConfig {
  mode: 'off' | 'VVI' | 'DDD' | 'AAI';
  /** Lower rate limit, bpm. */
  rate: number;
  /** Programmed AV delay for DDD, s. */
  avDelay: number;
  /** Transcutaneous output current, mA (0 for an implanted lead). */
  outputMa: number;
  /** Capture threshold for this subject, mA. */
  captureThresholdMa: number;
  /** True for a transcutaneous system (painful, threshold varies). */
  transcutaneous: boolean;
  /** Upper tracking rate for DDD, bpm. */
  upperRate: number;
}

export const PACING_OFF: PacingConfig = {
  mode: 'off',
  rate: 60,
  avDelay: 0.15,
  outputMa: 0,
  captureThresholdMa: 65,
  transcutaneous: true,
  upperRate: 130,
};

/** One depolarisation event emitted by the conduction system. */
export interface ActivationEvent {
  time: number;
  chamber: 'atrium' | 'ventricle';
  source: ActivationSource;
  /** QRS duration for ventricular events, s. */
  qrsWidth: number;
  /** PR interval for conducted beats, s (NaN otherwise). */
  prInterval: number;
  /** True when a pacing stimulus was delivered but failed to capture. */
  nonCapture: boolean;
}

/**
 * The conduction system as a discrete-event process advanced in lockstep with
 * the continuous haemodynamic integration.
 */
export class ConductionSystem {
  readonly p: ConductionParams;
  private rng: Rng;

  /** Absolute simulation time of the next scheduled sinus depolarisation. */
  nextSinus = 0;
  /** Time of the most recent atrial depolarisation. */
  lastAtrial = -10;
  /** Time of the most recent ventricular depolarisation, any source. */
  lastVentricular = -10;
  /** Time the AV node last conducted (used for the recovery interval). */
  lastAvConduction = -10;
  /** Pending conducted beat scheduled by the AV node, or null. */
  private pendingVentricular: { time: number; pr: number; wide: boolean } | null = null;
  /** Consecutive blocked atrial impulses, for reporting Wenckebach ratios. */
  blockedInARow = 0;
  /** Set once the subject has received any atropine. */
  atropineExposed = false;
  /** Simulation time until which an atropine-induced collapse persists. */
  collapseUntil = -1;
  conductedCount = 0;
  blockedCount = 0;
  paceDeliveredCount = 0;
  paceCaptureCount = 0;

  /** Most recent ventricular cycle length, s. */
  lastVentricularInterval = 60 / 72;
  /** Most recent atrial cycle length, s. */
  lastAtrialInterval = 60 / 72;
  /** QRS width of the most recent ventricular beat, s. */
  lastQrsWidth: number;
  lastSource: ActivationSource = 'sinus';

  constructor(params: ConductionParams, rng: Rng, startTime = 0) {
    this.p = params;
    this.rng = rng;
    this.lastQrsWidth = params.qrsNarrow;
    this.nextSinus = startTime + 60 / Math.max(params.intrinsicSinusRate * 0.72, 20);
  }

  /**
   * Vagal tone actually reaching the nodes: resting tone scaled by the
   * reflex, reduced by muscarinic blockade, and absent altogether in a
   * denervated heart.
   */
  private effectiveVagal(d: ConductionDrive): number {
    if (this.p.denervated) return 0;
    return d.vagalTone * this.p.restingVagalTone * (1 - d.muscarinicBlockade);
  }

  /**
   * Register an atropine dose. Returns true if it precipitated conduction
   * collapse in a denervated heart.
   */
  notifyAtropine(): boolean {
    if (!this.p.denervated || this.atropineExposed) return false;
    this.atropineExposed = true;
    if (this.rng.uniform() < this.p.atropineCollapseRisk) {
      // Complete block with the escape focus suppressed: the pattern reported
      // in transplant recipients, in whom no escape rhythm appeared before
      // pacing was started.
      this.collapseUntil = this.lastVentricular + 45 + this.rng.range(0, 135);
      return true;
    }
    return false;
  }

  /** True while an atropine-induced conduction collapse is in force. */
  inCollapse(t: number): boolean {
    return t < this.collapseUntil;
  }

  /**
   * Instantaneous sinus cycle length under the current autonomic state.
   *
   * The intrinsic rate is modulated multiplicatively by vagal and sympathetic
   * tone. Vagal effect is scaled by (1 - muscarinic blockade), which is the
   * single mechanism by which atropine accelerates the sinus node. A
   * denervated heart has no neural modulation at all and responds only to
   * circulating catecholamines.
   */
  sinusCycleLength(d: ConductionDrive): number {
    const p = this.p;
    const intrinsic = p.intrinsicSinusRate * (1 - 0.45 * p.sinusNodeDysfunction);
    let rate: number;
    if (p.denervated) {
      rate = intrinsic * (1 + 0.55 * d.betaChronotropy);
    } else {
      const vagal = this.effectiveVagal(d) * (1 - 0.5 * p.sinusNodeDysfunction);
      const symp = d.sympatheticTone * (1 - 0.35 * p.sinusNodeDysfunction);
      // Vagal slowing is the dominant resting influence: it takes the ~100 bpm
      // intrinsic rate down to a resting ~70 bpm at unit tone.
      rate = intrinsic * (1 + 0.30 * (symp - 1) + 0.55 * d.betaChronotropy) / (1 + 0.42 * vagal);
    }
    rate = Math.min(Math.max(rate, 15), 190);
    return 60 / rate;
  }

  /** AV nodal effective refractory period under current tone, s. */
  private erp(d: ConductionDrive): number {
    if (this.p.avBlockSite === 'infranodal') return this.p.avErp;
    const vagal = this.effectiveVagal(d);
    const symp = this.p.denervated ? 1 : d.sympatheticTone;
    return this.p.avErp * (1 + 0.32 * vagal - 0.18 * (symp - 1) - 0.25 * d.betaChronotropy);
  }

  /**
   * AV nodal conduction time for an impulse arriving after recovery interval
   * `h` seconds, or null if the impulse is blocked in the node.
   */
  private avNodalConduction(h: number, d: ConductionDrive, t: number): number | null {
    const p = this.p;
    if (this.inCollapse(t)) return null;
    if (p.avBlockDegree === 'third' && p.avBlockSite === 'nodal') return null;
    const erp = this.erp(d);
    if (h < erp) return null;
    const vagal = this.effectiveVagal(d);
    const symp = p.denervated ? 1 : d.sympatheticTone;
    // Vagal tone slows nodal conduction; sympathetic tone and beta-agonists
    // speed it. Blocking muscarinic receptors therefore shortens PR.
    const toneScale = 1 + 0.45 * vagal - 0.2 * (symp - 1) - 0.3 * d.betaChronotropy;
    const base = p.avMinDelay * Math.max(toneScale, 0.4);
    const recovery = p.avRecoveryAmplitude * Math.exp(-(h - erp) / p.avRecoveryTau);
    let pr = base + recovery * Math.max(toneScale, 0.4);
    if (p.avBlockDegree === 'first') pr += 0.12;
    if (p.avBlockDegree === 'second_type_i') pr += 0.06;
    return pr;
  }

  /**
   * Probability that an impulse emerging from the AV node traverses the
   * His-Purkinje system. Diseased infranodal tissue conducts *worse* at
   * higher input rates, which is the mechanism by which sinus acceleration
   * increases the degree of infranodal block.
   */
  private hisConductionProbability(atrialRateBpm: number): number {
    const p = this.p;
    if (p.avBlockDegree === 'third' && p.avBlockSite === 'infranodal') return 0;
    if (p.hisConductionProb >= 1 && p.hisRateSensitivity === 0) return 1;
    const excess = Math.max(0, atrialRateBpm - 60);
    const prob = p.hisConductionProb - p.hisRateSensitivity * excess;
    return Math.min(Math.max(prob, 0), 1);
  }

  /** Escape focus cycle length, s, or Infinity when there is no escape focus. */
  escapeCycleLength(d: ConductionDrive, t = 0): number {
    const p = this.p;
    if (p.escapeFocus === 'none') return Infinity;
    // During an atropine-induced collapse the subsidiary pacemakers are
    // suppressed too, which is why the reported episodes produced no escape
    // rhythm and required immediate pacing.
    if (this.inCollapse(t)) return Infinity;
    const s = p.escapeAutonomicSensitivity;
    const vagal = p.denervated ? 0 : d.vagalTone * (1 - d.muscarinicBlockade);
    const symp = p.denervated ? 1 : d.sympatheticTone;
    // Subsidiary pacemakers are tonically suppressed by vagal activity and
    // accelerated by adrenergic drive. Removing vagal tone therefore speeds a
    // junctional escape focus, which is why atropine can help in complete
    // block with a narrow escape even though conduction never resumes - and
    // why it cannot help when the focus is ventricular, since the escape
    // sensitivity of that tissue is near zero.
    const modulation =
      1 + s * (0.5 * (symp - 1) + 0.9 * d.betaChronotropy) - s * 0.5 * (vagal - 1);
    const rate = Math.min(Math.max(p.escapeRate * Math.max(modulation, 0.5), 10), 130);
    return 60 / rate;
  }

  /**
   * Advance the conduction system over [t, t + dt] and return the events that
   * occurred. `dt` is the haemodynamic integration step, so at most one event
   * per chamber can occur per call at any physiological rate.
   */
  step(t: number, dt: number, d: ConductionDrive, pacing: PacingConfig): ActivationEvent[] {
    const events: ActivationEvent[] = [];
    const tEnd = t + dt;
    const p = this.p;

    // --- Atrial pacing (AAI / DDD) ---------------------------------------
    if (pacing.mode === 'AAI' || pacing.mode === 'DDD') {
      const paceInterval = 60 / pacing.rate;
      if (tEnd - this.lastAtrial >= paceInterval && this.nextSinus > tEnd) {
        const captured = this.attemptCapture(pacing);
        if (captured) {
          this.emitAtrial(tEnd, 'atrial_paced', events);
          this.nextSinus = tEnd + this.sinusCycleLength(d);
        }
      }
    }

    // --- Sinus node -------------------------------------------------------
    if (this.nextSinus <= tEnd && this.nextSinus > t - dt) {
      const at = Math.max(this.nextSinus, t);
      this.emitAtrial(at, 'sinus', events);
      let cl = this.sinusCycleLength(d);
      // Respiratory sinus arrhythmia is a vagally mediated phenomenon, so it
      // is abolished by muscarinic blockade - a detail that matters because
      // heart-rate variability is one of the observations the agent receives.
      const rsaGain = p.denervated ? 0 : (1 - d.muscarinicBlockade);
      cl *= 1 + p.rsaAmplitude * rsaGain * Math.sin(2 * Math.PI * d.respiratoryPhase);
      cl *= 1 + p.sinusVariability * this.rng.normal();
      this.nextSinus = at + Math.max(cl, 0.28);

      // Try to conduct this atrial impulse to the ventricle.
      const h = at - this.lastAvConduction;
      const pr = this.avNodalConduction(h, d, at);
      if (pr !== null) {
        const atrialRate = 60 / Math.max(this.lastAtrialInterval, 0.2);
        if (this.rng.uniform() < this.hisConductionProbability(atrialRate)) {
          this.pendingVentricular = { time: at + pr, pr, wide: p.avBlockSite === 'infranodal' && p.hisConductionProb < 1 };
          this.lastAvConduction = at;
          this.conductedCount++;
          this.blockedInARow = 0;
        } else {
          this.blockedCount++;
          this.blockedInARow++;
        }
      } else {
        this.blockedCount++;
        this.blockedInARow++;
      }
    }

    // --- Conducted ventricular beat --------------------------------------
    if (this.pendingVentricular && this.pendingVentricular.time <= tEnd) {
      const ev = this.pendingVentricular;
      this.pendingVentricular = null;
      this.emitVentricular(
        Math.max(ev.time, t),
        'conducted',
        ev.wide ? p.qrsWide : p.qrsNarrow,
        ev.pr,
        events,
      );
    }

    // --- Ventricular pacing (VVI / DDD) ----------------------------------
    if (pacing.mode === 'VVI' || pacing.mode === 'DDD') {
      const paceInterval = 60 / pacing.rate;
      let due: boolean;
      if (pacing.mode === 'DDD') {
        // Atrioventricular tracking. When an atrial event - sensed or paced -
        // has not yet been followed by a ventricular event, the ventricle is
        // paced exactly one programmed AV delay after it, subject to the
        // upper rate limit. Only when no atrial event is outstanding does the
        // lower rate limit act as a ventricular backup. Allowing the backup
        // to fire while an atrial event is pending would collapse the AV
        // delay to zero and make the programmed value inert.
        const atrialOutstanding = this.lastAtrial > this.lastVentricular;
        const trackDue =
          atrialOutstanding &&
          tEnd >= this.lastAtrial + pacing.avDelay &&
          tEnd - this.lastVentricular >= 60 / pacing.upperRate;
        const backupDue = !atrialOutstanding && this.lastVentricular + paceInterval <= tEnd;
        due = trackDue || backupDue;
      } else {
        due = this.lastVentricular + paceInterval <= tEnd;
      }
      if (due && this.pendingVentricular === null) {
        const captured = this.attemptCapture(pacing);
        if (captured) {
          this.emitVentricular(tEnd, 'paced', p.qrsWide, NaN, events);
        } else {
          events.push({
            time: tEnd,
            chamber: 'ventricle',
            source: 'paced',
            qrsWidth: 0,
            prInterval: NaN,
            nonCapture: true,
          });
          // A non-capturing stimulus still consumes an interval.
          this.lastVentricular = Math.max(this.lastVentricular, tEnd - paceInterval + 0.06);
        }
      }
    }

    // --- Escape focus -----------------------------------------------------
    const escapeCl = this.escapeCycleLength(d, tEnd);
    if (
      Number.isFinite(escapeCl) &&
      tEnd - this.lastVentricular >= escapeCl &&
      this.pendingVentricular === null
    ) {
      const source: ActivationSource =
        p.escapeFocus === 'junctional' ? 'junctional_escape' : 'ventricular_escape';
      const width = p.escapeFocus === 'junctional' ? p.qrsNarrow : p.qrsWide;
      this.emitVentricular(tEnd, source, width, NaN, events);
    }

    return events;
  }

  private attemptCapture(pacing: PacingConfig): boolean {
    this.paceDeliveredCount++;
    if (!pacing.transcutaneous) {
      this.paceCaptureCount++;
      return true;
    }
    // Transcutaneous capture is a steep but not instantaneous function of
    // delivered current relative to the subject's threshold, and it fails
    // intermittently even above threshold because of impedance changes and
    // patient movement.
    const margin = (pacing.outputMa - pacing.captureThresholdMa) / 12;
    const prob = 1 / (1 + Math.exp(-margin));
    const captured = this.rng.uniform() < prob * 0.985;
    if (captured) this.paceCaptureCount++;
    return captured;
  }

  private emitAtrial(time: number, source: ActivationSource, out: ActivationEvent[]): void {
    this.lastAtrialInterval = Math.min(Math.max(time - this.lastAtrial, 0.2), 6);
    this.lastAtrial = time;
    out.push({
      time,
      chamber: 'atrium',
      source,
      qrsWidth: 0,
      prInterval: NaN,
      nonCapture: false,
    });
  }

  private emitVentricular(
    time: number,
    source: ActivationSource,
    qrs: number,
    pr: number,
    out: ActivationEvent[],
  ): void {
    this.lastVentricularInterval = Math.min(Math.max(time - this.lastVentricular, 0.2), 8);
    this.lastVentricular = time;
    this.lastQrsWidth = qrs;
    this.lastSource = source;
    // A ventricular depolarisation renders the AV node refractory from below,
    // so the recovery clock restarts for escape and paced beats too.
    if (source !== 'conducted') this.lastAvConduction = time;
    out.push({ time, chamber: 'ventricle', source, qrsWidth: qrs, prInterval: pr, nonCapture: false });
  }

  /** Conducted fraction, for reporting AV conduction ratios. */
  get conductionRatio(): number {
    const total = this.conductedCount + this.blockedCount;
    return total === 0 ? 1 : this.conductedCount / total;
  }
}
