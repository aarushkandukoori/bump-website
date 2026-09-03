/**
 * Physiological response validation ("emergent model behaviour" evidence).
 *
 * The steady-state validation in report.ts checks that the model sits in the
 * right place. This checks that it *moves* the right way - that the responses
 * the platform's clinical claims depend on arise from the mechanisms, and
 * were not fitted in.
 *
 * The load-bearing check is the atropine response by lesion site. Nothing in
 * this engine contains a rule saying "atropine fails in infranodal block".
 * What it contains is a vagally innervated sinus and AV node, an
 * un-innervated His-Purkinje system, and rate-dependent infranodal
 * conduction. If the model is right, the clinical pattern follows; if the
 * pattern does not follow, the model is wrong. That is the test.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardiacModel, defaultModelConfig } from '../src/rlfda/engine/model.ts';
import { PACING_OFF, type PacingConfig } from '../src/rlfda/engine/conduction.ts';
import { PHENOTYPES, sampleCohort, type PhenotypeId } from '../src/rlfda/engine/patient.ts';
import { measure } from './measure.ts';

const here = dirname(fileURLToPath(import.meta.url));

/** Mean heart rate and MAP over a window, after settling. */
function observe(m: CardiacModel, seconds: number, pacing = PACING_OFF, inf = {}): { hr: number; map: number; co: number } {
  const dt = m.cfg.dt;
  const n = Math.round(seconds / dt);
  let sumMap = 0;
  let beats = 0;
  let sumRr = 0;
  let sumFlow = 0;
  let last = m.beatCount;
  for (let i = 0; i < n; i++) {
    m.step(pacing, inf);
    sumMap += m.snapshotRaw().pAo;
    sumFlow += m.snapshotRaw().qAortic * dt;
    if (m.beatCount !== last) {
      last = m.beatCount;
      beats++;
      sumRr += 60 / Math.max(m.heartRate, 1);
    }
  }
  return {
    hr: beats > 0 ? 60 / (sumRr / beats) : 0,
    map: sumMap / n,
    co: (sumFlow / seconds) * 0.06,
  };
}

/** 1. Cardiac output as a function of paced heart rate. */
function rateResponseCurve(): { rate: number; co: number; sv: number; map: number }[] {
  const rows: { rate: number; co: number; sv: number; map: number }[] = [];
  for (const rate of [30, 35, 40, 45, 50, 60, 70, 80, 90, 100, 120, 140]) {
    const cfg = defaultModelConfig(21);
    cfg.conduction.avBlockDegree = 'third';
    cfg.conduction.escapeFocus = 'none';
    cfg.conduction.intrinsicSinusRate = 0.5;
    const pacing: PacingConfig = {
      mode: 'DDD', rate, avDelay: 0.16, outputMa: 0,
      captureThresholdMa: 0, transcutaneous: false, upperRate: 180,
    };
    const m = measure(new CardiacModel(cfg), {
      settleSeconds: 70, measureSeconds: 25, pacing,
    });
    rows.push({ rate, co: m.cardiacOutput, sv: m.strokeVolume, map: m.map });
  }
  return rows;
}

/** 2. Atrioventricular synchrony: the atrial contribution to stroke volume. */
function avSynchrony(): { avDelayMs: number; sv: number; co: number }[] {
  const rows: { avDelayMs: number; sv: number; co: number }[] = [];
  for (const avDelay of [0.04, 0.08, 0.12, 0.16, 0.2, 0.26, 0.32, 0.4]) {
    const cfg = defaultModelConfig(22);
    cfg.conduction.avBlockDegree = 'third';
    cfg.conduction.escapeFocus = 'none';
    cfg.conduction.intrinsicSinusRate = 0.5;
    const pacing: PacingConfig = {
      mode: 'DDD', rate: 60, avDelay, outputMa: 0,
      captureThresholdMa: 0, transcutaneous: false, upperRate: 180,
    };
    const m = measure(new CardiacModel(cfg), { settleSeconds: 70, measureSeconds: 25, pacing });
    rows.push({ avDelayMs: avDelay * 1000, sv: m.strokeVolume, co: m.cardiacOutput });
  }
  return rows;
}

