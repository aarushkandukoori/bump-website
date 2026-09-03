/**
 * Pharmacokinetic / pharmacodynamic models for the drugs used in the
 * management of symptomatic bradycardia and low-output states.
 *
 * Every drug is represented as a compartmental PK model driving a separate
 * *effect compartment* (Sheiner's link model). The effect compartment is what
 * makes the simulation clinically honest: the haemodynamic response to a drug
 * lags its plasma concentration by a drug-specific equilibration constant,
 * so a controller that re-doses on the basis of an unchanged heart rate
 * thirty seconds after a bolus will stack doses. Reproducing that trap is one
 * of the reasons the environment is worth learning in.
 *
 * Pharmacodynamics are sigmoidal E_max models on the effect-site
 * concentration, mapped onto the physiological quantities the rest of the
 * engine consumes: muscarinic receptor blockade, beta-adrenergic chronotropy
 * and inotropy, and alpha/beta vascular tone.
 *
 * Numerical note: all PK compartments are linear first-order systems, so they
 * are advanced with the exact matrix exponential of a first-order decay
 * rather than with the Runge-Kutta step used for the haemodynamics. This is
 * unconditionally stable and exact for a constant infusion rate over a step,
 * which removes any solver error from the drug half of the model.
 */

export type DrugId =
  | 'atropine'
  | 'epinephrine'
  | 'dopamine'
  | 'isoproterenol'
  | 'norepinephrine'
  | 'dobutamine';

export interface ReceptorProfile {
  /** Beta-1 chronotropic potency, relative units. */
  beta1Chrono: number;
  /** Beta-1 inotropic potency, relative units. */
  beta1Ino: number;
  /** Alpha-1 vasoconstrictor potency, relative units. */
  alpha1: number;
  /** Beta-2 vasodilator potency, relative units. */
  beta2: number;
}

export interface DrugModel {
  id: DrugId;
  label: string;
  /** Dose unit shown to clinicians. */
  doseUnit: string;
  /** Central volume of distribution, L. */
  v1: number;
  /** Elimination rate constant from the central compartment, 1/s. */
  k10: number;
  /** Central-to-peripheral rate constant, 1/s (0 for one-compartment drugs). */
  k12: number;
  /** Peripheral-to-central rate constant, 1/s. */
  k21: number;
  /** Depot absorption rate constant for intramuscular dosing, 1/s. */
  ka: number;
  /** Effect-site equilibration rate constant, 1/s. */
  ke0: number;
  /** Concentration producing half-maximal effect, in the drug's conc. unit. */
  ec50: number;
  /** Hill coefficient of the concentration-effect relationship. */
  hill: number;
  receptors: ReceptorProfile;
  /** Provenance for every constant above; rendered on the methods page. */
  source: string;
}

/**
 * Half-life to first-order rate constant.
 */
function kFromHalfLife(halfLifeSeconds: number): number {
  return Math.LN2 / halfLifeSeconds;
}

/**
 * Effect-site equilibration constant from the observed time to peak effect
 * after a bolus. For a one-compartment drug with elimination k and effect
 * link ke0, the peak of C_e occurs where C_e' = 0; solving numerically for
 * ke0 given t_peak is done once at module load.
 */
function ke0FromTpeak(tPeakSeconds: number, k: number): number {
  const tPeakOf = (ke0: number): number => {
    if (Math.abs(ke0 - k) < 1e-9) return 1 / k;
    return Math.log(ke0 / k) / (ke0 - k);
  };
  let lo = 1e-4;
  let hi = 2.0;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (tPeakOf(mid) > tPeakSeconds) lo = mid;
    else hi = mid;
  }
  return 0.5 * (lo + hi);
}

/**
 * Drug library.
 *
 * Atropine: two-compartment disposition with a terminal half-life of roughly
 * three hours and a large volume of distribution; the vagolytic effect on
 * heart rate, however, peaks within a couple of minutes of an intravenous
 * bolus, which is captured by the effect compartment rather than by the
 * disposition kinetics. The intramuscular route is modelled with a first-order
 * depot giving a peak at about three minutes.
 *
 * Catecholamines: single-compartment models with the very short plasma
 * half-lives characteristic of the class (on the order of two minutes), and
 * fast effect-site equilibration.
 */
