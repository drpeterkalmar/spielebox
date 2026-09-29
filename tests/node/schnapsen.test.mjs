// Regeltests Schnapsen: Teilen, Bedienen, Ansagen, Austauschen, Zudrehen, Ausmelden, Wertung, Bummerl, Sicht, Bot.
// Aufruf: node tests/node/schnapsen.test.mjs
import assert from 'node:assert/strict';
import * as S from '../../src/games/schnapsen/engine.js';
import { chooseMove } from '../../src/games/schnapsen/bot.js';
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

// Permutation aus Wunschkarten: v = Vorhand (≤ 5), d = Teiler (≤ 5), atout = aufgeschlagene Karte,
// talon = oberste Talonkarten; der Rest wird in DECK-Reihenfolge aufgefüllt.
function permFor({ v = [], d = [], atout, talon = [] }) {
  const used = new Set([...v, ...d, atout, ...talon].filter(Boolean));
  const rest = S.DECK.filter(c => !used.has(c));
  const fill = (list, n) => { const out = list.slice(); while (out.length < n) out.push(rest.shift()); return out; };
  const V = fill(v, 5), D = fill(d, 5), A = atout || rest.shift(), T = fill(talon, 9);
  const order = [V[0], V[1], V[2], D[0], D[1], D[2], A, V[3], V[4], D[3], D[4], ...T];
  return order.map(c => S.DECK.indexOf(c));
}
function dealFrom(cards, opts = {}, state = S.initialState(opts)) {
  return S.applyChance(state, permFor(cards));
}
const P = card => ({ type: 'play', card });
const T = type => ({ type });
const keys = s => S.legalMoves(s).map(S.moveKey).sort();
const playable = s => S.legalMoves(s).filter(m => m.type === 'play').map(m => m.card).sort();
const sorted = list => list.slice().sort();
const run = (s, ...moves) => moves.reduce((st, m) => S.applyMove(st, m), s);
// Stellung am Ausspielen für seat mit gewünschten Augen/Stichen (Karten der Stiche sind hier egal)
function atLead(s, seat, { augen = [0, 0], tricks = [0, 0] } = {}) {
  return { ...s, turn: seat, augen: augen.slice(), tricks: tricks.slice() };
}

// Standardausteilung: Vorhand (Sitz 0) hat Herz-König/-Ober, Atout Herz, Teiler hat den Atout-Unter
const STD = () => dealFrom({ v: ['HK', 'HO', 'SA', 'LU', 'EO'], d: ['HU', 'SZ', 'LA', 'LZ', 'EK'], atout: 'HZ',
  talon: ['SU', 'SK', 'EU'] });

// ---------- Karten und Teilen ----------

test('Karten: 20 verschiedene, 120 Augen, Namen', () => {
  assert.equal(S.DECK.length, 20);
  assert.equal(new Set(S.DECK).size, 20);
  assert.equal(S.DECK.reduce((a, c) => a + S.VALUE[c[1]], 0), 120);
  assert.deepEqual([...S.SUITS], ['H', 'S', 'L', 'E']);
  assert.deepEqual([...S.RANKS], ['A', 'Z', 'K', 'O', 'U']);
  assert.equal(S.cardName('HA'), 'Herz-Daus');
  assert.equal(S.cardName('EU'), 'Eichel-Unter');
  assert.equal(S.cardName('SZ'), 'Schellen-Zehner');
  assert.deepEqual(S.normalizeOptions({ bummerl: 7, hart: 'ja' }), { hart: false, schneider: false, bummerl: 2 });
  assert.deepEqual(S.normalizeOptions({ bummerl: 3, hart: true, schneider: true }), { hart: true, schneider: true, bummerl: 3 });
});

test('Teilen: 3 Vorhand, 3 Teiler, Atout, 2 Vorhand, 2 Teiler, Rest Talon (bekannte Permutation)', () => {
  const s0 = S.initialState();
  assert.deepEqual(S.chance(s0), { kind: 'shuffle', n: 20 });
  assert.equal(S.currentPlayer(s0), null);
  assert.deepEqual(S.legalMoves(s0), []);
  assert.equal(S.phase(s0), 'deal');
  const s = S.applyChance(s0, [...Array(20).keys()]);   // Stapel = DECK
  assert.equal(s.dealer, 1);
  assert.deepEqual(s.hands[0], ['HA', 'HZ', 'HK', 'SK', 'SO']);   // Vorhand = Sitz 0
  assert.deepEqual(s.hands[1], ['HO', 'HU', 'SA', 'SU', 'LA']);
  assert.equal(s.atoutCard, 'SZ');
  assert.equal(s.atout, 'S');
  assert.deepEqual(s.talon, ['LZ', 'LK', 'LO', 'LU', 'EA', 'EZ', 'EK', 'EO', 'EU']);
  assert.equal(S.currentPlayer(s), 0);
  assert.equal(S.chance(s), null);
  assert.equal(S.phase(s), 'play');
  assert.throws(() => S.applyChance(s0, [0, 1, 2]));
  assert.throws(() => S.applyChance(s0, [...Array(19).keys(), 0]));
  assert.throws(() => S.applyChance(s, [...Array(20).keys()]));
});

