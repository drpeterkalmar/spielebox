// Regeltests Mau-Mau (de.wikipedia „Mau-Mau (Kartenspiel)“ + Hausregel Daus = Aussetzen): Austeilen, Bedienen,
// Ziehen/Passen, 7 + Kontern, Unter-Wunsch, Unter auf Unter, Daus, Mau, Sieg, Nachmischen, erste Karte,
// Optionen aus, Sicht, evaluate, Müll-Züge, Bot-Stufen.
// Aufruf: node tests/node/maumau.test.mjs
import assert from 'node:assert/strict';
import * as M from '../../src/games/maumau/engine.js';
import { chooseMove } from '../../src/games/maumau/bot.js';
import { RULES } from '../../src/games/maumau/rules.js';
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
const hexOf = rng => Array.from({ length: 64 }, () => randInt(rng, 16).toString(16)).join('');
const shufflePerm = (n, rng) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = randInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const total = s => s.hands.reduce((a, h) => a + h.length, 0) + s.stock.length + s.pile.length;
const keys = s => M.legalMoves(s).map(M.moveKey);

// Spielstellung von Hand; ohne stock kommen alle übrigen Karten (DECK-Reihenfolge) in den Stapel → immer 32 Karten
function mk({ hands, pile, stock, turn = 0, opts = {}, ...rest }) {
  const base = M.initialState({ ...opts, players: hands.length });
  const used = new Set([...hands.flat(), ...pile, ...(stock || [])]);
  const st = stock ?? M.DECK.filter(c => !used.has(c));
  return deepFreeze({ ...base, phase: 'play', hands: hands.map(h => h.slice()), pile: pile.slice(), stock: st.slice(), turn, ...rest });
}
const play = (card, extra = {}) => ({ type: 'play', card, ...extra });
const DRAW = { type: 'draw' }, PASS = { type: 'pass' };

// Austeilen mit Permutation, die die Karte top als erste offene Karte legt (Rest in DECK-Reihenfolge)
function dealWithTop(n, top) {
  const perm = [...Array(32).keys()], at = 5 * n, k = M.DECK.indexOf(top);
  [perm[at], perm[k]] = [perm[k], perm[at]];
  return M.applyChance(M.initialState({ players: n }), perm);
}

// ---------- Grundlagen ----------

test('Exporte, Optionen (players 2–5, Standard 3; sieben/unter/ass/mau an), 32 Karten, Regeltext', () => {
  assert.equal(M.id, 'maumau');
  assert.equal(M.title, 'Mau-Mau');
  assert.equal(M.HIDDEN, true);
  assert.equal(M.PLAYERS.length, 5);
  assert.equal(M.DECK.length, 32);
  assert.equal(new Set(M.DECK).size, 32);
  assert.deepEqual(M.normalizeOptions(), { players: 3, sieben: true, unter: true, ass: true, mau: true });
  assert.deepEqual(M.normalizeOptions({ players: '2', ass: false, mau: 'false', x: 1 }),
    { players: 2, sieben: true, unter: true, ass: false, mau: false });
  assert.equal(M.normalizeOptions({ players: 6 }).players, 3);
  assert.equal(M.normalizeOptions({ players: 1 }).players, 3);
  assert.equal(M.normalizeOptions({ players: 5 }).players, 5);
  assert.equal(M.cardName('EA'), 'Eichel-Daus');
  assert.equal(M.cardName('SU'), 'Schellen-Unter');
  assert.ok(RULES.title === 'Mau-Mau' && RULES.items.length >= 10 && RULES.source.includes('de.wikipedia.org/wiki/Mau-Mau'));
  assert.ok(RULES.items.some(t => t.includes('Daus')));
  for (const k of ['players', 'sieben', 'unter', 'ass', 'mau']) assert.ok(RULES.options[k], k);
  assert.ok(RULES.options.ass.includes('Hausregel'));
});