/** 3. Atropine response by lesion site: the decisive clinical test. */
function atropineByPhenotype(): {
  phenotype: PhenotypeId;
  label: string;
  expectation: string;
  baselineHr: number;
  afterHr: number;
  deltaHr: number;
  baselineMap: number;
  afterMap: number;
  responderRate: number;
  worsenedRate: number;
  n: number;
}[] {
  const out = [];
  for (const ph of PHENOTYPES) {
    const cohort = sampleCohort(40, 90210, ph.id);
    let sumBase = 0;
    let sumAfter = 0;
    let sumBaseMap = 0;
    let sumAfterMap = 0;
    let responders = 0;
    let worsened = 0;
    for (const s of cohort) {
      const m = new CardiacModel(s.cfg);
      m.advance(70);
      const before = observe(m, 30);
      // A full 1 mg intravenous dose, the guideline first dose.
      m.giveAtropine(1.0, 'iv');
      // Allow the effect to develop, then measure at the plateau.
      m.advance(60);
      const after = observe(m, 60);
      sumBase += before.hr;
      sumAfter += after.hr;
      sumBaseMap += before.map;
      sumAfterMap += after.map;
      // Responder: a rise of at least 10 bpm, the conventional threshold for
      // a clinically meaningful chronotropic response.
      if (after.hr - before.hr >= 10) responders++;
      if (after.hr < before.hr - 3) worsened++;
    }
    const n = cohort.length;
    out.push({
      phenotype: ph.id,
      label: ph.label,
      expectation: ph.atropineExpectation,
      baselineHr: sumBase / n,
      afterHr: sumAfter / n,
      deltaHr: (sumAfter - sumBase) / n,
      baselineMap: sumBaseMap / n,
      afterMap: sumAfterMap / n,
      responderRate: responders / n,
      worsenedRate: worsened / n,
      n,
    });
  }
  return out;
}

/** 4. Low-dose paradoxical bradycardia. */
function paradoxicalDoseResponse(): { doseMg: number; nadirDeltaHr: number; peakDeltaHr: number }[] {
  const rows = [];
  for (const dose of [0.1, 0.2, 0.3, 0.5, 1.0, 2.0]) {
    let nadir = 0;
    let peak = 0;
    const cohort = sampleCohort(12, 5150, 'vagal_sinus_bradycardia');
    for (const s of cohort) {
      const m = new CardiacModel(s.cfg);
      m.advance(80);
      const base = observe(m, 25).hr;
      m.giveAtropine(dose, 'iv');
      let lo = 1e9;
      let hi = -1e9;
      // Sample the rate in 10 s windows across the first four minutes.
      for (let w = 0; w < 24; w++) {
        const hr = observe(m, 10).hr;
        lo = Math.min(lo, hr);
        hi = Math.max(hi, hr);
      }
      nadir += lo - base;
      peak += hi - base;
    }
    rows.push({
      doseMg: dose,
      nadirDeltaHr: nadir / cohort.length,
      peakDeltaHr: peak / cohort.length,
    });
  }
  return rows;
}

/** 5. Cumulative-dose ceiling: full vagal blockade. */
function atropineCeiling(): { cumulativeMg: number; hr: number }[] {
  const cohort = sampleCohort(16, 777, 'vagal_sinus_bradycardia');
  const doses = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0, 5.0];
  const sums = new Array(doses.length).fill(0);
  for (const s of cohort) {
    const m = new CardiacModel(s.cfg);
    m.advance(70);
    sums[0] += observe(m, 25).hr;
    for (let i = 1; i < doses.length; i++) {
      m.giveAtropine(doses[i] - doses[i - 1], 'iv');
      m.advance(45);
      sums[i] += observe(m, 30).hr;
    }
  }
  return doses.map((d, i) => ({ cumulativeMg: d, hr: sums[i] / cohort.length }));
}

