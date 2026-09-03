/**
 * Virtual subjects: clinical phenotypes and the population sampler.
 *
 * A virtual subject is a fully specified `ModelConfig`. Subjects are produced
 * in two layers:
 *
 *  1. A **phenotype** sets the structural lesion - where in the conduction
 *     system the disease sits, whether the heart is innervated, how much
 *     ventricular reserve remains. The phenotype is what decides whether a
 *     muscarinic antagonist can possibly work.
 *
 *  2. **Inter-subject variability** then perturbs every continuous parameter
 *     around that phenotype: contractility, vascular properties, blood
 *     volume, baroreflex gain, conduction intervals, drug sensitivity and
 *     body size. Distributions are lognormal about the reference value so
 *     that parameters stay positive and multiplicative effects compose.
 *
 * The phenotype mix is the intended-use population. It is stated explicitly
 * here, with prevalence weights, because "what population was this validated
 * in" is the first question any reviewer asks, and the answer has to be a
 * number in the source rather than a claim in a slide.
 */

import { cloneCirculation } from './circulation.ts';
import { defaultModelConfig, type ModelConfig } from './model.ts';
import { Rng } from './rng.ts';

export type PhenotypeId =
  | 'vagal_sinus_bradycardia'
  | 'sinus_node_dysfunction'
  | 'av_block_nodal'
  | 'av_block_infranodal'
  | 'complete_block_junctional'
  | 'complete_block_ventricular'
  | 'beta_blocker_toxicity'
  | 'post_transplant_denervated'
  | 'post_tavr_conduction';

export interface Phenotype {
  id: PhenotypeId;
  label: string;
  /** Short clinical description shown in the interface. */
  description: string;
  /**
   * Where the lesion sits. This is the single fact that determines whether
   * atropine can work, and it is deliberately named the same way a clinician
   * would name it.
   */
  lesion: 'sinus' | 'av_nodal' | 'infranodal' | 'denervated';
  /** Whether atropine is expected to help, per guideline reasoning. */
  atropineExpectation: 'responsive' | 'partial' | 'unresponsive' | 'harmful';
  /** Prevalence weight within the intended-use population. */
  prevalence: number;
  apply: (cfg: ModelConfig, rng: Rng) => void;
}

/**
 * Phenotype library.
 *
 * Prevalence weights describe a symptomatic-bradycardia population presenting
 * to acute care, weighted towards the post-procedural conduction disease that
 * is the intended beachhead indication. They are an explicit modelling
 * assumption, recorded here so that the trial's subgroup structure and any
 * reweighting are auditable.
 */
