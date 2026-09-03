/**
 * A small dense network with explicit forward and backward passes.
 *
 * Written directly against typed arrays rather than pulled from a framework,
 * for three reasons. It runs identically in Node during training and in the
 * browser during a live demonstration, so the policy a viewer watches is
 * bit-for-bit the policy that was trained and evaluated. It has no
 * dependencies to pin, version or audit. And every operation that contributes
 * to a regulated decision is inspectable in a few hundred lines, which is a
 * property worth more here than convenience.
 *
 * Architecture is a dueling head: the network emits a state value and a
 * per-action advantage, and their combination gives the action values. The
 * separation matters in this domain because most of the variance in return
 * comes from which patient you were given rather than from which action you
 * chose, and the dueling form lets the network represent that directly
 * instead of spending capacity encoding it into every action's estimate.
 */

import { Rng } from '../engine/rng.ts';

export interface LayerSpec {
  inSize: number;
  outSize: number;
  activation: 'relu' | 'linear';
}

class Layer {
  readonly inSize: number;
  readonly outSize: number;
  readonly activation: 'relu' | 'linear';
  w: Float64Array;
  b: Float64Array;
  // Adam moments.
  private mw: Float64Array;
  private vw: Float64Array;
  private mb: Float64Array;
  private vb: Float64Array;
  // Scratch for the backward pass.
  gw: Float64Array;
  gb: Float64Array;
  lastIn: Float64Array | null = null;
  lastPre: Float64Array;
  lastOut: Float64Array;

  constructor(spec: LayerSpec, rng: Rng, batch: number) {
    this.inSize = spec.inSize;
    this.outSize = spec.outSize;
    this.activation = spec.activation;
    const n = spec.inSize * spec.outSize;
    this.w = new Float64Array(n);
    this.b = new Float64Array(spec.outSize);
    this.mw = new Float64Array(n);
    this.vw = new Float64Array(n);
    this.mb = new Float64Array(spec.outSize);
    this.vb = new Float64Array(spec.outSize);
    this.gw = new Float64Array(n);
    this.gb = new Float64Array(spec.outSize);
    this.lastPre = new Float64Array(batch * spec.outSize);
    this.lastOut = new Float64Array(batch * spec.outSize);
    // He initialisation for rectified units, Glorot for linear outputs.
    const scale =
      spec.activation === 'relu'
        ? Math.sqrt(2 / spec.inSize)
        : Math.sqrt(1 / spec.inSize);
    for (let i = 0; i < n; i++) this.w[i] = rng.normal() * scale;
  }

  /** Forward pass over a batch of `rows` inputs laid out row-major. */
  forward(input: Float64Array, rows: number): Float64Array {
    this.lastIn = input;
    const { inSize, outSize, w, b } = this;
    for (let r = 0; r < rows; r++) {
      const io = r * inSize;
      const oo = r * outSize;
      for (let j = 0; j < outSize; j++) {
        let sum = b[j];
        const wo = j * inSize;
        for (let i = 0; i < inSize; i++) sum += w[wo + i] * input[io + i];
        this.lastPre[oo + j] = sum;
        this.lastOut[oo + j] = this.activation === 'relu' ? (sum > 0 ? sum : 0) : sum;
      }
    }
    return this.lastOut;
  }

  /**
   * Backward pass. `gradOut` holds dLoss/dOut for the batch; returns
   * dLoss/dIn in `gradIn`. Accumulates parameter gradients.
   */
  backward(gradOut: Float64Array, rows: number, gradIn: Float64Array | null): void {
    const { inSize, outSize, w, gw, gb, lastIn } = this;
    if (gradIn) gradIn.fill(0, 0, rows * inSize);
    for (let r = 0; r < rows; r++) {
      const io = r * inSize;
      const oo = r * outSize;
      for (let j = 0; j < outSize; j++) {
        let g = gradOut[oo + j];
        if (this.activation === 'relu' && this.lastPre[oo + j] <= 0) g = 0;
        if (g === 0) continue;
        gb[j] += g;
        const wo = j * inSize;
        for (let i = 0; i < inSize; i++) {
          gw[wo + i] += g * lastIn![io + i];
          if (gradIn) gradIn[io + i] += g * w[wo + i];
        }
      }
    }
  }

  zeroGrad(): void {
    this.gw.fill(0);
    this.gb.fill(0);
  }

  /** Adam update. `t` is the global step, used for bias correction. */
  adam(lr: number, t: number, beta1 = 0.9, beta2 = 0.999, eps = 1e-8, scale = 1): void {
    const bc1 = 1 - Math.pow(beta1, t);
    const bc2 = 1 - Math.pow(beta2, t);
    for (let i = 0; i < this.w.length; i++) {
      const g = this.gw[i] * scale;
      this.mw[i] = beta1 * this.mw[i] + (1 - beta1) * g;
      this.vw[i] = beta2 * this.vw[i] + (1 - beta2) * g * g;
      this.w[i] -= (lr * (this.mw[i] / bc1)) / (Math.sqrt(this.vw[i] / bc2) + eps);
    }
    for (let j = 0; j < this.b.length; j++) {
      const g = this.gb[j] * scale;
      this.mb[j] = beta1 * this.mb[j] + (1 - beta1) * g;
      this.vb[j] = beta2 * this.vb[j] + (1 - beta2) * g * g;
      this.b[j] -= (lr * (this.mb[j] / bc1)) / (Math.sqrt(this.vb[j] / bc2) + eps);
    }
  }
}

/**
 * Dueling action-value network.
 *
 *   trunk: obs -> h1 -> h2
 *   value head:     h2 -> 1
 *   advantage head: h2 -> nActions
 *   Q(s,a) = V(s) + A(s,a) - mean_a A(s,a)
 */