/** 6. Baroreflex response to an abrupt fall in vascular resistance. */
function baroreflexStep(): { second: number; map: number; hr: number }[] {
  const cfg = defaultModelConfig(31);
  const m = new CardiacModel(cfg);
  m.advance(90);
  const rows: { second: number; map: number; hr: number }[] = [];
  for (let i = 0; i < 5; i++) rows.push({ second: i * 5 - 25, ...pick(observe(m, 5)) });
  // A 35% fall in systemic vascular resistance, the haemodynamic signature of
  // a vasodilatory insult.
  m.cfg.circulation.rSys *= 0.65;
  for (let i = 0; i < 12; i++) rows.push({ second: i * 5, ...pick(observe(m, 5)) });
  return rows;
}

function pick(o: { hr: number; map: number }): { hr: number; map: number } {
  return { hr: o.hr, map: o.map };
}

function main(): void {
  const t0 = Date.now();
  console.log('\n=== 1. Cardiac output versus paced rate (AV sequential, healthy) ===');
  const rate = rateResponseCurve();
  for (const r of rate) {
    console.log(`  ${String(r.rate).padStart(4)} bpm   CO ${r.co.toFixed(2)} L/min   SV ${r.sv.toFixed(1)} mL   MAP ${r.map.toFixed(1)} mmHg`);
  }

  console.log('\n=== 2. Stroke volume versus programmed AV delay (paced 60 bpm) ===');
  const av = avSynchrony();
  const bestAv = av.reduce((a, b) => (b.sv > a.sv ? b : a));
  for (const r of av) {
    const mark = r === bestAv ? '  <- optimum' : '';
    console.log(`  ${String(r.avDelayMs).padStart(5)} ms   SV ${r.sv.toFixed(1)} mL   CO ${r.co.toFixed(2)} L/min${mark}`);
  }

  console.log('\n=== 3. Response to 1 mg intravenous atropine, by lesion site (n=40 each) ===');
  const atro = atropineByPhenotype();
  for (const r of atro) {
    console.log(
      `  ${r.label.padEnd(52)} ${r.baselineHr.toFixed(1).padStart(6)} -> ${r.afterHr.toFixed(1).padStart(6)} bpm  ` +
        `(${(r.deltaHr >= 0 ? '+' : '') + r.deltaHr.toFixed(1)})  responders ${(r.responderRate * 100).toFixed(0)}%  ` +
        `worse ${(r.worsenedRate * 100).toFixed(0)}%   [expected: ${r.expectation}]`,
    );
  }
  const overall = atro.reduce((a, r) => a + r.responderRate * r.n, 0) / atro.reduce((a, r) => a + r.n, 0);
  console.log(`  Unweighted mean responder rate across phenotypes: ${(overall * 100).toFixed(1)}%`);

  console.log('\n=== 4. Low-dose paradoxical bradycardia (vagal sinus bradycardia) ===');
  const par = paradoxicalDoseResponse();
  for (const r of par) {
    console.log(`  ${r.doseMg.toFixed(2)} mg   nadir ${r.nadirDeltaHr.toFixed(1)} bpm   peak +${r.peakDeltaHr.toFixed(1)} bpm`);
  }

  console.log('\n=== 5. Cumulative dose ceiling ===');
  const ceil = atropineCeiling();
  for (const r of ceil) console.log(`  ${r.cumulativeMg.toFixed(1)} mg cumulative   HR ${r.hr.toFixed(1)} bpm`);

  console.log('\n=== 6. Baroreflex response to a 35% fall in systemic resistance ===');
  const baro = baroreflexStep();
  for (const r of baro) {
    console.log(`  t = ${String(r.second).padStart(4)} s   MAP ${r.map.toFixed(1)} mmHg   HR ${r.hr.toFixed(1)} bpm`);
  }

  const outDir = join(here, '..', 'src', 'rlfda', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'physiology-validation.json'),
    JSON.stringify(
      { generated: new Date().toISOString(), rateResponse: rate, avSynchrony: av, atropineByPhenotype: atro, paradoxical: par, ceiling: ceil, baroreflexStep: baro },
      null, 2,
    ),
  );
  console.log(`\nCompleted in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
