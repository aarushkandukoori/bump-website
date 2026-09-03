/**
 * Short-term autonomic regulation: the arterial baroreflex.
 *
 * Structure follows Ursino's carotid baroregulation model: a pressure
 * afferent pathway with high-pass dynamics feeding a sigmoidal firing-rate
 * characteristic, separate sympathetic and vagal efferent pathways, and a set
 * of effectors each with its own pure transport delay, logarithmic static
 * gain and first-order lag.
 *
 * The baroreflex is not decoration here. It is the reason bradycardia is
 * survivable at all: as heart rate falls, the reflex raises contractility,
 * constricts resistance vessels and recruits unstressed venous volume, and
 * these compensations are what hold mean arterial pressure up until they are
 * exhausted. A controller that acts before the reflex has been exhausted
 * treats a patient who did not need treating; a controller that waits until
 * after has waited too long. Getting the compensation right is therefore
 * a precondition for the therapeutic question being meaningful.
 *
 * A per-subject `reflexGain` scales the whole efferent limb, representing the
 * blunted baroreflex of older patients, of the chronically beta-blocked, and
 * of the autonomically neuropathic - the populations in which bradycardia
 * decompensates fastest.
 */

/** A fixed-interval ring buffer implementing a pure transport delay. */
export class DelayLine {
  private buf: Float64Array;
  private idx = 0;
  private readonly step: number;

  constructor(delaySeconds: number, sampleStep: number, initial: number) {
    this.step = sampleStep;
    const n = Math.max(1, Math.round(delaySeconds / sampleStep));
    this.buf = new Float64Array(n);
    this.buf.fill(initial);
  }

  /** Push a new sample and return the value delayed by the configured time. */
  push(value: number): number {
    const out = this.buf[this.idx];
    this.buf[this.idx] = value;
    this.idx = (this.idx + 1) % this.buf.length;
    return out;
  }

  /** Current delayed output without advancing. */
  peek(): number {
    return this.buf[this.idx];
  }

  reset(value: number): void {
    this.buf.fill(value);
    this.idx = 0;
  }

  get sampleStep(): number {
    return this.step;
  }
}

export interface BaroreflexParams {
  /** Afferent sigmoid: minimum and maximum carotid sinus firing, spikes/s. */
  fMin: number;
  fMax: number;
  /** Central set point of the afferent sigmoid, mmHg. */
  pSetpoint: number;
  /** Slope parameter of the afferent sigmoid, mmHg. */
  ka: number;
  /** Afferent high-pass zero and pole time constants, s. */
  tauZ: number;
  tauP: number;
  /**
   * Time constant of the low-pass that converts pulsatile arterial pressure
   * into the mean-pressure signal the afferent pathway acts on, s.
   *
   * Model-form assumption, recorded deliberately. Real baroreceptors fire in
   * bursts synchronised to the pulse, and the afferent lead-lag has a
   * high-frequency gain of about three, so driving the sigmoid with the raw
   * pulsatile waveform swings it far outside its linear range in both
   * directions on every beat. The resulting mean firing rate is then set by
   * the duty cycle of that saturation and is almost blind to mean pressure -
   * which would defeat the entire purpose of the reflex in this model, whose
   * question of interest is the regulation of mean arterial pressure over
   * seconds to minutes rather than pulse-synchronous afferent traffic.
   *
   * Filtering to the mean first, then applying the same sigmoid and the same
   * lead-lag, preserves the reflex's static gain, its set point and its
   * dynamic response, at the cost of not reproducing pulse-pressure-dependent
   * baroreceptor effects. That limitation is stated in the credibility record.
   */
  tauMean: number;
  /** Sympathetic efferent static curve. */
  fesInf: number;
  fes0: number;
  kes: number;
  fesMin: number;
  /** Vagal efferent static curve. */
  fev0: number;
  fevInf: number;
  fcs0: number;
  kev: number;
  /** Effector gains. */
  gEmaxLv: number;
  gEmaxRv: number;
  gRsys: number;
  gVunstressed: number;
  gPeriodSymp: number;
  gPeriodVagal: number;
  /** Effector time constants, s. */
  tauEmax: number;
  tauRsys: number;
  tauVunstressed: number;
  tauPeriodSymp: number;
  tauPeriodVagal: number;
  /** Effector pure delays, s. */
  dEmax: number;
  dRsys: number;
  dVunstressed: number;
  dPeriodSymp: number;
  dPeriodVagal: number;
  /** Whole-reflex efferent gain multiplier; 1.0 = healthy young adult. */
  reflexGain: number;
}

/**
 * Baseline constants after Ursino's carotid baroreflex model. The effector
 * gains are expressed in the same units as the quantities they modify
 * (mmHg/mL for elastance, mmHg*s/mL for resistance, mL for unstressed volume,
 * s for heart period).
 */