export const PHENOTYPES: Phenotype[] = [
  {
    id: 'vagal_sinus_bradycardia',
    label: 'Vagally mediated sinus bradycardia',
    description:
      'Intact conduction with high resting vagal tone: the classical setting in which muscarinic blockade restores rate immediately.',
    lesion: 'sinus',
    atropineExpectation: 'responsive',
    prevalence: 0.17,
    apply: (cfg, rng) => {
      cfg.conduction.avBlockDegree = 'none';
      cfg.conduction.avBlockSite = 'nodal';
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(44, 5, 34, 55);
      // High resting vagal tone with an intrinsically normal sinus node: the
      // whole of the rate deficit is recoverable by muscarinic blockade.
      cfg.conduction.restingVagalTone = rng.truncNormal(2.6, 0.45, 1.7, 3.8);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(108, 8, 92, 125);
    },
  },
  {
    id: 'sinus_node_dysfunction',
    label: 'Sinus node dysfunction',
    description:
      'Intrinsic sinus node disease. Some reserve remains, so vagolysis produces a partial and unpredictable rate response.',
    lesion: 'sinus',
    atropineExpectation: 'partial',
    prevalence: 0.16,
    apply: (cfg, rng) => {
      cfg.conduction.sinusNodeDysfunction = rng.range(0.45, 0.85);
      cfg.conduction.restingVagalTone = rng.truncNormal(1.25, 0.25, 0.8, 1.9);
      cfg.conduction.avBlockDegree = 'none';
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(41, 6, 30, 52);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(96, 9, 78, 115);
    },
  },
  {
    id: 'av_block_nodal',
    label: 'Second-degree AV block, nodal (Mobitz I)',
    description:
      'Progressive PR prolongation and dropped beats arising within the AV node, which is richly vagally innervated and therefore atropine responsive.',
    lesion: 'av_nodal',
    atropineExpectation: 'responsive',
    prevalence: 0.14,
    apply: (cfg, rng) => {
      cfg.conduction.avBlockDegree = 'second_type_i';
      cfg.conduction.avBlockSite = 'nodal';
      cfg.conduction.restingVagalTone = rng.truncNormal(1.9, 0.35, 1.2, 2.8);
      cfg.conduction.avErp = rng.truncNormal(0.52, 0.06, 0.40, 0.66);
      cfg.conduction.avRecoveryAmplitude = rng.truncNormal(0.52, 0.08, 0.36, 0.70);
      cfg.conduction.avRecoveryTau = rng.truncNormal(0.30, 0.05, 0.20, 0.42);
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(43, 5, 33, 54);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(104, 9, 88, 122);
    },
  },
  {
    id: 'av_block_infranodal',
    label: 'Second-degree AV block, infranodal (Mobitz II)',
    description:
      'Block below the AV node, in tissue with no vagal innervation. Accelerating the sinus increases the number of impulses the diseased His-Purkinje system must carry, so the ventricular rate can fall.',
    lesion: 'infranodal',
    atropineExpectation: 'harmful',
    prevalence: 0.13,
    apply: (cfg, rng) => {
      cfg.conduction.avBlockDegree = 'second_type_ii';
      cfg.conduction.avBlockSite = 'infranodal';
      cfg.conduction.hisConductionProb = rng.range(0.42, 0.62);
      cfg.conduction.hisRateSensitivity = rng.range(0.006, 0.014);
      cfg.conduction.qrsNarrow = rng.truncNormal(0.14, 0.02, 0.11, 0.19);
      cfg.conduction.escapeFocus = 'ventricular';
      cfg.conduction.escapeRate = rng.truncNormal(33, 5, 22, 44);
      cfg.conduction.escapeAutonomicSensitivity = rng.range(0.04, 0.16);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(104, 9, 88, 122);
    },
  },
  {
    id: 'complete_block_junctional',
    label: 'Complete AV block, junctional escape',
    description:
      'No atrioventricular conduction, with a narrow-complex escape rhythm arising at or just below the node. The escape focus retains some autonomic responsiveness.',
    lesion: 'av_nodal',
    atropineExpectation: 'partial',
    prevalence: 0.12,
    apply: (cfg, rng) => {
      cfg.conduction.avBlockDegree = 'third';
      cfg.conduction.avBlockSite = 'nodal';
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(44, 6, 32, 56);
      cfg.conduction.escapeAutonomicSensitivity = rng.range(0.3, 0.6);
      cfg.conduction.restingVagalTone = rng.truncNormal(1.5, 0.3, 1.0, 2.3);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(102, 9, 86, 120);
    },
  },
  {
    id: 'complete_block_ventricular',
    label: 'Complete AV block, ventricular escape',
    description:
      'No conduction, with a slow wide-complex escape from below the bifurcation. Muscarinic blockade cannot reach this tissue; pacing is the definitive therapy.',
    lesion: 'infranodal',
    atropineExpectation: 'unresponsive',
    prevalence: 0.11,
    apply: (cfg, rng) => {
      cfg.conduction.avBlockDegree = 'third';
      cfg.conduction.avBlockSite = 'infranodal';
      cfg.conduction.escapeFocus = 'ventricular';
      cfg.conduction.escapeRate = rng.truncNormal(31, 5, 20, 42);
      cfg.conduction.escapeAutonomicSensitivity = rng.range(0.02, 0.12);
      cfg.conduction.qrsWide = rng.truncNormal(0.16, 0.02, 0.13, 0.21);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(100, 9, 84, 118);
      // Loss of atrioventricular synchrony plus a slow rate: ventricular
      // reserve is usually reduced in this group.
      cfg.circulation.lv.eEs *= rng.range(0.72, 0.95);
    },
  },
  {
    id: 'beta_blocker_toxicity',
    label: 'Beta-blocker or calcium-channel-blocker effect',
    description:
      'Pharmacological suppression of sinus and nodal function with a blunted reflex. Muscarinic blockade helps little because the lesion is not vagal.',
    lesion: 'sinus',
    atropineExpectation: 'partial',
    prevalence: 0.08,
    apply: (cfg, rng) => {
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(62, 7, 48, 78);
      cfg.conduction.sinusNodeDysfunction = rng.range(0.2, 0.5);
      cfg.conduction.avBlockDegree = rng.bernoulli(0.5) ? 'first' : 'second_type_i';
      cfg.conduction.avBlockSite = 'nodal';
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(34, 5, 24, 45);
      // Beta blockade attenuates both the reflex and any beta-agonist rescue.
      cfg.baroreflex.reflexGain = rng.range(0.25, 0.55);
      cfg.circulation.lv.eEs *= rng.range(0.65, 0.88);
    },
  },
  {
    id: 'post_transplant_denervated',
    label: 'Denervated (transplanted) heart',
    description:
      'No vagal innervation to block, so a muscarinic antagonist has no substrate to act on. A direct beta agonist is the appropriate chronotrope.',
    lesion: 'denervated',
    atropineExpectation: 'unresponsive',
    prevalence: 0.04,
    apply: (cfg, rng) => {
      cfg.conduction.denervated = true;
      // Reported in one in five transplant recipients given atropine, with no
      // dose relationship and no identifiable predictor.
      cfg.conduction.atropineCollapseRisk = 0.2;
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(92, 8, 76, 110);
      cfg.conduction.sinusNodeDysfunction = rng.range(0.3, 0.7);
      cfg.conduction.avBlockDegree = rng.bernoulli(0.35) ? 'second_type_ii' : 'none';
      cfg.conduction.avBlockSite = 'infranodal';
      cfg.conduction.hisConductionProb = 0.6;
      cfg.conduction.escapeFocus = 'junctional';
      cfg.conduction.escapeRate = rng.truncNormal(48, 6, 36, 60);
      cfg.conduction.escapeAutonomicSensitivity = rng.range(0.05, 0.2);
      cfg.baroreflex.reflexGain = rng.range(0.1, 0.3);
      cfg.conduction.rsaAmplitude = 0;
    },
  },
  {
    id: 'post_tavr_conduction',
    label: 'New conduction disturbance after aortic valve intervention',
    description:
      'Peri-procedural injury to the conduction system below the node, the intended beachhead indication: high-grade block may appear days after discharge.',
    lesion: 'infranodal',
    atropineExpectation: 'unresponsive',
    prevalence: 0.05,
    apply: (cfg, rng) => {
      const complete = rng.bernoulli(0.45);
      cfg.conduction.avBlockDegree = complete ? 'third' : 'second_type_ii';
      cfg.conduction.avBlockSite = 'infranodal';
      cfg.conduction.hisConductionProb = complete ? 0 : rng.range(0.35, 0.6);
      cfg.conduction.hisRateSensitivity = rng.range(0.008, 0.018);
      cfg.conduction.escapeFocus = complete ? 'ventricular' : 'ventricular';
      cfg.conduction.escapeRate = rng.truncNormal(32, 6, 20, 45);
      cfg.conduction.escapeAutonomicSensitivity = rng.range(0.03, 0.15);
      cfg.conduction.qrsWide = rng.truncNormal(0.17, 0.02, 0.14, 0.22);
      cfg.conduction.intrinsicSinusRate = rng.truncNormal(100, 9, 84, 118);
      // Older, stiffer, with reduced reflex reserve.
      cfg.baroreflex.reflexGain = rng.range(0.35, 0.7);
      cfg.circulation.lv.eEs *= rng.range(0.75, 1.05);
    },
  },
];

