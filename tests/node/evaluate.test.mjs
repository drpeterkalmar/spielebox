// evaluate() aller Engines: Startstellung ausgeglichen, Vorzeichen (Vorteil → positiv), Symmetrie (2 Spieler: Summe 0),
// Kartenspiele nur aus der eigenen Sicht (evaluate(viewFor) = evaluate(voll)).
// Aufruf: node tests/node/evaluate.test.mjs
import assert from 'node:assert/strict';
import { GAMES } from '../../src/games/registry.js';
import { mulberry32, pick } from '../../src/rng.js';
import { valueFor } from '../../src/net/fair.js';

let fails = 0;
function test(name, fn) {
  try { const info = fn(); console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n   ')}`); }
}
const hex = (rng) => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
function resolve(E, s, rng) {
  while (E.chance && E.chance(s)) s = E.applyChance(s, valueFor(E.chance(s), hex(rng)));
  return s;
}

for (const g of Object.values(GAMES)) {
  const E = g.engine;
  test(`${g.title}: evaluate exportiert, Start ausgeglichen, Summe 0 bei 2 Spielern`, () => {
    assert.equal(typeof E.evaluate, 'function');
    const rng = mulberry32(3);
    let s = resolve(E, E.initialState(E.normalizeOptions({})), rng);
    if (g.id !== 'blackjack' && g.id !== 'schnapsen') assert.equal(E.evaluate(s, 0), 0, 'Start');
    let checked = 0;
    for (let i = 0; i < 300 && !E.result(s); i++) {
      const ms = E.legalMoves(s);
      if (!ms.length) break;
      s = resolve(E, E.applyMove(s, pick(rng, ms)), rng);
      const n = typeof g.seats === 'function' ? g.seats(E.normalizeOptions({})) : g.seats;
      const vals = Array.from({ length: n }, (_, k) => E.evaluate(s, k));
      assert.ok(vals.every(Number.isFinite), 'Zahl');
      if (n === 2 && g.id !== 'schnapsen' && g.id !== 'blackjack') assert.ok(Math.abs(vals[0] + vals[1]) < 1e-9, `Symmetrie ${vals}`);
      if (E.HIDDEN) for (let k = 0; k < n; k++) assert.equal(E.evaluate(E.viewFor(s, k), k), vals[k], 'nur aus eigener Sicht');
      checked++;
    }
    return `${checked} Stellungen`;
  });
}

test('Vorzeichen: Vorteil ergibt positive Zahl', () => {
  const S = GAMES.schach.engine;
  assert.ok(S.evaluate(S.fromFen('4k3/8/8/8/8/8/8/QQ2K3 w - - 0 1'), 0) > 0);
  const M = GAMES.muehle.engine;
  assert.ok(M.evaluate(M.setup({ w: ['a7', 'd7', 'g7', 'a1'], b: ['b6', 'd6'], hand: [0, 0] }), 0) > 0);
  const D = GAMES.dame.engine;
  const d0 = D.initialState({});
  const board = d0.board.slice(); board[board.indexOf(-1)] = 0;
  assert.ok(D.evaluate({ ...d0, board }, 0) > 0);
  const B = GAMES.backgammon.engine;
  assert.ok(B.evaluate(B.setup({ w: { 1: 15 }, b: { 19: 15 } }), 0) > 0);
});

console.log(fails ? `\n${fails} rot` : '\nevaluate grün');
process.exit(fails ? 1 : 0);
