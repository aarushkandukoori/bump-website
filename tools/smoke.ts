/** Smoke test: run the guideline controller over a small cohort. */
import { enrolCohort } from '../src/rlfda/engine/patient.ts';
import { ChronotropicEnv, screenSubject } from '../src/rlfda/envs/chronotropic.ts';
import { guidelineAction, newGuidelineState, updateGuidelineState } from '../src/rlfda/envs/guideline.ts';

const t00 = Date.now();
const enrol = await enrolCohort(24, 4242, screenSubject);
const cohort = enrol.enrolled;
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`screened ${enrol.screened} to enrol ${cohort.length} (${((cohort.length / enrol.screened) * 100).toFixed(0)}% eligible) in ${((Date.now() - t00) / 1000).toFixed(0)} s`);
console.log(`  baseline MAP ${mean(enrol.baselineMap).toFixed(1)} mmHg, HR ${mean(enrol.baselineHr).toFixed(1)} bpm`);
const t0 = Date.now();
let n = 0;
const agg = { tit: 0, twa65: 0, arrest: 0, atro: 0, pace: 0, cap: 0, shield: 0, resp: 0, stab: 0, stabN: 0, collapse: 0 };
for (const s of cohort) {
  const env = new ChronotropicEnv(s, { mode: 'evaluation', useShield: true });
  let obs = env.reset();
  const st = newGuidelineState();
  let done = false;
  while (!done) {
    const a = guidelineAction(env.lastObservation, st, { weightKg: s.weightKg, ischaemic: s.ischaemic });
    updateGuidelineState(st, a, env.lastObservation.elapsedSeconds);
    const r = env.step(a);
    done = r.done;
  }
  const m = env.metrics();
  agg.tit += m.timeInTarget; agg.twa65 += m.twaBelow65; agg.arrest += m.arrest ? 1 : 0;
  agg.atro += m.atropineMg; agg.pace += m.pacingFraction; agg.cap += m.captureFraction;
  agg.shield += m.shieldInterventions; agg.resp += m.respondedAt30Min ? 1 : 0;
  agg.collapse += m.atropineCollapse ? 1 : 0;
  if (m.timeToStability >= 0) { agg.stab += m.timeToStability; agg.stabN++; }
  n++;
}
const el = (Date.now() - t0) / 1000;
console.log(`${n} subjects in ${el.toFixed(1)} s (${(el / n).toFixed(2)} s/episode)`);
console.log(`  time in MAP target      ${(agg.tit / n * 100).toFixed(1)} %`);
console.log(`  TWA below 65            ${(agg.twa65 / n).toFixed(2)} mmHg`);
console.log(`  responded at 30 min     ${(agg.resp / n * 100).toFixed(0)} %`);
console.log(`  median-ish time to stab ${agg.stabN ? (agg.stab / agg.stabN / 60).toFixed(1) : 'n/a'} min (${agg.stabN}/${n} reached)`);
console.log(`  atropine used           ${(agg.atro / n).toFixed(2)} mg`);
console.log(`  pacing fraction         ${(agg.pace / n * 100).toFixed(0)} %`);
console.log(`  true capture fraction   ${(agg.cap / n * 100).toFixed(0)} %`);
console.log(`  arrests                 ${agg.arrest}/${n}`);
console.log(`  atropine collapses      ${agg.collapse}/${n}`);
console.log(`  shield interventions    ${(agg.shield / n).toFixed(1)} per episode`);
