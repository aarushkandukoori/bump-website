/**
 * How much of the selected checkpoint's validation return was luck.
 *
 * The shipped policy is the checkpoint with the highest return on a
 * validation cohort of a few dozen subjects. Choosing the maximum of a noisy
 * quantity guarantees that the chosen value overstates the thing it measures,
 * and the smaller the cohort the larger the overstatement. That bias is
 * usually left implicit. It is cheap to measure directly: re-evaluate the same
 * policy on a validation cohort drawn from a seed that played no part in
 * choosing it, and take the difference.
 *
 * The result does not change the trial, which is already run on an
 * independent cohort. It says how much to discount the learning curve.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enrolCohort } from '../src/rlfda/engine/patient.ts';
import { ChronotropicEnv, screenSubject } from '../src/rlfda/envs/chronotropic.ts';
import { Policy, type PolicyBundle } from '../src/rlfda/rl/policy.ts';
import { guidelineActionAt } from '../src/rlfda/envs/guideline.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'src', 'rlfda', 'data');

const FRESH_SEED = 40041;
const N = 48;

async function main(): Promise<void> {
  const bundle = JSON.parse(
    readFileSync(join(dataDir, 'policy-chronotropic.json'), 'utf8'),
  ) as PolicyBundle;
  const curve = JSON.parse(readFileSync(join(dataDir, 'training-curve.json'), 'utf8')) as {
    baseline?: { guidelineReturn: number };
    curve: { episode: number; validReturn: number }[];
  };
  const policy = new Policy(bundle);
  const selectedAt = Number(bundle.provenance.selectedAtEpisode);
  const selectedReturn = Number(bundle.provenance.bestValidationReturn);

  console.log(
    `\nSelection optimism check for policy ${bundle.version}\n` +
      `  selected at episode ${selectedAt} on a validation return of ${selectedReturn.toFixed(2)}\n` +
      `  re-evaluating on a fresh cohort (seed ${FRESH_SEED}, n = ${N})\n`,
  );

  const fresh = await enrolCohort(N, FRESH_SEED, screenSubject);
  let policyTotal = 0;
  let guideTotal = 0;
  for (const s of fresh.enrolled) {
    const pe = new ChronotropicEnv(s, { mode: 'design', useShield: true });
    let o = pe.reset();
    let pr = 0;
    let done = false;
    while (!done) {
      const r = pe.step(policy.act(o));
      pr += r.reward;
      o = r.obs;
      done = r.done;
    }
    policyTotal += pr;

    const ge = new ChronotropicEnv(s, { mode: 'design', useShield: true });
    ge.reset();
    let gr = 0;
    done = false;
    while (!done) {
      const a = guidelineActionAt(ge.lastObservation, {
        weightKg: s.weightKg, ischaemic: s.ischaemic,
      });
      const r = ge.step(a);
      gr += r.reward;
      done = r.done;
    }
    guideTotal += gr;
  }

  const freshReturn = policyTotal / fresh.enrolled.length;
  const freshGuideline = guideTotal / fresh.enrolled.length;
  const optimism = selectedReturn - freshReturn;

  console.log(`  return on the selection cohort   ${selectedReturn.toFixed(2)}`);
  console.log(`  return on the fresh cohort       ${freshReturn.toFixed(2)}`);
  console.log(`  selection optimism               ${optimism.toFixed(2)}`);
  console.log(`  guideline on the fresh cohort    ${freshGuideline.toFixed(2)}`);
  console.log(
    `\n  On an unselected cohort the policy is ${
      freshReturn > freshGuideline ? 'ahead of' : 'behind'
    } the comparator by ${Math.abs(freshReturn - freshGuideline).toFixed(2)}.\n`,
  );

  writeFileSync(
    join(dataDir, 'selection-optimism.json'),
    JSON.stringify(
      {
        generated: new Date().toISOString(),
        policyVersion: bundle.version,
        selectedAtEpisode: selectedAt,
        selectionCohortReturn: selectedReturn,
        freshCohortSeed: FRESH_SEED,
        freshCohortN: fresh.enrolled.length,
        freshCohortReturn: freshReturn,
        freshCohortGuidelineReturn: freshGuideline,
        selectionOptimism: optimism,
        checkpointsEvaluated: curve.curve.length,
      },
      null,
      2,
    ),
  );
  console.log('wrote src/rlfda/data/selection-optimism.json');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
