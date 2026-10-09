// Stein-Bildchen je Größe (n9 E2): Kachelstufen und Regler – ohne DOM.
// Aufruf: node --test tests/node/sprites.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tileFor, TILES, S, RS, setSpriteScale, spriteScale, sprite } from '../../src/ui/sprites.js';

test('tileFor: kleinste Stufe ohne Hochskalieren, Grenzen', () => {
  assert.equal(tileFor(0), S, 'unbekannt → Standard');
  assert.equal(tileFor(NaN), S);
  // Halma am Handy: Radius ≈ 8 CSS-px × 2,6 ≈ 21 Gerätepixel → braucht 21/0,36 ≈ 58 px Kachel
  assert.equal(tileFor(21), 64);
  // Dame am Handy: Radius ≈ 52 Gerätepixel → 145 px → 168
  assert.equal(tileFor(52), 168);
  // Desktop groß: Radius 80 → 222 → 224; riesig → größte Stufe
  assert.equal(tileFor(80), 224);
  assert.equal(tileFor(500), TILES[TILES.length - 1]);
  for (let r = 1; r < 100; r += 3) {
    const t = tileFor(r);
    assert.ok(TILES.includes(t));
    assert.ok(t * RS / S >= r || t === TILES[TILES.length - 1], `Radius ${r} passt in Kachel ${t}`);
  }
});

test('setSpriteScale: nur gültige Werte', () => {
  setSpriteScale(2.5); assert.equal(spriteScale(), 2.5);
  setSpriteScale(-1); assert.equal(spriteScale(), 0);
  setSpriteScale(Infinity); assert.equal(spriteScale(), 0);
});

test('sprite: ohne DOM null (Vektor-Rückfall)', () => {
  assert.equal(sprite('st:w:'), null);
});
