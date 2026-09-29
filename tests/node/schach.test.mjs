// Regeltests Schach (Hülle um chess.js): Sonderzüge, Remisregeln, Zustands-API, PGN, Schwarm, Bot-Stufen.
// Aufruf: node tests/node/schach.test.mjs
import assert from 'node:assert/strict';
import * as S from '../../src/games/schach/engine.js';
import { chooseMove } from '../../src/games/schach/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 5).join('\n   ')}`);
  }
}
const mv = (t) => ({ from: t.slice(0, 2), to: t.slice(2, 4), ...(t[4] ? { promo: t[4] } : {}) });
const play = (s, ...ms) => ms.reduce((st, t) => S.applyMove(st, mv(t)), s);
const has = (s, t) => S.legalMoves(s).some((m) => S.moveKey(m) === t);

test('Grundstellung: 20 Züge, Weiß am Zug, keine Wertung', () => {
  const s = S.initialState();
  assert.equal(S.legalMoves(s).length, 20);
  assert.equal(S.currentPlayer(s), 0);
  assert.equal(S.result(s), null);
  assert.equal(S.evaluate(s, 0), 0);
});

test('Rochade kurz/lang erlaubt, durch Schach verboten, aus dem Schach verboten', () => {
  const s = S.fromFen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(has(s, 'e1g1') && has(s, 'e1c1'));
  // schwarzer Turm auf f-Linie greift f1 an → kurze Rochade verboten (Durchgang), lange erlaubt
  const t = S.fromFen('r3kr2/8/8/8/8/8/8/R3K2R w KQq - 0 1');
  assert.ok(!has(t, 'e1g1') && has(t, 'e1c1'));
  // König im Schach → keine Rochade
  const u = S.fromFen('r3k2r/8/8/8/8/8/4r3/R3K2R w KQkq - 0 1');
  assert.ok(!has(u, 'e1g1') && !has(u, 'e1c1'));
  const after = S.applyMove(s, mv('e1g1'));
  assert.equal(S.board(after)[7][5].type, 'r');
  assert.equal(S.describeMove(s, mv('e1g1')), 'O-O');
});

test('En passant nur unmittelbar danach', () => {
  let s = S.fromFen('4k3/3p4/8/4P3/8/8/8/4K3 b - - 0 1');
  s = play(s, 'd7d5');
  assert.ok(has(s, 'e5d6'));
  const t = S.applyMove(s, mv('e5d6'));
  assert.equal(S.board(t)[3][3], null, 'geschlagener Bauer weg');
  const later = play(s, 'e1e2', 'e8e7');
  assert.ok(!has(later, 'e5d6'), 'später nicht mehr');
});

test('Umwandlung: promo Pflicht, alle 4 Figuren wählbar, Unterverwandlung', () => {
  const s = S.fromFen('8/4P3/8/8/8/8/k7/4K3 w - - 0 1');
  assert.equal(S.isLegal(s, { from: 'e7', to: 'e8' }), false);
  for (const p of 'qrbn') assert.ok(S.isLegal(s, { from: 'e7', to: 'e8', promo: p }));
  assert.equal(S.isLegal(s, { from: 'e7', to: 'e8', promo: 'k' }), false);
  const t = S.applyMove(s, { from: 'e7', to: 'e8', promo: 'n' });
  assert.equal(S.board(t)[0][4].type, 'n');
  assert.equal(S.describeMove(s, { from: 'e7', to: 'e8', promo: 'q' }), 'e8=D');
  assert.equal(S.isLegal(S.initialState(), { from: 'e2', to: 'e4', promo: 'q' }), false);
});

test('Schachmatt (Schäfermatt) → Weiß gewinnt', () => {
  const s = play(S.initialState(), 'e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7');
  assert.deepEqual(S.result(s), { winner: 0, reason: 'Schachmatt' });
  assert.equal(S.legalMoves(s).length, 0);
  assert.equal(S.evaluate(s, 0), 100);
  assert.equal(S.evaluate(s, 1), -100);
});

test('Patt → Remis (auch durch einen Zug erreicht)', () => {
  const q = S.fromFen('k7/2Q5/1K6/8/8/8/8/8 b - - 0 1');
  assert.deepEqual(S.result(q), { winner: null, reason: 'Patt' });
  assert.equal(S.legalMoves(q).length, 0);
  const r = play(S.fromFen('k7/8/1K6/8/8/8/8/2Q5 w - - 0 1'), 'c1c7');
  assert.deepEqual(S.result(r), { winner: null, reason: 'Patt' });
});

test('Zu wenig Material (K+L gegen K) → Remis', () => {
  const s = play(S.fromFen('4k3/8/8/8/8/8/3r4/2B1K3 w - - 0 1'), 'e1d2'); // König schlägt Turm
  assert.deepEqual(S.result(s), { winner: null, reason: 'zu wenig Material' });
});

test('50-Züge-Regel (100 Halbzüge ohne Bauernzug/Schlag)', () => {
  let s = S.fromFen('4k3/8/8/8/8/8/R7/4K3 w - - 98 80');
  s = play(s, 'a2b2', 'e8d8');
  assert.deepEqual(S.result(s), { winner: null, reason: '50-Züge-Regel' });
});