test('Austeilen über chance: 5 Karten je Spieler reihum, eine offen, Rest Stapel; Spieler 1 beginnt', () => {
  const s = deepFreeze(M.initialState({ players: 3 }));
  assert.equal(s.phase, 'deal');
  assert.equal(M.currentPlayer(s), null);
  assert.deepEqual(M.legalMoves(s), []);
  assert.deepEqual(M.chance(s), { kind: 'shuffle', n: 32 });
  const t = M.applyChance(s, [...Array(32).keys()]);
  assert.deepEqual(t.hands[0], [0, 3, 6, 9, 12].map(i => M.DECK[i]));
  assert.deepEqual(t.hands[2], [2, 5, 8, 11, 14].map(i => M.DECK[i]));
  assert.deepEqual(t.pile, [M.DECK[15]]);
  assert.equal(t.stock.length, 16);
  assert.equal(t.phase, 'play');
  assert.equal(M.currentPlayer(t), 0);
  assert.equal(M.chance(t), null);
  assert.throws(() => M.applyChance(s, [0, 1, 2]), /Permutation/);
  assert.throws(() => M.applyChance(s, Array(32).fill(0)), /Permutation/);
  assert.throws(() => M.applyChance(t, [...Array(32).keys()]), /Kein Zufall/);
  const rng = mulberry32(7);
  for (const n of [2, 3, 4, 5]) {
    const u = M.applyChance(M.initialState({ players: n }), valueFor({ kind: 'shuffle', n: 32 }, hexOf(rng)));
    assert.ok(u.hands.every(h => h.length === 5));
    assert.equal(u.stock.length, 32 - 5 * n - 1);
    assert.equal(new Set([...u.hands.flat(), ...u.stock, ...u.pile]).size, 32);
  }
});

test('Bedienen: gleiche Farbe oder gleicher Wert; Ziehen ist immer erlaubt („kann oder will“)', () => {
  const s = mk({ hands: [['H9', 'S9', 'LK', 'E8', 'EZ'], ['S8'], ['L8']], pile: ['HK'] });
  assert.deepEqual(keys(s), ['play:H9', 'play:LK', 'draw']);
  assert.deepEqual(M.playable(s), ['H9', 'LK']);
  assert.equal(M.isLegal(s, play('S9')), false);
  assert.equal(M.isLegal(s, PASS), false);
  const t = M.applyMove(s, play('LK'));
  assert.deepEqual(t.pile, ['HK', 'LK']);
  assert.equal(t.turn, 1);
  assert.equal(M.topCard(t), 'LK');
  assert.equal(M.effectiveSuit(t), 'L');
  assert.equal(t.hands[0].length, 4);
  assert.equal(total(t), 32);
});

test('Gezogene Karte: sofort legen (nur sie) oder passen; passt sie nicht, nur passen', () => {
  const s = mk({ hands: [['H9', 'S9'], ['S8', 'SZ'], ['L8', 'LZ']], pile: ['HK'], stock: ['H8', 'EK', 'E9'] });
  const t = deepFreeze(M.applyMove(s, DRAW));
  assert.deepEqual(t.hands[0], ['H9', 'S9', 'H8']);
  assert.equal(t.drawn, 'H8');
  assert.equal(M.currentPlayer(t), 0);
  assert.deepEqual(keys(t), ['play:H8', 'pass']);   // H9 passt zwar, ist aber nicht die gezogene Karte
  assert.equal(M.isLegal(t, play('H9')), false);
  assert.equal(M.isLegal(t, DRAW), false);
  const a = M.applyMove(t, play('H8'));
  assert.equal(a.turn, 1); assert.equal(a.drawn, null); assert.equal(M.topCard(a), 'H8');
  const b = M.applyMove(t, PASS);
  assert.equal(b.turn, 1); assert.equal(b.drawn, null); assert.equal(b.hands[0].length, 3);
  assert.equal(b.last.type, 'pass');
  // gezogene Karte passt nicht → nur passen
  const u = M.applyMove(mk({ hands: [['H9'], ['S8'], ['L8']], pile: ['HK'], stock: ['E9', 'EK'] }), DRAW);
  assert.deepEqual(keys(u), ['pass']);
  assert.equal(u.last.n, 1);
});

test('Siebener: Nächster zieht 2, Kontern mit 7 → 4, Strafe auf einmal, danach fertig; 7 wieder normal', () => {
  const s = mk({ hands: [['H7', 'H9'], ['S7', 'HU', 'H8', 'SK'], ['L8', 'LZ', 'E9']], pile: ['HK'] });
  const a = deepFreeze(M.applyMove(s, play('H7')));
  assert.equal(a.penalty, 2); assert.equal(a.turn, 1); assert.equal(a.last.penalty, 2);
  assert.deepEqual(keys(a), ['play:S7', 'draw']);   // kein Unter, keine Herz-Karte auf eine offene Strafe
  assert.equal(M.describeMove(a, DRAW), 'zieht 2 Strafkarten');
  const b = deepFreeze(M.applyMove(a, play('S7')));
  assert.equal(b.penalty, 4); assert.equal(b.turn, 2);
  assert.deepEqual(keys(b), ['draw']);
  const c = deepFreeze(M.applyMove(b, DRAW));
  assert.equal(c.hands[2].length, 7);
  assert.equal(c.penalty, 0); assert.equal(c.turn, 0); assert.equal(c.drawn, null);
  assert.equal(c.last.strafe, 4); assert.equal(c.last.n, 4);
  assert.equal(total(c), 32);
  // die liegende S7 ist jetzt eine normale Karte: Spieler 1 bedient Farbe Schellen oder Wert 7
  assert.deepEqual(keys(c), ['draw']);   // H9 passt nicht auf S7
  const d = mk({ hands: [['H9', 'SZ', 'L7'], ['E8'], ['E9']], pile: ['HK', 'S7'] });
  assert.deepEqual(keys(d), ['play:SZ', 'play:L7', 'draw']);
  assert.equal(M.applyMove(d, play('L7')).penalty, 2);
});

