// Regeltests Schiffe versenken: Brett, Flotten, Setzen (Berühr-Regel), Schießen, Versenken, Spielende, Sicht,
// öffentlicher Zug, Ansichts-Hilfen, evaluate und Bot-Stufen.
// Quelle: https://de.wikipedia.org/wiki/Schiffe_versenken
// Aufruf: node tests/node/schiffe.test.mjs
import assert from 'node:assert/strict';
import * as S from '../../src/games/schiffe/engine.js';
import { chooseMove } from '../../src/games/schiffe/bot.js';
import { RULES } from '../../src/games/schiffe/rules.js';
import { mulberry32 } from '../../src/rng.js';

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

// ---------- Hilfen ----------

const at = name => S.ROWS.indexOf(name[0]) * 10 + Number(name.slice(1)) - 1;   // „B7“ → 16
const shot = name => ({ type: 'shot', i: at(name) });
const place = ships => ({ type: 'place', ships });
const run = (s, ...moves) => moves.reduce((st, m) => S.applyMove(st, m), s);

// Flotte A (klein): Flugzeugträger A1–A5, Schlachtschiff C1–F1 (senkrecht), Zerstörer J8–J10, U-Boot E5–E7,
// Schnellboot H3–H4 – berührt sich nirgends
const FA = [
  { r: 0, c: 0, len: 5, dir: 'h' }, { r: 2, c: 0, len: 4, dir: 'v' }, { r: 9, c: 7, len: 3, dir: 'h' },
  { r: 4, c: 4, len: 3, dir: 'h' }, { r: 7, c: 2, len: 2, dir: 'h' }
];
// Flotte B (klein): andere Lage, Schnellboot zuerst (Reihenfolge im Zug ist egal)
const FB = [
  { r: 9, c: 0, len: 2, dir: 'h' }, { r: 0, c: 9, len: 5, dir: 'v' }, { r: 2, c: 2, len: 4, dir: 'h' },
  { r: 5, c: 0, len: 3, dir: 'v' }, { r: 6, c: 5, len: 3, dir: 'h' }
];
const start = (opts = {}, a = FA, b = FB) => run(S.initialState(opts), place(a), place(b));
// Sitz 0 trifft nie (schießt auf Wasser von FB), damit Sitz 1 frei schießen kann
const WATER_B = [...Array(100).keys()].filter(i => !FB.some(s => S.cells(s).includes(i)));

// ---------- Brett und Flotten ----------

test('Optionen: Standard klein, Berühren aus, abwechselnd; Unsinn → Standard', () => {
  assert.deepEqual(S.normalizeOptions(), { flotte: 'klein', beruehren: false, nochmal: false });
  assert.deepEqual(S.normalizeOptions({ flotte: 'riesig', beruehren: 'ja', nochmal: 1 }), { flotte: 'klein', beruehren: false, nochmal: false });
  assert.deepEqual(S.normalizeOptions({ flotte: 'gross', beruehren: true, nochmal: true }), { flotte: 'gross', beruehren: true, nochmal: true });
  assert.equal(S.id, 'schiffe');
  assert.equal(S.title, 'Schiffe versenken');
  assert.equal(S.HIDDEN, true);
});

test('Flotten: klein 5,4,3,3,2 = 17 Felder; groß (Quelle) 1×5, 2×4, 3×3, 4×2 = 30 Felder mit Namen', () => {
  assert.deepEqual(S.FLEETS.klein.map(s => s.len), [5, 4, 3, 3, 2]);
  assert.equal(S.fleetCells({}), 17);
  assert.deepEqual(S.FLEETS.gross.map(s => s.len), [5, 4, 4, 3, 3, 3, 2, 2, 2, 2]);
  assert.equal(S.fleetCells({ flotte: 'gross' }), 30);
  assert.deepEqual([...new Set(S.FLEETS.gross.map(s => s.name))], ['Schlachtschiff', 'Kreuzer', 'Zerstörer', 'U-Boot']);
  assert.equal(S.shipName({}, 4), 'Schnellboot');
});

test('Koordinaten: 10×10, Zeilen A–J, Spalten 1–10, i = r*10 + c; „B7“ = Zelle 16', () => {
  assert.equal(S.cellName(0), 'A1');
  assert.equal(S.cellName(16), 'B7');
  assert.equal(S.cellName(99), 'J10');
  assert.equal(S.cellName(100), '?');
  assert.equal(at('B7'), 16);
  assert.deepEqual(S.cells({ r: 1, c: 6, len: 3, dir: 'h' }), [16, 17, 18]);
  assert.deepEqual(S.cells({ r: 1, c: 6, len: 3, dir: 'v' }), [16, 26, 36]);
  assert.deepEqual(S.cells({ r: 1, c: 8, len: 3, dir: 'h' }), [], 'ragt aus dem Brett');
  assert.deepEqual(S.cells({ r: 0, c: 0, len: 2, dir: 'd' }), [], 'diagonal gibt es nicht');
});

