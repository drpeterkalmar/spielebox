// Regelfälle Paare finden (de.wikipedia „Memory (Spiel)“), Sicht, evaluate, Computer-Stufen.
// Aufruf: node tests/node/paare.test.mjs
import assert from 'node:assert/strict';
import * as P from '../../src/games/paare/engine.js';
import { chooseMove } from '../../src/games/paare/bot.js';
import { mulberry32 } from '../../src/rng.js';
import { valueFor } from '../../src/net/fair.js';

let fails = 0, passed = 0;
function test(name, fn) {
  try { const info = fn(); passed++; console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 4).join('\n   ')}`); }
}
const hexOf = (rng) => () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
// geordnet: Feld 2k und 2k+1 = Motiv k
const ordered = (opts) => P.applyChance(P.initialState(opts), Array.from({ length: 2 * P.normalizeOptions(opts).paare }, (_, i) => i));
function play(levels, opts, seed) {
  const rng = mulberry32(seed), hex = hexOf(rng);
  let s = P.initialState(opts);
  s = P.applyChance(s, valueFor(P.chance(s), hex()));
  while (!P.result(s)) s = P.applyMove(s, chooseMove(P.viewFor(s, s.turn), { level: levels[s.turn], rng }));
  return s;
}

test('Optionen: Standard 12 Paare, 2 Spieler; Unsinn → Standard', () => {
  assert.deepEqual(P.normalizeOptions({}), { paare: 12, players: 2 });
  assert.deepEqual(P.normalizeOptions({ paare: 18, players: 4 }), { paare: 18, players: 4 });
  assert.deepEqual(P.normalizeOptions({ paare: 7, players: 9 }), { paare: 12, players: 2 });
});
test('Start: erst mischen (chance shuffle über alle Karten), dann ist Spieler 1 dran', () => {
  const s = P.initialState({ paare: 8 });
  assert.deepEqual(P.chance(s), { kind: 'shuffle', n: 16 });
  assert.equal(P.currentPlayer(s), null);
  assert.equal(P.legalMoves(s).length, 0);
  const t = ordered({ paare: 8 });
  assert.equal(P.currentPlayer(t), 0);
  assert.equal(P.legalMoves(t).length, 16);
  for (let k = 0; k < 8; k++) assert.equal(t.cards.filter((x) => x === k).length, 2, 'jedes Motiv zweimal');
});
test('Ungültige Mischung wird abgelehnt', () => {
  const s = P.initialState({ paare: 8 });
  assert.throws(() => P.applyChance(s, [0, 0, 1]));
  assert.throws(() => P.applyChance(s, Array(16).fill(0)));
});
test('Paar gefunden: Karten bleiben offen, Punkt, derselbe Spieler ist nochmal dran', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(s, { flip: 0 });
  assert.deepEqual(s.open, [0]);
  assert.equal(P.currentPlayer(s), 0);
  s = P.applyMove(s, { flip: 1 });
  assert.equal(s.found[0], 0); assert.equal(s.found[1], 0);
  assert.equal(s.scores[0], 1);
  assert.equal(P.currentPlayer(s), 0);
  assert.equal(s.last.match, true);
});
test('Kein Paar: der Nächste ist dran, beide Karten bleiben sichtbar bis zu seiner ersten Karte', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(s, { flip: 0 });
  s = P.applyMove(s, { flip: 2 });
  assert.equal(P.currentPlayer(s), 1);
  assert.deepEqual(s.shown, [0, 2]);
  const v = P.viewFor(s, 1);
  assert.equal(v.cards[0], 0); assert.equal(v.cards[2], 1);
  s = P.applyMove(s, { flip: 5 });
  assert.equal(s.shown, null);
  const v2 = P.viewFor(s, 1);
  assert.equal(v2.cards[0], null, 'wieder verdeckt');
  assert.equal(v2.cards[5], 2);
});
test('Eine offene Karte (diesen Zug) und gefundene Paare dürfen nicht nochmal umgedreht werden', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(s, { flip: 0 });
  assert.equal(P.isLegal(s, { flip: 0 }), false);
  s = P.applyMove(s, { flip: 1 });
  assert.equal(P.isLegal(s, { flip: 0 }), false);
  assert.equal(P.isLegal(s, { flip: 1 }), false);
  assert.equal(P.isLegal(s, { flip: 2 }), true);
});
test('Eine Karte des falschen Paars darf der Nächste sofort wieder umdrehen', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 2 });
  assert.equal(P.isLegal(s, { flip: 0 }), true);
  s = P.applyMove(s, { flip: 0 });
  s = P.applyMove(s, { flip: 1 });
  assert.equal(s.scores[1], 1);
});
test('isLegal lehnt Müll ab, wirft nie', () => {
  const s = ordered({ paare: 8 });
  for (const m of [null, 5, 'x', [], {}, { flip: -1 }, { flip: 16 }, { flip: 1.5 }, { flip: '3' }, { flip: 3, x: 1 }, { type: 'flip', flip: 3 }]) assert.equal(P.isLegal(s, m), false, JSON.stringify(m));
  assert.equal(P.isLegal(null, { flip: 1 }), false);
  assert.throws(() => P.applyMove(s, { flip: 99 }));
});
test('Ende: alle Paare gefunden → wer mehr hat, gewinnt; Gleichstand = unentschieden', () => {
  let s = ordered({ paare: 8 });
  // Spieler 1 findet 5 Paare, dann ein Fehlversuch, Spieler 2 findet 3
  for (let k = 0; k < 5; k++) s = P.applyMove(P.applyMove(s, { flip: 2 * k }), { flip: 2 * k + 1 });
  s = P.applyMove(P.applyMove(s, { flip: 10 }), { flip: 12 });
  for (let k = 5; k < 8; k++) s = P.applyMove(P.applyMove(s, { flip: 2 * k }), { flip: 2 * k + 1 });
  assert.equal(s.phase, 'over');
  assert.deepEqual(P.result(s), { winner: 0, reason: '5 von 8 Paaren' });
  let t = ordered({ paare: 8 });
  for (let k = 0; k < 4; k++) t = P.applyMove(P.applyMove(t, { flip: 2 * k }), { flip: 2 * k + 1 });
  t = P.applyMove(P.applyMove(t, { flip: 8 }), { flip: 10 });
  for (let k = 4; k < 8; k++) t = P.applyMove(P.applyMove(t, { flip: 2 * k }), { flip: 2 * k + 1 });
  assert.equal(P.result(t).winner, null);
});
test('Allein: Ergebnis zählt die Züge', () => {
  let s = ordered({ paare: 8, players: 1 });
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 2 });
  assert.equal(P.currentPlayer(s), 0);
  for (let k = 0; k < 8; k++) s = P.applyMove(P.applyMove(s, { flip: 2 * k }), { flip: 2 * k + 1 });
  assert.deepEqual(P.result(s), { winner: 0, reason: 'alle Paare in 9 Zügen' });
});
test('Sicht: verdeckte Karten sind für alle null (auch für den, der dran ist), Länge bleibt', () => {
  let s = ordered({ paare: 12 });
  s = P.applyMove(s, { flip: 3 });
  for (const seat of [0, 1, null]) {
    const v = P.viewFor(s, seat);
    assert.equal(v.cards.length, 24);
    assert.equal(v.cards.filter((x) => x !== null).length, 1);
    assert.equal(v.cards[3], 1);
  }
  assert.ok(P.isLegal(P.viewFor(s, 0), { flip: 4 }), 'Züge auf der Sicht prüfbar');
});
test('Gedächtnis (memory) enthält nur, was offen lag, in Reihenfolge, ohne gefundene', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 2 });
  s = P.applyMove(P.applyMove(s, { flip: 4 }), { flip: 6 });
  assert.deepEqual(s.memory, [[0, 0], [2, 1], [4, 2], [6, 3]]);
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 1 });
  assert.deepEqual(s.memory, [[2, 1], [4, 2], [6, 3]]);
});
test('evaluate: Paare-Differenz, symmetrisch, auf der Sicht gleich', () => {
  let s = ordered({ paare: 8 });
  assert.equal(P.evaluate(s, 0), 0);
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 1 });
  assert.equal(P.evaluate(s, 0), 1); assert.equal(P.evaluate(s, 1), -1);
  assert.equal(P.evaluate(P.viewFor(s, 1), 1), -1);
  assert.equal(P.evaluate(ordered({ players: 1 }), 0), 0);
});
test('describeMove nennt das Tier (nach dem Aufdecken öffentlich)', () => {
  let s = ordered({ paare: 8 });
  assert.match(P.describeMove(s, { flip: 0 }), /Hund/);
  s = P.applyMove(s, { flip: 0 });
  assert.equal(P.describeMove(s, { flip: 1 }), 'findet ein Paar (Hund)');
  assert.match(P.describeMove(s, { flip: 2 }), /Katze\) – kein Paar/);
});
test('Computer: findet bekannte Paare sofort, nimmt nie eine unerlaubte Karte', () => {
  let s = ordered({ paare: 8 });
  s = P.applyMove(P.applyMove(s, { flip: 0 }), { flip: 2 });   // Hund bei 0, Katze bei 2 gesehen
  s = P.applyMove(s, { flip: 1 });                              // Spieler 2 deckt den zweiten Hund auf
  const m = chooseMove(P.viewFor(s, 1), { level: 3, rng: mulberry32(1) });
  assert.deepEqual(m, { flip: 0 });
  for (let seed = 0; seed < 50; seed++) {
    const e = play([1, 3], { paare: 8 }, seed);
    assert.equal(e.phase, 'over');
  }
});
test('Computer-Stufen: 3 schlägt 1 klar, 2 schlägt 1, 3 schlägt 2 (je 200 Partien, Farben wechseln)', () => {
  const duel = (a, b) => {
    let w = 0, l = 0;
    for (let g = 0; g < 200; g++) {
      const lv = g % 2 ? [b, a] : [a, b];
      const r = P.result(play(lv, { paare: 12 }, 1000 + g));
      if (r.winner === null) continue;
      if ((r.winner === 0) === (g % 2 === 0)) w++; else l++;
    }
    return [w, l];
  };
  const [a, b] = duel(3, 1), [c, d] = duel(2, 1), [e, f] = duel(3, 2);
  assert.ok(a > 3 * b, `3:1 ${a}:${b}`);
  assert.ok(c > 2 * d, `2:1 ${c}:${d}`);
  assert.ok(e > f, `3:2 ${e}:${f}`);
  return `3:1 ${a}:${b}, 2:1 ${c}:${d}, 3:2 ${e}:${f}`;
});

console.log(`\n${passed} ✅, ${fails} ❌`);
process.exit(fails ? 1 : 0);