test('Unter: auf jede Karte, Wunsch ist Pflicht (4 Varianten); danach passt nur die Wunschfarbe', () => {
  const s = mk({ hands: [['HU', 'E8', 'E9'], ['H9', 'LZ', 'SK', 'EU'], ['L8', 'LK']], pile: ['SA'] });
  assert.deepEqual(keys(s), ['play:HU/H', 'play:HU/S', 'play:HU/L', 'play:HU/E', 'draw']);
  assert.equal(M.isLegal(s, play('HU')), false, 'Unter ohne Wunsch');
  assert.equal(M.isLegal(s, play('HU', { wish: 'X' })), false);
  const a = deepFreeze(M.applyMove(s, play('HU', { wish: 'L' })));
  assert.equal(a.wish, 'L'); assert.equal(a.turn, 1); assert.equal(a.last.wish, 'L');
  assert.equal(M.effectiveSuit(a), 'L');
  // H9 (Farbe der Karte), SK und EU (Unter auf Unter) passen nicht, nur LZ
  assert.deepEqual(keys(a), ['play:LZ', 'draw']);
  const b = M.applyMove(a, play('LZ'));
  assert.equal(b.wish, null);
  assert.equal(M.effectiveSuit(b), 'L');
  // Wunsch an eine andere Karte als den Unter ist illegal
  assert.equal(M.isLegal(b, play('LK', { wish: 'H' })), false);
  assert.equal(M.describeMove(s, play('HU', { wish: 'L' })), 'Herz-Unter – wünscht Laub');
  // eigene Farbe wünschen ist erlaubt
  assert.equal(M.applyMove(s, play('HU', { wish: 'H' })).wish, 'H');
});

test('Unter auf Unter ist verboten (auch ohne Wunsch, z. B. als erste Karte); Option unter aus → normale Karte', () => {
  const s = mk({ hands: [['SU', 'H8', 'E9'], ['E8'], ['L8']], pile: ['HU'] });
  assert.deepEqual(keys(s), ['play:H8', 'draw']);
  const w = mk({ hands: [['SU', 'L8', 'E9'], ['E8'], ['H8']], pile: ['HU'], wish: 'L' });
  assert.deepEqual(keys(w), ['play:L8', 'draw']);
  // Option aus: Unter nach Wert auf Unter, ohne Wunsch, nicht auf jede Karte
  const o = mk({ hands: [['SU', 'H8', 'E9'], ['E8'], ['L8']], pile: ['HU'], opts: { unter: false } });
  assert.deepEqual(keys(o), ['play:SU', 'play:H8', 'draw']);
  assert.equal(M.isLegal(o, play('SU', { wish: 'L' })), false);
  assert.equal(M.applyMove(o, play('SU')).wish, null);
  const o2 = mk({ hands: [['SU', 'E9'], ['E8'], ['L8']], pile: ['HK'], opts: { unter: false } });
  assert.deepEqual(keys(o2), ['draw']);
});

