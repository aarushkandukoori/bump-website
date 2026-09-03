/**
 * The in-silico trial engine.
 *
 * Design: a paired, within-subject comparison. Every enrolled virtual subject
 * is run twice from an identical initial state with an identical noise
 * realisation, once under the learned controller and once under the guideline
 * comparator. The only thing that differs between the two runs is the policy.
 *
 * That design is the reason to do this in silico at all. A crossover of this
 * kind is impossible in a real emergency: a patient cannot be resuscitated
 * twice from the same starting point. Here it is exact, it removes all
 * between-subject variance from the contrast, and it makes a few hundred
 * virtual subjects worth what a few thousand real ones would be in a
 * parallel-group design.
 *
 * It also has to be qualified honestly. This estimates the effect of the
 * controller *within this model*, and it is evidence about real patients only
 * to the extent that the model has been shown credible for the question being
 * asked. That is why the credibility assessment sits alongside the result
 * rather than behind it, and why nothing here should be read as a clinical
 * finding.
 *
 * The evaluation cohort is drawn from a master seed that was never used in
 * training or in model selection, and runs against the evaluation model:
 * finer integration step, degraded sensing, and every hazard enabled.
 */

import { ChronotropicEnv, screenSubject, type EpisodeMetrics } from '../envs/chronotropic.ts';
import {
  guidelineAction, newGuidelineState, updateGuidelineState,
} from '../envs/guideline.ts';
import { enrolCohort, PHENOTYPE_BY_ID, type PhenotypeId, type VirtualSubject } from '../engine/patient.ts';
import { Policy } from '../rl/policy.ts';
import {
  bootstrapBca, mcNemar, mean, median, nonInferiority, pairedDifference,
  quantile, sd, wilcoxonSignedRank, benjaminiHochberg,
  type Estimate,
} from './stats.ts';

export interface ArmResult {
  metrics: EpisodeMetrics[];
  totalReward: number[];
}

export interface EndpointResult {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  /** Primary, secondary or safety. */
  family: 'primary' | 'secondary' | 'safety' | 'control';
  policyMean: number;
  policySd: number;
  guidelineMean: number;
  guidelineSd: number;
  difference: Estimate;
  wilcoxonP: number;
  adjustedP: number;
  /** Non-inferiority margin in the endpoint's units, where one is defined. */
  margin?: number;
  nonInferior?: boolean;
  superior?: boolean;
}

export interface SubgroupResult {
  key: string;
  label: string;
  n: number;
  policyMean: number;
  guidelineMean: number;
  difference: Estimate;
}

export interface TrialResult {
  generated: string;
  policyVersion: string;
  cohortSeed: number;
  enrolled: number;
  screened: number;
  screenFailureRate: number;
  baseline: {
    mapMean: number; mapSd: number; hrMean: number; hrSd: number;
    ageMean: number; femaleFraction: number; ischaemicFraction: number;
    phenotypeCounts: Record<string, number>;
  };
  endpoints: EndpointResult[];
  subgroups: SubgroupResult[];
  /** Per-subject paired values for the primary endpoint, for plotting. */
  primaryPairs: { policy: number; guideline: number; phenotype: string }[];
  safety: {
    arrestPolicy: number;
    arrestGuideline: number;
    arrestMcNemarP: number;
    collapsePolicy: number;
    collapseGuideline: number;
    shieldInterventionRate: number;
    shieldRuleCounts: Record<string, number>;
  };
  runtimeSeconds: number;
}

/** Numeric accessor for an endpoint. */
type Getter = (m: EpisodeMetrics) => number;

interface EndpointSpec {
  key: string;
  label: string;
  unit: string;
  higherIsBetter: boolean;
  family: 'primary' | 'secondary' | 'safety' | 'control';
  get: Getter;
  margin?: number;
}