// ---------- Setzen ----------

test('Flotte gültig: richtige Schiffe, im Brett, am Rand erlaubt, Reihenfolge egal', () => {
  assert.ok(S.validFleet({}, FA));
  assert.ok(S.validFleet({}, FB));
  assert.ok(S.validFleet({}, FA.slice().reverse()));
  assert.ok(!S.validFleet({}, FA.slice(0, 4)), 'ein Schiff fehlt');
  assert.ok(!S.validFleet({}, [...FA, { r: 7, c: 7, len: 2, dir: 'h' }]), 'ein Schiff zu viel');
  assert.ok(!S.validFleet({}, FA.map((s, k) => (k === 4 ? { ...s, len: 3 } : s))), 'falsche Länge');
  assert.ok(!S.validFleet({ flotte: 'gross' }, FA), 'kleine Flotte bei Option groß');
  assert.ok(!S.validFleet({}, FA.map((s, k) => (k === 2 ? { ...s, c: 8 } : s))), 'ragt über den Rand');
  assert.ok(!S.validFleet({}, FA.map((s, k) => (k === 4 ? { ...s, dir: 'd' } : s))), 'nicht diagonal');
  assert.ok(!S.validFleet({}, FA.map((s, k) => (k === 4 ? { ...s, x: 1 } : s))), 'fremdes Feld im Schiff');
  assert.ok(!S.validFleet({}, null) && !S.validFleet({}, 'x') && !S.validFleet({}, [1, 2, 3, 4, 5]));
});

test('Schiffe dürfen sich nicht überlappen und nicht berühren – auch nicht über Eck (Standard)', () => {
  const overlap = FA.map((s, k) => (k === 4 ? { r: 0, c: 3, len: 2, dir: 'v' } : s));      // auf dem Träger
  const side = FA.map((s, k) => (k === 4 ? { r: 1, c: 6, len: 2, dir: 'h' } : s));         // B7–B8: zwei Spalten neben A5, berührt nicht
  const below = FA.map((s, k) => (k === 4 ? { r: 1, c: 3, len: 2, dir: 'h' } : s));        // B4–B5 direkt unter A4/A5
  const corner = FA.map((s, k) => (k === 4 ? { r: 1, c: 5, len: 2, dir: 'h' } : s));       // B6 berührt A5 über Eck
  assert.ok(!S.validFleet({}, overlap));
  assert.ok(!S.validFleet({}, below));
  assert.ok(!S.validFleet({}, corner));
  assert.ok(S.validFleet({}, side), 'B7 ist zwei Felder von A5 weg');
  // Hausregel: Berühren erlaubt, Überlappen nie
  assert.ok(S.validFleet({ beruehren: true }, below));
  assert.ok(S.validFleet({ beruehren: true }, corner));
  assert.ok(!S.validFleet({ beruehren: true }, overlap));
});

test('Ablauf beim Setzen: erst Sitz 0, dann Sitz 1, danach schießt Sitz 0', () => {
  let s = S.initialState();
  assert.equal(S.phase(s), 'place');
  assert.equal(S.currentPlayer(s), 0);
  s = S.applyMove(s, place(FA));
  assert.equal(S.currentPlayer(s), 1);
  assert.equal(s.phase, 'place');
  assert.ok(!S.isLegal(s, shot('A1')), 'vor dem Setzen beider Flotten kein Schuss');
  s = S.applyMove(s, place(FB));
  assert.equal(s.phase, 'shoot');
  assert.equal(S.currentPlayer(s), 0);
  assert.equal(S.legalMoves(s).length, 100);
  // gespeichert nach Länge absteigend, Treffer 0
  assert.deepEqual(s.fleets[1].map(x => x.len), [5, 4, 3, 3, 2]);
  assert.deepEqual(s.fleets[1][0], { r: 0, c: 9, len: 5, dir: 'v', hits: 0 });
  assert.deepEqual(s.fleets[1][3], { r: 6, c: 5, len: 3, dir: 'h', hits: 0 }, 'gleich lange Schiffe in Zug-Reihenfolge');
});