test('Ziehen: Stichgewinner hebt zuerst, zuletzt bekommt der Verlierer die Atoutkarte', () => {
  let s = STD();
  s = run(s, P('LU'), P('LA'));   // Teiler (1) sticht
  assert.equal(s.turn, 1);
  assert.equal(s.hands[1].at(-1), 'SU');   // oberste Talonkarte an den Gewinner
  assert.equal(s.hands[0].at(-1), 'SK');
  assert.equal(s.talon.length, 7);
  assert.deepEqual(s.lastTrick, { cards: [{ seat: 0, card: 'LU' }, { seat: 1, card: 'LA' }], winner: 1 });
  // Nur noch eine verdeckte Karte: Gewinner hebt sie, Verlierer die Atoutkarte
  const t = { ...STD(), talon: ['EU'] };
  const u = run(t, P('SA'), P('SZ'));   // Vorhand sticht mit Daus
  assert.equal(u.hands[0].at(-1), 'EU');
  assert.equal(u.hands[1].at(-1), 'HZ');
  assert.equal(u.atoutCard, null);
  assert.equal(u.talon.length, 0);
  assert.ok(S.mustFollow(u));
});

test('Stich: höchste Karte der ausgespielten Farbe, Atout sticht alles', () => {
  const w = (a, b, atout = 'H') => S.trickWinner([{ seat: 0, card: a }, { seat: 1, card: b }], atout);
  assert.equal(w('SZ', 'SA'), 1);
  assert.equal(w('SA', 'SZ'), 0);
  assert.equal(w('SK', 'SO'), 0);
  assert.equal(w('SA', 'HU'), 1);
  assert.equal(w('SU', 'LA'), 0);   // Fehlfarbe gewinnt nie
  assert.equal(w('HU', 'SA'), 0);
  assert.equal(w('HO', 'HK'), 1);
});

// ---------- Bedienen ----------

test('Offener Talon: weder Farb- noch Stichzwang', () => {
  let s = STD();
  s = S.applyMove(s, P('SA'));
  assert.deepEqual(playable(s), sorted(['HU', 'SZ', 'LA', 'LZ', 'EK']));
});

function followState({ closed = true, hand, led, atout = 'H' }) {
  const s = STD();
  const st = { ...s, atout, trick: [{ seat: 0, card: led }], turn: 1, hands: [s.hands[0], hand] };
  if (closed) st.closed = { by: 0, oppAugen: 0, oppTricks: 0 };
  else Object.assign(st, { talon: [], atoutCard: null });
  return st;
}

for (const closed of [true, false]) {
  const how = closed ? 'nach Zudrehen' : 'bei leerem Talon';
  test(`Farbzwang vor Stichzwang, dann Trumpfzwang – ${how}`, () => {
    // höher bedienen, wenn möglich
    assert.deepEqual(playable(followState({ closed, led: 'SK', hand: ['SA', 'SO', 'SU', 'HU', 'LA'] })), ['SA']);
    // nur niedriger bedienen möglich → irgendeine Karte der Farbe (nicht Atout)
    assert.deepEqual(playable(followState({ closed, led: 'SZ', hand: ['SK', 'SO', 'HU', 'LA'] })), ['SK', 'SO']);
    // nicht bedienen → Atout zwingend
    assert.deepEqual(playable(followState({ closed, led: 'SZ', hand: ['HU', 'HO', 'LA', 'EZ'] })), ['HO', 'HU']);
    // weder Farbe noch Atout → frei
    assert.deepEqual(playable(followState({ closed, led: 'SZ', hand: ['LA', 'EZ'] })), ['EZ', 'LA']);
    // Atout ausgespielt → höheres Atout, sonst irgendein Atout
    assert.deepEqual(playable(followState({ closed, led: 'HO', hand: ['HK', 'HU', 'SA'] })), ['HK']);
    assert.deepEqual(playable(followState({ closed, led: 'HK', hand: ['HO', 'HU', 'SA'] })), ['HO', 'HU']);
  });
}

// ---------- Ansagen ----------

