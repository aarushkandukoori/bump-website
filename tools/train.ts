/**
 * Train the Programme A chronotropic-rescue policy.
 *
 * Data separation, which is the part that matters:
 *
 *  - The **training cohort** is enrolled from master seed 1001.
 *  - The **validation cohort**, used only for model selection, from seed 2002.
 *  - The **evaluation cohort**, used for the in-silico trial and never seen
 *    here at all, from seed 3003.
 *
 * Because subjects are generated from derived per-subject seeds, these three
 * populations are disjoint by construction and each is reproducible in
 * isolation. Nothing in the trial's population has contributed to selecting
 * the policy that the trial evaluates.
 *
 * Training also runs against the *design* model - coarser integration step,
 * cleaner sensors, catastrophic hazards withheld - while the trial runs the
 * evaluation model. Keeping the model used to design the controller distinct
 * from the model used to evaluate it is an explicit expectation of the
 * physiologic closed-loop control guidance.
 *
 * Usage: node tools/train.ts [episodes]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrolCohort, type VirtualSubject } from '../src/rlfda/engine/patient.ts';
import { ChronotropicEnv, screenSubject, ACTIONS } from '../src/rlfda/envs/chronotropic.ts';
import { guidelineAction, guidelineActionAt, newGuidelineState, updateGuidelineState } from '../src/rlfda/envs/guideline.ts';
import { ConservativeDqn } from '../src/rlfda/rl/dqn.ts';
import { SOURCE_GUIDELINE, SOURCE_POLICY, SOURCE_RANDOM } from '../src/rlfda/rl/replay.ts';
import { FEATURE_NAMES } from '../src/rlfda/envs/common.ts';
import { Rng } from '../src/rlfda/engine/rng.ts';
import type { PolicyBundle } from '../src/rlfda/rl/policy.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'src', 'rlfda', 'data');

const EPISODES = Number(process.argv[2] ?? 1600);
const TRAIN_N = 400;
const VALID_N = 32;
const GRADIENT_STEPS_PER_ENV_STEP = 2;

interface CurvePoint {
  episode: number;
  envSteps: number;
  trainReturn: number;
  validReturn: number;
  validTimeInTarget: number;
  validArrestRate: number;
  validShieldRate: number;
  loss: number;
  qMean: number;
  conservativeGap: number;
  epsilonGuideline: number;
  epsilonRandom: number;
}

/** Run one episode under a fixed policy function; returns metrics and return. */
function rollout(
  subject: VirtualSubject,
  choose: (obs: Float64Array, env: ChronotropicEnv) => number,
  mode: 'design' | 'evaluation',
): { total: number; env: ChronotropicEnv } {
  const env = new ChronotropicEnv(subject, { mode, useShield: true });
  let obs = env.reset();
  let total = 0;
  let done = false;
  while (!done) {
    const a = choose(obs, env);
    const r = env.step(a);
    total += r.reward;
    obs = r.obs;
    done = r.done;
  }
  return { total, env };
}