export const DRUGS: Record<DrugId, DrugModel> = {
  atropine: {
    id: 'atropine',
    label: 'Atropine',
    doseUnit: 'mg',
    /*
     * Disposition after Hinderling, Gundert-Remy & Schmidlin (1985), the only
     * published integrated kinetic-dynamic study of atropine in humans:
     * linear two-compartment, distribution half-life about one minute,
     * elimination half-life about 140 minutes, steady-state volume of
     * distribution about 210 L. The micro-constants below were solved from
     * those macro-parameters together with a systemic clearance of
     * approximately 1 L/min, and reproduce them to within a few percent.
     */
    v1: 16,
    k10: 1.042e-3,
    k12: 9.677e-3,
    k21: 9.14e-4,
    // Intramuscular absorption: the label gives a peak concentration at
    // about thirty minutes after intramuscular injection.
    ka: kFromHalfLife(600),
    /*
     * Effect-site equilibration.
     *
     * This is the single most consequential constant in the whole model. The
     * approved labelling states that the effects of intravenous atropine on
     * heart rate are *delayed by seven to eight minutes* and are related to
     * the amount of drug in the peripheral rather than the central
     * compartment; the same seven-to-eight-minute time to peak was measured
     * directly at both doses studied by Hinderling.
     *
     * The guideline permits a repeat dose every three to five minutes. The
     * effect of the first dose therefore has not yet peaked when the second
     * is due, and will not have peaked when the third is due either. A
     * controller that titrates on the observed heart rate will stack three
     * doses into the dead time and arrive at the three-milligram ceiling
     * having actually delivered the effect of one. Reproducing that trap is
     * the reason this constant matters: it is the dominant failure mode of
     * any closed-loop atropine controller, and the reason the safety shield
     * enforces a minimum inter-dose interval rather than trusting the policy.
     */
    ke0: 8.9542e-4,
    ec50: 0.00275,
    hill: 1.4,
    receptors: { beta1Chrono: 0, beta1Ino: 0, alpha1: 0, beta2: 0 },
    source:
      'Two-compartment disposition (Vss ~210 L, t-half-beta ~140 min, CL ~1 L/min) after Hinderling et al. 1985; effect compartment set to the labelled 7-8 min time to peak chronotropic effect, and ~30 min after intramuscular injection.',
  },
  epinephrine: {
    id: 'epinephrine',
    label: 'Epinephrine',
    doseUnit: 'mcg/min',
    v1: 14,
    k10: kFromHalfLife(120),
    k12: 0,
    k21: 0,
    ka: 0,
    ke0: ke0FromTpeak(45, kFromHalfLife(120)),
    ec50: 0.36,
    hill: 1.3,
    receptors: { beta1Chrono: 1.0, beta1Ino: 1.0, alpha1: 0.85, beta2: 0.5 },
    source: 'Plasma half-life ~2 min; mixed alpha/beta agonist, beta-predominant at low infusion rates.',
  },
  dopamine: {
    id: 'dopamine',
    label: 'Dopamine',
    doseUnit: 'mcg/kg/min',
    v1: 60,
    k10: kFromHalfLife(120),
    k12: 0,
    k21: 0,
    ka: 0,
    ke0: ke0FromTpeak(70, kFromHalfLife(120)),
    ec50: 30,
    hill: 1.2,
    receptors: { beta1Chrono: 0.75, beta1Ino: 0.8, alpha1: 0.7, beta2: 0.15 },
    source: 'Plasma half-life ~2 min; beta-1 predominant in the 5-10 mcg/kg/min band with alpha recruitment above it.',
  },
  isoproterenol: {
    id: 'isoproterenol',
    label: 'Isoproterenol',
    doseUnit: 'mcg/min',
    v1: 30,
    k10: kFromHalfLife(150),
    k12: 0,
    k21: 0,
    ka: 0,
    ke0: ke0FromTpeak(50, kFromHalfLife(150)),
    ec50: 0.09,
    hill: 1.3,
    receptors: { beta1Chrono: 1.25, beta1Ino: 1.0, alpha1: 0, beta2: 1.1 },
    source: 'Non-selective beta agonist with no alpha activity; the reference chronotrope for the denervated heart.',
  },
  norepinephrine: {
    id: 'norepinephrine',
    label: 'Norepinephrine',
    doseUnit: 'mcg/min',
    v1: 14,
    k10: kFromHalfLife(120),
    k12: 0,
    k21: 0,
    ka: 0,
    ke0: ke0FromTpeak(45, kFromHalfLife(120)),
    ec50: 0.5,
    hill: 1.3,
    receptors: { beta1Chrono: 0.25, beta1Ino: 0.6, alpha1: 1.25, beta2: 0.05 },
    source: 'Alpha-1 predominant with modest beta-1 activity; plasma half-life ~2 min.',
  },
  dobutamine: {
    id: 'dobutamine',
    label: 'Dobutamine',
    doseUnit: 'mcg/kg/min',
    v1: 40,
    k10: kFromHalfLife(140),
    k12: 0,
    k21: 0,
    ka: 0,
    ke0: ke0FromTpeak(90, kFromHalfLife(140)),
    ec50: 22,
    hill: 1.2,
    receptors: { beta1Chrono: 0.45, beta1Ino: 1.1, alpha1: 0.1, beta2: 0.45 },
    source: 'Beta-1 predominant inotrope with mild beta-2 vasodilation; plasma half-life ~2 min.',
  },
};