export const BASELINE_BAROREFLEX: BaroreflexParams = {
  fMin: 2.52,
  fMax: 47.78,
  pSetpoint: 92,
  ka: 11.758,
  tauZ: 6.37,
  tauP: 2.076,
  tauMean: 1.2,
  fesInf: 2.1,
  fes0: 16.11,
  kes: 0.0675,
  fesMin: 2.66,
  fev0: 3.2,
  fevInf: 6.3,
  fcs0: 25,
  kev: 7.06,
  gEmaxLv: 0.475,
  gEmaxRv: 0.282,
  gRsys: 0.695,
  gVunstressed: -265,
  gPeriodSymp: -0.13,
  gPeriodVagal: 0.09,
  tauEmax: 8,
  tauRsys: 6,
  tauVunstressed: 20,
  tauPeriodSymp: 2,
  tauPeriodVagal: 1.5,
  dEmax: 2,
  dRsys: 2,
  dVunstressed: 5,
  dPeriodSymp: 2,
  dPeriodVagal: 0.2,
  reflexGain: 1.0,
};

/** Outputs of the reflex, in the form the rest of the engine consumes. */
export interface AutonomicOutput {
  /** Carotid sinus afferent firing rate, spikes/s. */
  fCarotid: number;
  /** Sympathetic efferent firing rate, spikes/s. */
  fSymp: number;
  /** Vagal efferent firing rate, spikes/s. */
  fVagal: number;
  /** Normalised tones, 1.0 at the resting operating point. */
  sympatheticTone: number;
  vagalTone: number;
  /** Multiplicative scaling of ventricular active elastance. */
  inotropyLv: number;
  inotropyRv: number;
  /** Multiplicative scaling of systemic vascular resistance. */
  svrScale: number;
  /** Change in venous unstressed volume, mL. */
  venousUnstressedDelta: number;
}

/** Sympathetic static effector characteristic, sigma = G ln(f - f_min + 1). */
function sympStatic(g: number, f: number, fMin: number): number {
  const arg = f - fMin + 1;
  return arg > 1e-6 ? g * Math.log(arg) : 0;
}

export class Baroreflex {
  readonly p: BaroreflexParams;
  /** Filtered (high-passed) carotid pressure, mmHg. */
  private pTilde: number;
  private prevP: number;
  /** Low-passed arterial pressure feeding the afferent pathway, mmHg. */
  private pMean: number;
  /** First-order effector states. */
  private xEmaxLv = 0;
  private xEmaxRv = 0;
  private xRsys = 0;
  private xVu = 0;
  private xPeriodSymp = 0;
  private xPeriodVagal = 0;
  private dEmax: DelayLine;
  private dRsys: DelayLine;
  private dVu: DelayLine;
  private dPerSymp: DelayLine;
  private dPerVagal: DelayLine;
  /** Resting reference values used to normalise the reported tones. */
  private restSymp: number;
  private restVagal: number;
  private restEmaxSigma: number;
  private restRsysSigma: number;
  readonly baseElastanceLv: number;

  constructor(p: BaroreflexParams, baseElastanceLv: number, delayStep = 0.005) {
    this.p = p;
    this.baseElastanceLv = baseElastanceLv;
    this.pTilde = p.pSetpoint;
    this.prevP = p.pSetpoint;
    this.pMean = p.pSetpoint;

    // Resting operating point: afferent firing at the set point.
    const fcsRest = this.afferentFiring(p.pSetpoint);
    this.restSymp = p.fesInf + (p.fes0 - p.fesInf) * Math.exp(-p.kes * fcsRest);
    this.restVagal = this.vagalFiring(fcsRest);
    this.restEmaxSigma = sympStatic(p.gEmaxLv, this.restSymp, p.fesMin);
    this.restRsysSigma = sympStatic(p.gRsys, this.restSymp, p.fesMin);

    this.dEmax = new DelayLine(p.dEmax, delayStep, this.restSymp);
    this.dRsys = new DelayLine(p.dRsys, delayStep, this.restSymp);
    this.dVu = new DelayLine(p.dVunstressed, delayStep, this.restSymp);
    this.dPerSymp = new DelayLine(p.dPeriodSymp, delayStep, this.restSymp);
    this.dPerVagal = new DelayLine(p.dPeriodVagal, delayStep, this.restVagal);

    // Initialise the effector states at their resting values so the model
    // starts in equilibrium rather than transiently.
    this.xEmaxLv = this.restEmaxSigma;
    this.xEmaxRv = sympStatic(p.gEmaxRv, this.restSymp, p.fesMin);
    this.xRsys = this.restRsysSigma;
    this.xVu = sympStatic(p.gVunstressed, this.restSymp, p.fesMin);
    this.xPeriodSymp = sympStatic(p.gPeriodSymp, this.restSymp, p.fesMin);
    this.xPeriodVagal = p.gPeriodVagal * this.restVagal;
  }

  private afferentFiring(p: number): number {
    const q = this.p;
    const e = Math.exp((p - q.pSetpoint) / q.ka);
    return (q.fMin + q.fMax * e) / (1 + e);
  }

  private vagalFiring(fcs: number): number {
    const q = this.p;
    const e = Math.exp((fcs - q.fcs0) / q.kev);
    return (q.fev0 + q.fevInf * e) / (1 + e);
  }