test('Daus: der Nächste setzt aus (zu dritt kommt Spieler 3, zu zweit gleich nochmal); Option aus → normal', () => {
  const s3 = mk({ hands: [['HA', 'E9'], ['H8'], ['L8']], pile: ['HK'] });
  const a = M.applyMove(s3, play('HA'));
  assert.equal(a.turn, 2); assert.equal(a.last.skipped, 1);
  const s2 = mk({ hands: [['HA', 'E9', 'EK'], ['H8']], pile: ['HK'] });
  const b = M.applyMove(s2, play('HA'));
  assert.equal(b.turn, 0); assert.equal(b.last.skipped, 1);
  assert.equal(M.currentPlayer(b), 0);
  assert.deepEqual(keys(b), ['draw']);   // E9/EK passen nicht auf HA
  const s5 = mk({ hands: [['HA', 'E9'], ['H8'], ['L8'], ['S8'], ['E8']], pile: ['HK'], turn: 0 });
  assert.equal(M.applyMove({ ...s5, turn: 0 }, play('HA')).turn, 2);
  const s4 = mk({ hands: [['E9'], ['H8'], ['L8'], ['HA', 'SK']], pile: ['HK'], turn: 3 });
  assert.equal(M.applyMove(s4, play('HA')).turn, 1, 'Sitz 4 überspringt Sitz 1 → Sitz 2');
  const off = mk({ hands: [['HA', 'E9'], ['H8'], ['L8']], pile: ['HK'], opts: { ass: false } });
  const c = M.applyMove(off, play('HA'));
  assert.equal(c.turn, 1); assert.equal(c.last.skipped, undefined);
});

test('Mau: bei der vorletzten Karte sagen; vergessen → 2 Strafkarten; mau nur dann erlaubt; Option aus', () => {
  const s = mk({ hands: [['H9', 'S8'], ['E8', 'EZ'], ['L8', 'LZ']], pile: ['HK'], stock: ['E7', 'EK', 'EO', 'E9'] });
  assert.deepEqual(keys(s), ['play:H9', 'play:H9!', 'draw']);
  const ok = deepFreeze(M.applyMove(s, play('H9', { mau: true })));
  assert.deepEqual(ok.hands[0], ['S8']);
  assert.deepEqual(ok.mau, [true, false, false]);
  assert.equal(ok.last.mau, true);
  assert.equal(M.describeMove(s, play('H9', { mau: true })), 'Herz-Neuner – „Mau!“');
  const miss = deepFreeze(M.applyMove(s, play('H9')));
  assert.deepEqual(miss.hands[0], ['S8', 'E7', 'EK']);
  assert.equal(miss.last.mauMissed, true); assert.equal(miss.last.n, 2);
  assert.deepEqual(miss.mau, [false, false, false]);
  assert.equal(miss.turn, 1);
  assert.equal(total(miss), total(s));
  // Mau nur bei der vorletzten Karte, nur true
  const three = mk({ hands: [['H9', 'S8', 'E9'], ['E8'], ['L8']], pile: ['HK'] });
  assert.equal(M.isLegal(three, play('H9', { mau: true })), false);
  assert.equal(M.isLegal(s, play('H9', { mau: false })), false);
  assert.equal(M.isLegal(s, play('H9', { mau: 'ja' })), false);
  // wer Mau gesagt hat und Karten ziehen muss, ist nicht mehr „Mau“
  const m7 = mk({ hands: [['S8'], ['L8'], ['E7', 'EZ', 'LZ']], pile: ['HK', 'E9'], turn: 2, mau: [true, false, false] });
  const m7b = M.applyMove(m7, play('E7'));
  assert.equal(m7b.turn, 0); assert.equal(m7b.mau[0], true);
  const m7c = M.applyMove(m7b, DRAW);
  assert.equal(m7c.hands[0].length, 3); assert.equal(m7c.mau[0], false);
  // Option aus: keine Mau-Varianten, keine Strafe
  const o = mk({ hands: [['H9', 'S8'], ['E8'], ['L8']], pile: ['HK'], opts: { mau: false } });
  assert.deepEqual(keys(o), ['play:H9', 'draw']);
  assert.equal(M.isLegal(o, play('H9', { mau: true })), false);
  assert.equal(M.applyMove(o, play('H9')).hands[0].length, 1);
});

test('Sieg mit der letzten Karte sofort – auch mit Siebener oder Daus; Punkte = Karten der anderen', () => {
  for (const last of ['H7', 'HA', 'H9']) {
    const s = mk({ hands: [[last], ['E8', 'EZ'], ['L8', 'LZ', 'LK']], pile: ['HK'], mau: [true, false, false] });
    const t = M.applyMove(s, play(last));
    assert.equal(t.phase, 'over');
    assert.equal(t.winner, 0);
    assert.deepEqual(M.result(t), { winner: 0, reason: 'hat keine Karten mehr', points: 5 });
    assert.equal(t.penalty, 0);
    assert.equal(M.currentPlayer(t), null);
    assert.deepEqual(M.legalMoves(t), []);
    assert.equal(M.isLegal(t, DRAW), false);
  }
  // letzte Karte ein Unter: Wunsch trotzdem Pflicht, Sieg sofort
  const u = mk({ hands: [['EU'], ['E8'], ['L8']], pile: ['HK'] });
  assert.equal(M.applyMove(u, play('EU', { wish: 'E' })).winner, 0);
});

