/**
 * Conservative double deep Q-learning with a dueling architecture.
 *
 * Three choices here are made for regulatory tractability rather than for
 * benchmark performance, and each costs a little return:
 *
 *  1. **Conservative Q-learning penalty.** An additional term pushes down the
 *     value of actions the training distribution does not support, so that
 *     the learned value function lower-bounds the true value rather than
 *     over-estimating it. Optimistic extrapolation onto unsupported actions
 *     is the characteristic failure of value-based methods in medicine, and a
 *     value function that is provably conservative is a far easier object to
 *     defend than one that is merely accurate on a held-out set.
 *
 *  2. **Behaviour anchoring.** Exploration is not uniform. A fixed fraction of
 *     actions are drawn from the guideline comparator, so the training
 *     distribution stays centred on standard of care. This keeps off-policy
 *     evaluation meaningful, gives the value function support where the
 *     clinician would actually be, and means the policy is learning to
 *     improve on a known baseline rather than to find its own way from
 *     nothing.
 *
 *  3. **Huber loss on the temporal-difference error.** Bounded influence per
 *     transition, so a single catastrophic episode cannot dominate an update.
 *
 * The policy is *locked* at the end of training. Nothing about this design
 * updates in the field; adaptation, if any, happens through a controlled
 * retraining and revalidation cycle, which is what a predetermined change
 * control plan describes.
 */

import { Rng } from '../engine/rng.ts';
import { DuelingQNetwork } from './mlp.ts';
import { ReplayBuffer } from './replay.ts';

export interface DqnConfig {
  nObs: number;
  nActions: number;
  hidden: number;
  batch: number;
  gamma: number;
  learningRate: number;
  /** Polyak coefficient for the target network. */
  tau: number;
  /** Weight on the conservative penalty. */
  cqlAlpha: number;
  /**
   * Weight on the behaviour-cloning anchor to the guideline comparator.
   *
   * The term is the same functional form as the conservative penalty, but
   * evaluated at the action the guideline would have taken rather than at the
   * action the data contains: it raises the value of the standard-of-care
   * action relative to every alternative. Annealed from `bcWeightStart` to
   * `bcWeightEnd` over training, so the policy begins by imitating the
   * guideline and is progressively released to improve on it.
   *
   * This is the value-based analogue of adding a behaviour-cloning term to a
   * policy-gradient objective, and it is the design a reviewer can most
   * easily reason about: the controller is constrained to stay near an
   * accepted algorithm rather than free to find its own way from nothing.
   */
  bcWeightStart: number;
  bcWeightEnd: number;
  /**
   * Number of environment steps the stored return spans.
   *
   * Atropine's chronotropic effect peaks seven to eight minutes after it is
   * given, which at a thirty-second decision interval is fifteen steps. With
   * single-step bootstrapping the value of giving the drug has to propagate
   * back across fifteen updates before the network can associate the dose
   * with the response. Multi-step returns carry the consequence back directly,
   * and in a domain whose defining feature is a long actuator dead time that
   * is not a tuning detail but a structural requirement.
   */
  nStep: number;
  /**
   * Restrict the behaviour-cloning anchor to states where the guideline
   * intervenes.
   *
   * The comparator observes and waits at roughly four decisions in five. An
   * unweighted anchor is therefore a classification problem with an
   * overwhelming majority class, and the network solves it by never acting -
   * a failure that is invisible in the loss and obvious in the action mix.
   * Anchoring only where the guideline acts teaches the policy *when*
   * intervention is warranted, which is the part worth imitating.
   */
  bcOnlyOnIntervention: boolean;
  /** Huber transition point. */
  huberDelta: number;
  seed: number;
  bufferCapacity: number;
}

export const DEFAULT_DQN: DqnConfig = {
  nObs: 24,
  nActions: 13,
  hidden: 96,
  batch: 48,
  gamma: 0.99,
  learningRate: 3e-4,
  tau: 0.005,
  cqlAlpha: 0.12,
  bcWeightStart: 0.6,
  bcWeightEnd: 0.04,
  nStep: 5,
  bcOnlyOnIntervention: true,
  huberDelta: 1.0,
  seed: 20260902,
  bufferCapacity: 300000,
};