export const ENDPOINTS: EndpointSpec[] = [
  {
    key: 'timeInTarget', label: 'Time with mean arterial pressure in target', unit: '% of episode',
    higherIsBetter: true, family: 'primary', get: (m) => m.timeInTarget * 100,
  },
  {
    key: 'twaBelow65', label: 'Time-weighted average pressure below 65', unit: 'mmHg',
    higherIsBetter: false, family: 'secondary', get: (m) => m.twaBelow65, margin: 1.0,
  },
  {
    key: 'twaBelow55', label: 'Time-weighted average pressure below 55', unit: 'mmHg',
    higherIsBetter: false, family: 'secondary', get: (m) => m.twaBelow55, margin: 0.5,
  },
  {
    key: 'secondsUnder55', label: 'Cumulative time with pressure under 55', unit: 's',
    higherIsBetter: false, family: 'secondary', get: (m) => m.secondsUnder55,
  },
  {
    key: 'timeRateAdequate', label: 'Time with heart rate at or above 50', unit: '% of episode',
    higherIsBetter: true, family: 'secondary', get: (m) => m.timeRateAdequate * 100,
  },
  {
    key: 'respondedAt30Min', label: 'Haemodynamic response at thirty minutes', unit: '% of subjects',
    higherIsBetter: true, family: 'secondary', get: (m) => (m.respondedAt30Min ? 100 : 0),
  },
  {
    key: 'timeToStability', label: 'Time to sustained stability', unit: 'min',
    higherIsBetter: false, family: 'secondary',
    get: (m) => (m.timeToStability >= 0 ? m.timeToStability / 60 : 45),
  },
  {
    key: 'atropineMg', label: 'Cumulative atropine', unit: 'mg',
    higherIsBetter: false, family: 'safety', get: (m) => m.atropineMg, margin: 0.4,
  },
  {
    key: 'timeTachycardic', label: 'Time with heart rate above 120', unit: '% of episode',
    higherIsBetter: false, family: 'safety', get: (m) => m.timeTachycardic * 100, margin: 3,
  },
  {
    key: 'pacingFraction', label: 'Time receiving transcutaneous pacing', unit: '% of episode',
    higherIsBetter: false, family: 'safety', get: (m) => m.pacingFraction * 100, margin: 10,
  },
  {
    key: 'settlingTime', label: 'Settling time to the pressure set point', unit: 'min',
    higherIsBetter: false, family: 'control',
    get: (m) => (m.settlingTime >= 0 ? m.settlingTime / 60 : 45),
  },
  {
    key: 'overshoot', label: 'Relative overshoot above set point', unit: 'mmHg',
    higherIsBetter: false, family: 'control', get: (m) => m.overshoot,
  },
  {
    key: 'steadyStateDeviation', label: 'Steady-state deviation from set point', unit: 'mmHg',
    higherIsBetter: false, family: 'control',
    get: (m) => (Number.isFinite(m.steadyStateDeviation) ? Math.abs(m.steadyStateDeviation) : 0),
  },
  {
    key: 'trackingError', label: 'Root mean square tracking error', unit: 'mmHg',
    higherIsBetter: false, family: 'control',
    get: (m) => (Number.isFinite(m.trackingError) ? m.trackingError : 0),
  },
  {
    key: 'therapyChanges', label: 'Therapy adjustments per episode', unit: 'count',
    higherIsBetter: false, family: 'control', get: (m) => m.therapyChanges,
  },
];

/** Run one subject under the learned policy. */
export function runPolicyArm(subject: VirtualSubject, policy: Policy): { m: EpisodeMetrics; reward: number; env: ChronotropicEnv } {
  const env = new ChronotropicEnv(subject, { mode: 'evaluation', useShield: true });
  let obs = env.reset();
  let reward = 0;
  let done = false;
  while (!done) {
    const r = env.step(policy.act(obs));
    reward += r.reward;
    obs = r.obs;
    done = r.done;
  }
  return { m: env.metrics(), reward, env };
}