test('Ansage: nur am Ausspielen mit König+Ober, danach nur König/Ober dieser Farbe', () => {
  let s = STD();
  assert.ok(keys(s).includes('ansagen:H'));
  assert.equal(S.describeMove(s, { type: 'ansagen', suit: 'H' }), 'Ansage 40 (Herz)');
  s = S.applyMove(s, { type: 'ansagen', suit: 'H' });
  assert.deepEqual(keys(s), ['play:HK', 'play:HO']);   // stichlos → kein Ausmelden
  assert.equal(s.openAnsage, 'H');
  assert.deepEqual(s.ansagen, [{ seat: 0, suit: 'H', points: 40 }]);
  assert.equal(S.isLegal(s, P('SA')), false);
  s = S.applyMove(s, P('HO'));
  assert.equal(s.openAnsage, null);
  assert.equal(S.isLegal(s, { type: 'ansagen', suit: 'H' }), false);   // Nachhand darf nicht ansagen
  const t = dealFrom({ v: ['SK', 'SO', 'HA', 'LU', 'EO'], atout: 'HZ' });
  assert.equal(S.describeMove(t, { type: 'ansagen', suit: 'S' }), 'Ansage 20 (Schellen)');
  assert.equal(S.applyMove(t, { type: 'ansagen', suit: 'S' }).ansagen[0].points, 20);
});

test('Ansage ohne Stich schwebt und verfällt; zählt ab dem ersten Stich', () => {
  let s = STD();
  s = run(s, { type: 'ansagen', suit: 'H' }, P('HO'), P('HU'));   // Teiler sticht mit Atout-Unter? HU < HO → Vorhand gewinnt
  assert.equal(s.lastTrick.winner, 0);
  assert.equal(S.cardPoints(s, 0), 3 + 2 + 40);
  // Anders: Ansage 20, Ober verliert den Stich → schwebend
  let t = dealFrom({ v: ['SK', 'SO', 'HA', 'LU', 'EO'], d: ['SA', 'HU', 'LA', 'LZ', 'EK'], atout: 'HZ' });
  t = run(t, { type: 'ansagen', suit: 'S' }, P('SO'), P('SA'));
  assert.equal(t.tricks[0], 0);
  assert.equal(S.cardPoints(t, 0), 0);
  assert.equal(S.pendingPoints(t, 0), 20);
  assert.equal(S.cardPoints(t, 1), 14);
  // Vorhand bleibt bis zum Ende stichlos → Ansage verfällt in der Abrechnung
  const end = S.applyMove({ ...t, turn: 1, augen: [0, 70], tricks: [0, 5] }, T('ausmelden'));
  assert.deepEqual(end.spiel.augen, [0, 70]);
  assert.equal(end.spiel.points, 3);
  // Später ein Stich → die 20 zählen
  const u = run({ ...t, hands: [['HA', 'LU', 'EO', 'SK', 'EZ'], ['SU', 'HU', 'LA', 'LZ', 'EK']] }, P('SU'), P('SK'));
  assert.equal(u.tricks[0], 1);
  assert.equal(S.cardPoints(u, 0), 6 + 20);
});

test('Ausmelden direkt mit einer Ansage (schon ein Stich)', () => {
  const s = atLead(STD(), 0, { augen: [30, 40], tricks: [1, 2] });
  const a = S.applyMove(s, { type: 'ansagen', suit: 'H' });   // 30 + 40 = 70
  assert.ok(keys(a).includes('ausmelden'));
  assert.ok(S.canDeclare(a));
  const e = S.applyMove(a, T('ausmelden'));
  assert.equal(e.spiel.winner, 0);
  assert.equal(e.spiel.points, 1);   // Gegner hat 40 Augen
  assert.deepEqual(e.spiel.augen, [70, 40]);
  // Ansage reicht nicht → kein Ausmelden nach der Ansage
  const b = S.applyMove(atLead(STD(), 0, { augen: [20, 40], tricks: [1, 2] }), { type: 'ansagen', suit: 'H' });
  assert.ok(!keys(b).includes('ausmelden'));
});

// ---------- Ausmelden und Wertung ----------

test('Ausmelden: 3 Punkte (Gegner stichlos), 2 (Gegner ≤ 32), 1 (Gegner ≥ 33)', () => {
  const cases = [[[66, 0], [3, 0], 3], [[70, 32], [4, 3], 2], [[66, 33], [4, 3], 1], [[80, 1], [5, 0], 3]];
  for (const [augen, tricks, pts] of cases) {
    const s = atLead(STD(), 1, { augen, tricks: tricks.slice().reverse() });
    const t = { ...s, augen: augen.slice().reverse() };   // Sitz 1 hat augen[0]
    assert.ok(S.canDeclare(t));
    const e = S.applyMove(t, T('ausmelden'));
    assert.equal(e.phase, 'spielende');
    assert.equal(e.spiel.winner, 1);
    assert.equal(e.spiel.points, pts, JSON.stringify(augen));
    assert.deepEqual(e.points, [0, pts]);
    assert.equal(S.currentPlayer(e), 1);   // Teiler war 1 → nächste Vorhand
    assert.deepEqual(S.legalMoves(e), [{ type: 'weiter' }]);
  }
  // Ansagen des Gegners zählen bei „≤ 32“ mit, wenn er einen Stich hat
  const s = { ...atLead(STD(), 1, { augen: [20, 66], tricks: [1, 4] }), ansagen: [{ seat: 0, suit: 'S', points: 20 }] };
  assert.equal(S.applyMove(s, T('ausmelden')).spiel.points, 1);
});

