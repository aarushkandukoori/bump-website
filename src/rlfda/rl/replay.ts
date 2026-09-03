/**
 * Fixed-capacity replay buffer over flat typed arrays.
 *
 * Transitions also record which behaviour produced them - learned policy,
 * guideline comparator, or uniform exploration - because off-policy
 * evaluation needs the behaviour policy's action probabilities, and because
 * being able to say what fraction of the training distribution came from
 * standard of care is part of describing the training data.
 */

import { Rng } from '../engine/rng.ts';

export const SOURCE_POLICY = 0;
export const SOURCE_GUIDELINE = 1;
export const SOURCE_RANDOM = 2;

export class ReplayBuffer {
  readonly capacity: number;
  readonly nObs: number;
  private obs: Float64Array;
  private next: Float64Array;
  private act: Int32Array;
  private rew: Float64Array;
  private done: Uint8Array;
  private src: Uint8Array;
  private behaviourProb: Float64Array;
  /** What the guideline comparator would have done in this state. */
  private guide: Int32Array;
  /** Number of environment steps the stored return spans. */
  private nsteps: Int32Array;
  private idx = 0;
  size = 0;

  constructor(capacity: number, nObs: number) {
    this.capacity = capacity;
    this.nObs = nObs;
    this.obs = new Float64Array(capacity * nObs);
    this.next = new Float64Array(capacity * nObs);
    this.act = new Int32Array(capacity);
    this.rew = new Float64Array(capacity);
    this.done = new Uint8Array(capacity);
    this.src = new Uint8Array(capacity);
    this.behaviourProb = new Float64Array(capacity);
    this.guide = new Int32Array(capacity);
    this.nsteps = new Int32Array(capacity);
  }

  push(
    obs: Float64Array, action: number, reward: number,
    next: Float64Array, done: boolean, source: number, behaviourProb: number,
    guidelineAction = -1,
    nSteps = 1,
  ): void {
    const o = this.idx * this.nObs;
    this.obs.set(obs, o);
    this.next.set(next, o);
    this.act[this.idx] = action;
    this.rew[this.idx] = reward;
    this.done[this.idx] = done ? 1 : 0;
    this.src[this.idx] = source;
    this.behaviourProb[this.idx] = behaviourProb;
    this.guide[this.idx] = guidelineAction;
    this.nsteps[this.idx] = nSteps;
    this.idx = (this.idx + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  /** Fill the provided batch arrays with a uniform random sample. */
  sample(
    rng: Rng, n: number,
    obsOut: Float64Array, nextOut: Float64Array,
    actOut: Int32Array, rewOut: Float64Array, doneOut: Uint8Array,
    guideOut?: Int32Array,
    stepsOut?: Int32Array,
  ): void {
    for (let k = 0; k < n; k++) {
      const i = rng.int(this.size);
      obsOut.set(this.obs.subarray(i * this.nObs, (i + 1) * this.nObs), k * this.nObs);
      nextOut.set(this.next.subarray(i * this.nObs, (i + 1) * this.nObs), k * this.nObs);
      actOut[k] = this.act[i];
      rewOut[k] = this.rew[i];
      doneOut[k] = this.done[i];
      if (guideOut) guideOut[k] = this.guide[i];
      if (stepsOut) stepsOut[k] = this.nsteps[i];
    }
  }

  /** Fraction of stored transitions from each behaviour source. */
  sourceMix(): { policy: number; guideline: number; random: number } {
    let p = 0;
    let g = 0;
    let r = 0;
    for (let i = 0; i < this.size; i++) {
      if (this.src[i] === SOURCE_POLICY) p++;
      else if (this.src[i] === SOURCE_GUIDELINE) g++;
      else r++;
    }
    const n = Math.max(this.size, 1);
    return { policy: p / n, guideline: g / n, random: r / n };
  }
}
