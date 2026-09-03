/**
 * Closed-loop lumped-parameter cardiovascular model.
 *
 * Structure (eight elastic compartments, closed circuit):
 *
 *   LA --mitral--> LV --aortic--> AO --R_sys--> VC --R_vc--> RA
 *   RA --tricusp--> RV --pulmon--> PA --R_pul--> PU --R_pu--> LA
 *
 * The four cardiac chambers use the Smith et al. (2004) chamber law, which
 * blends an active end-systolic pressure-volume line with a passive
 * exponential end-diastolic pressure-volume relationship under the
 * activation e(t):
 *
 *   P_chamber = e(t) * E_es * (V - V_d)
 *             + (1 - e(t)) * P_0 * (exp(lambda * (V - V_0)) - 1)
 *
 * The four vascular compartments are linear elastances about an unstressed
 * volume:  P = E * (V - V_u).
 *
 * Two extensions to the bare minimal model are included:
 *
 *  - **Atria.** Smith's minimal model lumps the atria into the venous
 *    compartments. We model them explicitly because the atrial contribution
 *    to ventricular filling ("atrial kick") is the physical quantity that
 *    programmable AV delay and atrioventricular dissociation act on, and both
 *    are central to the pacing and complete-heart-block scenarios.
 *
 *  - **Pericardial constraint.** Total cardiac volume generates a pericardial
 *    pressure that is added to every intracardiac chamber, together with the
 *    intrathoracic pressure. This bounds filling pressures realistically at
 *    the high end-diastolic volumes reached during profound bradycardia.
 *
 * The interventricular septum of the full Smith model is deliberately
 * omitted; see the model credibility record for the justification and the
 * sensitivity analysis supporting that simplification.
 *
 * Units: mmHg, mL, s, mL/s (see units.ts).
 */

/** Indices into the circulation section of the state vector. */
export const V_LV = 0;
export const V_AO = 1;
export const V_VC = 2;
export const V_RA = 3;
export const V_RV = 4;
export const V_PA = 5;
export const V_PU = 6;
export const V_LA = 7;
export const N_CIRC = 8;

export interface ChamberParams {
  /** End-systolic elastance, mmHg/mL. */
  eEs: number;
  /** Volume-axis intercept of the ESPVR, mL. */
  vD: number;
  /** Scale of the passive EDPVR, mmHg. */
  p0: number;
  /** Exponent of the passive EDPVR, 1/mL. */
  lambda: number;
  /** Volume-axis intercept of the EDPVR, mL. */
  v0: number;
}

export interface VesselParams {
  /** Elastance, mmHg/mL. */
  e: number;
  /** Unstressed volume, mL. */
  vU: number;
}

export interface CirculationParams {
  lv: ChamberParams;
  rv: ChamberParams;
  la: ChamberParams;
  ra: ChamberParams;
  ao: VesselParams;
  vc: VesselParams;
  pa: VesselParams;
  pu: VesselParams;
  /** Valve resistances, mmHg*s/mL. */
  rMitral: number;
  rAortic: number;
  rTricuspid: number;
  rPulmonic: number;
  /** Circuit resistances, mmHg*s/mL. */
  rSys: number;
  rPul: number;
  /** Venous return resistances into the atria, mmHg*s/mL. */
  rVc: number;
  rPu: number;
  /** Intrathoracic pressure, mmHg (negative during spontaneous breathing). */
  pThoracic: number;
  /** Pericardial constraint. */
  pericardium: { p0: number; lambda: number; v0: number };
  /** Regurgitant conductance fractions (0 = competent valve). */
  mitralRegurgFrac: number;
  aorticRegurgFrac: number;
}

/**
 * Baseline parameter set.
 *
 * Cardiac chamber and vascular values follow Smith BW, Chase JG, Nokes RI,
 * Shaw GM, Wake G. "Minimal haemodynamic system model including ventricular
 * interaction and valve dynamics." Med Eng Phys 2004;26(2):131-139, with the
 * atrial chambers and the venous-return resistances added here and calibrated
 * so that the intact closed loop reproduces published normal adult
 * haemodynamics (see verification/calibration record).
 */