test('Irrtümliches Ausmelden: Spiel endet, Gegner bekommt die Punkte (Wikipedia)', () => {
  const s = atLead(STD(), 0, { augen: [50, 20], tricks: [3, 1] });
  assert.equal(S.canDeclare(s), false);
  assert.ok(S.isLegal(s, T('ausmelden')));
  const e = S.applyMove(s, T('ausmelden'));
  assert.equal(e.spiel.winner, 1);
  assert.equal(e.spiel.points, 2);   // so viele, wie Sitz 0 bekommen hätte (Gegner 20 Augen)
  assert.equal(e.spiel.reason, 'irrtümlich ausgemeldet');
  // Vorhand meldet sich sofort aus: Gegner stichlos → 3
  const f = S.applyMove(STD(), T('ausmelden'));
  assert.deepEqual([f.spiel.winner, f.spiel.points], [1, 3]);
  // nicht am Ausspielen → nicht erlaubt
  assert.equal(S.isLegal(S.applyMove(STD(), P('SA')), T('ausmelden')), false);
});

test('Letzter Stich gewinnt das Spiel (ohne Zudrehen), Punkte nach den Augen des Gegners', () => {
  const base = { ...STD(), talon: [], atoutCard: null, hands: [['SA'], ['SZ']], turn: 0 };
  let e = run({ ...base, augen: [40, 59], tricks: [4, 5] }, P('SA'), P('SZ'));
  assert.equal(e.spiel.winner, 0);
  assert.equal(e.spiel.reason, 'letzter Stich');
  assert.equal(e.spiel.points, 1);   // Gegner 59
  assert.deepEqual(e.spiel.augen, [61, 59]);
  e = run({ ...base, augen: [80, 19], tricks: [7, 2] }, P('SA'), P('SZ'));
  assert.equal(e.spiel.points, 2);
  e = run({ ...base, hands: [['SZ'], ['SA']], augen: [0, 99], tricks: [0, 9] }, P('SZ'), P('SA'));
  assert.deepEqual([e.spiel.winner, e.spiel.points], [1, 3]);
});

// ---------- Austauschen und Zudrehen ----------

test('Austauschen: Atout-Unter gegen offene Atoutkarte, nur am Ausspielen', () => {
  const s = { ...STD(), turn: 1 };
  assert.ok(keys(s).includes('tauschen'));
  const t = S.applyMove(s, T('tauschen'));
  assert.equal(t.atoutCard, 'HU');
  assert.ok(t.hands[1].includes('HZ') && !t.hands[1].includes('HU'));
  assert.equal(S.describeMove(s, T('tauschen')), 'tauscht den Atout-Unter');
  assert.ok(!keys(STD()).includes('tauschen'));   // Vorhand hat den Unter nicht
  assert.ok(!keys({ ...s, closed: { by: 1, oppAugen: 0, oppTricks: 0 } }).includes('tauschen'));
  assert.ok(!keys({ ...s, talon: [], atoutCard: null }).includes('tauschen'));
  assert.equal(S.isLegal(S.applyMove(STD(), P('SA')), T('tauschen')), false);   // Nachhand beim Zugeben
});

test('Eine verdeckte Talonkarte: Austauschen erlaubt (hart: verboten), Zudrehen verboten', () => {
  const s = { ...STD(), turn: 1, talon: ['EU'] };
  assert.ok(keys(s).includes('tauschen'));
  assert.ok(!keys(s).includes('zudrehen'));
  const h = { ...s, opts: S.normalizeOptions({ hart: true }) };
  assert.ok(!keys(h).includes('tauschen'));
  assert.ok(keys({ ...h, talon: ['EU', 'SU'] }).includes('tauschen'));
  assert.ok(keys({ ...s, talon: ['EU', 'SU'] }).includes('zudrehen'));
});

