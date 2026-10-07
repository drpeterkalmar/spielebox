// Kartenbilder aus dem Atlas (n9): Lage, SVG-Ausschnitt, CSS-Prozentlage, Regler ?atlas=0.
// Aufruf: node --test tests/node/cardsprite.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { atlasCell, svgSprite, spriteStyle, cardImgAttrs, atlasFiles, singleUrl, BLANK } from '../../src/ui/cardsprite.js';
import { urlFlag } from '../../src/ui/flags.js';
import { ATLAS } from '../../src/ui/cardatlas.js';

const withSearch = (search, fn) => {
  const old = globalThis.location;
  globalThis.location = { search };
  try { return fn(); } finally { globalThis.location = old; }
};

test('urlFlag: 0/1/sonst Standard', () => {
  withSearch('?atlas=0', () => assert.equal(urlFlag('atlas'), false));
  withSearch('?material=1', () => assert.equal(urlFlag('material', false), true));
  withSearch('?x=1', () => assert.equal(urlFlag('atlas'), true));
  withSearch('', () => assert.equal(urlFlag('material', false), false));
});

test('atlasCell: jede Karte, Datei je Gruppe und Auflösung', () => {
  const c = atlasCell('de', 'HA', true);
  assert.equal(c.href, 'assets/cards/atlas/de-a@2x.webp');
  assert.deepEqual([c.w, c.h], ATLAS.de['2x'].size);
  assert.equal(atlasCell('de', 'S9', false).href, 'assets/cards/atlas/de-b.webp');
  assert.equal(atlasCell('fr', 'KC', true).href, 'assets/cards/atlas/fr-b@2x.webp');
  assert.equal(atlasCell('fr', 'XX', true), null);
  assert.equal(atlasCell('zz', 'HA', true), null);
});

test('svgSprite: Ausschnitt = Karte im Atlas, Rechteck wie bisher das <image>', () => {
  const c = atlasCell('fr', 'TH', true);
  const sp = svgSprite(c, -90, -130, 180, 260);
  assert.equal(sp.outer.viewBox, `${c.x} ${c.y} ${c.w} ${c.h}`);
  assert.deepEqual([sp.outer.x, sp.outer.y, sp.outer.width, sp.outer.height, sp.outer.preserveAspectRatio], [-90, -130, 180, 260, 'none']);
  assert.deepEqual([sp.inner.width, sp.inner.height], [c.W, c.H]);
  assert.equal(sp.outer.class, 'card-face');
});

test('spriteStyle: Prozentlage trifft die Karte bei jeder Elementgröße', () => {
  for (const [deck, card] of [['de', 'EU'], ['fr', 'AS'], ['fr', 'QD'], ['de', 'H7']]) {
    for (const hi of [false, true]) {
      const c = atlasCell(deck, card, hi);
      const css = spriteStyle(c);
      const [sx, sy] = css.match(/background-size:([\d.]+)% ([\d.]+)%/).slice(1).map(Number);
      const [px, py] = css.match(/background-position:([\d.]+)% ([\d.]+)%/).slice(1).map(Number);
      for (const boxW of [30, 60, 133.7]) {
        const boxH = boxW * c.h / c.w;
        const imgW = boxW * sx / 100, imgH = boxH * sy / 100;
        // Versatz laut CSS: (Box − Bild) · p; erwartet: −x · Maßstab
        const offX = (boxW - imgW) * px / 100, offY = (boxH - imgH) * py / 100;
        const k = boxW / c.w;
        assert.ok(Math.abs(offX + c.x * k) < 0.01 && Math.abs(offY + c.y * k) < 0.01, `${deck} ${card} ${hi} ${boxW}`);
      }
      assert.match(css, new RegExp(`aspect-ratio:${c.w} / ${c.h}`));
    }
  }
});

test('cardImgAttrs: Atlas als Hintergrund, ?atlas=0 → Einzeldatei', () => {
  withSearch('', () => {
    const a = cardImgAttrs('de', 'LK', true);
    assert.equal(a.src, BLANK);
    assert.match(a.style, /de-a@2x\.webp/);
  });
  withSearch('?atlas=0', () => assert.deepEqual(cardImgAttrs('de', 'LK', true), { src: singleUrl('de', 'LK', true) }));
  assert.equal(singleUrl('fr', 'TD', false), 'assets/cards/fr/TD.webp');
});

test('atlasFiles: 4 Dateien je Auflösung', () => {
  assert.deepEqual(atlasFiles(true).sort(), ['assets/cards/atlas/de-a@2x.webp', 'assets/cards/atlas/de-b@2x.webp', 'assets/cards/atlas/fr-a@2x.webp', 'assets/cards/atlas/fr-b@2x.webp']);
  assert.equal(atlasFiles(false).length, 4);
});
