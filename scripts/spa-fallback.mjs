import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * GitHub Pages has no SPA fallback. Copy index.html so /demo and unknown
 * paths still boot the React router.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const index = join(dist, 'index.html');

if (!existsSync(index)) {
  console.error('spa-fallback: dist/index.html missing — run vite build first');
  process.exit(1);
}

copyFileSync(index, join(dist, '404.html'));

/*
 * Every client-side route also gets a real directory index, so the server
 * answers 200 rather than falling through to 404.html. That matters for
 * shared links and for anything that reads the status code.
 */
const routes = [
  'demo',
  'RL-FDA-Approval',
  'RL-FDA-Approval/simulator',
  'RL-FDA-Approval/trial',
  'RL-FDA-Approval/evidence',
  'RL-FDA-Approval/methods',
];

for (const route of routes) {
  const dir = join(dist, route);
  mkdirSync(dir, { recursive: true });
  copyFileSync(index, join(dir, 'index.html'));
}

console.log(`spa-fallback: wrote dist/404.html and ${routes.length} route indexes`);