/** Run one subject under the guideline comparator. */
export function runGuidelineArm(subject: VirtualSubject): { m: EpisodeMetrics; reward: number; env: ChronotropicEnv } {
  const env = new ChronotropicEnv(subject, { mode: 'evaluation', useShield: true });
  env.reset();
  const st = newGuidelineState();
  let reward = 0;
  let done = false;
  while (!done) {
    const a = guidelineAction(env.lastObservation, st, {
      weightKg: subject.weightKg, ischaemic: subject.ischaemic,
    });
    updateGuidelineState(st, a, env.lastObservation.elapsedSeconds);
    const r = env.step(a);
    reward += r.reward;
    done = r.done;
  }
  return { m: env.metrics(), reward, env };
}

export interface TrialOptions {
  n?: number;
  cohortSeed?: number;
  onProgress?: (done: number, total: number, phase: string) => void;
}

export async function runTrial(policy: Policy, opts: TrialOptions = {}): Promise<TrialResult> {
  const n = opts.n ?? 300;
  const cohortSeed = opts.cohortSeed ?? 3003;
  const t0 = Date.now();

  opts.onProgress?.(0, n, 'enrolling');
  const cohort = await enrolCohort(n, cohortSeed, screenSubject, undefined, (done) =>
    opts.onProgress?.(done, n, 'enrolling'),
  );

  const policyArm: ArmResult = { metrics: [], totalReward: [] };
  const guidelineArm: ArmResult = { metrics: [], totalReward: [] };
  const shieldCounts = new Map<string, number>();
  let shieldProposals = 0;
  let shieldTotal = 0;

  for (let i = 0; i < cohort.enrolled.length; i++) {
    const s = cohort.enrolled[i];
    const p = runPolicyArm(s, policy);
    const g = runGuidelineArm(s);
    policyArm.metrics.push(p.m);
    policyArm.totalReward.push(p.reward);
    guidelineArm.metrics.push(g.m);
    guidelineArm.totalReward.push(g.reward);
    shieldProposals += p.env.shieldLog.proposals;
    shieldTotal += p.env.shieldLog.total;
    for (const [k, v] of p.env.shieldLog.counts) {
      shieldCounts.set(k, (shieldCounts.get(k) ?? 0) + v);
    }
    opts.onProgress?.(i + 1, cohort.enrolled.length, 'running');
  }

  // Endpoint analysis.
  const rawP: number[] = [];
  const results: EndpointResult[] = [];
  for (const e of ENDPOINTS) {
    const a = policyArm.metrics.map(e.get);
    const b = guidelineArm.metrics.map(e.get);
    const diff = pairedDifference(a, b, 9001 + results.length);
    const w = wilcoxonSignedRank(a, b);
    let ni: ReturnType<typeof nonInferiority> | undefined;
    if (e.margin !== undefined) {
      ni = nonInferiority(a, b, e.margin, e.higherIsBetter, 7001 + results.length);
    }
    rawP.push(w.p);
    results.push({
      key: e.key, label: e.label, unit: e.unit, higherIsBetter: e.higherIsBetter,
      family: e.family,
      policyMean: mean(a), policySd: sd(a), guidelineMean: mean(b), guidelineSd: sd(b),
      difference: diff, wilcoxonP: w.p, adjustedP: w.p,
      margin: e.margin, nonInferior: ni?.nonInferior, superior: ni?.superior,
    });
  }
  // Control the secondary and safety family; the primary stands alone.
  const familyIdx = results.map((r, i) => ({ r, i })).filter((x) => x.r.family !== 'primary');
  const adj = benjaminiHochberg(familyIdx.map((x) => rawP[x.i]));
  familyIdx.forEach((x, k) => {
    results[x.i].adjustedP = adj[k];
  });

  // Subgroups on the primary endpoint.
  const primary = ENDPOINTS[0];
  const subgroups: SubgroupResult[] = [];
  const byPhenotype = new Map<PhenotypeId, number[]>();
  cohort.enrolled.forEach((s, i) => {
    const arr = byPhenotype.get(s.phenotype) ?? [];
    arr.push(i);
    byPhenotype.set(s.phenotype, arr);
  });
  const addSubgroup = (key: string, label: string, idx: number[]): void => {
    if (idx.length < 6) return;
    const a = idx.map((i) => primary.get(policyArm.metrics[i]));
    const b = idx.map((i) => primary.get(guidelineArm.metrics[i]));
    subgroups.push({
      key, label, n: idx.length,
      policyMean: mean(a), guidelineMean: mean(b),
      difference: pairedDifference(a, b, 5000 + subgroups.length),
    });
  };
  for (const [ph, idx] of byPhenotype) addSubgroup(ph, PHENOTYPE_BY_ID[ph].label, idx);
  const ages = cohort.enrolled.map((s) => s.ageYears);
  const ageCut = median(ages);
  addSubgroup('age_lt', `Age below ${ageCut.toFixed(0)}`, cohort.enrolled.map((s, i) => (s.ageYears < ageCut ? i : -1)).filter((i) => i >= 0));
  addSubgroup('age_ge', `Age ${ageCut.toFixed(0)} and above`, cohort.enrolled.map((s, i) => (s.ageYears >= ageCut ? i : -1)).filter((i) => i >= 0));
  addSubgroup('female', 'Female', cohort.enrolled.map((s, i) => (s.sex === 'F' ? i : -1)).filter((i) => i >= 0));
  addSubgroup('male', 'Male', cohort.enrolled.map((s, i) => (s.sex === 'M' ? i : -1)).filter((i) => i >= 0));
  addSubgroup('ischaemic', 'Documented ischaemia', cohort.enrolled.map((s, i) => (s.ischaemic ? i : -1)).filter((i) => i >= 0));
  addSubgroup('non_ischaemic', 'No documented ischaemia', cohort.enrolled.map((s, i) => (!s.ischaemic ? i : -1)).filter((i) => i >= 0));

  const arrestP = policyArm.metrics.map((m) => m.arrest);
  const arrestG = guidelineArm.metrics.map((m) => m.arrest);
  const mn = mcNemar(arrestP, arrestG);

  const phenotypeCounts: Record<string, number> = {};
  for (const s of cohort.enrolled) {
    const label = PHENOTYPE_BY_ID[s.phenotype].label;
    phenotypeCounts[label] = (phenotypeCounts[label] ?? 0) + 1;
  }

  return {
    generated: new Date().toISOString(),
    policyVersion: policy.bundle.version,
    cohortSeed,
    enrolled: cohort.enrolled.length,
    screened: cohort.screened,
    screenFailureRate: cohort.screenFailures / Math.max(cohort.screened, 1),
    baseline: {
      mapMean: mean(cohort.baselineMap), mapSd: sd(cohort.baselineMap),
      hrMean: mean(cohort.baselineHr), hrSd: sd(cohort.baselineHr),
      ageMean: mean(ages),
      femaleFraction: cohort.enrolled.filter((s) => s.sex === 'F').length / cohort.enrolled.length,
      ischaemicFraction: cohort.enrolled.filter((s) => s.ischaemic).length / cohort.enrolled.length,
      phenotypeCounts,
    },
    endpoints: results,
    subgroups,
    primaryPairs: cohort.enrolled.map((s, i) => ({
      policy: primary.get(policyArm.metrics[i]),
      guideline: primary.get(guidelineArm.metrics[i]),
      phenotype: PHENOTYPE_BY_ID[s.phenotype].label,
    })),
    safety: {
      arrestPolicy: arrestP.filter(Boolean).length,
      arrestGuideline: arrestG.filter(Boolean).length,
      arrestMcNemarP: mn.p,
      collapsePolicy: policyArm.metrics.filter((m) => m.atropineCollapse).length,
      collapseGuideline: guidelineArm.metrics.filter((m) => m.atropineCollapse).length,
      shieldInterventionRate: shieldProposals === 0 ? 0 : shieldTotal / shieldProposals,
      shieldRuleCounts: Object.fromEntries(shieldCounts),
    },
    runtimeSeconds: (Date.now() - t0) / 1000,
  };
}

export { quantile, bootstrapBca };