test('Nachmischen: Stapel leer → Ablage außer der obersten über chance mischen, dann weiterziehen', () => {
  const pile = ['S8', 'LZ', 'E9', 'H8', 'HK'];
  const rest = M.DECK.filter(c => !pile.includes(c));
  const s = mk({ hands: [rest.slice(0, 9), rest.slice(9, 18), rest.slice(18)], pile, stock: [] });
  assert.equal(total(s), 32);
  const a = deepFreeze(M.applyMove(s, DRAW));
  assert.equal(a.phase, 'deal');
  assert.equal(M.currentPlayer(a), null);
  assert.deepEqual(M.legalMoves(a), []);
  assert.deepEqual(M.chance(a), { kind: 'shuffle', n: 4 });
  assert.equal(M.result(a), null);
  const b = M.applyChance(a, [2, 0, 1, 3]);   // perm[i] = Index in [S8, LZ, E9, H8]
  assert.equal(b.phase, 'play');
  assert.equal(b.drawn, 'E9');
  assert.equal(b.hands[0].at(-1), 'E9');
  assert.deepEqual(b.stock, ['S8', 'LZ', 'H8']);
  assert.deepEqual(b.pile, ['HK']);
  assert.equal(b.turn, 0);
  assert.equal(b.owed, null);
  assert.equal(b.last.n, 1);
  assert.equal(total(b), 32);
  // dasselbe mit einem echten Zufallswert aus fair.js
  const c = M.applyChance(a, valueFor(M.chance(a), hexOf(mulberry32(3))));
  assert.equal(c.stock.length, 3); assert.equal(total(c), 32);
  assert.ok(pile.slice(0, 4).includes(c.drawn));
});

test('Strafkarten über das Nachmischen hinweg; reicht nichts mehr, zieht man weniger; leer → der Nächste', () => {
  // 7er-Strafe 4, im Stapel nur 1 Karte, unter der obersten Ablagekarte nur 2 → 3 Karten
  const pile = ['L9', 'S9', 'H7'];
  const used = new Set([...pile, 'EK']);
  const rest = M.DECK.filter(c => !used.has(c));
  const s = mk({ hands: [rest.slice(0, 14), rest.slice(14)], pile, stock: ['EK'], penalty: 2, turn: 0 });
  const t = deepFreeze({ ...s, penalty: 4 });
  const a = M.applyMove(t, DRAW);
  assert.equal(a.phase, 'deal');
  assert.equal(a.turn, 1);
  assert.deepEqual(M.chance(a), { kind: 'shuffle', n: 2 });
  const b = M.applyChance(a, [1, 0]);
  assert.equal(b.phase, 'play');
  assert.deepEqual(b.hands[0].slice(-3), ['EK', 'S9', 'L9']);
  assert.equal(b.last.n, 3); assert.equal(b.last.strafe, 4);
  assert.deepEqual(b.pile, ['H7']); assert.deepEqual(b.stock, []);
  assert.equal(total(b), 32);
  assert.equal(M.currentPlayer(b), 1);
  // gar nichts mehr zu ziehen → der Nächste ist dran
  const c = M.applyMove(b, DRAW);
  assert.equal(c.turn, 0); assert.equal(c.hands[1].length, b.hands[1].length); assert.equal(c.last.n, 0);
  assert.equal(c.drawn, null); assert.equal(c.phase, 'play');
});

test('Erste offene Karte bleibt wirkungslos (7: keiner zieht, Daus: keiner setzt aus, Unter: kein Wunsch)', () => {
  const s7 = dealWithTop(3, 'H7');
  assert.equal(M.topCard(s7), 'H7');
  assert.equal(s7.penalty, 0); assert.equal(s7.turn, 0);
  assert.equal(M.describeMove(s7, DRAW), 'zieht eine Karte');
  assert.ok(M.playable(s7).every(c => c[0] === 'H' || c[1] === '7' || c[1] === 'U'));
  const sa = dealWithTop(3, 'HA');
  assert.equal(M.topCard(sa), 'HA'); assert.equal(M.currentPlayer(sa), 0);
  const su = dealWithTop(2, 'HU');
  assert.equal(M.topCard(su), 'HU'); assert.equal(su.wish, null);
  assert.equal(M.effectiveSuit(su), 'H');
  assert.ok(M.playable(su).every(c => c[0] === 'H' && c[1] !== 'U'));
  for (const t of [s7, sa, su]) assert.equal(total(t), 32);
});

