/**
 * Applies the fitted parameter set from calibrated.json to a model config.
 * Kept separate from the calibrator so that the shipped engine never imports
 * the optimiser.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelConfig } from '../src/rlfda/engine/model.ts';
import { KNOBS } from './calibrate.ts';

const here = dirname(fileURLToPath(import.meta.url));

export function loadFitted(): Record<string, number> {
  const raw = readFileSync(join(here, 'calibrated.json'), 'utf8');
  return JSON.parse(raw).fitted as Record<string, number>;
}

export function applyCalibration(cfg: ModelConfig, fitted = loadFitted()): ModelConfig {
  for (const k of KNOBS) {
    if (fitted[k.name] !== undefined) k.set(cfg, fitted[k.name]);
  }
  return cfg;
}