async function main(): Promise<void> {
  console.log('enrolling cohorts...');
  const t0 = Date.now();
  const train = await enrolCohort(TRAIN_N, 1001, screenSubject);
  const valid = await enrolCohort(VALID_N, 2002, screenSubject);
  console.log(
    `  training  ${train.enrolled.length} enrolled / ${train.screened} screened\n` +
      `  validation ${valid.enrolled.length} enrolled / ${valid.screened} screened  ` +
      `(${((Date.now() - t0) / 1000).toFixed(0)} s)`,
  );

  // Guideline performance on the same validation cohort, computed once. The
  // learning curve is meaningless without the number it has to beat.
  let baseReturn = 0;
  let baseTit = 0;
  let baseArrest = 0;
  for (const s of valid.enrolled) {
    const gs = newGuidelineState();
    const { total, env: e } = rollout(
      s,
      (_o, env) => {
        const a = guidelineAction(env.lastObservation, gs, {
          weightKg: s.weightKg, ischaemic: s.ischaemic,
        });
        updateGuidelineState(gs, a, env.lastObservation.elapsedSeconds);
        return a;
      },
      'design',
    );
    const m = e.metrics();
    baseReturn += total;
    baseTit += m.timeInTarget;
    baseArrest += m.arrest ? 1 : 0;
  }
  const vn = valid.enrolled.length;
  baseReturn /= vn;
  baseTit /= vn;
  baseArrest /= vn;
  console.log(
    `guideline baseline on validation cohort: return ${baseReturn.toFixed(1)}, ` +
      `in-target ${(baseTit * 100).toFixed(1)}%, arrest ${(baseArrest * 100).toFixed(0)}%`,
  );

  const agent = new ConservativeDqn({ nObs: FEATURE_NAMES.length, nActions: ACTIONS.length });
  const rng = new Rng(770077);
  const curve: CurvePoint[] = [];
  let envSteps = 0;
  let bestValid = -Infinity;
  let bestWeights = agent.online.toJSON();
  let bestEpisode = 0;

  const trainStart = Date.now();
  let runningReturn = 0;
  let runningN = 0;
  const actionCounts = new Array(ACTIONS.length).fill(0);

  for (let ep = 0; ep < EPISODES; ep++) {
    const frac = ep / Math.max(EPISODES - 1, 1);
    // Behaviour anchoring: heavy reliance on the guideline early, decaying to
    // a residual fraction so the training distribution never fully leaves it.
    const epsGuide = 0.55 * Math.exp(-3.2 * frac) + 0.10;
    const epsRand = 0.22 * Math.exp(-4.0 * frac) + 0.03;

    agent.progress = frac;
    const subject = train.enrolled[rng.int(train.enrolled.length)];
    const env = new ChronotropicEnv(subject, { mode: 'design', useShield: true });
    let obs = env.reset();
    const gstate = newGuidelineState();
    let done = false;
    let epReturn = 0;
    /*
     * Rolling window of the last n transitions, so that each stored sample
     * carries the discounted return actually observed over the following n
     * decisions rather than a single step.
     */
    const nStep = agent.cfg.nStep;
    const window: {
      obs: Float64Array; action: number; reward: number; guide: number;
      source: number; behaviourProb: number;
    }[] = [];
    const flush = (nextObs: Float64Array, terminal: boolean, all: boolean): void => {
      while (window.length > 0 && (all || window.length >= nStep)) {
        let R = 0;
        for (let i = 0; i < window.length; i++) R += Math.pow(agent.cfg.gamma, i) * window[i].reward;
        const head = window[0];
        // The behaviour recorded is the one that chose the *first* action of
        // the window, since that is the action whose value is being learned.
        agent.buffer.push(
          head.obs, head.action, R, nextObs, terminal,
          head.source, head.behaviourProb, head.guide, window.length,
        );
        window.shift();
        if (!all) break;
      }
    };

    while (!done) {
      let action: number;
      let source: number;
      let behaviourProb: number;
      // The guideline action at this exact state, computed every step: it is
      // both a candidate action and the anchor the value function is
      // regularised towards.
      const guideHere = guidelineActionAt(env.lastObservation, {
        weightKg: subject.weightKg, ischaemic: subject.ischaemic,
      });
      const u = rng.uniform();
      if (u < epsGuide) {
        action = guideHere;
        source = SOURCE_GUIDELINE;
        behaviourProb = epsGuide;
      } else if (u < epsGuide + epsRand) {
        action = rng.int(ACTIONS.length);
        source = SOURCE_RANDOM;
        behaviourProb = epsRand / ACTIONS.length;
      } else {
        action = agent.greedy(obs);
        source = SOURCE_POLICY;
        behaviourProb = 1 - epsGuide - epsRand;
      }
      updateGuidelineState(gstate, action, env.lastObservation.elapsedSeconds);

      const prev = Float64Array.from(obs);
      const res = env.step(action);
      // The transition stored is the action that was *executed*, after the
      // shield. Storing the proposed action would teach the value function
      // the consequences of an action that never happened.
      window.push({
        obs: prev, action: res.executedAction, reward: res.reward, guide: guideHere,
        source, behaviourProb,
      });
      flush(res.obs, res.done, res.done);
      actionCounts[res.executedAction]++;
      obs = res.obs;
      done = res.done;
      epReturn += res.reward;
      envSteps++;

      for (let g = 0; g < GRADIENT_STEPS_PER_ENV_STEP; g++) agent.trainStep();
    }

    runningReturn += epReturn;
    runningN++;

    const isCheckpoint = (ep + 1) % 100 === 0 || ep === EPISODES - 1;
    if (isCheckpoint) {
      let vTotal = 0;
      let vTit = 0;
      let vArrest = 0;
      let vShield = 0;
      const greedyCounts = new Array(ACTIONS.length).fill(0);
      for (const s of valid.enrolled) {
        const e = new ChronotropicEnv(s, { mode: 'design', useShield: true });
        let o = e.reset();
        let total = 0;
        let d = false;
        while (!d) {
          const r = e.step(agent.greedy(o));
          greedyCounts[r.executedAction]++;
          total += r.reward;
          o = r.obs;
          d = r.done;
        }
        const m = e.metrics();
        vTotal += total;
        vTit += m.timeInTarget;
        vArrest += m.arrest ? 1 : 0;
        vShield += e.shieldLog.interventionRate;
      }
      const n = valid.enrolled.length;
      const point: CurvePoint = {
        episode: ep + 1,
        envSteps,
        trainReturn: runningReturn / Math.max(runningN, 1),
        validReturn: vTotal / n,
        validTimeInTarget: vTit / n,
        validArrestRate: vArrest / n,
        validShieldRate: vShield / n,
        loss: agent.lastLoss,
        qMean: agent.lastQMean,
        conservativeGap: agent.lastConservativeGap,
        epsilonGuideline: epsGuide,
        epsilonRandom: epsRand,
      };
      curve.push(point);
      runningReturn = 0;
      runningN = 0;

      if (point.validReturn > bestValid) {
        bestValid = point.validReturn;
        bestWeights = agent.online.toJSON();
        bestEpisode = ep + 1;
      }
      const mins = (Date.now() - trainStart) / 60000;
      console.log(
        `ep ${String(ep + 1).padStart(5)}  train ${point.trainReturn.toFixed(1).padStart(7)}  ` +
          `valid ${point.validReturn.toFixed(1).padStart(7)}  in-target ${(point.validTimeInTarget * 100).toFixed(1)}%  ` +
          `(base ${baseReturn.toFixed(1)} / ${(baseTit * 100).toFixed(1)}%)  ` +
          `arrest ${(point.validArrestRate * 100).toFixed(0)}%  shield ${(point.validShieldRate * 100).toFixed(1)}%  ` +
          `loss ${point.loss.toFixed(3)}  bc ${agent.bcWeight.toFixed(2)}  [${mins.toFixed(0)} min]`,
      );
      // Action mix of the greedy policy: a policy that has collapsed onto a
      // single action is visible here long before it is visible in the return.
      const totalG = greedyCounts.reduce((a, b) => a + b, 0);
      const mix = greedyCounts
        .map((c, i) => ({ a: ACTIONS[i], f: c / totalG }))
        .filter((x) => x.f > 0.02)
        .sort((a, b) => b.f - a.f)
        .map((x) => `${x.a} ${(x.f * 100).toFixed(0)}%`)
        .join(', ');
      console.log(`        greedy mix: ${mix}`);
      // Checkpoint continuously so a long run is never lost.
      writeCheckpoint(bestWeights, bestEpisode, bestValid, curve, agent, train, valid, {
        guidelineReturn: baseReturn, guidelineTimeInTarget: baseTit, guidelineArrestRate: baseArrest,
      });
    }
  }

  writeCheckpoint(bestWeights, bestEpisode, bestValid, curve, agent, train, valid, {
    guidelineReturn: baseReturn, guidelineTimeInTarget: baseTit, guidelineArrestRate: baseArrest,
  });
  console.log(
    `\ndone. best validation return ${bestValid.toFixed(2)} at episode ${bestEpisode}; ` +
      `${envSteps} environment steps, ${agent.updates} gradient steps.`,
  );
}