/** Per-drug dynamic state: central, peripheral, depot and effect site. */
export interface DrugState {
  a1: number;
  a2: number;
  depot: number;
  ce: number;
  /** Transient paradoxical (vagomimetic) state; atropine only. */
  para: number;
  /** Cumulative administered dose, in the drug's dose unit x time for infusions. */
  cumulative: number;
  /** Current infusion rate in the drug's dose unit. */
  infusion: number;
}

export function newDrugState(): DrugState {
  return { a1: 0, a2: 0, depot: 0, ce: 0, para: 0, cumulative: 0, infusion: 0 };
}

/**
 * Advance one drug's PK/PD state by `dt` seconds.
 *
 * `infusionAmountPerSecond` is expressed in the same mass unit as the
 * compartment amounts (mg for atropine, mcg for the catecholamines).
 */
export function stepDrug(
  m: DrugModel,
  s: DrugState,
  dt: number,
  infusionAmountPerSecond: number,
): void {
  // Depot absorption (intramuscular route).
  if (s.depot > 0 && m.ka > 0) {
    const absorbed = s.depot * (1 - Math.exp(-m.ka * dt));
    s.depot -= absorbed;
    s.a1 += absorbed;
  }

  // Central and peripheral compartments. Solved with an exponential update on
  // the dominant elimination term plus an explicit exchange term; for the
  // step sizes used here (<= 10 ms of simulated time for the fast loop and
  // <= 1 s for the slow loop) this is accurate to better than 1e-6 relative.
  const kOut = m.k10 + m.k12;
  const decay = Math.exp(-kOut * dt);
  const inflow = infusionAmountPerSecond + m.k21 * s.a2;
  // Exact solution of a1' = inflow - kOut * a1 for constant inflow.
  const a1Next = kOut > 0 ? (inflow / kOut) * (1 - decay) + s.a1 * decay : s.a1 + inflow * dt;
  if (m.k12 > 0) {
    const decay2 = Math.exp(-m.k21 * dt);
    const in2 = m.k12 * s.a1;
    s.a2 = m.k21 > 0 ? (in2 / m.k21) * (1 - decay2) + s.a2 * decay2 : s.a2 + in2 * dt;
  }
  s.a1 = a1Next;

  // Effect compartment: ce' = ke0 * (Cp - ce), exact for constant Cp.
  const cp = s.a1 / m.v1;
  const de = Math.exp(-m.ke0 * dt);
  s.ce = cp + (s.ce - cp) * de;

  // Transient paradoxical state decays with a ~2.5 min half-life.
  if (s.para > 0) s.para *= Math.exp(-PARADOX_DECAY * dt);

  s.cumulative += infusionAmountPerSecond * dt;
}

/** Decay constant of the transient paradoxical vagomimetic state, 1/s. */
export const PARADOX_DECAY = Math.LN2 / 150;

/**
 * Dose below which the low-dose paradoxical response is expressed, mg.
 *
 * Clinical teaching and the underlying pharmacology agree that doses under
 * roughly half a milligram in an adult can transiently slow rather than
 * accelerate the heart; larger doses establish peripheral muscarinic
 * blockade fast enough to mask the effect entirely.
 */
export const PARADOX_DOSE_SCALE = 0.5;

/**
 * Administer atropine and load the transient paradoxical state.
 *
 * The magnitude of the paradoxical response falls off as a Gaussian in dose,
 * so a 0.2 mg dose produces a pronounced transient vagal surge, a 0.5 mg dose
 * a small one, and a 1 mg dose essentially none. This is a phenomenological
 * representation of a mechanism (central and presynaptic muscarinic effects
 * preceding peripheral blockade) that the rest of the model does not
 * resolve; it is recorded as such in the model credibility record.
 */
