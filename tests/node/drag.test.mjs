// Ziehen (n10 E2): Schwelle (Finger 6 px, Maus 3 px), Neigung ±8°, Eingabe-Puffer (höchstens ein Tipp, nicht zu alt).
// Aufruf: node tests/node/drag.test.mjs
import assert from 'node:assert/strict';
import { ZIEH, dragThreshold, isDrag, tiltDeg, gate, markDrop, recentDrop } from '../../src/ui/drag.js';

let fails = 0, passed = 0;
function ok(name, fn) {
  try { const info = fn(); passed++; console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}

ok('Messgröße 2: Tippen < 6 px (Finger) bzw. < 3 px (Maus) ist nie Ziehen', () => {
  assert.equal(dragThreshold('touch'), 6);
  assert.equal(dragThreshold('mouse'), 3);
  assert.equal(dragThreshold('pen'), 3);
  for (let d = 0; d < 6; d += 0.25) for (let a = 0; a < 6.3; a += 0.3) assert.equal(isDrag(Math.cos(a) * d, Math.sin(a) * d, 'touch'), false, `${d} px`);
  for (let d = 0; d < 3; d += 0.25) assert.equal(isDrag(d, 0, 'mouse'), false);
  assert.equal(isDrag(6, 0, 'touch'), true);
  assert.equal(isDrag(0, 3, 'mouse'), true);
});

ok('Neigung folgt dem Tempo, geglättet, nie über ±8°', () => {
  assert.equal(ZIEH.neigung, 8);
  let t = 0;
  for (let k = 0; k < 40; k++) t = tiltDeg(5, t);
  assert.ok(Math.abs(t - 8) < 0.05, `schnell nach rechts → +8° (${t})`);
  for (let k = 0; k < 40; k++) t = tiltDeg(-50, t);
  assert.ok(Math.abs(t + 8) < 0.05, `schnell nach links → −8° (${t})`);
  for (let k = 0; k < 40; k++) t = tiltDeg(0, t);
  assert.ok(Math.abs(t) < 0.05, 'Stillstand → gerade');
  assert.ok(Math.abs(tiltDeg(0.3, 0)) < 1, 'langsam → kaum Neigung');
});

ok('Landung: Plopp 1,06 → 1 in 120 ms, Zurückfliegen kurz', () => {
  assert.equal(ZIEH.plopp, 1.06);
  assert.equal(ZIEH.landung, 120);
  assert.ok(ZIEH.zurueck <= 200);
});

ok('Eingabe-Puffer: nur der neueste Tipp, höchstens 1,5 s alt, drop() verwirft', () => {
  const got = [];
  const fn = (x, y) => got.push([x, y]);
  gate.hold(fn, [1, 1]);
  gate.hold(fn, [2, 2]);
  assert.equal(gate.flush(), true);
  assert.deepEqual(got, [[2, 2]]);
  assert.equal(gate.flush(), false, 'nur einmal');
  gate.hold(fn, [3, 3]);
  gate.held.at -= 2000;
  assert.equal(gate.flush(), false, 'zu alt');
  gate.hold(fn, [4, 4]);
  gate.drop();
  assert.equal(gate.flush(), false);
  assert.deepEqual(got, [[2, 2]]);
});

ok('Nach dem Ziehen kein zweites Gleiten: recentDrop() einmalig und nur kurz', () => {
  markDrop();
  assert.equal(recentDrop(), true);
  assert.equal(recentDrop(), false);
  markDrop();
  assert.equal(recentDrop(0), false);
});

console.log(`\n${passed} ✅, ${fails} ❌`);
process.exit(fails ? 1 : 0);