  /**
   * Advance the reflex by `dt` seconds given the instantaneous arterial
   * pressure sensed at the carotid sinus.
   */
  step(pArterial: number, dt: number, out: AutonomicOutput): AutonomicOutput {
    const q = this.p;

    // Pulsatile pressure -> mean pressure (see tauMean).
    this.pMean += ((pArterial - this.pMean) / q.tauMean) * dt;

    // Afferent lead-lag block: tau_p * dPt/dt = P + tau_z dP/dt - Pt
    const dP = (this.pMean - this.prevP) / Math.max(dt, 1e-9);
    this.prevP = this.pMean;
    const dPt = (this.pMean + q.tauZ * dP - this.pTilde) / q.tauP;
    this.pTilde += dPt * dt;
    // The filtered pressure is a physiological signal, not an unbounded state.
    this.pTilde = Math.min(Math.max(this.pTilde, 0), 300);

    const fcs = this.afferentFiring(this.pTilde);
    const fesRaw = q.fesInf + (q.fes0 - q.fesInf) * Math.exp(-q.kes * fcs);
    const fes = Math.min(Math.max(fesRaw, q.fesMin), 60);
    const fev = this.vagalFiring(fcs);

    // Efferent transport delays.
    const fesEmax = this.dEmax.push(fes);
    const fesRsys = this.dRsys.push(fes);
    const fesVu = this.dVu.push(fes);
    const fesPer = this.dPerSymp.push(fes);
    const fevPer = this.dPerVagal.push(fev);

    const g = q.reflexGain;
    const relax = (x: number, target: number, tau: number): number =>
      x + ((target - x) / tau) * dt;

    this.xEmaxLv = relax(this.xEmaxLv, sympStatic(q.gEmaxLv, fesEmax, q.fesMin), q.tauEmax);
    this.xEmaxRv = relax(this.xEmaxRv, sympStatic(q.gEmaxRv, fesEmax, q.fesMin), q.tauEmax);
    this.xRsys = relax(this.xRsys, sympStatic(q.gRsys, fesRsys, q.fesMin), q.tauRsys);
    this.xVu = relax(this.xVu, sympStatic(q.gVunstressed, fesVu, q.fesMin), q.tauVunstressed);
    this.xPeriodSymp = relax(
      this.xPeriodSymp,
      sympStatic(q.gPeriodSymp, fesPer, q.fesMin),
      q.tauPeriodSymp,
    );
    this.xPeriodVagal = relax(this.xPeriodVagal, q.gPeriodVagal * fevPer, q.tauPeriodVagal);

    out.fCarotid = fcs;
    out.fSymp = fes;
    out.fVagal = fev;

    // Normalised tones for the conduction system, taken from the *lagged*
    // heart-period effector states rather than from raw efferent firing.
    // These are Ursino's own chronotropic effectors, each with its own time
    // constant, which is what gives the reflex its correct dynamics.
    // Keeping the two limbs separate is essential rather than cosmetic:
    // atropine blocks the vagal limb alone, so a model that collapsed them
    // into one chronotropic signal could not represent the drug at all.
    const restPeriodSymp = sympStatic(q.gPeriodSymp, this.restSymp, q.fesMin);
    const restPeriodVagal = q.gPeriodVagal * this.restVagal;
    out.sympatheticTone =
      1 + g * (this.xPeriodSymp / (Math.abs(restPeriodSymp) > 1e-9 ? restPeriodSymp : 1) - 1);
    out.vagalTone = Math.max(
      0,
      1 + g * (this.xPeriodVagal / (Math.abs(restPeriodVagal) > 1e-9 ? restPeriodVagal : 1) - 1),
    );

    // Effector outputs, expressed relative to the resting operating point so
    // that the baseline parameter set already contains the resting tone.
    const dEmaxLv = g * (this.xEmaxLv - this.restEmaxSigma);
    out.inotropyLv = Math.max(0.25, 1 + dEmaxLv / this.baseElastanceLv);
    out.inotropyRv = Math.max(
      0.25,
      1 + (g * (this.xEmaxRv - sympStatic(q.gEmaxRv, this.restSymp, q.fesMin))) /
        (this.baseElastanceLv * 0.203),
    );
    out.svrScale = Math.min(
      2.6,
      Math.max(0.4, 1 + (g * (this.xRsys - this.restRsysSigma)) / 1.0889),
    );
    out.venousUnstressedDelta =
      g * (this.xVu - sympStatic(q.gVunstressed, this.restSymp, q.fesMin));
    return out;
  }

  /** Resting sympathetic and vagal firing rates, for diagnostics. */
  get restingFiring(): { symp: number; vagal: number } {
    return { symp: this.restSymp, vagal: this.restVagal };
  }
}

export function newAutonomicOutput(): AutonomicOutput {
  return {
    fCarotid: 0,
    fSymp: 0,
    fVagal: 0,
    sympatheticTone: 1,
    vagalTone: 1,
    inotropyLv: 1,
    inotropyRv: 1,
    svrScale: 1,
    venousUnstressedDelta: 0,
  };
}