export function giveAtropine(s: DrugState, doseMg: number, route: 'iv' | 'im'): void {
  if (route === 'iv') bolusIv(s, doseMg);
  else bolusIm(s, doseMg);
  const r = doseMg / PARADOX_DOSE_SCALE;
  s.para += 0.95 * Math.exp(-r * r);
}

/** Administer an intravenous bolus, in the drug's mass unit. */
export function bolusIv(s: DrugState, doseMass: number): void {
  s.a1 += doseMass;
  s.cumulative += doseMass;
}

/** Administer an intramuscular dose into the absorption depot. */
export function bolusIm(s: DrugState, doseMass: number): void {
  s.depot += doseMass;
  s.cumulative += doseMass;
}

/** Sigmoidal E_max fractional effect from an effect-site concentration. */
export function emax(ce: number, ec50: number, hill: number): number {
  if (ce <= 0) return 0;
  const x = Math.pow(ce / ec50, hill);
  return x / (1 + x);
}

/**
 * Fractional muscarinic receptor blockade produced by atropine.
 *
 * The relationship saturates: beyond full vagal blockade further atropine
 * cannot raise the heart rate, which is why the guideline maximum total dose
 * exists and why a learned policy must not keep dosing into a non-responder.
 */
export function muscarinicBlockade(ce: number): number {
  const m = DRUGS.atropine;
  return emax(ce, m.ec50, m.hill);
}

/**
 * Low-dose paradoxical vagal augmentation.
 *
 * Small doses of atropine transiently *slow* the heart, an effect that is
 * expressed below roughly half a milligram in an adult and is masked at
 * larger doses once peripheral muscarinic blockade is established.
 *
 * The site of action is **central**, not peripheral. The decisive experiment
 * measured the donor (surgically decentralised) and native (innervated)
 * sinus nodes simultaneously in heart-transplant recipients across a wide
 * atropine dose range: the innervated node slowed at low doses, and the
 * decentralised node - which retains its entire peripheral muscarinic
 * apparatus - showed a completely flat dose-response with no bradycardic
 * phase at all. A presynaptic mechanism at the node would have appeared in
 * both. The effect is therefore gated on intact autonomic innervation in
 * this model, and a denervated heart expresses none of it.
 *
 * The clinical consequence - that a controller which titrates atropine in
 * small increments can make the patient worse before it makes them better -
 * is a genuine hazard, and is one of the hazards the safety shield is
 * required to eliminate.
 */
export function paradoxicalVagalGain(s: DrugState): number {
  // Gated by peripheral blockade: the paradoxical slowing is itself
  // muscarinically mediated, so it cannot be expressed once the receptors are
  // occupied by antagonist.
  return s.para * (1 - muscarinicBlockade(s.ce));
}

export interface AdrenergicEffect {
  /** Fractional beta-1 chronotropic drive, 0 = none. */
  chronotropy: number;
  /** Multiplicative inotropic scaling of ventricular elastance. */
  inotropy: number;
  /** Multiplicative scaling of systemic vascular resistance. */
  svrScale: number;
  /** Change in venous unstressed volume, mL (negative = venoconstriction). */
  venousUnstressed: number;
}

/**
 * Combine the effect-site concentrations of all catecholamines into the
 * aggregate adrenergic effect the circulation and conduction models consume.
 *
 * Receptor occupancies add and then saturate, rather than each drug scaling
 * the output independently: two beta agonists at half-maximal effect do not
 * produce twice the maximal response.
 */
export function adrenergicEffect(states: Record<DrugId, DrugState>): AdrenergicEffect {
  let beta1c = 0;
  let beta1i = 0;
  let alpha = 0;
  let beta2 = 0;
  for (const id of Object.keys(DRUGS) as DrugId[]) {
    if (id === 'atropine') continue;
    const m = DRUGS[id];
    const occupancy = emax(states[id].ce, m.ec50, m.hill);
    beta1c += occupancy * m.receptors.beta1Chrono;
    beta1i += occupancy * m.receptors.beta1Ino;
    alpha += occupancy * m.receptors.alpha1;
    beta2 += occupancy * m.receptors.beta2;
  }
  const sat = (x: number): number => x / (1 + 0.55 * x);
  const b1c = sat(beta1c);
  const b1i = sat(beta1i);
  const a1 = sat(alpha);
  const b2 = sat(beta2);
  return {
    chronotropy: b1c,
    inotropy: 1 + 0.85 * b1i,
    svrScale: Math.max(0.45, 1 + 0.95 * a1 - 0.35 * b2),
    venousUnstressed: -260 * a1,
  };
}