test('Zudrehen: merkt Augen/Stiche des Gegners, danach kein Ziehen, Zwang', () => {
  const s = atLead(STD(), 0, { augen: [20, 25], tricks: [1, 2] });
  const z = S.applyMove(s, T('zudrehen'));
  assert.deepEqual(z.closed, { by: 0, oppAugen: 25, oppTricks: 2 });
  assert.equal(S.describeMove(s, T('zudrehen')), 'dreht zu');
  assert.ok(S.mustFollow(z));
  assert.ok(!keys(z).includes('zudrehen') && !keys(z).includes('tauschen'));
  assert.ok(keys(z).includes('ansagen:H'));   // Ansagen weiter erlaubt
  const a = run(z, P('SA'), P('SZ'));
  assert.equal(a.hands[0].length, 4);
  assert.equal(a.talon.length, 9);
  assert.equal(a.atoutCard, 'HZ');
  assert.equal(S.isLegal(z, T('zudrehen')), false);
});

test('Zudrehen erfolgreich: Punkte nach den Gegneraugen beim Zudrehen', () => {
  // Gegner hatte 25 beim Zudrehen (→ 2), jetzt schon 40 (wäre 1)
  let z = S.applyMove(atLead(STD(), 0, { augen: [20, 25], tricks: [1, 2] }), T('zudrehen'));
  z = { ...z, augen: [70, 40], tricks: [4, 3] };
  let e = S.applyMove(z, T('ausmelden'));
  assert.deepEqual([e.spiel.winner, e.spiel.points, e.spiel.reason], [0, 2, 'zugedreht und ausgemeldet']);
  // Gegner stichlos beim Zudrehen → 3, auch wenn er danach sticht
  z = S.applyMove(atLead(STD(), 0, { augen: [30, 0], tricks: [2, 0] }), T('zudrehen'));
  e = S.applyMove({ ...z, augen: [66, 20], tricks: [4, 1] }, T('ausmelden'));
  assert.equal(e.spiel.points, 3);
  // Gegner 40 beim Zudrehen → 1
  z = S.applyMove(atLead(STD(), 0, { augen: [30, 40], tricks: [2, 2] }), T('zudrehen'));
  assert.equal(S.applyMove({ ...z, augen: [66, 40] }, T('ausmelden')).spiel.points, 1);
  // 66 mit dem letzten Stich zählt als Erfolg
  z = { ...z, hands: [['SA'], ['SZ']], augen: [45, 40], tricks: [3, 2] };
  e = run(z, P('SA'), P('SZ'));
  assert.deepEqual([e.spiel.winner, e.spiel.points], [0, 1]);
});

test('Zudrehen misslungen: Gegner bekommt 3 (stichlos beim Zudrehen) bzw. 2', () => {
  // Karten aus, Zudreher unter 66
  let z = S.applyMove(atLead(STD(), 0, { augen: [40, 0], tricks: [3, 0] }), T('zudrehen'));
  let e = run({ ...z, hands: [['SA'], ['SZ']] }, P('SA'), P('SZ'));
  assert.deepEqual([e.spiel.winner, e.spiel.points, e.spiel.reason], [1, 3, 'Zudrehen misslungen']);
  z = S.applyMove(atLead(STD(), 0, { augen: [40, 10], tricks: [3, 1] }), T('zudrehen'));
  e = run({ ...z, hands: [['SA'], ['SZ']] }, P('SA'), P('SZ'));
  assert.deepEqual([e.spiel.winner, e.spiel.points], [1, 2]);
  // Gegner meldet sich zuerst aus
  e = S.applyMove({ ...z, turn: 1, augen: [50, 66], tricks: [4, 3] }, T('ausmelden'));
  assert.deepEqual([e.spiel.winner, e.spiel.points], [1, 2]);
  // Zudreher meldet sich irrtümlich aus
  e = S.applyMove({ ...z, augen: [60, 30] }, T('ausmelden'));
  assert.deepEqual([e.spiel.winner, e.spiel.points], [1, 2]);
});

// ---------- Spielfolge und Bummerl ----------

function endGame(s, winner, pts) {
  // Sitz winner meldet sich mit passender Gegneraugenzahl aus
  const opp = pts === 3 ? [0, 0] : pts === 2 ? [20, 2] : [40, 3];
  const augen = [0, 0], tricks = [0, 0];
  augen[winner] = 70; tricks[winner] = 5; augen[1 - winner] = opp[0]; tricks[1 - winner] = opp[1];
  return S.applyMove({ ...s, turn: winner, augen, tricks, trick: [], openAnsage: null }, T('ausmelden'));
}