test('Option sieben aus: Siebener ist eine normale Karte', () => {
  const s = mk({ hands: [['H7', 'E9'], ['S8', 'SK'], ['L8']], pile: ['HK'], opts: { sieben: false } });
  const a = M.applyMove(s, play('H7'));
  assert.equal(a.penalty, 0); assert.equal(a.turn, 1);
  assert.deepEqual(keys(a), ['draw']);
  assert.equal(M.applyMove(a, DRAW).hands[1].length, 3);
});

test('Sicht (viewFor): keine fremden Hand- oder Stapelkarten, Längen bleiben; Züge auf der Sicht = voll', () => {
  const rng = mulberry32(11);
  let s = M.applyChance(M.initialState({ players: 4 }), valueFor({ kind: 'shuffle', n: 32 }, hexOf(rng)));
  for (let step = 0; step < 200 && !M.result(s); step++) {
    if (M.chance(s)) { s = M.applyChance(s, shufflePerm(M.chance(s).n, rng)); continue; }
    const p = M.currentPlayer(s);
    for (const seat of [0, 1, 2, 3, null]) {
      const v = M.viewFor(s, seat), j = JSON.stringify(v);
      for (let q = 0; q < 4; q++) {
        assert.equal(v.hands[q].length, s.hands[q].length);
        if (q === seat) assert.deepEqual(v.hands[q], s.hands[q]);
        else for (const c of s.hands[q]) assert.ok(!v.hands[q].includes(c));
      }
      assert.equal(v.stock.length, s.stock.length);
      assert.ok(v.stock.every(c => c === null));
      assert.deepEqual(v.pile, s.pile);
      // keine fremde verdeckte Karte steht irgendwo in der Sicht (außer sie liegt offen in der Ablage)
      const hidden = [...s.stock, ...s.hands.flatMap((h, q) => (q === seat ? [] : h))];
      for (const c of hidden) assert.ok(!j.includes(`"${c}"`), `${c} sichtbar für ${seat}`);
      if (seat !== p) assert.equal(v.drawn, null);
    }
    const v = M.viewFor(s, p);
    assert.equal(M.currentPlayer(v), p);
    assert.deepEqual(M.legalMoves(v), M.legalMoves(s));
    const m = pick(rng, M.legalMoves(s));
    assert.equal(M.isLegal(v, m), true);
    assert.equal(M.describeMove(v, m), M.describeMove(s, m));
    assert.equal(M.evaluate(v, p), M.evaluate(s, p));
    s = M.applyMove(s, m);
  }
  const d = M.applyMove(mk({ hands: [['H9'], ['S8'], ['L8']], pile: ['HK'], stock: ['H8', 'E9'] }), DRAW);
  assert.equal(M.viewFor(d, 0).drawn, 'H8');
  assert.equal(M.viewFor(d, 1).drawn, null);
  assert.ok(!JSON.stringify(M.viewFor(d, 1)).includes('H8'));
});

test('evaluate (Einheit Karten): Start 0, Vorzeichen, Symmetrie zu zweit, Sicht = voll, Strafe zählt', () => {
  const s = dealWithTop(3, 'HK');
  for (let q = 0; q < 3; q++) assert.equal(M.evaluate(s, q), 0);
  assert.equal(M.evaluate(M.initialState(), 0), 0);
  const a = mk({ hands: [['H9'], ['S8', 'SK', 'SZ'], ['L8', 'LZ']], pile: ['HK'] });
  assert.equal(M.evaluate(a, 0), 1.5);
  assert.ok(M.evaluate(a, 1) < 0);
  const p = mk({ hands: [['H9', 'E9'], ['S8', 'SK']], pile: ['HK', 'H7'], penalty: 2, turn: 1 });
  assert.equal(M.evaluate(p, 0), 1);   // Strafe 2 zählt halb für den Sitz am Zug
  const rng = mulberry32(5);
  for (let g = 0; g < 30; g++) {
    let t = M.applyChance(M.initialState({ players: 2 }), shufflePerm(32, rng));
    for (let k = 0; k < 120 && !M.result(t); k++) {
      if (M.chance(t)) { t = M.applyChance(t, shufflePerm(M.chance(t).n, rng)); continue; }
      for (const q of [0, 1]) {
        assert.ok(Number.isFinite(M.evaluate(t, q)));
        assert.equal(M.evaluate(M.viewFor(t, q), q), M.evaluate(t, q));
      }
      assert.equal(M.evaluate(t, 0) + M.evaluate(t, 1), 0);
      t = M.applyMove(t, pick(rng, M.legalMoves(t)));
    }
  }
});

