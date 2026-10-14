// Schwarm (n10 E4, Messgröße 10): 10 000 Zufallspartien Ludo/Würfelglück/Mau-Mau, je zweimal mit demselben Zufall –
// einmal mit Auszeichnungs-Zählung (wie der Tisch), einmal ohne. Ergebnis, Rangliste und Endstellung müssen gleich sein;
// Auszeichnungen nur für die Besten (Gleichstand → alle), Zähler plausibel.
// Aufruf: node tests/node/ehrung.swarm.test.mjs [Partien]
import assert from 'node:assert/strict';
import { GAMES } from '../../src/games/registry.js';
import { tallyStep, awards } from '../../src/ehrung.js';
import { mulberry32 } from '../../src/rng.js';

const N = Number(process.argv[2]) || 10000;
const perm = (rng, n) => { const p = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
const chanceValue = (c, rng) => (c.kind === 'shuffle' ? perm(rng, c.n) : Array.from({ length: c.n || 2 }, () => 1 + Math.floor(rng() * 6)));

function play(id, seed, withTally) {
  const E = GAMES[id].engine, rng = mulberry32(seed);
  let s = E.initialState(E.normalizeOptions({})), tal = null, prev = null, rolls = 0, moves = 0;
  for (let k = 0; k < 4000 && !E.result(s); k++) {
    const c = E.chance ? E.chance(s) : null;
    let move = null, by = null;
    if (c) { s = E.applyChance(s, chanceValue(c, rng)); if (c.kind === 'dice') rolls++; }
    else {
      const ms = E.legalMoves(s);
      by = E.currentPlayer(s);
      move = ms[Math.floor(rng() * ms.length)];
      s = E.applyMove(s, move);
      moves++;
    }
    if (withTally) { tal = tallyStep(id, tal, prev, s, move, by); prev = s; }
  }
  return { result: E.result(s), key: E.positionKey(s), tal, rolls, moves, seats: s.sheets ? s.sheets.length : (s.hands || s.pieces || []).length };
}

let n = 0, given = 0, ties = 0;
const games = ['ludo', 'wuerfel', 'maumau'];
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const id = games[i % 3];
  const a = play(id, 1000 + i, true), b = play(id, 1000 + i, false);
  assert.deepEqual(a.result, b.result, `${id} #${i}: Ergebnis gleich`);
  assert.equal(a.key, b.key, `${id} #${i}: Endstellung gleich`);
  const seats = GAMES[id].engine.normalizeOptions({}).players;
  const aw = awards(id, a.tal, seats);
  for (const x of aw) {
    const arr = a.tal[{ 'Meiste Rauswürfe': 'raus', 'Meiste Sechsen': 'sechs', 'Höchster Wurf': 'hoch', 'Meiste Siebener': 'sieben' }[x.title]];
    assert.ok(x.seats.length >= 1 && x.value > 0);
    for (let s = 0; s < seats; s++) assert.equal((arr[s] || 0) === x.value, x.seats.includes(s), 'Gleichstand → alle, sonst nur der Beste');
    if (x.seats.length > 1) ties++;
    given++;
  }
  if (id === 'ludo' && a.tal && a.tal.sechs) assert.ok(a.tal.sechs.reduce((p, q) => p + q, 0) <= a.rolls);
  if (id === 'wuerfel' && a.tal && a.tal.hoch) assert.ok(Math.max(...a.tal.hoch) <= 50 + 30 + 35 + 100);
  n++;
}
console.log(`✅ ${n} Partien: Ergebnis und Endstellung mit/ohne Auszeichnungen identisch; ${given} Auszeichnungen, davon ${ties} geteilt (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