test('Teiler wechselt jedes Spiel, weiter → neues Teilen', () => {
  let s = endGame(STD(), 0, 1);
  assert.equal(S.currentPlayer(s), 1);
  assert.equal(S.describeMove(s, T('weiter')), 'nächstes Spiel');
  s = S.applyMove(s, T('weiter'));
  assert.equal(s.dealer, 0);
  assert.deepEqual(S.chance(s), { kind: 'shuffle', n: 20 });
  s = S.applyChance(s, [...Array(20).keys()]);
  assert.equal(S.currentPlayer(s), 1);   // Vorhand = Sitz 1
  assert.deepEqual(s.hands[1], ['HA', 'HZ', 'HK', 'SK', 'SO']);
  assert.equal(s.spielNr, 2);
  assert.deepEqual(s.augen, [0, 0]);
  s = S.applyMove(endGame(s, 1, 2), T('weiter'));
  assert.equal(s.dealer, 1);
  assert.deepEqual(s.points, [1, 2]);
  assert.deepEqual(s.games.map(g => [g.bummerl, g.spiel, g.winner, g.points]), [[1, 1, 0, 1], [1, 2, 1, 2]]);
});

function playGames(opts, results) {
  let s = dealFrom({}, opts);
  for (const [w, p] of results) {
    s = endGame(s, w, p);
    if (S.result(s)) break;
    s = S.applyChance(S.applyMove(s, T('weiter')), permFor({}));
  }
  return s;
}

test('Bummerl bei 7 Punkten, Partie auf 2 Bummerl', () => {
  let s = playGames({}, [[0, 3], [0, 3], [1, 2]]);
  assert.deepEqual(s.points, [6, 2]);
  s = endGame(s, 0, 1);
  assert.deepEqual(s.points, [7, 2]);
  assert.deepEqual(s.bummerl, [1, 0]);
  assert.equal(s.phase, 'spielende');
  assert.equal(S.result(s), null);
  s = S.applyMove(s, T('weiter'));
  assert.deepEqual(s.points, [0, 0]);
  assert.equal(s.bummerlNr, 2);
  s = S.applyChance(s, permFor({}));
  s = endGame(s, 1, 3); s = S.applyChance(S.applyMove(s, T('weiter')), permFor({}));
  s = endGame(s, 1, 3); s = S.applyChance(S.applyMove(s, T('weiter')), permFor({}));
  s = endGame(s, 1, 3);
  assert.deepEqual(s.bummerl, [1, 1]);
  s = S.applyChance(S.applyMove(s, T('weiter')), permFor({}));
  for (let i = 0; i < 3; i++) { s = endGame(s, 0, 3); if (!S.result(s)) s = S.applyChance(S.applyMove(s, T('weiter')), permFor({})); }
  assert.deepEqual(S.result(s), { winner: 0, reason: 'gewinnt 2:1 Bummerl', points: 2 });
  assert.equal(S.phase(s), 'over');
  assert.equal(S.currentPlayer(s), null);
  assert.deepEqual(S.legalMoves(s), []);
  assert.equal(s.games.filter(g => g.bummerl === 3).length, 3);
});

test('Schneider (7:0) zählt doppelt, nur mit Option', () => {
  let s = playGames({ schneider: true }, [[0, 3], [0, 3], [0, 1]]);
  assert.deepEqual(s.bummerl, [2, 0]);
  assert.deepEqual(S.result(s), { winner: 0, reason: 'gewinnt 2:0 Bummerl', points: 2 });
  assert.equal(s.spiel.bummerl.schneider, true);
  s = playGames({}, [[0, 3], [0, 3], [0, 1]]);
  assert.deepEqual(s.bummerl, [1, 0]);
  assert.equal(S.result(s), null);
  s = playGames({ schneider: true }, [[0, 3], [1, 1], [0, 3], [0, 1]]);
  assert.deepEqual(s.bummerl, [1, 0]);
});

test('Partie auf 3 Bummerl', () => {
  const res = [];
  for (let i = 0; i < 9; i++) res.push([1, 3]);
  const s = playGames({ bummerl: 3 }, res);
  assert.deepEqual(s.bummerl, [0, 3]);
  assert.deepEqual(S.result(s), { winner: 1, reason: 'gewinnt 3:0 Bummerl', points: 3 });
  assert.equal(s.games.length, 9);
});

// ---------- Sicht ----------