test('legalMoves beim Setzen: eine gültige Beispiel-Flotte; isLegal nimmt jede gültige Flotte', () => {
  for (const opts of [{}, { flotte: 'gross' }, { beruehren: true }, { flotte: 'gross', beruehren: true }]) {
    let s = S.initialState(opts);
    for (const p of [0, 1]) {
      const ms = S.legalMoves(s);
      assert.equal(ms.length, 1);
      assert.ok(S.validFleet(opts, ms[0].ships));
      assert.deepEqual(S.legalMoves(s), ms, 'deterministisch');
      s = S.applyMove(s, ms[0]);
    }
    assert.equal(s.phase, 'shoot');
  }
});

test('isLegal lehnt Müll und verfälschte Züge ab, wirft nie; applyMove wirft', () => {
  const s0 = S.initialState(), s = start();
  const bad = [null, undefined, 1, 'shot', [], {}, { type: 'x' }, { type: 'place' }, { type: 'place', ships: FA, extra: 1 },
    { type: 'shot' }, { type: 'shot', i: -1 }, { type: 'shot', i: 100 }, { type: 'shot', i: 1.5 }, { type: 'shot', i: '3' },
    { type: 'shot', i: 3, x: 0 }];
  for (const m of bad) { assert.equal(S.isLegal(s, m), false, JSON.stringify(m)); assert.equal(S.isLegal(s0, m), false); }
  assert.equal(S.isLegal(s, place(FA)), false, 'kein Setzen beim Schießen');
  assert.equal(S.isLegal(s0, shot('A1')), false);
  assert.equal(S.isLegal(null, shot('A1')), false);
  assert.equal(S.isLegal({ phase: 'shoot' }, shot('A1')), false);
  assert.throws(() => S.applyMove(s, shot('K1')));
  assert.throws(() => S.applyMove(s0, place(FA.slice(1))));
});

// ---------- Schießen ----------

test('Wasser und Treffer: abwechselnd schießen (Standard), Treffer genau auf Schiffsfeldern', () => {
  let s = start();
  s = S.applyMove(s, shot('A1'));                      // B hat dort nichts
  assert.deepEqual(s.shots[0], [{ i: 0, hit: false, sunk: null }]);
  assert.equal(S.currentPlayer(s), 1);
  s = S.applyMove(s, shot('A1'));                      // A hat dort den Träger
  assert.deepEqual(s.shots[1], [{ i: 0, hit: true, sunk: null }]);
  assert.equal(s.fleets[0][0].hits, 1);
  assert.deepEqual(s.last, { seat: 1, i: 0, hit: true, sunk: null });
  assert.equal(S.currentPlayer(s), 0, 'auch nach Treffer wechselt der Schütze');
});

test('Kein Feld doppelt beschießen; der Gegner darf dasselbe Feld auf seinem Brett beschießen', () => {
  let s = start();
  s = run(s, shot('C3'), shot('C3'));
  assert.ok(!S.isLegal(s, shot('C3')));
  assert.equal(S.legalMoves(s).length, 99);
  assert.ok(S.isLegal(s, shot('C4')));
});

test('Hausregel nochmal: nach Treffer schießt derselbe weiter, nach Wasser wechselt es', () => {
  let s = start({ nochmal: true });
  s = S.applyMove(s, shot('C3'));                      // Treffer auf B-Schlachtschiff C3–C6
  assert.equal(S.currentPlayer(s), 0);
  s = S.applyMove(s, shot('C4'));
  assert.equal(S.currentPlayer(s), 0);
  s = S.applyMove(s, shot('D4'));                      // Wasser
  assert.equal(S.currentPlayer(s), 1);
});

test('Versenkt, wenn alle Felder getroffen; Zugtexte Wasser/Treffer/versenkt (Schiffsname)', () => {
  let s = start();
  assert.equal(S.describeMove(s, shot('B7')), 'B7: Wasser');
  assert.equal(S.describeMove(s, shot('J1')), 'J1: Treffer');
  s = run(s, shot('J1'), shot('A2'));
  assert.equal(S.describeMove(s, shot('J2')), 'J2: Treffer, versenkt (Schnellboot)');
  s = S.applyMove(s, shot('J2'));
  assert.deepEqual(s.shots[0].at(-1), { i: at('J2'), hit: true, sunk: 4 });
  assert.deepEqual(s.sunk[0], [4]);
  assert.deepEqual(s.last, { seat: 0, i: at('J2'), hit: true, sunk: 4, len: 2 });
  assert.equal(S.describeMove(s, { type: 'place', ships: FA }), 'Flotte gesetzt');
  assert.equal(S.describeMove(s, { type: 'blub' }), '?');
});

