/**
 * Execute the in-silico trial and write the result for the site to render.
 *
 * Usage: node tools/trial.ts [n] [seed]
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Policy, type PolicyBundle } from '../src/rlfda/rl/policy.ts';
import { runTrial } from '../src/rlfda/trial/trial.ts';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'src', 'rlfda', 'data');

const n = Number(process.argv[2] ?? 300);
const seed = Number(process.argv[3] ?? 3003);

const bundle = JSON.parse(
  readFileSync(join(dataDir, 'policy-chronotropic.json'), 'utf8'),
) as PolicyBundle;
const policy = new Policy(bundle);

console.log(`running in-silico trial: n=${n}, cohort seed ${seed}, policy ${bundle.version}`);
let lastPhase = '';
const result = await runTrial(policy, {
  n,
  cohortSeed: seed,
  onProgress: (done, total, phase) => {
    if (phase !== lastPhase) {
      lastPhase = phase;
      process.stdout.write(`\n  ${phase}: `);
    }
    if (done % 25 === 0) process.stdout.write(`${done}/${total} `);
  },
});
process.stdout.write('\n');

mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'trial-results.json'), JSON.stringify(result));

const primary = result.endpoints[0];
console.log(`\nEnrolled ${result.enrolled} of ${result.screened} screened.`);
console.log(
  `Baseline: MAP ${result.baseline.mapMean.toFixed(1)} mmHg, HR ${result.baseline.hrMean.toFixed(1)} bpm, ` +
    `age ${result.baseline.ageMean.toFixed(0)}, ${(result.baseline.femaleFraction * 100).toFixed(0)}% female.`,
);
console.log(`\nPrimary endpoint: ${primary.label}`);
console.log(
  `  learned ${primary.policyMean.toFixed(2)} vs guideline ${primary.guidelineMean.toFixed(2)} ${primary.unit}\n` +
    `  difference ${primary.difference.estimate.toFixed(2)} ` +
    `(95% CI ${primary.difference.low.toFixed(2)} to ${primary.difference.high.toFixed(2)}), ` +
    `p = ${primary.wilcoxonP.toExponential(2)}`,
);
console.log('\nSecondary and safety:');
for (const e of result.endpoints.slice(1)) {
  console.log(
    `  ${e.label.padEnd(52)} ${e.policyMean.toFixed(2).padStart(8)} vs ${e.guidelineMean.toFixed(2).padStart(8)}  ` +
      `diff ${e.difference.estimate.toFixed(2).padStart(7)} [${e.difference.low.toFixed(2)}, ${e.difference.high.toFixed(2)}]  ` +
      `p(adj) ${e.adjustedP.toExponential(1)}` +
      (e.nonInferior !== undefined ? `  ${e.nonInferior ? 'non-inferior' : 'NOT non-inferior'}` : ''),
  );
}
console.log(
  `\nArrest: learned ${result.safety.arrestPolicy}, guideline ${result.safety.arrestGuideline} ` +
    `(McNemar p = ${result.safety.arrestMcNemarP.toFixed(3)})`,
);
console.log(`Shield intervention rate: ${(result.safety.shieldInterventionRate * 100).toFixed(2)}%`);
console.log(`Runtime ${result.runtimeSeconds.toFixed(0)} s`);
