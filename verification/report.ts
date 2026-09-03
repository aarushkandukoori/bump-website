/**
 * Validation report: measures the calibrated model and compares every
 * reference quantity against its accepted range.
 *
 * Run with `npm run verify`. Writes a machine-readable record to
 * src/rlfda/data/validation.json, which is the source the evidence page
 * renders, so the published table cannot drift from the executed check.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { measureConfig, type Measurement } from './measure.ts';
import { defaultModelConfig } from '../src/rlfda/engine/model.ts';
import { NORMAL_ADULT, type ReferenceValue } from './targets.ts';

const here = dirname(fileURLToPath(import.meta.url));

export interface ValidationRow {
  key: string;
  label: string;
  unit: string;
  measured: number;
  target: number;
  low: number;
  high: number;
  pass: boolean;
  calibrated: boolean;
  source: string;
}

export function validationRows(m: Measurement, refs: ReferenceValue[] = NORMAL_ADULT): ValidationRow[] {
  return refs.map((r) => {
    const measured = (m as unknown as Record<string, number>)[r.key];
    return {
      key: r.key,
      label: r.label,
      unit: r.unit,
      measured,
      target: r.target,
      low: r.low,
      high: r.high,
      pass: measured >= r.low && measured <= r.high,
      calibrated: !r.validationOnly && r.weight > 0,
      source: r.source,
    };
  });
}

export function printRows(rows: ValidationRow[]): number {
  let fails = 0;
  for (const r of rows) {
    if (!r.pass) fails++;
    const tag = r.pass ? 'PASS' : 'FAIL';
    const kind = r.calibrated ? 'calib' : 'valid';
    console.log(
      `  ${tag} [${kind}] ${r.label.padEnd(36)}${r.measured.toFixed(2).padStart(10)}  ` +
        `target ${r.target} [${r.low}, ${r.high}] ${r.unit}`,
    );
  }
  return fails;
}

function main(): void {
  const cfg = defaultModelConfig(3);
  const t0 = Date.now();
  const m = measureConfig(cfg);
  const rows = validationRows(m);
  console.log(`\nSteady-state validation (measured in ${Date.now() - t0} ms, ${m.beats} beats)\n`);
  const fails = printRows(rows);
  console.log(`\n${rows.length - fails}/${rows.length} within accepted range\n`);
  // A non-zero exit makes this usable as a gate: if the model stops
  // reproducing the reference haemodynamics, the run fails rather than
  // quietly writing a report that says so.
  if (fails > 0) process.exitCode = 1;

  const outDir = join(here, '..', 'src', 'rlfda', 'data');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, 'validation.json'),
    JSON.stringify({ generated: new Date().toISOString(), rows }, null, 2),
  );
}

if (import.meta.url === `file://${process.argv[1]}`) main();
