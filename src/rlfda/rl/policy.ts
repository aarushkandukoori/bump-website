/**
 * Inference-only policy.
 *
 * Loads exported network weights and evaluates them. This is the artefact the
 * browser runs, and it is deliberately separate from the trainer: the shipped
 * decision path contains no optimiser, no replay buffer and no capacity to
 * change, which is the concrete meaning of a locked algorithm.
 */

import { DuelingQNetwork } from './mlp.ts';

export interface PolicyWeights {
  nObs: number;
  nActions: number;
  hidden: number;
  l1: { w: number[]; b: number[] };
  l2: { w: number[]; b: number[] };
  lv: { w: number[]; b: number[] };
  la: { w: number[]; b: number[] };
}

export interface PolicyBundle {
  /** Programme this policy controls. */
  program: string;
  /** Version identifier recorded with every result it produced. */
  version: string;
  trainedAt: string;
  weights: PolicyWeights;
  /** Feature names, in order, so a mismatched encoder fails loudly. */
  features: string[];
  actions: string[];
  /** Training provenance, rendered on the evidence page. */
  provenance: Record<string, string | number>;
}

export class Policy {
  readonly bundle: PolicyBundle;
  private net: DuelingQNetwork;
  private buf: Float64Array;

  constructor(bundle: PolicyBundle) {
    this.bundle = bundle;
    const w = bundle.weights;
    this.net = new DuelingQNetwork(w.nObs, w.nActions, w.hidden, 1, 1);
    this.net.loadJSON(w);
    this.buf = new Float64Array(w.nObs);
  }

  /** Action values for one observation. */
  values(obs: Float64Array): Float64Array {
    if (obs.length !== this.bundle.weights.nObs) {
      throw new Error(
        `feature vector has ${obs.length} elements, policy expects ${this.bundle.weights.nObs}`,
      );
    }
    this.buf.set(obs);
    return Float64Array.from(this.net.forward(this.buf, 1).subarray(0, this.bundle.weights.nActions));
  }

  /** Greedy action. */
  act(obs: Float64Array): number {
    const q = this.values(obs);
    let best = 0;
    for (let a = 1; a < q.length; a++) if (q[a] > q[best]) best = a;
    return best;
  }
}