export const BASELINE_CIRCULATION: CirculationParams = {
  lv: { eEs: 2.8773, vD: 0.0, p0: 0.1203, lambda: 0.033, v0: 0.0 },
  rv: { eEs: 0.585, vD: 0.0, p0: 0.2157, lambda: 0.023, v0: 0.0 },
  la: { eEs: 0.29, vD: 0.0, p0: 0.44, lambda: 0.031, v0: 0.0 },
  ra: { eEs: 0.22, vD: 0.0, p0: 0.36, lambda: 0.029, v0: 0.0 },
  ao: { e: 0.6913, vU: 0.0 },
  vc: { e: 0.0059, vU: 0.0 },
  pa: { e: 0.369, vU: 0.0 },
  pu: { e: 0.0073, vU: 0.0 },
  rMitral: 0.0158,
  rAortic: 0.018,
  rTricuspid: 0.0237,
  rPulmonic: 0.0055,
  rSys: 1.0889,
  rPul: 0.1552,
  rVc: 0.0075,
  rPu: 0.006,
  pThoracic: -4.0,
  pericardium: { p0: 0.5003, lambda: 0.03, v0: 200.0 },
  mitralRegurgFrac: 0.0,
  aorticRegurgFrac: 0.0,
};

/** Deep copy of the baseline parameters, for per-subject perturbation. */
export function cloneCirculation(p: CirculationParams): CirculationParams {
  return {
    lv: { ...p.lv },
    rv: { ...p.rv },
    la: { ...p.la },
    ra: { ...p.ra },
    ao: { ...p.ao },
    vc: { ...p.vc },
    pa: { ...p.pa },
    pu: { ...p.pu },
    rMitral: p.rMitral,
    rAortic: p.rAortic,
    rTricuspid: p.rTricuspid,
    rPulmonic: p.rPulmonic,
    rSys: p.rSys,
    rPul: p.rPul,
    rVc: p.rVc,
    rPu: p.rPu,
    pThoracic: p.pThoracic,
    pericardium: { ...p.pericardium },
    mitralRegurgFrac: p.mitralRegurgFrac,
    aorticRegurgFrac: p.aorticRegurgFrac,
  };
}

/**
 * Cardiac chamber pressure.
 *
 * `eScale` multiplies the active elastance and carries the inotropic state
 * (baroreflex sympathetic drive plus beta-agonist effect); `pExternal` is the
 * pericardial-plus-intrathoracic pressure surrounding the heart.
 */
export function chamberPressure(
  c: ChamberParams,
  v: number,
  activation: number,
  eScale: number,
  pExternal: number,
): number {
  const passiveArg = c.lambda * (v - c.v0);
  // Clamp the exponent: at pathological volumes the raw exponential can
  // overflow and destroy the integration. 30 corresponds to >10^10 mmHg,
  // far outside any physiological state, so the clamp is never active in
  // valid simulations but guarantees numerical robustness.
  const passive = c.p0 * (Math.exp(Math.min(passiveArg, 30)) - 1);
  const active = activation * eScale * c.eEs * (v - c.vD);
  return active + (1 - activation) * passive + pExternal;
}

/** Vascular compartment pressure. Intrathoracic compartments add P_th. */
export function vesselPressure(p: VesselParams, v: number, pExternal: number): number {
  return p.e * (v - p.vU) + pExternal;
}

/**
 * Smoothed diode used for the cardiac valves.
 *
 * A hard `max(0, dP)/R` introduces a derivative discontinuity at valve
 * opening that degrades a fixed-step Runge-Kutta solution and can chatter.
 * We use a logistic gate of width `eps` (0.05 mmHg, far below any
 * physiologically meaningful pressure difference), which is smooth, monotone,
 * and reduces to the ideal diode outside a 0.2 mmHg band.
 *
 * `regurg` adds a small backward conductance for modelling incompetent
 * valves; it is zero for a competent valve.
 */
export function valveFlow(dP: number, r: number, regurg = 0, eps = 0.05): number {
  const gate = 1 / (1 + Math.exp(-dP / eps));
  const forward = (dP / r) * gate;
  const backward = regurg > 0 ? (dP / (r / Math.max(regurg, 1e-9))) * (1 - gate) : 0;
  return forward + backward;
}

/** Everything the derivative function needs that is not a circulation state. */
export interface CirculationDrive {
  /** Activation of each chamber in [0, 1]. */
  eLv: number;
  eRv: number;
  eLa: number;
  eRa: number;
  /** Multiplicative inotropic scaling of ventricular active elastance. */
  inotropyLv: number;
  inotropyRv: number;
  /** Multiplicative scaling of systemic vascular resistance. */
  svrScale: number;
  /** Additive change in venous unstressed volume, mL (venoconstriction < 0). */
  venousUnstressedDelta: number;
  /** Instantaneous intrathoracic pressure, mmHg. */
  pThoracic: number;
}