export const PHENOTYPE_BY_ID: Record<PhenotypeId, Phenotype> = Object.fromEntries(
  PHENOTYPES.map((p) => [p.id, p]),
) as Record<PhenotypeId, Phenotype>;

export interface VirtualSubject {
  id: number;
  seed: number;
  phenotype: PhenotypeId;
  cfg: ModelConfig;
  /** Demographics, carried for subgroup reporting. */
  ageYears: number;
  sex: 'F' | 'M';
  weightKg: number;
  heightCm: number;
  /** Transcutaneous pacing capture threshold for this subject, mA. */
  captureThresholdMa: number;
  /** Multiplier on atropine potency; captures pharmacodynamic variability. */
  atropineSensitivity: number;
  /**
   * Documented myocardial ischaemia. Both a modifier of the presenting
   * physiology and a charted fact the controller can see, because it
   * triggers the labelled cumulative atropine limit for coronary disease.
   */
  ischaemic: boolean;
}

/**
 * Sample one virtual subject.
 *
 * Every random draw comes from the subject's own seeded generator, so subject
 * n is reproducible in isolation and independent of how many subjects were
 * drawn before it. That property is what allows a trial to be resumed,
 * re-run in a different order, or partially re-executed by a reviewer and
 * still produce identical results.
 */
