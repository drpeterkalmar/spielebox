// Kartenpakete (n9): jede @2x-Einzelkarte steckt bitgleich im Paket ihres Blatts, sw.js kennt Paket, Versatz und Länge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const PACKED = Object.fromEntries([...sw.split('const PACKED = {')[1].split('};')[0].matchAll(/'([^']+)': \['([^']+)', (\d+), (\d+)\]/g)]
  .map((m) => [m[1], [m[2], +m[3], +m[4]]]));
const list = (name) => sw.split(`const ${name} = [`)[1].split('];')[0].match(/'[^']+'/g).map((x) => x.slice(1, -1));

test('alle @2x-Einzelkarten im Paket, bitgleich', () => {
  for (const deck of ['de', 'fr']) {
    const cards = readdirSync(join(ROOT, 'assets', 'cards', deck)).filter((f) => f.endsWith('@2x.webp'));
    assert.ok(cards.length >= 32, deck);
    for (const f of cards) {
      const p = `assets/cards/${deck}/${f}`;
      assert.ok(PACKED[p], p + ' fehlt im Paket');
      const [pack, off, len] = PACKED[p];
      const single = readFileSync(join(ROOT, p));
      const slice = readFileSync(join(ROOT, pack)).subarray(off, off + len);
      assert.equal(len, single.length, p);
      assert.ok(Buffer.compare(slice, single) === 0, p + ' weicht im Paket ab');
    }
  }
});

test('Vorab-Liste: Pakete statt Einzelkarten und Atlanten', () => {
  const pre = list('PRE');
  assert.ok(pre.includes('assets/cards/paket/de@2x.bin') && pre.includes('assets/cards/paket/fr@2x.bin'));
  assert.equal(pre.filter((f) => f.startsWith('assets/cards/') && f.endsWith('.webp')).length, 0);
  // Pakete haben einen Inhalts-Hash (Cache-Schlüssel), die Einzelkarten weiter auch (Rückfall, solange das Paket fehlt)
  const hashes = sw.split('const ASSET_HASH = {')[1].split('};')[0];
  assert.match(hashes, /'assets\/cards\/paket\/de@2x\.bin': '[0-9a-f]{10}'/);
  assert.match(hashes, /'assets\/cards\/fr\/KH@2x\.webp': '[0-9a-f]{10}'/);
});