function randomMid(seed, steps) {
  const rng = mulberry32(seed);
  let s = S.applyChance(S.initialState(), shuffled(rng));
  for (let i = 0; i < steps && S.phase(s) === 'play'; i++) {
    const ms = S.legalMoves(s).filter(m => m.type !== 'ausmelden' || S.canDeclare(s));
    s = S.applyMove(s, ms[Math.floor(rng() * ms.length)]);
  }
  return s;
}
function shuffled(rng) {
  const a = [...Array(20).keys()];
  for (let i = 19; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

test('viewFor: fremde Hand, Talon, fremde Stiche/Augen verborgen; Längen bleiben', () => {
  let checked = 0;
  for (let seed = 1; seed <= 60; seed++) {
    for (const steps of [0, 3, 7, 12]) {
      const s = randomMid(seed, steps);
      if (S.phase(s) !== 'play') continue;
      for (const seat of [0, 1, null]) {
        const v = S.viewFor(s, seat), json = JSON.stringify(v);
        const secret = [...s.talon];
        for (const q of [0, 1]) if (q !== seat) secret.push(...s.hands[q]);
        for (const c of secret) assert.ok(!json.includes(`"${c}"`), `Sicht ${seat} verrät ${c}`);
        assert.equal(v.talon.length, s.talon.length);
        assert.equal(v.atoutCard, s.atoutCard);
        for (const q of [0, 1]) {
          assert.equal(v.hands[q].length, s.hands[q].length);
          assert.equal(v.won[q].length, s.won[q].length);
          if (q === seat) {
            assert.deepEqual(v.hands[q], s.hands[q]);
            assert.equal(v.augen[q], s.augen[q]);
          } else {
            assert.equal(v.augen[q], null);
            assert.ok(v.won[q].every(c => c === null));
            assert.equal(S.cardPoints(v, q), null);
          }
        }
        assert.deepEqual(v.tricks, s.tricks);
        assert.deepEqual(v.trick, s.trick);
        assert.deepEqual(v.lastTrick, s.lastTrick);
        assert.deepEqual(v.ansagen, s.ansagen);
        checked++;
      }
    }
  }
  // Zudrehen: Gegneraugen beim Zudrehen nur für den Gegner sichtbar
  const z = S.applyMove(atLead(STD(), 0, { augen: [20, 25], tricks: [1, 2] }), T('zudrehen'));
  assert.equal(S.viewFor(z, 0).closed.oppAugen, null);
  assert.equal(S.viewFor(z, 1).closed.oppAugen, 25);
  // Spielende: beide Augen offen
  const e = endGame(STD(), 0, 2);
  assert.deepEqual(S.viewFor(e, 1).augen, e.augen);
  assert.deepEqual(S.viewFor(e, 1).spiel.augen, [70, 20]);
  assert.ok(S.viewFor(e, 1).hands[0].every(c => c === null));
  return `${checked} Sichten`;
});

test('Engine-Funktionen auf viewFor(state, currentPlayer) wie auf dem vollen Zustand', () => {
  let n = 0;
  for (let seed = 100; seed < 160; seed++) {
    const rng = mulberry32(seed);
    let s = S.applyChance(S.initialState(), shuffled(rng));
    while (S.phase(s) === 'play') {
      const p = S.currentPlayer(s), v = S.viewFor(s, p);
      assert.equal(S.currentPlayer(v), p);
      assert.deepEqual(keys(v), keys(s));
      for (const m of S.legalMoves(s)) {
        assert.ok(S.isLegal(v, m));
        assert.equal(S.describeMove(v, m), S.describeMove(s, m));
      }
      assert.equal(S.result(v), S.result(s));
      assert.equal(S.canDeclare(v), S.canDeclare(s));
      assert.equal(S.cardPoints(v, p), S.cardPoints(s, p));
      for (const seat of [0, 1]) assert.equal(S.evaluate(S.viewFor(s, seat), seat), S.evaluate(s, seat));
      const ms = S.legalMoves(s);
      s = S.applyMove(s, ms[Math.floor(rng() * ms.length)]);
      n++;
    }
    const v = S.viewFor(s, S.currentPlayer(s));
    assert.deepEqual(S.legalMoves(v), [{ type: 'weiter' }]);
    for (const seat of [0, 1]) assert.equal(S.evaluate(S.viewFor(s, seat), seat), S.evaluate(s, seat));
  }
  return `${n} Stellungen`;
});

test('evaluate: Einheit Punkte, Vorzeichen aus Sicht des Sitzes', () => {
  const e = endGame(STD(), 0, 3);
  assert.equal(S.evaluate(e, 0), 3);
  assert.equal(S.evaluate(e, 1), -3);
  const s = atLead(STD(), 0, { augen: [60, 10], tricks: [4, 1] });
  assert.ok(S.evaluate(s, 0) > 0 && S.evaluate(s, 0) <= 2);
});

test('isLegal wirft nie (Müll-Züge)', () => {
  const s = STD();
  const junk = [null, undefined, 0, 'play', [], {}, { type: 'play' }, { type: 'play', card: 'XX' },
    { type: 'play', card: 'HK', extra: 1 }, { type: 'play', card: 'LA' }, { type: 'ansagen' }, { type: 'ansagen', suit: 'S' },
    { type: 'ansagen', suit: 'H', card: 'HK' }, { type: 'weiter' }, { type: 'constructor' }, { type: '__proto__' },
    { type: 'toString' }, { type: 'tauschen' }, { type: { a: 1 } }, { type: 'play', card: { toString: null } },
    Object.create(null)];
  for (const m of junk) {
    assert.equal(S.isLegal(s, m), false, JSON.stringify(m));
    assert.throws(() => S.applyMove(s, m));
  }
  for (const bad of [null, undefined, 5, {}, { phase: 'play' }, { ...s, hands: null }]) {
    assert.equal(S.isLegal(bad, P('HK')), false);
    assert.deepEqual(S.legalMoves(bad), []);
  }
  assert.equal(S.isLegal(s, P('HK')), true);
  assert.equal(S.describeMove(s, P('HK')), 'Herz-König');
  assert.equal(S.describeMove(s, T('ausmelden')), 'meldet sich aus');
});

test('Zustand bleibt unverändert (reines JSON)', () => {
  const s = STD(), before = JSON.stringify(s);
  run(s, { type: 'ansagen', suit: 'H' }, P('HK'), P('SZ'));
  S.applyMove(s, T('zudrehen'));
  S.viewFor(s, 0);
  assert.equal(JSON.stringify(s), before);
  assert.deepEqual(JSON.parse(before), s);
  assert.equal(typeof S.positionKey(s), 'string');
});

// ---------- Bot ----------

test('Bot: alle Stufen wählen nur legale Züge aus der Sicht', () => {
  let n = 0;
  for (let seed = 1; seed <= 25; seed++) {
    const s = randomMid(seed, seed % 14);
    if (S.phase(s) !== 'play') continue;
    const v = S.viewFor(s, S.currentPlayer(s));
    for (const level of [1, 2, 3]) {
      const m = chooseMove(v, { level, rng: mulberry32(seed), timeMs: 15 });
      assert.ok(S.isLegal(s, m), `Stufe ${level}: ${JSON.stringify(m)}`);
      n++;
    }
  }
  return `${n} Züge`;
});

test('Bot Stufe 2: meldet sich bei 66 aus, tauscht aus, sagt an, sticht Zehner mit kleinem Atout', () => {
  const v = s => S.viewFor(s, S.currentPlayer(s));
  const s66 = atLead(STD(), 0, { augen: [66, 30], tricks: [3, 2] });
  assert.deepEqual(chooseMove(v(s66), { level: 2 }), T('ausmelden'));
  assert.deepEqual(chooseMove(v(s66), { level: 1 }), T('ausmelden'));
  assert.deepEqual(chooseMove(v({ ...STD(), turn: 1 }), { level: 2 }), T('tauschen'));
  assert.deepEqual(chooseMove(v(STD()), { level: 2 }), { type: 'ansagen', suit: 'H' });
  assert.deepEqual(chooseMove(v(STD()), { level: 1 }), { type: 'ansagen', suit: 'H' });
  // Vorhand spielt Laub-Zehner, Teiler hat kein Laub-Daus aber Atout-Unter → sticht mit Atout
  const t = S.applyMove(dealFrom({ v: ['LZ', 'SU', 'SO', 'EU', 'EO'], d: ['HU', 'HA', 'SK', 'EK', 'LU'], atout: 'HZ' }), P('LZ'));
  assert.deepEqual(chooseMove(v(t), { level: 2 }), P('HU'));
  // Stufe 1 wirft niedrig ab (Unter, egal welcher)
  for (let seed = 1; seed <= 5; seed++) {
    assert.ok(['HU', 'LU'].includes(chooseMove(v(t), { level: 1, rng: mulberry32(seed) }).card));
  }
  // Stufe 2 meldet sich nie irrtümlich aus
  assert.notDeepEqual(chooseMove(v(atLead(STD(), 0, { augen: [60, 30], tricks: [3, 2] })), { level: 2 }), T('ausmelden'));
});

test('Bot Stufe 3: hält timeMs ungefähr ein', () => {
  const s = STD();   // Vorhand am Ausspielen, 8 Zugmöglichkeiten
  const t = performance.now();
  const m = chooseMove(S.viewFor(s, S.currentPlayer(s)), { level: 3, rng: mulberry32(3), timeMs: 100 });
  const dt = performance.now() - t;
  assert.ok(S.isLegal(s, m));
  assert.ok(dt >= 90 && dt < 250, `${dt.toFixed(0)} ms`);
  return `${dt.toFixed(0)} ms`;
});

const secs = ((performance.now() - t0) / 1000).toFixed(2);
console.log(`\nSchnapsen-Regeltests: ${passed} bestanden, ${failed} fehlgeschlagen – Laufzeit ${secs} s`);
process.exitCode = failed ? 1 : 0;