/** Derived pressures and flows for one evaluation of the model. */
export interface CirculationOutputs {
  pLv: number;
  pRv: number;
  pLa: number;
  pRa: number;
  pAo: number;
  pVc: number;
  pPa: number;
  pPu: number;
  pPericardium: number;
  qMitral: number;
  qAortic: number;
  qTricuspid: number;
  qPulmonic: number;
  qSys: number;
  qPul: number;
  qVc: number;
  qPu: number;
}

const outScratch: CirculationOutputs = {
  pLv: 0, pRv: 0, pLa: 0, pRa: 0, pAo: 0, pVc: 0, pPa: 0, pPu: 0,
  pPericardium: 0, qMitral: 0, qAortic: 0, qTricuspid: 0, qPulmonic: 0,
  qSys: 0, qPul: 0, qVc: 0, qPu: 0,
};

/**
 * Evaluate all pressures and flows for a circulation state.
 *
 * Writes into `out` (defaulting to a module-level scratch object) so the
 * derivative evaluation performs no allocation; this function runs tens of
 * millions of times during training and must not create garbage.
 */
export function evaluateCirculation(
  y: Float64Array,
  base: number,
  p: CirculationParams,
  d: CirculationDrive,
  out: CirculationOutputs = outScratch,
): CirculationOutputs {
  const vLv = y[base + V_LV];
  const vAo = y[base + V_AO];
  const vVc = y[base + V_VC];
  const vRa = y[base + V_RA];
  const vRv = y[base + V_RV];
  const vPa = y[base + V_PA];
  const vPu = y[base + V_PU];
  const vLa = y[base + V_LA];

  // Pericardial constraint from total cardiac volume.
  const vHeart = vLv + vRv + vLa + vRa;
  const pc = p.pericardium;
  const pPeri =
    pc.p0 * (Math.exp(Math.min(pc.lambda * (vHeart - pc.v0), 30)) - 1);
  const pExtHeart = pPeri + d.pThoracic;

  out.pPericardium = pPeri;
  out.pLv = chamberPressure(p.lv, vLv, d.eLv, d.inotropyLv, pExtHeart);
  out.pRv = chamberPressure(p.rv, vRv, d.eRv, d.inotropyRv, pExtHeart);
  out.pLa = chamberPressure(p.la, vLa, d.eLa, d.inotropyLv, pExtHeart);
  out.pRa = chamberPressure(p.ra, vRa, d.eRa, d.inotropyRv, pExtHeart);

  // The aorta and the pulmonary compartments are intrathoracic; the systemic
  // venous compartment is dominated by its extrathoracic capacitance.
  out.pAo = vesselPressure(p.ao, vAo, d.pThoracic);
  out.pPa = vesselPressure(p.pa, vPa, d.pThoracic);
  out.pPu = vesselPressure(p.pu, vPu, d.pThoracic);
  out.pVc = p.vc.e * (vVc - (p.vc.vU + d.venousUnstressedDelta));

  out.qMitral = valveFlow(out.pLa - out.pLv, p.rMitral, p.mitralRegurgFrac);
  out.qAortic = valveFlow(out.pLv - out.pAo, p.rAortic, p.aorticRegurgFrac);
  out.qTricuspid = valveFlow(out.pRa - out.pRv, p.rTricuspid);
  out.qPulmonic = valveFlow(out.pRv - out.pPa, p.rPulmonic);

  // Non-valved conduits carry flow in either direction.
  out.qSys = (out.pAo - out.pVc) / (p.rSys * d.svrScale);
  out.qPul = (out.pPa - out.pPu) / p.rPul;
  out.qVc = (out.pVc - out.pRa) / p.rVc;
  out.qPu = (out.pPu - out.pLa) / p.rPu;

  return out;
}

/** Volume conservation: dV/dt for the eight compartments. */
export function circulationDerivatives(
  o: CirculationOutputs,
  dy: Float64Array,
  base: number,
): void {
  dy[base + V_LV] = o.qMitral - o.qAortic;
  dy[base + V_AO] = o.qAortic - o.qSys;
  dy[base + V_VC] = o.qSys - o.qVc;
  dy[base + V_RA] = o.qVc - o.qTricuspid;
  dy[base + V_RV] = o.qTricuspid - o.qPulmonic;
  dy[base + V_PA] = o.qPulmonic - o.qPul;
  dy[base + V_PU] = o.qPul - o.qPu;
  dy[base + V_LA] = o.qPu - o.qMitral;
}

/** Total stressed blood volume held in the eight compartments, mL. */
export function totalVolume(y: Float64Array, base: number): number {
  let s = 0;
  for (let i = 0; i < N_CIRC; i++) s += y[base + i];
  return s;
}