test('Spielende genau, wenn die ganze Flotte versenkt ist; Sieger ist der Schütze', () => {
  let s = start();
  const targets = FB.flatMap(S.cells);
  const misses = WATER_B.slice();
  // Sitz 0 schießt alle B-Felder, Sitz 1 schießt dazwischen auf Wasser von A
  const waterA = [...Array(100).keys()].filter(i => !FA.some(x => S.cells(x).includes(i)));
  for (let k = 0; k < targets.length; k++) {
    assert.equal(S.result(s), null);
    s = S.applyMove(s, { type: 'shot', i: targets[k] });
    if (k < targets.length - 1) s = S.applyMove(s, { type: 'shot', i: waterA[k] });
  }
  assert.equal(misses.length, 83);
  assert.equal(s.phase, 'over');
  assert.equal(s.winner, 0);
  assert.equal(S.currentPlayer(s), null);
  assert.deepEqual(S.legalMoves(s), []);
  assert.deepEqual(S.result(s), { winner: 0, reason: 'alle Schiffe versenkt' });
  assert.equal(s.sunk[0].length, 5);
  assert.ok(!S.isLegal(s, shot('J10')));
});

// ---------- Sicht ----------

test('Sicht beim Setzen: Sitz 1 sieht die Flotte von Sitz 0 nicht, Zuschauer sieht keine', () => {
  const s = S.applyMove(S.initialState(), place(FA));
  const v1 = S.viewFor(s, 1), v0 = S.viewFor(s, 0), z = S.viewFor(s, null);
  assert.deepEqual(v1.fleets, [null, null]);
  assert.deepEqual(z.fleets, [null, null]);
  assert.equal(v0.fleets[0].length, 5);
  assert.ok(!JSON.stringify(v1).includes('"dir"'), 'keine Schiffsdaten in der Sicht');
  // Engine auf der Sicht des Sitzes am Zug
  assert.equal(S.currentPlayer(v1), 1);
  assert.ok(S.isLegal(v1, place(FB)));
  assert.ok(S.validFleet({}, S.legalMoves(v1)[0].ships));
});

test('Sicht beim Schießen: eigene Flotte offen, fremde null, versenkte fremde Schiffe offen, Schüsse öffentlich', () => {
  let s = start();
  s = run(s, shot('J1'), shot('A1'), shot('J2'), shot('A2'));     // B-Schnellboot versenkt, A-Träger 2 Treffer
  const v0 = S.viewFor(s, 0), v1 = S.viewFor(s, 1), z = S.viewFor(s, null);
  assert.equal(v0.fleets[1], null);
  assert.equal(v0.fleets[0].length, 5);
  assert.deepEqual(v0.revealed, [[], [{ k: 4, r: 9, c: 0, len: 2, dir: 'h' }]]);
  assert.deepEqual(z.revealed, v0.revealed);
  assert.deepEqual(z.fleets, [null, null]);
  assert.deepEqual(v1.shots, s.shots);
  assert.equal(v1.fleets[0], null, 'unversenkter Träger bleibt verdeckt, obwohl getroffen');
  // Sicht ist unabhängig von der Lage unversenkter fremder Schiffe
  const twin = { ...s, fleets: [s.fleets[0], s.fleets[1].map((x, k) => (k === 4 ? x : { ...x, r: 0, c: 0 }))] };
  assert.deepEqual(S.viewFor(twin, 0), v0);
  // Engine auf der Sicht wie auf dem vollen Zustand
  assert.equal(S.currentPlayer(v0), S.currentPlayer(s));
  assert.deepEqual(S.legalMoves(v0), S.legalMoves(s));
  assert.equal(S.isLegal(v0, shot('J1')), false);
  assert.equal(S.isLegal(v0, shot('E5')), true);
  assert.equal(S.result(v0), null);
  assert.equal(S.describeMove(v0, shot('E5')), 'E5');
  // keine Veränderung des Originals
  v0.shots[0].push({ i: 99, hit: false, sunk: null });
  assert.equal(s.shots[0].length, 2);
});

test('Nach Spielende sind beide Flotten offen; JSON-Rundreise gleich', () => {
  let s = start({ nochmal: true });
  for (const i of FB.flatMap(S.cells)) s = S.applyMove(s, { type: 'shot', i });
  assert.equal(s.winner, 0);
  const z = S.viewFor(s, null);
  assert.equal(z.fleets[0].length, 5);
  assert.equal(z.fleets[1].length, 5);
  assert.equal(z.revealed[1].length, 5);
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(S.positionKey(JSON.parse(JSON.stringify(s))), S.positionKey(s));
});