export class DuelingQNetwork {
  readonly nObs: number;
  readonly nActions: number;
  readonly hidden: number;
  readonly batch: number;
  private l1: Layer;
  private l2: Layer;
  private lv: Layer;
  private la: Layer;
  private q: Float64Array;
  private gv: Float64Array;
  private ga: Float64Array;
  private g2: Float64Array;
  private g1: Float64Array;
  /** Scratch for the advantage head's input gradient; never reallocated. */
  private gaIn: Float64Array;
  private step = 0;

  constructor(nObs: number, nActions: number, hidden: number, batch: number, seed: number) {
    const rng = new Rng(seed);
    this.nObs = nObs;
    this.nActions = nActions;
    this.hidden = hidden;
    this.batch = batch;
    this.l1 = new Layer({ inSize: nObs, outSize: hidden, activation: 'relu' }, rng, batch);
    this.l2 = new Layer({ inSize: hidden, outSize: hidden, activation: 'relu' }, rng, batch);
    this.lv = new Layer({ inSize: hidden, outSize: 1, activation: 'linear' }, rng, batch);
    this.la = new Layer({ inSize: hidden, outSize: nActions, activation: 'linear' }, rng, batch);
    this.q = new Float64Array(batch * nActions);
    this.gv = new Float64Array(batch);
    this.ga = new Float64Array(batch * nActions);
    this.g2 = new Float64Array(batch * hidden);
    this.g1 = new Float64Array(batch * hidden);
    this.gaIn = new Float64Array(batch * hidden);
  }

  /** Action values for a batch of observations. Returns a row-major view. */
  forward(obs: Float64Array, rows: number): Float64Array {
    const h1 = this.l1.forward(obs, rows);
    const h2 = this.l2.forward(h1, rows);
    const v = this.lv.forward(h2, rows);
    const a = this.la.forward(h2, rows);
    const n = this.nActions;
    for (let r = 0; r < rows; r++) {
      let mean = 0;
      const ao = r * n;
      for (let j = 0; j < n; j++) mean += a[ao + j];
      mean /= n;
      const vr = v[r];
      for (let j = 0; j < n; j++) this.q[ao + j] = vr + a[ao + j] - mean;
    }
    return this.q;
  }

  /**
   * Backward pass from dLoss/dQ. Gradients flow through the dueling
   * combination: the value head receives the sum over actions, and the
   * advantage head receives the mean-centred gradient.
   */
  backward(gradQ: Float64Array, rows: number): void {
    const n = this.nActions;
    for (let r = 0; r < rows; r++) {
      const o = r * n;
      let sum = 0;
      for (let j = 0; j < n; j++) sum += gradQ[o + j];
      this.gv[r] = sum;
      const m = sum / n;
      for (let j = 0; j < n; j++) this.ga[o + j] = gradQ[o + j] - m;
    }
    this.lv.backward(this.gv, rows, this.g2);
    // The advantage head's input gradient adds to the value head's.
    this.la.backward(this.ga, rows, this.gaIn);
    const m = rows * this.hidden;
    for (let i = 0; i < m; i++) this.g2[i] += this.gaIn[i];
    this.l2.backward(this.g2, rows, this.g1);
    this.l1.backward(this.g1, rows, null);
  }

  zeroGrad(): void {
    this.l1.zeroGrad();
    this.l2.zeroGrad();
    this.lv.zeroGrad();
    this.la.zeroGrad();
  }

  update(lr: number, scale = 1): void {
    this.step++;
    this.l1.adam(lr, this.step, 0.9, 0.999, 1e-8, scale);
    this.l2.adam(lr, this.step, 0.9, 0.999, 1e-8, scale);
    this.lv.adam(lr, this.step, 0.9, 0.999, 1e-8, scale);
    this.la.adam(lr, this.step, 0.9, 0.999, 1e-8, scale);
  }

  /** Polyak-average this network's parameters towards `src`. */
  softUpdateFrom(src: DuelingQNetwork, tau: number): void {
    const pairs: [Layer, Layer][] = [
      [this.l1, src.l1], [this.l2, src.l2], [this.lv, src.lv], [this.la, src.la],
    ];
    for (const [dst, s] of pairs) {
      for (let i = 0; i < dst.w.length; i++) dst.w[i] += tau * (s.w[i] - dst.w[i]);
      for (let i = 0; i < dst.b.length; i++) dst.b[i] += tau * (s.b[i] - dst.b[i]);
    }
  }

  copyFrom(src: DuelingQNetwork): void {
    this.softUpdateFrom(src, 1);
  }

  /** Serialise the parameters for shipping to the browser. */
  toJSON(): {
    nObs: number; nActions: number; hidden: number;
    l1: { w: number[]; b: number[] }; l2: { w: number[]; b: number[] };
    lv: { w: number[]; b: number[] }; la: { w: number[]; b: number[] };
  } {
    const pack = (l: Layer) => ({ w: Array.from(l.w, (x) => +x.toPrecision(7)), b: Array.from(l.b, (x) => +x.toPrecision(7)) });
    return {
      nObs: this.nObs, nActions: this.nActions, hidden: this.hidden,
      l1: pack(this.l1), l2: pack(this.l2), lv: pack(this.lv), la: pack(this.la),
    };
  }

  loadJSON(j: ReturnType<DuelingQNetwork['toJSON']>): void {
    const set = (l: Layer, d: { w: number[]; b: number[] }) => {
      l.w.set(d.w);
      l.b.set(d.b);
    };
    set(this.l1, j.l1);
    set(this.l2, j.l2);
    set(this.lv, j.lv);
    set(this.la, j.la);
  }
}
