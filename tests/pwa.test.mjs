// The offline bundle must contain every file the app loads, or the app breaks offline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = d => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });

test('pwa: every JS module, the stylesheet and the icons are precached', () => {
  const sw = readFileSync('sw.js', 'utf8');
  const listed = new Set([...sw.matchAll(/'([^']+)'/g)].map(m => m[1]));
  for (const f of [...walk('assets/js'), 'assets/app.css', 'index.html', 'manifest.webmanifest', ...walk('assets/icons')]) {
    assert.ok(listed.has(f.replaceAll('\\', '/')), `${f} is missing from sw.js PRECACHE`);
  }
});

test('pwa: manifest is linked and installable', () => {
  const html = readFileSync('index.html', 'utf8');
  assert.match(html, /rel="manifest"/);
  const m = JSON.parse(readFileSync('manifest.webmanifest', 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.icons.some(i => i.sizes === '512x512'));
});