function writeCheckpoint(
  weights: ReturnType<ConservativeDqn['online']['toJSON']>,
  bestEpisode: number, bestValid: number, curve: CurvePoint[],
  agent: ConservativeDqn,
  train: Awaited<ReturnType<typeof enrolCohort>>,
  valid: Awaited<ReturnType<typeof enrolCohort>>,
  baseline: { guidelineReturn: number; guidelineTimeInTarget: number; guidelineArrestRate: number },
): void {
  mkdirSync(dataDir, { recursive: true });
  const mix = agent.buffer.sourceMix();
  const bundle: PolicyBundle = {
    program: 'chronotropic-rescue',
    version: `A-${bestEpisode}`,
    trainedAt: new Date().toISOString(),
    weights,
    features: [...FEATURE_NAMES],
    actions: [...ACTIONS],
    provenance: {
      algorithm: 'Conservative double deep Q-learning, dueling architecture',
      conservativePenalty: agent.cfg.cqlAlpha,
      discount: agent.cfg.gamma,
      hiddenUnits: agent.cfg.hidden,
      batchSize: agent.cfg.batch,
      learningRate: agent.cfg.learningRate,
      trainingCohortSeed: 1001,
      validationCohortSeed: 2002,
      evaluationCohortSeed: 3003,
      trainingSubjects: train.enrolled.length,
      validationSubjects: valid.enrolled.length,
      trainingScreened: train.screened,
      selectedAtEpisode: bestEpisode,
      bestValidationReturn: +bestValid.toFixed(3),
      gradientSteps: agent.updates,
      behaviourMixPolicy: +mix.policy.toFixed(3),
      behaviourMixGuideline: +mix.guideline.toFixed(3),
      behaviourMixRandom: +mix.random.toFixed(3),
      designModelStepMs: 2,
      evaluationModelStepMs: 1,
    },
  };
  writeFileSync(join(dataDir, 'policy-chronotropic.json'), JSON.stringify(bundle));
  writeFileSync(
    join(dataDir, 'training-curve.json'),
    JSON.stringify({ generated: new Date().toISOString(), baseline, curve }, null, 2),
  );
}

main();