export class ConservativeDqn {
  readonly cfg: DqnConfig;
  readonly online: DuelingQNetwork;
  readonly target: DuelingQNetwork;
  readonly buffer: ReplayBuffer;
  private rng: Rng;

  private bObs: Float64Array;
  private bNext: Float64Array;
  private bAct: Int32Array;
  private bRew: Float64Array;
  private bDone: Uint8Array;
  private gradQ: Float64Array;
  private single: Float64Array;
  /** Preallocated scratch: no allocation happens inside a gradient step. */
  private qNextOnline: Float64Array;
  private targets: Float64Array;
  private bGuide: Int32Array;
  private bSteps: Int32Array;
  /** Training progress in [0, 1], set by the trainer to drive annealing. */
  progress = 0;

  /** Running diagnostics. */
  lastLoss = 0;
  lastQMean = 0;
  lastConservativeGap = 0;
  lastBcGap = 0;
  updates = 0;

  /** Current behaviour-cloning weight under the annealing schedule. */
  get bcWeight(): number {
    const c = this.cfg;
    return c.bcWeightEnd + (c.bcWeightStart - c.bcWeightEnd) * Math.exp(-3.4 * this.progress);
  }

  constructor(cfg: Partial<DqnConfig> = {}) {
    this.cfg = { ...DEFAULT_DQN, ...cfg };
    const c = this.cfg;
    this.rng = new Rng(c.seed);
    this.online = new DuelingQNetwork(c.nObs, c.nActions, c.hidden, c.batch, c.seed);
    this.target = new DuelingQNetwork(c.nObs, c.nActions, c.hidden, c.batch, c.seed + 1);
    this.target.copyFrom(this.online);
    this.buffer = new ReplayBuffer(c.bufferCapacity, c.nObs);
    this.bObs = new Float64Array(c.batch * c.nObs);
    this.bNext = new Float64Array(c.batch * c.nObs);
    this.bAct = new Int32Array(c.batch);
    this.bRew = new Float64Array(c.batch);
    this.bDone = new Uint8Array(c.batch);
    this.gradQ = new Float64Array(c.batch * c.nActions);
    this.single = new Float64Array(c.nObs);
    this.qNextOnline = new Float64Array(c.batch * c.nActions);
    this.targets = new Float64Array(c.batch);
    this.bGuide = new Int32Array(c.batch);
    this.bSteps = new Int32Array(c.batch);
  }

  /** Greedy action for a single observation. */
  greedy(obs: Float64Array): number {
    this.single.set(obs);
    const q = this.online.forward(this.single, 1);
    let best = 0;
    let bv = -Infinity;
    for (let a = 0; a < this.cfg.nActions; a++) {
      if (q[a] > bv) {
        bv = q[a];
        best = a;
      }
    }
    return best;
  }

  /** Action values for a single observation, copied out. */
  values(obs: Float64Array): Float64Array {
    this.single.set(obs);
    return Float64Array.from(this.online.forward(this.single, 1).subarray(0, this.cfg.nActions));
  }

  /** Softmax action probabilities, used as the evaluation policy's density. */
  actionProbabilities(obs: Float64Array, temperature = 1): Float64Array {
    const q = this.values(obs);
    let max = -Infinity;
    for (const v of q) if (v > max) max = v;
    let sum = 0;
    const p = new Float64Array(q.length);
    for (let i = 0; i < q.length; i++) {
      p[i] = Math.exp((q[i] - max) / temperature);
      sum += p[i];
    }
    for (let i = 0; i < p.length; i++) p[i] /= sum;
    return p;
  }

