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

const demoDir = join(dist, 'demo');
mkdirSync(demoDir, { recursive: true });
copyFileSync(index, join(demoDir, 'index.html'));

console.log('spa-fallback: wrote dist/404.html and dist/demo/index.html');
