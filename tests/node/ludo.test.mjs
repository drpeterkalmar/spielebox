// Regeltests Ludo (Schmidt-Anleitung): Rauskommen mit 6, Startfeld räumen, nochmal würfeln, Schlagen, Ziel,
// 3× würfeln, Schlagpflicht, Ende, Ansichts-Hilfen, evaluate, Bot-Stufen.
// Aufruf: node tests/node/ludo.test.mjs
import assert from 'node:assert/strict';
import * as L from '../../src/games/ludo/engine.js';
import { chooseMove } from '../../src/games/ludo/bot.js';
import { RULES } from '../../src/games/ludo/rules.js';
import { valueFor } from '../../src/net/fair.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

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

const deepFreeze = o => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const H = -1;
// Stellung mit Wurf: würfelt (roll) und wendet d an
const roll = (s, d) => L.applyChance(L.applyMove(s, { type: 'roll' }), [d]);
const pieceList = s => L.legalMoves(s).map(m => m.piece).sort();
const mv = k => ({ type: 'move', piece: k });

// ---------- Grundlagen ----------

test('Exporte, Optionen, Startaufstellung (eine Figur auf dem Startfeld, drei im Haus)', () => {
  assert.equal(L.id, 'ludo');
  assert.equal(L.title, 'Ludo');
  assert.deepEqual(L.PLAYERS, ['Rot', 'Blau', 'Grün', 'Gelb']);
  assert.deepEqual(L.normalizeOptions(), { players: 4, schlagpflicht: false, dreimal: true, startfigur: true, zielspringen: true });
  assert.deepEqual(L.normalizeOptions({ players: 3, schlagpflicht: true, dreimal: 'ja', x: 1 }),
    { players: 3, schlagpflicht: true, dreimal: true, startfigur: true, zielspringen: true });
  assert.equal(L.normalizeOptions({ players: 5 }).players, 4);
  assert.equal(L.normalizeOptions({ players: '2' }).players, 2);
  const s = L.initialState();
  assert.equal(s.n, 4);
  assert.deepEqual(s.pieces, [[0, H, H, H], [0, H, H, H], [0, H, H, H], [0, H, H, H]]);
  assert.equal(s.phase, 'roll'); assert.equal(s.turn, 0); assert.equal(s.winner, null);
  assert.equal(L.currentPlayer(s), 0);
  assert.deepEqual(L.legalMoves(s), [{ type: 'roll' }]);
  assert.equal(L.chance(s), null);
  assert.deepEqual(L.initialState({ startfigur: false }).pieces[0], [H, H, H, H]);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.ok(RULES.title === 'Ludo' && RULES.items.length >= 10 && RULES.source.includes('schmidtspiele.de'));
  for (const k of ['players', 'dreimal', 'schlagpflicht', 'startfigur', 'zielspringen']) assert.ok(RULES.options[k], k);
});

test('Sitzfarben: 2 → Rot/Grün gegenüber, 3 → Rot/Blau/Grün, 4 → alle; absField', () => {
  const s2 = L.initialState({ players: 2 }), s3 = L.initialState({ players: 3 }), s4 = L.initialState({ players: 4 });
  assert.deepEqual(s2.colors, [0, 2]); assert.deepEqual(s3.colors, [0, 1, 2]); assert.deepEqual(s4.colors, [0, 1, 2, 3]);
  assert.equal(L.colorOf(s2, 1), 2);
  assert.equal(L.seatName(s2, 1), 'Grün');
  assert.equal(L.absField(s2, 1, 0), 20);
  assert.equal(L.absField(s4, 3, 0), 30);
  assert.equal(L.absField(s4, 3, 15), 5);    // Gelb läuft über Feld 39 → 0 weiter
  assert.equal(L.absField(s4, 0, 39), 39);
  assert.equal(L.absField(s4, 0, -1), null);
  assert.equal(L.absField(s4, 0, 40), null);
});