  /** One gradient step. Returns false if the buffer is not yet warm. */
  trainStep(): boolean {
    const c = this.cfg;
    if (this.buffer.size < Math.max(c.batch * 8, 2000)) return false;
    this.buffer.sample(
      this.rng, c.batch, this.bObs, this.bNext, this.bAct, this.bRew, this.bDone,
      this.bGuide, this.bSteps,
    );

    // Double DQN target: the online network selects, the target evaluates.
    this.qNextOnline.set(this.online.forward(this.bNext, c.batch));
    const qNextOnline = this.qNextOnline;
    const qNextTarget = this.target.forward(this.bNext, c.batch);
    const targets = this.targets;
    for (let k = 0; k < c.batch; k++) {
      let best = 0;
      let bv = -Infinity;
      const o = k * c.nActions;
      for (let a = 0; a < c.nActions; a++) {
        if (qNextOnline[o + a] > bv) {
          bv = qNextOnline[o + a];
          best = a;
        }
      }
      const nk = this.bSteps[k] > 0 ? this.bSteps[k] : 1;
      const disc = Math.pow(c.gamma, nk);
      targets[k] = this.bRew[k] + (this.bDone[k] ? 0 : disc * qNextTarget[o + best]);
    }

    const q = this.online.forward(this.bObs, c.batch);
    this.gradQ.fill(0);
    let loss = 0;
    let qMean = 0;
    let gap = 0;
    let bcGap = 0;
    let bcN = 0;
    const bc = this.bcWeight;

    for (let k = 0; k < c.batch; k++) {
      const o = k * c.nActions;
      const a = this.bAct[k];
      const pred = q[o + a];
      qMean += pred;

      // Huber temporal-difference loss.
      const err = pred - targets[k];
      const absErr = Math.abs(err);
      loss += absErr <= c.huberDelta
        ? 0.5 * err * err
        : c.huberDelta * (absErr - 0.5 * c.huberDelta);
      const dTd = absErr <= c.huberDelta ? err : c.huberDelta * Math.sign(err);
      this.gradQ[o + a] += dTd / c.batch;

      /*
       * Conservative penalty: alpha * (logsumexp_a Q(s,a) - Q(s, a_data)).
       *
       * The gradient pushes every action's value down in proportion to its
       * softmax weight and pushes the taken action's value back up, so the
       * net effect is to suppress the value of actions the data does not
       * contain while leaving the observed action's estimate intact.
       */
      let max = -Infinity;
      for (let j = 0; j < c.nActions; j++) if (q[o + j] > max) max = q[o + j];
      let sumExp = 0;
      for (let j = 0; j < c.nActions; j++) sumExp += Math.exp(q[o + j] - max);
      const lse = max + Math.log(sumExp);
      gap += lse - pred;
      loss += (c.cqlAlpha * (lse - pred)) / c.batch;
      for (let j = 0; j < c.nActions; j++) {
        const soft = Math.exp(q[o + j] - max) / sumExp;
        this.gradQ[o + j] += (c.cqlAlpha * soft) / c.batch;
      }
      this.gradQ[o + a] -= c.cqlAlpha / c.batch;

      // Behaviour-cloning anchor on the guideline action, same form.
      const ga = this.bGuide[k];
      const anchorHere = bc > 0 && ga >= 0 && ga < c.nActions &&
        (!c.bcOnlyOnIntervention || ga !== 0);
      if (anchorHere) {
        bcGap += lse - q[o + ga];
        bcN++;
        loss += (bc * (lse - q[o + ga])) / c.batch;
        for (let j = 0; j < c.nActions; j++) {
          const soft = Math.exp(q[o + j] - max) / sumExp;
          this.gradQ[o + j] += (bc * soft) / c.batch;
        }
        this.gradQ[o + ga] -= bc / c.batch;
      }
    }

    this.online.zeroGrad();
    this.online.backward(this.gradQ, c.batch);
    this.online.update(c.learningRate);
    this.target.softUpdateFrom(this.online, c.tau);

    this.lastLoss = loss / c.batch;
    this.lastQMean = qMean / c.batch;
    this.lastConservativeGap = gap / c.batch;
    this.lastBcGap = bcN > 0 ? bcGap / bcN : 0;
    this.updates++;
    return true;
  }
}