export function sampleSubject(id: number, seed: number, forcePhenotype?: PhenotypeId): VirtualSubject {
  const rng = new Rng(seed);
  const phenotype =
    forcePhenotype ?? PHENOTYPES[rng.categorical(PHENOTYPES.map((p) => p.prevalence))].id;

  const sex: 'F' | 'M' = rng.bernoulli(0.46) ? 'F' : 'M';
  const ageYears = Math.round(rng.truncNormal(sex === 'F' ? 73 : 71, 11, 34, 94));
  const heightCm = rng.truncNormal(sex === 'F' ? 162 : 176, 7, 145, 196);
  const weightKg = rng.truncNormal(sex === 'F' ? 71 : 84, 15, 42, 138);

  const cfg = defaultModelConfig(seed);
  cfg.circulation = cloneCirculation(cfg.circulation);
  cfg.weightKg = weightKg;
  cfg.heightCm = heightCm;

  // Body size scales the circulation. Cardiac volumes and flows scale with
  // body surface area; resistances scale inversely.
  const bsa = 0.007184 * Math.pow(heightCm, 0.725) * Math.pow(weightKg, 0.425);
  const sizeScale = bsa / 1.91;
  cfg.stressedVolume *= sizeScale;
  cfg.circulation.rSys /= sizeScale;
  cfg.circulation.rPul /= sizeScale;
  cfg.circulation.ao.e /= sizeScale;
  cfg.circulation.vc.e /= sizeScale;
  cfg.circulation.pa.e /= sizeScale;
  cfg.circulation.pu.e /= sizeScale;
  cfg.circulation.lv.eEs /= sizeScale;
  cfg.circulation.rv.eEs /= sizeScale;
  cfg.circulation.la.p0 /= sizeScale;
  cfg.circulation.ra.p0 /= sizeScale;
  cfg.circulation.pericardium.v0 *= sizeScale;

  // Inter-subject variability, independent of body size.
  cfg.circulation.lv.eEs *= rng.logNormal(1, 1.22);
  cfg.circulation.rv.eEs *= rng.logNormal(1, 1.18);
  cfg.circulation.ao.e *= rng.logNormal(1, 1.16);
  cfg.circulation.rSys *= rng.logNormal(1, 1.15);
  cfg.circulation.rPul *= rng.logNormal(1, 1.2);
  cfg.stressedVolume *= rng.logNormal(1, 1.09);
  cfg.circulation.lv.lambda *= rng.logNormal(1, 1.14);

  // Arterial stiffening and reflex blunting with age.
  const ageFactor = (ageYears - 60) / 30;
  cfg.circulation.ao.e *= 1 + 0.22 * Math.max(-1, ageFactor);
  cfg.baroreflex.reflexGain *= Math.min(
    1.25,
    Math.max(0.15, (1 - 0.3 * Math.max(-1, ageFactor)) * rng.logNormal(1, 1.2)),
  );

  cfg.conduction.avMinDelay *= rng.logNormal(1, 1.15);
  cfg.conduction.sinusVariability *= rng.logNormal(1, 1.4);

  /*
   * The acute precipitant.
   *
   * A slow heart on its own is usually tolerated: the baroreflex raises
   * contractility, constricts the resistance vessels and recruits venous
   * volume, and mean pressure holds. Patients reach acute care because
   * something else has already consumed that reserve - ischaemia has taken
   * contractility, vasodilatation has taken tone, or they are volume
   * depleted. Modelling the precipitant explicitly is what makes the
   * presenting population genuinely compromised rather than merely slow, and
   * it is also what makes the reserve heterogeneous across subjects, which is
   * the thing a controller has to infer.
   */
  const ischaemicInsult = rng.uniform() < 0.45;
  if (ischaemicInsult) cfg.circulation.lv.eEs *= rng.range(0.55, 0.9);
  cfg.stressedVolume *= rng.range(0.8, 1.0);
  cfg.circulation.rSys *= rng.range(0.72, 1.02);
  cfg.baroreflex.reflexGain *= rng.range(0.45, 1.0);

  PHENOTYPE_BY_ID[phenotype].apply(cfg, rng);

  // Re-apply the reflex-gain floor after phenotypes that set it directly.
  cfg.baroreflex.reflexGain = Math.min(1.4, Math.max(0.08, cfg.baroreflex.reflexGain));

  return {
    id,
    seed,
    phenotype,
    cfg,
    ageYears,
    sex,
    weightKg,
    heightCm,
    // Transcutaneous capture threshold: wide, right-skewed, and a meaningful
    // fraction of patients cannot be captured at the 140 mA device maximum.
    captureThresholdMa: Math.min(210, rng.logNormal(72, 1.42)),
    atropineSensitivity: rng.logNormal(1, 1.3),
    // Acute coronary syndrome is a common precipitant of symptomatic
    // bradycardia, and is over-represented in high-grade block.
    ischaemic: rng.bernoulli(
      phenotype === 'av_block_nodal' || phenotype === 'av_block_infranodal' ? 0.5 : 0.24,
    ),
  };
}