test('isLegal lehnt Müll ab und wirft nie; applyMove wirft; Zustand bleibt unverändert', () => {
  const s = mk({ hands: [['H9', 'HU', 'S8'], ['E8'], ['L8']], pile: ['HK'] });
  const bad = [null, undefined, 1, 'draw', [], {}, { type: 'Draw' }, { type: 'draw', x: 1 }, { type: 'pass' },
    { type: 'play' }, { type: 'play', card: 'X1' }, { type: 'play', card: 'S8' }, { type: 'play', card: 'E8' },
    { type: 'play', card: 'H9', wish: 'L' }, { type: 'play', card: 'HU', wish: 'Q' }, { type: 'play', card: 'HU', wish: null },
    { type: 'play', card: 'H9', mau: true }, { type: 'play', card: ['H9'] }, { type: 'play', card: 'toString' },
    { type: 'play', card: 'H9', extra: 1 }, { type: '__proto__' }, { type: 'constructor' }];
  for (const b of bad) {
    assert.equal(M.isLegal(s, b), false, JSON.stringify(b));
    assert.throws(() => M.applyMove(s, b), /Illegaler Zug/);
  }
  for (const st of [null, {}, { ...s, turn: 7 }, { ...s, hands: null }, { ...s, phase: 'x' }]) {
    assert.equal(M.isLegal(st, DRAW), false);
    assert.deepEqual(M.legalMoves(st), []);
  }
  assert.equal(M.isLegal(s, play('H9')), true);
  assert.equal(M.describeMove(s, PASS), 'passt');
  assert.equal(M.describeMove(s, { type: 'x' }), '?');
  const t = M.applyMove(s, play('H9'));   // s ist eingefroren → keine Veränderung möglich
  assert.equal(s.hands[0].length, 3); assert.equal(t.hands[0].length, 2);
  assert.equal(M.positionKey(JSON.parse(JSON.stringify(t))), M.positionKey(t));
});

test('Sicherheitsgrenze MAX_PLY: es gewinnt, wer die wenigsten Karten hat', () => {
  const s = mk({ hands: [['H9', 'E9'], ['S8'], ['L8', 'LK', 'LZ']], pile: ['HK'], ply: M.MAX_PLY - 1, turn: 2 });
  const t = M.applyMove(s, DRAW);
  assert.equal(t.phase, 'over'); assert.equal(t.winner, 1);
  const u = M.applyMove(mk({ hands: [['H9'], ['S8'], ['L8', 'LK']], pile: ['HK'], ply: M.MAX_PLY - 1, turn: 2 }), DRAW);
  assert.equal(u.winner, null); assert.equal(M.result(u).points, 0);
});

test('Mau-Zustand bleibt stimmig: Sieger nicht mehr „Mau“, Strafe mit Nachmischen hebt Mau sofort auf', () => {
  const w = M.applyMove(mk({ hands: [['H9'], ['E8'], ['L8']], pile: ['HK'], mau: [true, false, false] }), play('H9'));
  assert.deepEqual(w.mau, [false, false, false]);
  // Sitz 0 hat Mau gesagt, muss 2 ziehen, im Stapel liegt nur 1 Karte → wartet aufs Mischen mit 2 Karten
  const pile = ['L9', 'S9', 'E7'];
  const rest = M.DECK.filter(c => !pile.includes(c) && c !== 'EK' && c !== 'H9');
  const s = mk({ hands: [['H9'], rest.slice(0, 14), rest.slice(14)], pile, stock: ['EK'], penalty: 2, turn: 0, mau: [true, false, false] });
  const a = M.applyMove(s, DRAW);
  assert.equal(a.phase, 'deal');
  assert.equal(a.hands[0].length, 2);
  assert.equal(a.mau[0], false);
});

// ---------- Bot ----------

