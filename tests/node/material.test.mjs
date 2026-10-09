// Material-Regler (n9 E2): ?material=0|1, Standard an (seit der Abnahme am Bild).
// Aufruf: node --test tests/node/material.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useMaterial, MATERIAL_DEFAULT, MAT_LIGHT } from '../../src/ui/material.js';

const withSearch = (search, fn) => {
  const old = globalThis.location;
  globalThis.location = { search };
  try { return fn(); } finally { globalThis.location = old; }
};

test('useMaterial: Standard, an, aus', () => {
  withSearch('', () => assert.equal(useMaterial(), MATERIAL_DEFAULT));
  withSearch('?material=1', () => assert.equal(useMaterial(), true));
  withSearch('?material=0', () => assert.equal(useMaterial(), false));
});

test('Standard: Material an', () => assert.equal(MATERIAL_DEFAULT, true));

test('MAT_LIGHT: Muster der Licht-Ebene, weiches Licht', () => {
  assert.equal(MAT_LIGHT.fill, 'url(#dk-matlight)');
  assert.match(MAT_LIGHT.style, /soft-light/);
});