/**
 * Enrolment criterion for the chronotropic rescue programme.
 *
 * The guideline treats bradycardia when it is *causing compromise*, so that
 * is the population the controller is indicated for and the population the
 * trial must enrol. Screening is done by simulating each candidate untreated
 * for two minutes and applying an explicit, stated criterion, exactly as a
 * real protocol would - rather than by tuning the generative distribution
 * until it happens to produce sick patients.
 *
 * The screen failure rate is reported alongside the trial, because a cohort
 * assembled by rejection is only interpretable if the rejection rate is known.
 */
export interface EnrolmentResult {
  enrolled: VirtualSubject[];
  screened: number;
  screenFailures: number;
  baselineMap: number[];
  baselineHr: number[];
}

export async function enrolCohort(
  n: number,
  masterSeed: number,
  screen: (s: VirtualSubject) => { map: number; hr: number },
  forcePhenotype?: PhenotypeId,
  onProgress?: (done: number, screened: number) => void,
): Promise<EnrolmentResult> {
  const enrolled: VirtualSubject[] = [];
  const baselineMap: number[] = [];
  const baselineHr: number[] = [];
  let screened = 0;
  let i = 0;
  while (enrolled.length < n && screened < n * 40) {
    const seed = new Rng(masterSeed ^ Math.imul(i + 1, 0x9e3779b9)).nextUint32();
    const cand = sampleSubject(enrolled.length, seed, forcePhenotype);
    screened++;
    i++;
    const { map, hr } = screen(cand);
    // Symptomatic bradycardia with haemodynamic compromise: a slow rate
    // together with either frank hypotension or a profoundly slow rate.
    if (hr < 55 && (map < 65 || hr < 42)) {
      enrolled.push(cand);
      baselineMap.push(map);
      baselineHr.push(hr);
      onProgress?.(enrolled.length, screened);
    }
  }
  return { enrolled, screened, screenFailures: screened - enrolled.length, baselineMap, baselineHr };
}

/** Sample a whole cohort with reproducible per-subject seeds, without screening. */
export function sampleCohort(n: number, masterSeed: number, forcePhenotype?: PhenotypeId): VirtualSubject[] {
  const out: VirtualSubject[] = [];
  for (let i = 0; i < n; i++) {
    // Subject seeds are derived, not sequential, so that adjacent subjects
    // are not correlated through the low bits of the generator state.
    const s = new Rng(masterSeed ^ Math.imul(i + 1, 0x9e3779b9)).nextUint32();
    out.push(sampleSubject(i, s, forcePhenotype));
  }
  return out;
}