test('publicMove: Flotte setzen ohne Koordinaten, Schuss unverändert', () => {
  assert.deepEqual(S.publicMove(place(FA)), { type: 'place' });
  assert.ok(!JSON.stringify(S.publicMove(place(FA))).match(/"r"|"c"|ships/));
  assert.deepEqual(S.publicMove(shot('B7')), { type: 'shot', i: 16 });
});

// ---------- Ansichts-Hilfen ----------

test('grid: eigenes Brett zeigt Schiffe; fremdes nur Treffer, Wasser, Versenktes und sicheres Wasser', () => {
  let s = start();
  s = run(s, shot('J1'), shot('A1'), shot('J2'), shot('C1'));     // B-Schnellboot J1–J2 versenkt; A: Treffer A1, C1
  const v1 = S.viewFor(s, 1);
  const own = S.grid(v1, 1, 1);
  assert.equal(own.filter(x => x.ship).length, 17);
  assert.equal(own[at('J1')].shot, 'hit');
  assert.ok(own[at('J1')].sunk);
  const foe = S.grid(S.viewFor(s, 0), 1, 0);
  assert.deepEqual(foe[at('J1')], { ship: true, shot: 'hit', sunk: true });
  assert.deepEqual(foe[at('I1')], { ship: false, shot: null, sunk: false }, 'neben versenktem Schiff sicher Wasser');
  assert.deepEqual(foe[at('I3')], { ship: false, shot: null, sunk: false }, 'auch über Eck');
  assert.deepEqual(foe[at('A1')], { ship: null, shot: null, sunk: false });
  // Brett von Sitz 0 aus Sicht von Sitz 1: Treffer A1/C1, Ecken daneben sicher Wasser, Rest unbekannt
  const a = S.grid(S.viewFor(s, 1), 0, 1);
  assert.deepEqual(a[at('A1')], { ship: true, shot: 'hit', sunk: false });
  assert.equal(a[at('B2')].ship, false);
  assert.equal(a[at('A2')].ship, null);
  assert.equal(a[at('B1')].ship, null);
  // Host mit vollem Zustand, aber fremder Betrachter: verrät nichts
  assert.deepEqual(S.grid(s, 0, 1), a);
  // Hausregel Berühren: keine Schlüsse aufs Umfeld
  let t = start({ beruehren: true });
  t = run(t, shot('J1'), shot('A1'), shot('J2'));
  const g = S.grid(S.viewFor(t, 0), 1, 0);
  assert.equal(g[at('I1')].ship, null);
  assert.equal(S.grid(t, 0, 1)[at('B2')].ship, null);
});

test('remaining und evaluate (Einheit Felder): Start 0, Vorzeichen, Symmetrie, Sicht = voller Zustand', () => {
  let s = start();
  assert.equal(S.evaluate(s, 0), 0);
  assert.equal(S.evaluate(S.initialState(), 1), 0);
  assert.equal(S.remaining(s, 0), 17);
  s = run(s, shot('J1'), shot('B1'));                 // Sitz 0 trifft, Sitz 1 Wasser
  assert.equal(S.remaining(s, 1), 16);
  assert.equal(S.evaluate(s, 0), 1);
  assert.equal(S.evaluate(s, 1), -1);
  s = run(s, shot('J5'), shot('A1'), shot('J2'), shot('A2'), shot('J6'), shot('A3'));
  assert.equal(S.evaluate(s, 0), -1);
  for (const k of [0, 1]) {
    assert.equal(S.evaluate(S.viewFor(s, k), k), S.evaluate(s, k));
    assert.equal(S.evaluate(S.viewFor(s, null), k), S.evaluate(s, k));
  }
  assert.equal(S.evaluate(s, 0) + S.evaluate(s, 1), 0);
  assert.equal(S.remaining(S.initialState({ flotte: 'gross' }), 0), 30);
});

test('randomFleet: immer gültig für alle Optionen, mit rng reproduzierbar, ohne rng deterministisch', () => {
  let n = 0;
  for (const opts of [{}, { flotte: 'gross' }, { beruehren: true }, { flotte: 'gross', beruehren: true }]) {
    const rng = mulberry32(7);
    for (let k = 0; k < 300; k++) { assert.ok(S.validFleet(opts, S.randomFleet(opts, rng))); n++; }
    assert.deepEqual(S.randomFleet(opts, mulberry32(3)), S.randomFleet(opts, mulberry32(3)));
    assert.deepEqual(S.randomFleet(opts), S.randomFleet(opts));
  }
  return `${n} Flotten`;
});

