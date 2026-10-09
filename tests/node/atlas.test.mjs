// Kartenatlas (n9): Raster, Gutter, PSNR, PAM, Manifest – und ob src/ui/cardatlas.js zu den Einzelkarten passt.
// Aufruf: node --test tests/node/atlas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DECKS, groupCards, packGrid, cellOrigin, blitExtrude, crop, psnr, half, parsePAM, writePAM, manifestModule } from '../../tools/atlas_lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('Gruppen: jedes Blatt vollständig, keine Karte doppelt', () => {
  const de = [...groupCards('de', 'a'), ...groupCards('de', 'b')];
  assert.equal(de.length, 32);
  assert.equal(new Set(de).size, 32);
  assert.deepEqual(groupCards('de', 'a').slice(0, 5), ['HA', 'HZ', 'HK', 'HO', 'HU']);
  assert.equal(groupCards('de', 'a').length, 20, 'Schnapsen: 20 Karten in Atlas a');
  const fr = [...groupCards('fr', 'a'), ...groupCards('fr', 'b')];
  assert.equal(fr.length, 52);
  assert.equal(new Set(fr).size, 52);
  assert.ok(fr.includes('TH') && fr.includes('AS') && fr.includes('KC'));
});

test('packGrid: Wunschspalten, Grenze 4096, wenig Leerzellen', () => {
  const de2 = packGrid(20, 480, 766, { gutter: 8, align: 16, prefer: 5 });
  assert.deepEqual([de2.cols, de2.rows, de2.pw, de2.ph], [5, 4, 496, 784]);
  assert.ok(de2.W <= 4096 && de2.H <= 4096);
  // 13 Spalten passen @2x nicht → automatische Wahl
  const fr2 = packGrid(26, 480, 697, { gutter: 8, align: 16, prefer: 13 });
  assert.ok(fr2.W <= 4096 && fr2.H <= 4096, `${fr2.W}×${fr2.H}`);
  assert.equal(fr2.cols * fr2.rows - 26, 2, 'nur 2 Leerzellen (7×4)');
  const fr1 = packGrid(26, 240, 349, { gutter: 4, align: 8, prefer: 13 });
  assert.deepEqual([fr1.cols, fr1.rows], [13, 2]);
  assert.equal(fr1.pw % 8, 0);
  assert.throws(() => packGrid(200, 480, 766, {}), /passen nicht/);
});

test('cellOrigin: Karten liegen im Raster, Gutter ringsum, keine Überlappung', () => {
  const g = packGrid(12, 480, 766, { gutter: 8, align: 16, prefer: 3 });
  const seen = [];
  for (let i = 0; i < 12; i++) {
    const [x, y] = cellOrigin(i, g);
    assert.ok(x >= 8 && y >= 8 && x + 480 + 8 <= g.W && y + 766 + 8 <= g.H, `Zelle ${i}`);
    for (const [ax, ay] of seen) assert.ok(Math.abs(ax - x) >= 480 + 16 || Math.abs(ay - y) >= 766 + 16, 'Abstand ≥ Karte + 2 Gutter');
    seen.push([x, y]);
  }
});

test('blitExtrude: Inhalt exakt, Rand nach außen wiederholt', () => {
  const src = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 0, 1, 2, 3, 4]);   // 2×2
  const W = 8, H = 8, dst = new Uint8Array(W * H * 4);
  blitExtrude(dst, W, H, src, 2, 2, 3, 3, 2);
  assert.deepEqual([...crop(dst, W, 3, 3, 2, 2)], [...src], 'Inhalt unverändert');
  assert.deepEqual([...crop(dst, W, 1, 1, 1, 1)], [10, 20, 30, 255], 'Ecke links oben = Pixel (0,0)');
  assert.deepEqual([...crop(dst, W, 6, 3, 1, 1)], [40, 50, 60, 128], 'rechts = Pixel (1,0)');
  assert.deepEqual([...crop(dst, W, 3, 6, 1, 1)], [70, 80, 90, 0], 'unten = Pixel (0,1)');
  assert.deepEqual([...crop(dst, W, 0, 0, 1, 1)], [0, 0, 0, 0], 'außerhalb des Gutters bleibt leer');
});

