/**
 * The safety shield.
 *
 * Architecture note, because this is the load-bearing design decision of the
 * whole platform.
 *
 * A learned policy is a statistical object. Its worst-case behaviour cannot
 * be bounded by inspection, and no amount of held-out testing establishes
 * what it will do on an input it has not seen. That is a genuine obstacle to
 * a marketing submission, and it is not solved by a better learning
 * algorithm.
 *
 * It is solved by putting the safety argument somewhere else. The policy
 * proposes; a deterministic, enumerable, independently verifiable filter
 * disposes. Every rule below is a mechanical predicate over observable
 * quantities, each one traceable to a specific guideline recommendation, drug
 * label limit, or device constraint. The composite system's worst case is
 * therefore bounded by the shield rather than by the policy, and the policy's
 * failure modes degrade performance rather than safety. This is the classical
 * Simplex runtime-assurance pattern, and it is the reason the physiologic
 * closed-loop control standard's requirements for constraints, limits and
 * fallback modes can be met at all by a system with a learned component.
 *
 * It has a second, practical consequence. Because the shield is verified
 * separately from the policy, retraining the policy does not invalidate the
 * shield's verification. That is what makes a predetermined change control
 * plan tractable: the modification protocol has to re-establish performance,
 * not re-establish safety from scratch.
 *
 * Every intervention is counted. The rate at which the shield has to correct
 * the policy is itself a reportable metric - a policy that is frequently
 * overridden is a policy that has not learned the constraints, and that is
 * something a reviewer should be told.
 */

import type { Observation } from '../engine/sensors.ts';

export interface ShieldRule {
  id: string;
  /** One-line statement of the constraint. */
  statement: string;
  /** Where the constraint comes from. */
  provenance: string;
  /** Severity of the hazard it controls. */
  hazard: string;
}

export const SHIELD_RULES: ShieldRule[] = [
  {
    id: 'S1-denervated-atropine',
    statement: 'Atropine is never administered to a heart documented as denervated.',
    provenance:
      'Guideline recommendation Class III: Harm for atropine in transplant recipients without evidence of reinnervation.',
    hazard:
      'Complete atrioventricular block or sinus arrest, reported in one in five transplant recipients, dose-independent and with no escape rhythm.',
  },
  {
    id: 'S2-minimum-dose',
    statement: 'Any atropine dose administered is at least 0.5 mg.',
    provenance:
      'The sinoatrial response to atropine is bimodal, with slowing below roughly half a milligram.',
    hazard: 'Low-dose paradoxical bradycardia in an already bradycardic patient.',
  },
  {
    id: 'S3-dose-interval',
    statement: 'Atropine doses are separated by at least three minutes.',
    provenance:
      'Guideline repeat interval of three to five minutes; the labelled time to peak chronotropic effect is seven to eight minutes.',
    hazard:
      'Dose stacking into the effect-site dead time, exhausting the cumulative limit before the first dose has acted.',
  },
  {
    id: 'S4-cumulative-limit',
    statement: 'Cumulative atropine does not exceed 3 mg.',
    provenance: 'Guideline maximum total dose; approximately the full vagal blockade dose.',
    hazard: 'Anticholinergic toxicity with no further chronotropic benefit.',
  },
  {
    id: 'S5-ischaemic-limit',
    statement:
      'Where myocardial ischaemia is documented, cumulative atropine does not exceed 0.04 mg/kg.',
    provenance: 'Approved labelling limit for patients with coronary artery disease.',
    hazard:
      'Atropine-induced tachycardia raising myocardial oxygen demand; higher initial and cumulative doses have been associated with ventricular tachycardia and fibrillation in acute infarction.',
  },
  {
    id: 'S6-infranodal-atropine',
    statement:
      'Atropine is withheld where the block is documented as infranodal or the escape complex is wide, and pacing is offered instead.',
    provenance:
      'Guideline caution that atropine is unlikely to improve block at the His-Purkinje level and may worsen it.',
    hazard:
      'Sinus acceleration outrunning diseased infranodal conduction, increasing the block ratio and lowering the ventricular rate.',
  },
  {
    id: 'S7-no-indication',
    statement:
      'Atropine is not administered while the rate is at or above 60 and the pressure is at or above 65.',
    provenance: 'Guideline treatment threshold: bradycardia is treated when it causes compromise.',
    hazard: 'Treating a patient who does not require treatment.',
  },
  {
    id: 'S8-mandatory-escalation',
    statement:
      'Where mean arterial pressure has been below 50 for more than sixty seconds and pharmacological options are exhausted or contraindicated, pacing is started regardless of the proposed action.',
    provenance:
      'Guideline escalation to pacing for bradycardia refractory to or unsuitable for atropine.',
    hazard: 'Failure to escalate during sustained hypoperfusion.',
  },
  {
    id: 'S9-output-limit',
    statement: 'Pacing output does not exceed the 140 mA device maximum.',
    provenance: 'Device output specification.',
    hazard: 'Delivery outside the verified operating range.',
  },
  {
    id: 'S10-infusion-limits',
    statement:
      'Infusion rates are held within their labelled ranges and changed by no more than one increment per decision interval.',
    provenance:
      'Guideline infusion ranges: dopamine 5-20 mcg/kg/min, epinephrine 2-10 mcg/min, isoproterenol up to 10 mcg/min.',
    hazard: 'Overshoot and oscillation from unbounded rate changes.',
  },
];

export interface ShieldContext {
  obs: Observation;
  /** Charted myocardial ischaemia. */
  ischaemic: boolean;
  /** Seconds for which mean arterial pressure has been under 50. */
  secondsUnder50: number;
  /** Whether pharmacological chronotropes remain available. */
  pharmacologyExhausted: boolean;
}

export interface ShieldDecision {
  action: number;
  intervened: boolean;
  rule: string | null;
}

/** Cumulative counts of shield activity, reported as a safety metric. */
export class ShieldLog {
  counts = new Map<string, number>();
  total = 0;
  proposals = 0;

  record(rule: string | null): void {
    this.proposals++;
    if (!rule) return;
    this.total++;
    this.counts.set(rule, (this.counts.get(rule) ?? 0) + 1);
  }

  get interventionRate(): number {
    return this.proposals === 0 ? 0 : this.total / this.proposals;
  }

  toJSON(): Record<string, number> {
    return Object.fromEntries(this.counts);
  }
}
