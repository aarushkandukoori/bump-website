/**
 * Steady-state haemodynamic measurement.
 *
 * Runs the model to steady state and then measures, over a whole number of
 * cardiac cycles, every quantity the reference table asks for. Measuring over
 * complete cycles matters: averaging arterial pressure or aortic flow over a
 * fixed wall-clock window that is not an integer multiple of the cycle length
 * introduces a bias that varies with heart rate, which would corrupt exactly
 * the comparisons this platform exists to make.
 */

import { CardiacModel, type ModelConfig } from '../src/rlfda/engine/model.ts';
import { PACING_OFF, type PacingConfig } from '../src/rlfda/engine/conduction.ts';
import type { DrugId } from '../src/rlfda/engine/pharmacology.ts';
import { svrToClinical } from '../src/rlfda/engine/units.ts';

export interface Measurement {
  heartRate: number;
  cardiacOutput: number;
  cardiacIndex: number;
  strokeVolume: number;
  map: number;
  systolic: number;
  diastolic: number;
  pulsePressure: number;
  edv: number;
  esv: number;
  ejectionFraction: number;
  cvp: number;
  pcwp: number;
  meanPa: number;
  svr: number;
  pvr: number;
  lvedp: number;
  strokeWork: number;
  beats: number;
  arrested: boolean;
}

export interface MeasureOptions {
  /** Seconds discarded while the model reaches steady state. */
  settleSeconds?: number;
  /** Seconds of measurement, snapped up to a whole number of beats. */
  measureSeconds?: number;
  pacing?: PacingConfig;
  infusions?: Partial<Record<DrugId, number>>;
}

/**
 * Run `model` to steady state and measure it. The model is consumed: pass a
 * freshly constructed instance, or accept that its state has advanced.
 */
export function measure(model: CardiacModel, opts: MeasureOptions = {}): Measurement {
  const settle = opts.settleSeconds ?? 75;
  const window = opts.measureSeconds ?? 30;
  const pacing = opts.pacing ?? PACING_OFF;
  const infusions = opts.infusions ?? {};
  const dt = model.cfg.dt;

  model.advance(settle, pacing, infusions);

  let sumMap = 0;
  let sumCvp = 0;
  let sumPcwp = 0;
  let sumPa = 0;
  let sumFlow = 0;
  let sumPulFlow = 0;
  let sumPpu = 0;
  let n = 0;
  let sysMax = -1e9;
  let diaMin = 1e9;
  let beats = 0;
  let sumSv = 0;
  let sumEdv = 0;
  let sumEsv = 0;
  let sumEdvGeom = 0;
  let sumRr = 0;
  let sumLvedp = 0;
  let sumWork = 0;
  let work = 0;
  let lastBeat = model.beatCount;
  let peakV = -1e9;
  let pAtPeakV = 0;

  const nSteps = Math.round(window / dt);
  for (let i = 0; i < nSteps; i++) {
    model.step(pacing, infusions);
    const s = model.snapshotRaw();
    sumMap += s.pAo;
    sumCvp += s.pRa;
    sumPcwp += s.pLa;
    sumPa += s.pPa;
    sumPpu += s.pPu;
    sumFlow += s.qAortic * dt;
    sumPulFlow += s.qPulmonic * dt;
    if (s.pAo > sysMax) sysMax = s.pAo;
    if (s.pAo < diaMin) diaMin = s.pAo;
    // External stroke work: pressure times net volume leaving the ventricle.
    work += s.pLv * (s.qAortic - s.qMitral) * dt;
    // End-diastolic pressure is sampled at the largest ventricular volume
    // reached *before* activation begins. Sampling at the volume maximum
    // alone would catch the first milliseconds of isovolumic contraction,
    // when pressure has already risen steeply, and overstate LVEDP.
    if (s.eLv < 0.01 && s.vLv > peakV) {
      peakV = s.vLv;
      pAtPeakV = s.pLv;
    }
    n++;
    if (model.beatCount !== lastBeat) {
      lastBeat = model.beatCount;
      beats++;
      sumSv += model.strokeVolume;
      sumEdv += model.edv;
      sumEsv += model.esv;
      sumEdvGeom += model.strokeVolumeGeometric;
      sumRr += 60 / Math.max(model.heartRate, 1);
      sumLvedp += pAtPeakV;
      sumWork += work;
      work = 0;
      peakV = -1e9;
    }
  }

  const meanMap = sumMap / n;
  const meanCvp = sumCvp / n;
  const meanPcwp = sumPcwp / n;
  const meanPa = sumPa / n;
  const meanPpu = sumPpu / n;
  const co = (sumFlow / window) * 0.06; // mL/s -> L/min
  const pulCo = (sumPulFlow / window) * 0.06;
  const hr = beats > 0 ? 60 / (sumRr / beats) : 0;
  const sv = beats > 0 ? sumSv / beats : 0;
  const edv = beats > 0 ? sumEdv / beats : 0;
  const esv = beats > 0 ? sumEsv / beats : 0;
  const svGeom = beats > 0 ? sumEdvGeom / beats : 0;
  const coMlPerS = (co * 1000) / 60;
  const pulMlPerS = (pulCo * 1000) / 60;

  return {
    heartRate: hr,
    cardiacOutput: co,
    cardiacIndex: co / model.bsa,
    strokeVolume: sv,
    map: meanMap,
    systolic: sysMax,
    diastolic: diaMin,
    pulsePressure: sysMax - diaMin,
    edv,
    esv,
    ejectionFraction: edv > 0 ? (100 * svGeom) / edv : 0,
    cvp: meanCvp,
    pcwp: meanPcwp,
    meanPa,
    svr: coMlPerS > 0 ? svrToClinical((meanMap - meanCvp) / coMlPerS) : 0,
    pvr: pulMlPerS > 0 ? svrToClinical((meanPa - meanPpu) / pulMlPerS) : 0,
    lvedp: beats > 0 ? sumLvedp / beats : 0,
    strokeWork: beats > 0 ? sumWork / beats : 0,
    beats,
    arrested: model.arrested,
  };
}

/** Convenience: build a model from a config and measure it. */
export function measureConfig(cfg: ModelConfig, opts: MeasureOptions = {}): Measurement {
  return measure(new CardiacModel(cfg), opts);
}