test('Dreifache Stellungswiederholung', () => {
  let s = S.initialState();
  s = play(s, 'g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1');
  assert.equal(S.result(s), null, 'erst zweimal');
  s = play(s, 'f6g8');
  assert.deepEqual(S.result(s), { winner: null, reason: 'dreifache Stellungswiederholung' });
});

test('isLegal wirft nie (Müll)', () => {
  const s = S.initialState();
  for (const m of [null, 1, 'e2e4', [], {}, { from: 'e2' }, { from: 'e2', to: 'e9' }, { from: 'e2', to: 'e4', x: 1 }, { from: 'e7', to: 'e5' }, { from: 'e2', to: 'e5' }]) {
    assert.equal(S.isLegal(s, m), false, JSON.stringify(m));
  }
  assert.equal(S.isLegal({}, { from: 'e2', to: 'e4' }), false);
  assert.throws(() => S.applyMove(s, { from: 'e2', to: 'e5' }));
});

test('PGN-Export mit Kopf und Ergebnis', () => {
  const s = play(S.initialState(), 'f2f3', 'e7e5', 'g2g4', 'd8h4');
  const p = S.pgn(s, { white: 'Peter', black: 'Computer' });
  assert.ok(p.includes('[White "Peter"]') && p.includes('[Result "0-1"]'));
  assert.ok(p.trim().endsWith('1. f3 e5 2. g4 Qh4# 0-1'), p);
});

test('Zustand ist reines JSON und bleibt unverändert', () => {
  const s = S.initialState();
  const before = JSON.stringify(s);
  S.applyMove(s, mv('e2e4'));
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(JSON.parse(JSON.stringify(S.applyMove(s, mv('e2e4')))), S.applyMove(s, mv('e2e4')));
});

test('evaluate: Vorzeichen und Symmetrie (Material in Bauern)', () => {
  const s = S.fromFen('4k3/8/8/8/8/8/PPP5/Q3K3 w - - 0 1');
  assert.equal(S.evaluate(s, 0), 12);
  assert.equal(S.evaluate(s, 1), -12);
});

// Schwarm: Zufallspartien bis Ende oder 300 Halbzüge; Invarianten
test('Schwarm: 150 Zufallspartien, jeder Zug legal, Könige da, Farbe wechselt', () => {
  const rng = mulberry32(7);
  let plies = 0, ends = {};
  for (let g = 0; g < 150; g++) {
    let s = S.initialState();
    for (let i = 0; i < 300 && !s.over; i++) {
      const ms = S.legalMoves(s);
      assert.ok(ms.length > 0);
      const m = pick(rng, ms);
      assert.ok(S.isLegal(s, m));
      const n = S.applyMove(s, m);
      assert.equal(n.turn, 1 - s.turn);
      s = n;
      plies++;
    }
    const b = S.board(s).flat().filter(Boolean);
    assert.equal(b.filter((p) => p.type === 'k').length, 2);
    const k = s.over ? s.over.reason : 'Limit';
    ends[k] = (ends[k] || 0) + 1;
  }
  return `${plies} Halbzüge; ${Object.entries(ends).map(([k, v]) => `${k} ${v}`).join(', ')}`;
});

function match(n, la, lb, seed) {
  const rng = mulberry32(seed);
  let w = 0, d = 0, l = 0;
  for (let g = 0; g < n; g++) {
    let s = S.initialState();
    // Eröffnung würfeln, damit die Partien verschieden sind
    for (let i = 0; i < 4; i++) s = S.applyMove(s, pick(rng, S.legalMoves(s)));
    const aWhite = g % 2 === 0;
    for (let i = 0; i < 160 && !s.over; i++) {
      const lvl = (s.turn === 0) === aWhite ? la : lb;
      s = S.applyMove(s, chooseMove(s, { level: lvl, rng, timeMs: lvl === 3 ? 150 : 60 }));
    }
    const ev = S.evaluate(s, aWhite ? 0 : 1);
    if (s.over && s.over.winner !== null) (s.over.winner === (aWhite ? 0 : 1) ? w++ : l++);
    else if (!s.over && Math.abs(ev) >= 3) (ev > 0 ? w++ : l++); // Abbruch nach Material werten
    else d++;
  }
  return { w, d, l };
}

test('Bot Stufe 2 schlägt Stufe 1 deutlich', () => {
  const r = match(6, 2, 1, 11);
  assert.ok(r.w >= 4 && r.l <= 1, JSON.stringify(r));
  return JSON.stringify(r);
});

test('Bot Stufe 3 mindestens so gut wie Stufe 2', () => {
  const r = match(4, 3, 2, 12);
  assert.ok(r.w >= r.l, JSON.stringify(r));
  return JSON.stringify(r);
});

test('Bot findet Matt in 1 und nimmt hängende Dame', () => {
  const m1 = S.fromFen('6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1');
  assert.equal(S.moveKey(chooseMove(m1, { level: 2 })), 'a1a8');
  const q = S.fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
  assert.equal(S.moveKey(chooseMove(q, { level: 1, rng: () => 0.5 })), 'd1d5');
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