test('Würfeln: roll → chance {dice, n:1}, Wert aus fair.valueFor; ungültige Würfe werfen', () => {
  const s = deepFreeze(L.initialState());
  const r = deepFreeze(L.applyMove(s, { type: 'roll' }));
  assert.equal(r.phase, 'rolling');
  assert.deepEqual(L.chance(r), { kind: 'dice', n: 1 });
  assert.equal(L.currentPlayer(r), null);
  assert.deepEqual(L.legalMoves(r), []);
  const v = valueFor(L.chance(r), 'ab'.repeat(32));
  assert.equal(v.length, 1);
  assert.ok(v[0] >= 1 && v[0] <= 6);
  const t = L.applyChance(r, v);
  assert.ok(t.phase === 'move' || t.phase === 'roll');
  for (const bad of [[0], [7], [3, 4], 3, null, ['6'], [2.5]]) assert.throws(() => L.applyChance(r, bad), /Ungültiger Wurf/);
  assert.throws(() => L.applyChance(s, [3]), /Kein Zufall/);
});

// ---------- Rauskommen und Startfeld ----------

test('Startfeld räumen: Figur auf dem Startfeld muss weg, solange Figuren im Haus sind', () => {
  const s = roll(L.initialState(), 3);
  assert.equal(s.phase, 'move');
  assert.deepEqual(L.legalMoves(s), [mv(0)]);
  const n = L.applyMove(s, mv(0));
  assert.equal(n.pieces[0][0], 3);
  assert.equal(n.turn, 1);
  assert.deepEqual(n.lastRoll, { seat: 0, value: 3, moved: true });
  assert.deepEqual(n.last, { seat: 0, piece: 0, from: 0, to: 3, capture: null });
  // Haus leer → keine Pflicht mehr
  const f = roll(L.setup({ pieces: [[0, 5, 12, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 2);
  assert.deepEqual(pieceList(f), [0, 1, 2, 3]);
});

test('Mit 6 raus: Pflicht, solange Figuren im Haus und das Startfeld frei ist; danach nochmal würfeln', () => {
  const s = roll(L.setup({ pieces: [[7, H, H, 30], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 6);
  assert.deepEqual(pieceList(s), [1, 2]);            // nur Figuren aus dem Haus, nicht 7 → 13
  const n = L.applyMove(s, mv(2));
  assert.deepEqual(n.pieces[0], [7, H, 0, 30]);
  assert.equal(n.turn, 0, 'nach einer 6 nochmal');
  assert.equal(n.phase, 'roll');
  assert.equal(n.sixes, 1);
  assert.match(L.describeMove(s, mv(2)), /^Rot: Figur 3 raus aufs Startfeld$/);
});

test('6 mit eigener Figur auf dem Startfeld: diese Figur muss zuerst mit der 6 weiter', () => {
  const s = roll(L.setup({ pieces: [[0, H, H, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 6);
  assert.deepEqual(L.legalMoves(s), [mv(0)]);
  const n = L.applyMove(s, mv(0));
  assert.equal(n.pieces[0][0], 6);
  assert.equal(n.turn, 0);
});

test('Startfeld räumen geht nicht (eigene Figur im Weg) → andere Figur darf ziehen', () => {
  const s = roll(L.setup({ pieces: [[0, 4, H, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 4);
  assert.deepEqual(pieceList(s), [1, 3]);
});

test('Rauskommen schlägt eine fremde Figur auf dem eigenen Startfeld', () => {
  // Blau (Farbe 1) steht mit p = 30 auf absolut 0 = Startfeld Rot
  const s = roll(L.setup({ pieces: [[H, H, H, H], [30, H, H, H], [H, H, H, H], [H, H, H, H]] }), 6);
  assert.equal(L.absField(s, 1, 30), 0);
  assert.deepEqual(L.targets(s)[0], { piece: 0, from: -1, to: 0, fromAbs: null, toAbs: 0, capture: { seat: 1, piece: 0 } });
  const n = L.applyMove(s, mv(0));
  assert.deepEqual(n.pieces[0], [0, H, H, H]);
  assert.deepEqual(n.pieces[1], [H, H, H, H]);
  assert.match(L.describeMove(s, mv(0)), /schlägt Blau/);
});

// ---------- Laufen, Schlagen ----------

test('Schlagen: genau treffen → fremde Figur ins Haus; kein Schlagzwang (Grundregel)', () => {
  // Rot p=5 (abs 5), Grün (2 Spieler, Farbe 2) p=27 → abs (20+27)%40 = 7
  const s = roll(L.setup({ players: 2, pieces: [[5, 15, 41, 42], [27, H, H, H]] }), 2);
  assert.deepEqual(pieceList(s), [0, 1, 2]);   // 41 → 43 im Ziel geht auch
  const t = L.targets(s).find(x => x.piece === 0);
  assert.deepEqual(t.capture, { seat: 1, piece: 0 });
  assert.equal(t.toAbs, 7);
  const n = L.applyMove(s, mv(0));
  assert.deepEqual(n.pieces[1], [H, H, H, H]);
  assert.deepEqual(n.last.capture, { seat: 1, piece: 0 });
  // ohne Schlagpflicht darf auch die andere Figur ziehen
  assert.ok(L.isLegal(s, mv(1)));
});

test('Eigene Figur blockiert das Zielfeld, Überspringen auf der Bahn erlaubt', () => {
  const s = roll(L.setup({ pieces: [[5, 8, 9, 40], [11, H, H, H], [H, H, H, H], [H, H, H, H]] }), 3);
  // 5 → 8 besetzt (eigene) → nicht; 8 → 11 schlägt Blau? Blau p=11 → abs 21, nicht 11; 9 → 12 über 10/11 hinweg
  assert.deepEqual(pieceList(s), [1, 2, 3]);
  assert.equal(L.isLegal(s, mv(0)), false);
  const n = L.applyMove(s, mv(2));
  assert.equal(n.pieces[0][2], 12);
});

test('Schlagpflicht (Option): nur Schlag-Züge; Rauskommen/Räumen gehen vor', () => {
  const o = { schlagpflicht: true };
  const s = roll(L.setup({ players: 2, options: o, pieces: [[5, 15, 41, 42], [27, H, H, H]] }), 2);
  assert.deepEqual(pieceList(s), [0]);
  const e = roll(L.setup({ players: 2, options: o, pieces: [[5, H, 41, 42], [31, H, H, H]] }), 6);
  // 5 + 6 = 11 = abs Grün (20+31)%40 = 11 wäre ein Schlag, aber mit 6 muss raus
  assert.deepEqual(pieceList(e), [1]);
  const c = roll(L.setup({ players: 2, options: o, pieces: [[5, 15, 41, 42], [26, H, H, H]] }), 3);
  assert.deepEqual(pieceList(c), [0, 1], 'kein Schlag möglich → freie Wahl');
});

// ---------- Ziel ----------

test('Zielfelder einzeln gezählt, nur exakt; über das letzte Zielfeld hinaus geht es nicht', () => {
  const base = { pieces: [[38, 41, 42, 43], [H, H, H, H], [H, H, H, H], [H, H, H, H]] };
  assert.equal(roll(L.setup(base), 2).phase, 'move');
  const n = L.applyMove(roll(L.setup(base), 2), mv(0));
  assert.equal(n.pieces[0][0], 40);
  assert.equal(n.winner, 0);
  // 38 + 3 = 41 besetzt, 38 + 6 = 44 > 43
  const s3 = roll(L.setup(base), 3);
  assert.equal(s3.phase, 'roll'); assert.equal(s3.turn, 1);
  assert.deepEqual(s3.lastRoll, { seat: 0, value: 3, moved: false, reason: 'kein Zug möglich' });
  const s6 = roll(L.setup(base), 6);
  assert.equal(s6.turn, 1, 'ohne Zug kein Extrawurf');
  const t = roll(L.setup({ pieces: [[37, 10, 12, 14], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 5);
  assert.equal(L.targets(t).find(x => x.piece === 0).to, 42);
  assert.match(L.describeMove(t, mv(0)), /ins Ziel \(Feld 3\)/);
  assert.equal(L.targets(t).find(x => x.piece === 0).toAbs, null);
});

test('Im Ziel: Überspringen erlaubt (Grundregel), Option zielspringen:false verbietet es', () => {
  const pieces = [[39, 41, 10, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]];
  const a = roll(L.setup({ pieces }), 3);   // 39 → 42 über 41 hinweg; 41 → 44 zu weit
  assert.ok(L.isLegal(a, mv(0)));
  const b = roll(L.setup({ pieces, options: { zielspringen: false } }), 3);
  assert.equal(L.isLegal(b, mv(0)), false);
  assert.deepEqual(pieceList(b), [2, 3]);
  const c = roll(L.setup({ pieces: [[40, 42, 10, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]], options: { zielspringen: false } }), 3);
  assert.equal(L.isLegal(c, mv(0)), false, '40 → 43 über 42 verboten');
  const d = roll(L.setup({ pieces: [[40, 42, 10, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 3);
  assert.ok(L.isLegal(d, mv(0)), 'Grundregel: 40 → 43 über 42 erlaubt');
});

// ---------- 3× würfeln ----------

test('3× würfeln: alle im Haus → drei Versuche, dann der Nächste; mit 6 raus', () => {
  let s = L.setup({ players: 3, pieces: [[H, H, H, H], [0, H, H, H], [0, H, H, H]] });
  assert.equal(L.mayRollThrice(s, 0), true);
  s = roll(s, 2);
  assert.equal(s.turn, 0); assert.equal(s.tries, 1); assert.equal(s.phase, 'roll');
  assert.deepEqual(s.lastRoll, { seat: 0, value: 2, moved: false, reason: 'keine 6 – noch 2 Versuche' });
  s = roll(s, 5);
  assert.equal(s.turn, 0); assert.equal(s.tries, 2);
  assert.equal(s.lastRoll.reason, 'keine 6 – noch 1 Versuch');
  const six = roll(s, 6);
  assert.equal(six.phase, 'move');
  const after = L.applyMove(six, mv(0));
  assert.equal(after.turn, 0); assert.equal(after.tries, 0);
  s = roll(s, 1);
  assert.equal(s.turn, 1); assert.equal(s.tries, 0);
  assert.equal(s.lastRoll.reason, 'keine 6 in drei Versuchen');
});

test('3× würfeln nicht, wenn eine Zielfigur noch vorrücken kann (Beispiel der Anleitung) oder Option aus', () => {
  const c = L.setup({ pieces: [[42, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]] });
  assert.equal(L.mayRollThrice(c, 0), false);   // Figur auf Feld c kann mit 1 noch vor
  const r = roll(c, 3);
  assert.equal(r.turn, 1);
  assert.equal(r.lastRoll.reason, 'keine 6');
  const d = L.setup({ pieces: [[43, 42, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]] });
  assert.equal(L.mayRollThrice(d, 0), true);    // c und d besetzt → fest
  const off = L.setup({ pieces: [[H, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]], options: { dreimal: false } });
  assert.equal(L.mayRollThrice(off, 0), false);
  assert.equal(roll(off, 4).turn, 1);
  const track = L.setup({ pieces: [[3, H, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]] });
  assert.equal(L.mayRollThrice(track, 0), false);
  // ohne Überspringen: 41 hinter 42 kann nicht, 42 kann mit 1 → nicht fest
  const z = L.setup({ pieces: [[41, 42, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]], options: { zielspringen: false } });
  assert.equal(L.mayRollThrice(z, 0), false);
});

// ---------- Ende ----------

test('Ende: letzte Figur ins Ziel (auch mit 6) → Partie vorbei, kein weiterer Wurf', () => {
  const s = roll(L.setup({ players: 2, pieces: [[34, 41, 42, 43], [5, H, H, H]] }), 6);
  const n = deepFreeze(L.applyMove(s, mv(0)));
  assert.equal(n.phase, 'over'); assert.equal(n.winner, 0);
  assert.deepEqual(L.result(n), { winner: 0, reason: 'Rot hat alle vier Figuren im Ziel' });
  assert.equal(L.currentPlayer(n), null);
  assert.deepEqual(L.legalMoves(n), []);
  assert.equal(L.chance(n), null);
  assert.equal(L.isLegal(n, { type: 'roll' }), false);
  assert.equal(L.result(L.initialState()), null);
  const g = L.applyMove(roll(L.setup({ players: 2, turn: 1, pieces: [[5, H, H, H], [37, 41, 42, 43]] }), 3), mv(0));
  assert.equal(L.result(g).reason, 'Grün hat alle vier Figuren im Ziel');
});

// ---------- isLegal, Hilfen ----------

test('isLegal lehnt Müll ab und wirft nie; applyMove wirft bei illegalem Zug', () => {
  const s = roll(L.setup({ pieces: [[5, 15, H, H], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 2);
  const bad = [null, 1, 'move', [], {}, { type: 'roll' }, { type: 'pass' }, { type: 'move' }, { type: 'move', piece: 4 },
    { type: 'move', piece: -1 }, { type: 'move', piece: '0' }, { type: 'move', piece: 0.5 }, { type: 'move', piece: 2 },
    { type: 'move', piece: 0, to: 7 }, { type: 'move', piece: 0, x: undefined, y: 1 }];
  for (const m of bad) {
    assert.equal(L.isLegal(s, m), false, JSON.stringify(m));
    assert.throws(() => L.applyMove(s, m), /Illegaler Zug/);
  }
  assert.ok(L.isLegal(s, { type: 'move', piece: 0 }));
  assert.ok(L.isLegal(s, { type: 'move', piece: 0, x: undefined }));
  for (const st of [null, {}, 7, { ...s, pieces: null }, { ...s, turn: 9 }, { ...s, phase: 'x' }]) {
    assert.equal(L.isLegal(st, mv(0)), false);
  }
  assert.equal(L.isLegal(L.initialState(), { type: 'roll', extra: 1 }), false);
  assert.equal(L.describeMove(s, { type: 'move', piece: 3 }), '?');
  assert.equal(L.describeMove(L.initialState(), { type: 'roll' }), 'Rot: würfelt');
  assert.equal(L.describeMove(s, mv(0)), 'Rot: Figur 1 auf Feld 8');
});

test('Unveränderlichkeit, positionKey, JSON-Rundreise, progress', () => {
  let s = deepFreeze(L.initialState({ players: 3 }));
  const k0 = L.positionKey(s);
  s = deepFreeze(roll(s, 6));
  s = deepFreeze(L.applyMove(s, mv(0)));
  assert.notEqual(L.positionKey(s), k0);
  const j = JSON.parse(JSON.stringify(s));
  assert.equal(L.positionKey(j), L.positionKey(s));
  assert.deepEqual(L.legalMoves(j), L.legalMoves(s));
  assert.equal(L.progress(s, 0), 7);          // 0 → 6: Feld 7 von 44
  assert.equal(L.progress(s, 1), 1);
  assert.equal(L.progress(L.setup({ pieces: [[40, 41, 42, 43], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 0), 41 + 42 + 43 + 44);
});

// ---------- evaluate ----------

test('evaluate: Start 0, Vorsprung positiv, 2 Spieler symmetrisch, 4 Spieler Durchschnitt', () => {
  for (const n of [2, 3, 4]) {
    const s = L.initialState({ players: n });
    for (let k = 0; k < n; k++) assert.equal(L.evaluate(s, k), 0);
  }
  const s2 = L.setup({ players: 2, pieces: [[20, 41, H, H], [5, H, H, H]] });
  assert.equal(L.evaluate(s2, 0), 21 + 42 - 6);
  assert.equal(L.evaluate(s2, 0) + L.evaluate(s2, 1), 0);
  const s4 = L.setup({ pieces: [[10, H, H, H], [1, H, H, H], [H, H, H, H], [H, H, H, H]] });
  assert.equal(L.evaluate(s4, 0), 11 - 2 / 3);
  assert.ok(L.evaluate(s4, 2) < 0);
  // Zufallspartie: immer endlich, 2 Spieler Summe 0
  const rng = mulberry32(5);
  let s = L.initialState({ players: 2 });
  for (let i = 0; i < 2000 && !L.result(s); i++) {
    if (L.chance(s)) { s = L.applyChance(s, [1 + randInt(rng, 6)]); continue; }
    s = L.applyMove(s, pick(rng, L.legalMoves(s)));
    assert.ok(Number.isFinite(L.evaluate(s, 0)));
    assert.equal(L.evaluate(s, 0) + L.evaluate(s, 1), 0);
  }
});

// ---------- Bot ----------

function botGames(levels, games, seed, depth = 1) {
  const n = levels.length;
  let wins = 0, maxMs = 0;
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed + g), shift = g % n;   // geprüfte Stufe (levels[0]) wechselt den Sitz
    let s = L.initialState({ players: n });
    while (!L.result(s)) {
      if (L.chance(s)) { s = L.applyChance(s, [1 + randInt(rng, 6)]); continue; }
      const lv = levels[(L.currentPlayer(s) - shift + n) % n];
      const t = performance.now();
      const m = chooseMove(s, { level: lv, rng, timeMs: 1000, depth });
      maxMs = Math.max(maxMs, performance.now() - t);
      assert.ok(L.isLegal(s, m));
      s = L.applyMove(s, m);
    }
    if (s.winner === shift) wins++;
  }
  return { wins, games, maxMs, pct: (100 * wins / games).toFixed(1) };
}

test('Bot Stufe 1 holt mit einer 6 eine Figur raus, alle Stufen liefern legale Züge', () => {
  const s = roll(L.setup({ pieces: [[5, 12, H, 20], [H, H, H, H], [H, H, H, H], [H, H, H, H]] }), 6);
  for (let i = 0; i < 20; i++) assert.equal(chooseMove(s, { level: 1, rng: mulberry32(i) }).piece, 2);
  for (const level of [1, 2, 3]) {
    assert.deepEqual(chooseMove(L.initialState(), { level }), { type: 'roll' });
    assert.equal(chooseMove(L.applyMove(L.initialState(), { type: 'roll' }), { level }), null);
  }
});

test('Bot Stufe 2/3 schlagen, wenn es sich lohnt, und retten sich ins Ziel', () => {
  // Rot p=30 kann Grün (abs 33, weit gelaufen) schlagen oder Figur 12 vorziehen
  const pieces = [[30, 12, 41, 42], [13, 14, H, H]];   // Grün p=13 → abs 33, p=14 → abs 34
  const s = roll(L.setup({ players: 2, pieces }), 3);
  assert.deepEqual(L.targets(s).find(t => t.piece === 0).capture, { seat: 1, piece: 0 });
  for (const level of [2, 3]) assert.equal(chooseMove(s, { level, rng: mulberry32(1), timeMs: 100 }).piece, 0, `Stufe ${level}`);
  // Figur kurz vor dem Ziel, Gegner 2 Felder dahinter: ins Ziel statt weiter hinten ziehen
  const g = roll(L.setup({ players: 2, pieces: [[37, 5, H, H], [15, H, H, H]] }), 4);   // Grün p=15 → abs 35
  for (const level of [2, 3]) assert.equal(chooseMove(g, { level, rng: mulberry32(2), timeMs: 100 }).piece, 0, `Stufe ${level}`);
});

test('Bot Stufe 3 bleibt in der Zeit (timeMs 400 → höchstens ~1,2 s)', () => {
  const s = roll(L.setup({ pieces: [[5, 15, 25, 35], [3, 13, 23, H], [7, 17, H, H], [9, 19, 29, H]] }), 4);
  const t = performance.now();
  const m = chooseMove(s, { level: 3, rng: mulberry32(3), timeMs: 400 });
  const ms = performance.now() - t;
  assert.ok(L.isLegal(s, m));
  assert.ok(ms < 1200, `${ms.toFixed(0)} ms`);
  return `${ms.toFixed(0)} ms`;
});

test('Bot zu zweit: Stufe 2 schlägt Stufe 1, Stufe 3 schlägt Stufe 1 klar (je 400 Partien)', () => {
  const a = botGames([2, 1], 400, 1000), b = botGames([3, 1], 400, 2000), c = botGames([3, 2], 400, 3000);
  assert.ok(a.wins / a.games > 0.7, `Stufe 2: ${a.pct} %`);
  assert.ok(b.wins / b.games > 0.75, `Stufe 3: ${b.pct} %`);
  assert.ok(c.wins / c.games > 0.45, `Stufe 3 gegen 2: ${c.pct} %`);
  return `2:1 ${a.pct} %, 3:1 ${b.pct} %, 3:2 ${c.pct} %`;
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
