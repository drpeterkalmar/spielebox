// n11 Etappe A: „Wer gewinnt?“ ehrlich – exakt-Kennzeichen, schneller Reversi-Löser gegen einfache Referenz,
// Kalibrier-Kurven monoton, Wortwahl („Vorteil“, „Sieg sicher bei bestem Spiel“).
// Aufruf: node tests/node/n11_eval.test.mjs
import assert from 'node:assert/strict';
import * as RV from '../../src/games/reversi/engine.js';
import * as V4 from '../../src/games/vier/engine.js';
import { EVAL, evalPosition, evalText, rvSteil, P_SICHER } from '../../src/evalpos.js';
import { chooseMove as rvBot } from '../../src/games/reversi/bot.js';
import { mulberry32 } from '../../src/rng.js';

let fails = 0;
function test(name, fn) {
  try { const info = fn(); console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 5).join('\n   ')}`); }
}

// einfache Referenz: Minimax ohne Sortierung und ohne Schnitte über die öffentliche Engine
function ref(s) {
  if (RV.result(s)) { const [b, w] = RV.counts(s), d = b - w, e = 64 - b - w; const v = d > 0 ? d + e : d < 0 ? d - e : 0; return s.turn === 0 ? v : -v; }
  let best = -Infinity;
  for (const m of RV.legalMoves(s)) {
    const n = RV.applyMove(s, m);
    const v = RV.result(n) ? ref({ ...n, turn: s.turn }) : n.turn === s.turn ? ref(n) : -ref(n);
    if (v > best) best = v;
  }
  return best;
}

// Stellungen mit genau e leeren Feldern aus Partien Stufe 2 gegen Stufe 2 (Zufallseröffnung)
function positions(e, n, seed = 1) {
  const out = [];
  for (let g = 0; out.length < n && g < n * 4; g++) {
    const rng = mulberry32(seed * 1000 + g);
    let s = RV.initialState();
    for (let k = 0; k < 6; k++) { const l = RV.legalMoves(s); s = RV.applyMove(s, l[Math.floor(rng() * l.length)]); }
    while (!RV.result(s) && RV.empties(s) > e) s = RV.applyMove(s, rvBot(s, { level: 2, rng }));
    if (!RV.result(s) && RV.empties(s) === e) out.push(s);
  }
  return out;
}

test('Reversi: schneller Löser = Referenz-Minimax (60 Stellungen, 5–8 leer)', () => {
  let n = 0;
  for (const e of [5, 6, 7, 8]) for (const s of positions(e, 15, e)) { assert.equal(RV.solveExact(s, Infinity), ref(s), RV.positionKey(s)); n++; }
  return `${n} Stellungen`;
});

test('Reversi: evaluateInfo exakt bis SOLVE_EMPTIES, darüber Schätzung; Partie aus = exakt', () => {
  assert.equal(RV.SOLVE_EMPTIES, 12);
  let ex = 0, tot = 0;
  for (const s of positions(12, 40, 3)) {
    const r = RV.evaluateInfo(s, 0); tot++;
    if (r.exact) { ex++; assert.equal(r.x, (s.turn === 0 ? 1 : -1) * RV.solveExact(s, Infinity) + 0); }
    assert.equal(RV.evaluateInfo(s, 1).x, -r.x + 0, 'Symmetrie');
  }
  assert.ok(ex >= tot * 0.9, `bei 12 leeren Feldern fast immer exakt (${ex}/${tot})`);
  for (const s of positions(24, 10, 4)) assert.equal(RV.evaluateInfo(s, 0).exact, false);
  // 13–18 leer: nur „wer gewinnt“ bewiesen (Nullfenster), Vorzeichen = volle Lösung
  let w = 0;
  for (const s of positions(15, 12, 8)) {
    const r = RV.evaluateInfo(s, 0);
    if (!r.exact) continue;
    w++;
    assert.equal(r.wld, true);
    assert.equal(r.x, Math.sign((s.turn === 0 ? 1 : -1) * RV.solveExact(s, Infinity)) + 0);
  }
  assert.ok(w >= 8, `bei 15 leeren Feldern meist bewiesen (${w}/12)`);
  const end = RV.setup(['xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'xxxxxxxx', 'oooooooo', 'oooooooo', 'oooooooo', 'ooooooox']);
  assert.ok(RV.result(end));
  assert.deepEqual(RV.evaluateInfo(end, 0), { x: 2, exact: true });
  return `${ex}/${tot} exakt bei 12 leer`;
});

test('Reversi: ?solve=N senkt die Grenze, Knotenbudget fällt auf Schätzung zurück', () => {
  const s = positions(10, 1, 5)[0];
  assert.equal(RV.evaluateInfo(s, 0).exact, true);
  assert.equal(RV.evaluateInfo(s, 0, { solve: 0 }).exact, false);
  assert.equal(RV.evaluateInfo(s, 0, { solve: 8 }).wld, true);
  assert.equal(RV.evaluateInfo(s, 0, { nodes: 5 }).exact, false);
  assert.equal(RV.solveExact(s, 5), null);
});

test('Vier: evaluateInfo – bewiesener Gewinn exakt, sonst Schätzung', () => {
  const s0 = V4.initialState(V4.normalizeOptions({}));
  assert.deepEqual(V4.evaluateInfo(s0, 0), { x: 0, exact: false });
  // Rot hat unten drei in einer Reihe mit zwei freien Enden → Gewinn bewiesen
  let s = s0;
  for (const c of [2, 2, 3, 3, 4, 4]) s = V4.applyMove(s, { col: c });
  const r = V4.evaluateInfo(s, 0);
  assert.equal(r.exact, true);
  assert.equal(r.x, 99);
  assert.equal(V4.evaluateInfo(s, 1).x, -99);
});

test('evalPosition: exakt → 99 % / 1 % / 50 % und Text ohne Prozentzahl', () => {
  // Weiß am Zug kann nicht mehr verlieren? Wir nehmen Stellungen aus Partien und prüfen die Abbildung
  let w = 0, l = 0;
  for (const s of positions(10, 30, 6)) {
    const r = evalPosition('reversi', s, 0);
    assert.equal(r.exact, true);
    if (r.x > 0) { w++; assert.equal(r.p, P_SICHER); assert.match(evalText('reversi', r), /^Sieg sicher bei bestem Spiel \(\+\d+\)$/); assert.equal(evalText('reversi', r, 'pct'), evalText('reversi', r)); }
    else if (r.x < 0) { l++; assert.equal(r.p, 1 - P_SICHER); assert.match(evalText('reversi', r), /^Niederlage droht \(−\d+\)$/); }
    else { assert.equal(r.p, 0.5); assert.equal(evalText('reversi', r), 'Remis bei bestem Spiel'); }
  }
  assert.ok(w && l);
  assert.equal(evalText('vier', { x: 99, p: P_SICHER, exact: true }), 'Sieg sicher bei bestem Spiel');
  assert.equal(evalText('reversi', { x: -1, p: 1 - P_SICHER, exact: true, wld: true }), 'Niederlage droht');
  assert.equal(evalText('schach', { x: -99, p: 0.01, exact: true }), 'Matt droht');
  return `${w} gewonnen, ${l} verloren`;
});

test('Wortwahl: Reversi-Mittelspiel „Vorteil +N“ ohne „Steine“, andere Spiele mit Einheit', () => {
  const s = positions(30, 1, 7)[0];
  const r = evalPosition('reversi', s, 0);
  assert.equal(r.exact, false);
  const t = evalText('reversi', r);
  assert.match(t, /^Vorteil [+−±]\d+$/);
  assert.doesNotMatch(t, /Steine/);
  assert.match(evalText('reversi', r, 'pct'), /^\d+ % Gewinnchance$/);
  assert.equal(evalText('muehle', { x: 2, p: 0.8, exact: false }), '+2 Steine');
  assert.equal(evalText('schach', { x: -0.34, p: 0.4, exact: false }), '−0,3 Bauern');
  assert.equal(evalText('dame', { x: -0.2, p: 0.5, exact: false }), '±0 Steine');
  assert.match(EVAL.reversi.title, /ab 12 leeren Feldern exakt/);
  assert.match(EVAL.reversi.title, /^Schätzung/);
});

test('Kalibrier-Kurven: monoton steigend, symmetrisch, 50 % bei 0 (alle Spiele, Reversi je Phase)', () => {
  let n = 0;
  for (const [g, cfg] of Object.entries(EVAL)) {
    if (g === 'holdem') continue;
    const phases = g === 'reversi' ? Array.from({ length: 61 }, (_, e) => ({ board: Array.from({ length: 64 }, (_, i) => (i < e ? null : i % 2)) })) : [undefined];
    for (const gs of phases) {
      let prev = -1;
      for (let x = -80; x <= 80; x += 0.5) {
        const p = cfg.pct(x, gs);
        assert.ok(p >= prev && p >= 0 && p <= 1, `${g} x=${x}`);
        assert.ok(Math.abs(cfg.pct(-x, gs) - (1 - p)) < 1e-9, `${g} symmetrisch`);
        prev = p; n++;
      }
      assert.ok(Math.abs(cfg.pct(0, gs) - 0.5) < 1e-12);
    }
  }
  for (let e = 0; e < 60; e++) assert.ok(rvSteil(e) > 0);
  return `${n} Punkte`;
});

console.log(fails ? `\n${fails} rot` : '\nn11 evaluate grün');
process.exit(fails ? 1 : 0);