test('psnr: gleich = ∞, unsichtbare Farbe zählt nicht, Abweichung wird gemessen', () => {
  const a = new Uint8Array([100, 100, 100, 255, 7, 8, 9, 0]);
  assert.equal(psnr(a, a.slice()).db, Infinity);
  const b = a.slice(); b[4] = 200;   // Farbe eines durchsichtigen Pixels
  assert.equal(psnr(a, b).db, Infinity);
  const c = a.slice(); c[0] = 110;
  const p = psnr(a, c);
  assert.ok(p.db > 30 && p.db < 40, `${p.db}`);
  assert.equal(p.max, 10);
});

test('half: 2×2-Mittel vormultipliziert, durchsichtige Pixel färben nicht ab', () => {
  // links oben rot deckend, die anderen drei durchsichtig grün → Rot mit Alpha 1/4
  const img = new Uint8Array([255, 0, 0, 255, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0]);
  assert.deepEqual([...half(img, 2, 2)], [255, 0, 0, 64]);
  const grey = new Uint8Array(4 * 4 * 4).fill(100);
  assert.deepEqual([...half(grey, 4, 4)], new Array(16).fill(100));
});

test('PAM: schreiben und lesen ergibt dasselbe; RGB wird deckend', () => {
  const data = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  const back = parsePAM(writePAM(3, 1, data));
  assert.deepEqual([back.w, back.h, [...back.data]], [3, 1, [...data]]);
  const rgb = Buffer.concat([Buffer.from('P7\nWIDTH 1\nHEIGHT 1\nDEPTH 3\nMAXVAL 255\nTUPLTYPE RGB\nENDHDR\n', 'latin1'), Buffer.from([9, 8, 7])]);
  assert.deepEqual([...parsePAM(rgb).data], [9, 8, 7, 255]);
});

test('manifestModule: gültiges JS mit allen Karten', async () => {
  const mod = manifestModule({ de: { '1x': { size: [240, 383], files: { a: [1240, 1568] }, cards: { HA: ['a', 4, 4], H9: ['a', 252, 4] } } } });
  const url = 'data:text/javascript;base64,' + Buffer.from(mod).toString('base64');
  const { ATLAS } = await import(url);
  assert.deepEqual(ATLAS.de['1x'].cards.HA, ['a', 4, 4]);
  assert.deepEqual(ATLAS.de['1x'].files.a, [1240, 1568]);
});

test('src/ui/cardatlas.js: jede Karte jedes Blatts, Lage innerhalb der Atlanten', async (t) => {
  const p = join(ROOT, 'src', 'ui', 'cardatlas.js');
  if (!existsSync(p)) { t.skip('noch kein Atlas gebaut'); return; }
  const { ATLAS } = await import(p);
  for (const deck of Object.keys(DECKS)) {
    for (const res of ['1x', '2x']) {
      const m = ATLAS[deck][res];
      const all = Object.keys(DECKS[deck].groups).flatMap((g) => groupCards(deck, g));
      assert.equal(Object.keys(m.cards).length, all.length, `${deck} ${res}`);
      for (const c of all) {
        const [g, x, y] = m.cards[c];
        const [W, H] = m.files[g];
        assert.ok(x >= 0 && y >= 0 && x + m.size[0] <= W && y + m.size[1] <= H, `${deck} ${res} ${c}`);
        assert.ok(W <= 4096 && H <= 4096);
      }
      for (const g of Object.keys(m.files)) {
        const f = join(ROOT, 'assets', 'cards', 'atlas', `${deck}-${g}${res === '2x' ? '@2x' : ''}.webp`);
        assert.ok(existsSync(f) && statSync(f).size > 1000, f);
      }
    }
    // @2x doppelt so breit wie 1× (Höhe gerundet: fr 349 → 697)
    assert.equal(ATLAS[deck]['2x'].size[0], 2 * ATLAS[deck]['1x'].size[0]);
    assert.ok(Math.abs(ATLAS[deck]['2x'].size[1] - 2 * ATLAS[deck]['1x'].size[1]) <= 1);
  }
});