// ---------- Regeln (Daten) ----------

test('rules.js: Titel, Quelle mit URL, Sätze, alle Optionen erklärt', () => {
  assert.equal(RULES.title, 'Schiffe versenken');
  assert.ok(RULES.source.includes('https://de.wikipedia.org/wiki/Schiffe_versenken'));
  assert.ok(RULES.items.length >= 8);
  assert.deepEqual(Object.keys(RULES.options).sort(), Object.keys(S.normalizeOptions()).sort());
});

// ---------- Bot ----------

// Ganze Partie Bot gegen Bot; jeder Bot sieht nur seine Sicht
function duel(opts, levels, seed) {
  const rng = mulberry32(seed);
  let s = S.initialState(opts);
  while (!S.result(s)) {
    const p = S.currentPlayer(s), v = S.viewFor(s, p);
    const m = chooseMove(v, { level: levels[p], rng });
    assert.ok(S.isLegal(s, m), 'Bot-Zug legal');
    s = S.applyMove(s, m);
  }
  return s;
}
function solo(opts, level, seed) {
  const rng = mulberry32(seed);
  let s = run(S.initialState(opts), place(S.randomFleet(opts, rng)), place(S.randomFleet(opts, rng)));
  let n = 0;
  while (s.phase !== 'over') { s = S.applyMove({ ...s, turn: 0 }, chooseMove(S.viewFor({ ...s, turn: 0 }, 0), { level, rng })); n++; }
  return n;
}

test('Bot: setzt gültige Flotte und schießt nur legal (alle Stufen, alle Optionen), braucht keine fremde Flotte', () => {
  let games = 0;
  for (const opts of [{}, { flotte: 'gross' }, { beruehren: true, nochmal: true }]) {
    for (const L of [1, 2, 3]) { duel(opts, [L, L], 50 + L); games++; }
  }
  // Stufe 3 setzt weg von der „heißen“ Mitte und gültig
  const v = S.viewFor(S.initialState(), 0);
  const m = chooseMove(v, { level: 3, rng: mulberry32(1) });
  assert.ok(S.validFleet({}, m.ships));
  return `${games} Partien`;
});

test('Bot-Stufen: mittlere Schusszahl bis zum Versenken (5,4,3,3,2), Stufe 3 ≤ 45', () => {
  const N = 150, avg = {};
  for (const L of [1, 2, 3]) {
    let sum = 0;
    for (let g = 0; g < N; g++) sum += solo({}, L, 9000 + g);
    avg[L] = sum / N;
  }
  assert.ok(avg[3] <= 45, `Stufe 3: ${avg[3]}`);
  assert.ok(avg[2] < avg[1] && avg[3] < avg[2]);
  return `Stufe 1 ${avg[1].toFixed(1)}, Stufe 2 ${avg[2].toFixed(1)}, Stufe 3 ${avg[3].toFixed(1)} Schüsse`;
});

test('Bot-Stufen im Duell: Stufe 3 schlägt 1 klar, Stufe 2 schlägt 1, Stufe 3 ≥ Stufe 2', () => {
  const N = 200, rate = {};
  for (const [a, b] of [[3, 1], [2, 1], [3, 2]]) {
    let w = 0;
    for (let g = 0; g < N; g++) {
      const swap = g % 2 === 1;                       // Sitze tauschen: Anzug-Vorteil ausgleichen
      const s = duel({}, swap ? [b, a] : [a, b], 777 + g);
      if (s.winner === (swap ? 1 : 0)) w++;
    }
    rate[`${a}-${b}`] = w / N;
  }
  assert.ok(rate['3-1'] >= 0.85, JSON.stringify(rate));
  assert.ok(rate['2-1'] >= 0.75, JSON.stringify(rate));
  assert.ok(rate['3-2'] >= 0.5, JSON.stringify(rate));
  return Object.entries(rate).map(([k, v]) => `${k}: ${(v * 100).toFixed(0)} %`).join(', ');
});

const secs = ((performance.now() - t0) / 1000).toFixed(2);
console.log(`\nSchiffe-versenken-Regeltests: ${passed} bestanden, ${failed} fehlgeschlagen – Laufzeit ${secs} s`);
process.exitCode = failed ? 1 : 0;
