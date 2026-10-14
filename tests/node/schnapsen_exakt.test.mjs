// Schnapsen Stufe 3, Phase 2 exakt (n10 E4): Alpha-Beta mit Gedächtnis liefert denselben Wert wie eine einfache
// Vollsuche (Minimax ohne Abschneiden), ist schnell, und Stufe 3 spielt damit nur erlaubte Züge.
// Aufruf: node tests/node/schnapsen_exakt.test.mjs
import assert from 'node:assert/strict';
import * as E from '../../src/games/schnapsen/engine.js';
import { chooseMove, solve, phase2 } from '../../src/games/schnapsen/bot.js';
import { mulberry32 } from '../../src/rng.js';

let fails = 0;
function ok(name, fn) {
  try { const info = fn(); console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const perm = (rng, n) => { const p = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };

function minimax(s, seat) {
  if (s.phase !== 'play') {
    if (!s.spiel) return 0;
    return (s.spiel.winner === seat ? 1 : -1) * s.spiel.points + (E.cardPoints(s, seat) - E.cardPoints(s, 1 - seat)) / 1000;
  }
  const ms = E.legalMoves(s).filter((m) => m.type !== 'ausmelden' || E.canDeclare(s));
  const vs = ms.map((m) => minimax(E.applyMove(s, m), seat));
  return E.currentPlayer(s) === seat ? Math.max(...vs) : Math.min(...vs);
}

// Stellungen in Phase 2 aus Zufallspartien (Stufe 2 gegen Stufe 2)
function positions(count, seed) {
  const rng = mulberry32(seed), out = [];
  while (out.length < count) {
    let s = E.initialState({});
    for (let guard = 0; !E.result(s) && guard < 3000 && out.length < count; guard++) {
      const c = E.chance(s);
      if (c) { s = E.applyChance(s, perm(rng, c.n)); continue; }
      const seat = E.currentPlayer(s);
      const v = E.viewFor(s, seat);
      if (phase2(s) && rng() < 0.3) out.push(s);
      s = E.applyMove(s, chooseMove(v, { level: 2, rng }));
    }
  }
  return out;
}

ok('Alpha-Beta = Vollsuche auf 300 Stellungen der Phase 2 (Talon leer oder zugedreht)', () => {
  const ps = positions(300, 11);
  let closed = 0;
  for (const s of ps) {
    const seat = E.currentPlayer(s);
    if (s.closed) closed++;
    assert.ok(Math.abs(solve(s, seat) - minimax(s, seat)) < 1e-9, E.positionKey(s));
  }
  return `${ps.length} Stellungen, davon ${closed} zugedreht`;
});

ok('schnell: Lösung je Stellung im Mittel < 5 ms', () => {
  const ps = positions(200, 12);
  const t0 = performance.now();
  for (const s of ps) solve(s, E.currentPlayer(s));
  const avg = (performance.now() - t0) / ps.length;
  assert.ok(avg < 5, `${avg.toFixed(2)} ms`);
  return `Ø ${avg.toFixed(2)} ms`;
});

ok('Stufe 3 (exakt und bisherig) wählt nur erlaubte Züge, sieht nur die eigene Sicht', () => {
  const ps = positions(60, 13);
  for (const s of ps) {
    const v = E.viewFor(s, E.currentPlayer(s));
    for (const exakt of [true, false]) assert.ok(E.isLegal(s, chooseMove(v, { level: 3, rng: mulberry32(1), timeMs: 5, exakt })));
  }
});

console.log(fails ? `\n${fails} rot` : '\nSchnapsen exakt grün');
process.exit(fails ? 1 : 0);