test('Bot: alle Stufen spielen nur legale Züge auf der Sicht; Stufe 3 hält timeMs ein', () => {
  const rng = mulberry32(21);
  let maxMs = 0, moves = 0;
  for (let g = 0; g < 12; g++) {
    let s = M.applyChance(M.initialState({ players: 2 + (g % 4) }), shufflePerm(32, rng));
    while (!M.result(s)) {
      if (M.chance(s)) { s = M.applyChance(s, shufflePerm(M.chance(s).n, rng)); continue; }
      const p = M.currentPlayer(s), lv = 1 + ((g + p) % 3);
      const t = performance.now();
      const m = chooseMove(M.viewFor(s, p), { level: lv, rng, timeMs: 40 });
      if (lv === 3) maxMs = Math.max(maxMs, performance.now() - t);
      assert.ok(M.isLegal(s, m), JSON.stringify(m));
      s = M.applyMove(s, m);
      moves++;
    }
  }
  assert.ok(maxMs < 250, `${maxMs.toFixed(0)} ms`);
  const big = mk({ hands: [['H9', 'HZ', 'LK', 'S9', 'E9'], ['S8', 'S7', 'SZ'], ['L8', 'L9']], pile: ['HK'] });
  const t = performance.now();
  chooseMove(M.viewFor(big, 0), { level: 3, timeMs: 5000 });
  const ms = performance.now() - t;
  assert.ok(ms < 1400, `Obergrenze 1,2 s: ${ms.toFixed(0)} ms`);
  return `${moves} Bot-Züge, Stufe 3 langsamster Zug ${maxMs.toFixed(0)} ms bei timeMs 40, timeMs 5000 → ${ms.toFixed(0)} ms`;
});

test('Bot: letzte Karte wird gelegt, Stufe 2/3 sagen Mau, Stufe 2 hebt den Unter auf, 7 gegen kurze Hand', () => {
  const last = mk({ hands: [['H9'], ['S8', 'SK'], ['L8', 'LZ']], pile: ['HK'] });
  for (const level of [1, 2, 3]) assert.deepEqual(chooseMove(M.viewFor(last, 0), { level, rng: mulberry32(1), timeMs: 20 }), play('H9'));
  const two = mk({ hands: [['H9', 'S8'], ['S9', 'SK'], ['L8', 'LZ']], pile: ['HK'] });
  for (const level of [2, 3]) assert.equal(chooseMove(M.viewFor(two, 0), { level, rng: mulberry32(2), timeMs: 20 }).mau, true);
  const u = mk({ hands: [['HU', 'H9', 'E9', 'E8'], ['S9', 'SK', 'SZ'], ['L8', 'LZ', 'LK']], pile: ['HK'] });
  assert.equal(chooseMove(M.viewFor(u, 0), { level: 2 }).card, 'H9');
  const w = mk({ hands: [['HU', 'E9', 'E8', 'EK'], ['S9', 'SK', 'SZ'], ['L8', 'LZ', 'LK']], pile: ['SA'] });
  assert.deepEqual(chooseMove(M.viewFor(w, 0), { level: 2 }), play('HU', { wish: 'E' }));   // häufigste eigene Farbe
  const seven = mk({ hands: [['H7', 'HZ', 'E9', 'E8'], ['S9'], ['L8', 'LZ', 'LK', 'L9', 'SK']], pile: ['HK'] });
  assert.equal(chooseMove(M.viewFor(seven, 0), { level: 2 }).card, 'H7');
});

// 3er-Partien: Stufe a auf wechselndem Sitz gegen 2× Stufe b; fair wären 33 %.
function match(a, b, games, seed, samples) {
  let wins = 0;
  for (let g = 0; g < games; g++) {
    const rng = mulberry32(seed + g), me = g % 3;
    let s = M.initialState({ players: 3 });
    while (!M.result(s)) {
      if (M.chance(s)) { s = M.applyChance(s, shufflePerm(M.chance(s).n, rng)); continue; }
      const p = M.currentPlayer(s);
      s = M.applyMove(s, chooseMove(M.viewFor(s, p), { level: p === me ? a : b, rng, samples }));
    }
    if (M.result(s).winner === me) wins++;
  }
  return wins;
}

test('Bot-Stufen in 3er-Partien: Stufe 2 schlägt Stufe 1 (1500 Partien, > 40 %, fair 33 %)', () => {
  const n = 1500, w = match(2, 1, n, 1000, 0);
  assert.ok(w / n > 0.4, `${w}/${n}`);
  return `${w}/${n} = ${(100 * w / n).toFixed(1)} %`;
});

test('Bot-Stufen in 3er-Partien: Stufe 3 schlägt Stufe 1 klar (240 Partien, 30 Stichproben je Zug, > 40 %)', () => {
  const n = 240, w = match(3, 1, n, 5000, 30);
  assert.ok(w / n > 0.4, `${w}/${n}`);
  return `${w}/${n} = ${(100 * w / n).toFixed(1)} %`;
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
