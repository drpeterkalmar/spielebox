// Regeltests Blackjack: Schuh, Setzen, Auszahlungen (Gewinn, Verlust, Gleichstand, BJ 3:2, Bank-BJ), Bankregel,
// Teilen, Verdoppeln, Bank-Rotation (5 Runden, wechselBJ), Mischgrenze, Aussetzen, Deckung der Bank, Sicht, Bot.
// Aufruf: node tests/node/blackjack.test.mjs
import assert from 'node:assert/strict';
import * as B from '../../src/games/blackjack/engine.js';
import { chooseMove, strategy } from '../../src/games/blackjack/bot.js';
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

// Permutation über SHOE, deren oberste Karten `top` sind (Duplikate: jeweils die nächste freie Kopie)
function stack(top) {
  const used = new Set(), perm = [];
  for (const c of top) {
    const i = B.SHOE.findIndex((x, k) => x === c && !used.has(k));
    if (i < 0) throw new Error(`Karte ${c} nicht (mehr) im Schuh`);
    used.add(i);
    perm.push(i);
  }
  for (let i = 0; i < B.SHOE.length; i++) if (!used.has(i)) perm.push(i);
  return perm;
}
// Partie beginnen, Schuh mit `top` oben
function start(opts, top = []) {
  const s0 = B.initialState(opts);
  assert.deepEqual(B.chance(s0), { kind: 'shuffle', n: 104 });
  return B.applyChance(s0, stack(top));
}
// In der Setzphase (keine Karten im Spiel) den Schuh ersetzen: `top` oben, insgesamt len Karten, Rest abgelegt
function setShoe(s, top, len = 104) {
  assert.equal(s.phase, 'bet');
  const rest = B.SHOE.slice();
  for (const c of top) rest.splice(rest.indexOf(c), 1);
  const k = len - top.length;
  return { ...s, shoe: [...top, ...rest.slice(0, k)], discard: rest.slice(k) };
}
const bet = amount => ({ type: 'bet', amount });
const M = type => ({ type });
const run = (s, ...moves) => moves.reduce((st, m) => B.applyMove(st, m), s);
const types = s => B.legalMoves(s).map(m => m.type);
const sum = a => a.reduce((x, y) => x + y, 0);
function cardsInGame(s) {
  const all = [...s.shoe, ...s.discard, ...s.bankCards];
  for (const hs of s.hands) for (const h of hs) all.push(...h.cards);
  return all;
}
function assertCards(s) {
  const all = cardsInGame(s);
  assert.equal(all.length, 104);
  assert.deepEqual(all.slice().sort(), B.SHOE.slice().sort());
}
const results = (s, seat) => s.lastRound.hands[seat].map(h => h.result);

// ---------- Grundlagen ----------

test('Schuh: 104 Karten, jede Karte zweimal; Optionen; Kartenwerte', () => {
  assert.equal(B.SHOE.length, 104);
  const counts = {};
  for (const c of B.SHOE) counts[c] = (counts[c] || 0) + 1;
  assert.equal(Object.keys(counts).length, 52);
  assert.ok(Object.values(counts).every(n => n === 2));
  assert.ok(B.SHOE.includes('AS') && B.SHOE.includes('TH') && B.SHOE.includes('KC') && B.SHOE.includes('2D'));
  assert.deepEqual(B.normalizeOptions(), { players: 4, wechselBJ: false, start: 100 });
  assert.deepEqual(B.normalizeOptions({ players: 7, wechselBJ: 'ja', start: -3 }), { players: 4, wechselBJ: false, start: 100 });
  assert.deepEqual(B.normalizeOptions({ players: 2, wechselBJ: true, start: 50 }), { players: 2, wechselBJ: true, start: 50 });
  assert.deepEqual(B.normalizeOptions({ players: '6' }).players, 6);
  assert.equal(B.PLAYERS.length, 6);
  assert.deepEqual(B.handValue(['AS', 'KH']), { total: 21, soft: true, bj: true });
  assert.deepEqual(B.handValue(['AS', '6H']), { total: 17, soft: true, bj: false });
  assert.deepEqual(B.handValue(['AS', '6H', 'TD']), { total: 17, soft: false, bj: false });
  assert.deepEqual(B.handValue(['AS', 'AH', '9D']), { total: 21, soft: true, bj: false });
  assert.deepEqual(B.handValue(['TS', 'QH', '5D']), { total: 25, soft: false, bj: false });
  assert.equal(B.cardName('QH'), 'Herz-Dame');
  assert.equal(B.cardName('TS'), 'Pik-10');
});

test('Start: erst mischen (104), dann setzt der Sitz nach der Bank; Einsätze 1–50', () => {
  const s0 = B.initialState();
  assert.equal(B.currentPlayer(s0), null);
  assert.deepEqual(B.legalMoves(s0), []);
  assert.equal(s0.bank, 0);
  assert.deepEqual(s0.beans, [100, 100, 100, 100]);
  const s = B.applyChance(s0, [...Array(104).keys()]);
  assert.deepEqual(s.shoe, [...B.SHOE]);
  assert.equal(B.chance(s), null);
  assert.equal(B.phase(s), 'bet');
  assert.equal(B.currentPlayer(s), 1);
  const ms = B.legalMoves(s);
  assert.equal(ms.length, 50);
  assert.deepEqual(ms[0], bet(1));
  assert.deepEqual(ms[49], bet(50));
  assert.ok(!B.isLegal(s, bet(51)) && !B.isLegal(s, bet(0)) && !B.isLegal(s, bet(2.5)));
  const s1 = run(s, bet(5));
  assert.equal(B.currentPlayer(s1), 2);
  const s3 = run(s1, bet(7), bet(9));
  assert.equal(B.phase(s3), 'play');
  assert.deepEqual(s3.hands.map(h => h.length), [0, 1, 1, 1]);
  // Karte 1 an Sitz 1, 2, 3, Bank (offen); Karte 2 ebenso (Bank: Loch-Karte)
  assert.deepEqual(s3.hands.slice(1).map(h => h[0].cards), [['AS', '5S'], ['2S', '6S'], ['3S', '7S']]);
  assert.deepEqual(s3.bankCards, ['4S', '8S']);
  assert.equal(s3.holeOpen, false);
  assert.equal(s3.shoe.length, 96);
  assertCards(s3);
  assert.throws(() => B.applyChance(s0, [0, 1, 2]));
  assert.throws(() => B.applyChance(s, [...Array(104).keys()]));
});

// ---------- Auszahlungen ----------

test('Gewinn 1:1, Verlust, Gleichstand', () => {
  let s = run(start({ players: 2 }, ['TS', '7H', '9S', 'TH']), bet(10));   // 19 gegen 17
  assert.equal(B.currentPlayer(s), 1);
  s = run(s, M('stand'));
  assert.deepEqual(results(s, 1), ['win']);
  assert.deepEqual(s.beans, [90, 110]);
  assert.deepEqual(s.lastRound.delta, [-10, 10]);
  assert.equal(s.lastRound.bankTotal, 17);
  s = run(start({ players: 2 }, ['TS', 'TH', '9S', 'KH']), bet(10), M('stand'));   // 19 gegen 20
  assert.deepEqual(results(s, 1), ['lose']);
  assert.deepEqual(s.beans, [110, 90]);
  s = run(start({ players: 2 }, ['TS', 'TH', '8S', '8H']), bet(10), M('stand'));   // 18 gegen 18
  assert.deepEqual(results(s, 1), ['push']);
  assert.deepEqual(s.beans, [100, 100]);
  assertCards(s);
});

test('Black Jack 3:2 (halbe Bohnen), Spieler mit BJ spielt nicht, Bank zieht dann nicht', () => {
  const s = run(start({ players: 2 }, ['AS', 'TH', 'KS', '5H']), bet(5));
  assert.equal(B.phase(s), 'bet');   // Runde sofort fertig
  assert.deepEqual(results(s, 1), ['bj']);
  assert.deepEqual(s.beans, [92.5, 107.5]);
  assert.deepEqual(s.lastRound.bankCards, ['TH', '5H']);   // Bank zieht nicht (nur BJ im Spiel)
  assert.equal(s.lastRound.hands[1][0].win, 7.5);
});

test('Bank-BJ: sofort aufgedeckt, Spieler-BJ unentschieden, alle anderen verlieren', () => {
  // 3 Sitze, Bank 0: Karte 1 an 1, 2, Bank; Karte 2 an 1, 2, Bank
  const s = run(start({ players: 3 }, ['AS', '9S', 'AH', 'QS', '9D', 'KH']), bet(10), bet(20));
  assert.equal(B.phase(s), 'bet');
  assert.equal(s.lastRound.bankBJ, true);
  assert.deepEqual(results(s, 1), ['push']);
  assert.deepEqual(results(s, 2), ['lose']);
  assert.deepEqual(s.beans, [120, 100, 80]);
});

test('Überkauft vor der Bank verliert, auch wenn die Bank danach überkauft', () => {
  // Sitz 1: T+6, zieht K → 26; Sitz 2: T+Q = 20; Bank T+6 zieht K → 26
  let s = run(start({ players: 3 }, ['TS', 'TD', 'TH', '6S', 'QD', '6H', 'KS', 'KC']), bet(10), bet(10));
  assert.deepEqual(types(s), ['hit', 'stand', 'double']);
  s = run(s, M('hit'));
  assert.equal(B.currentPlayer(s), 2);   // überkauft → sofort weiter
  s = run(s, M('stand'));
  assert.equal(s.lastRound.bankTotal, 26);
  assert.equal(s.lastRound.bankBust, true);
  assert.deepEqual(results(s, 1), ['bust']);
  assert.deepEqual(results(s, 2), ['win']);
  assert.deepEqual(s.beans, [100, 90, 110]);
});

test('Bankregel: zieht bis 16, steht auf 17 und auf weicher 17; zieht nicht, wenn alle überkauft', () => {
  let s = run(start({ players: 2 }, ['TS', 'TH', '8S', '2H', '4C', '5C']), bet(10), M('stand'));
  assert.deepEqual(s.lastRound.bankCards, ['TH', '2H', '4C', '5C']);   // 12 → 16 → 21
  assert.deepEqual(results(s, 1), ['lose']);
  s = run(start({ players: 2 }, ['TS', 'AH', '8S', '6H', '4C']), bet(10), M('stand'));
  assert.deepEqual(s.lastRound.bankCards, ['AH', '6H']);   // weiche 17 steht
  assert.deepEqual(results(s, 1), ['win']);
  s = run(start({ players: 2 }, ['TS', '9H', '7S', '8H', '4C']), bet(10), M('stand'));
  assert.deepEqual(s.lastRound.bankCards, ['9H', '8H']);   // harte 17 steht
  assert.deepEqual(results(s, 1), ['push']);
  s = run(start({ players: 2 }, ['5S', 'AH', '5D', '5H', 'AC']), bet(10), M('stand'));
  assert.deepEqual(s.lastRound.bankCards, ['AH', '5H', 'AC']);   // weiche 16 zieht → weiche 17
  s = run(start({ players: 2 }, ['TS', 'TH', '6S', '2H', 'KS', '9C']), bet(10), M('hit'));
  assert.deepEqual(s.lastRound.bankCards, ['TH', '2H']);   // Spieler überkauft → Bank zieht nicht
  assert.deepEqual(s.beans, [110, 90]);
});

// ---------- Teilen und Verdoppeln ----------

test('Teilen 8/8, Verdoppeln auf geteilter Hand, zweite Hand spielt danach', () => {
  let s = run(start({ players: 2 }, ['8S', 'TH', '8H', '7H', '3S', 'TS', '9S']), bet(10));
  assert.deepEqual(types(s), ['hit', 'stand', 'double', 'split']);
  s = run(s, M('split'));
  assert.equal(s.hands[1].length, 2);
  assert.deepEqual(s.hands[1][0].cards, ['8S', '3S']);
  assert.deepEqual(s.hands[1][1].cards, ['8H']);   // zweite Karte erst, wenn die Hand dran ist
  assert.equal(s.hand, 0);
  assert.ok(!types(s).includes('split'));
  s = run(s, M('double'));   // 11 + T = 21
  assert.equal(s.hand, 1);
  assert.deepEqual(s.hands[1][1].cards, ['8H', '9S']);
  s = run(s, M('stand'));
  assert.deepEqual(results(s, 1), ['win', 'push']);
  assert.deepEqual(s.lastRound.hands[1].map(h => h.bet), [20, 10]);
  assert.deepEqual(s.beans, [80, 120]);
  assertCards(s);
});

test('Teilen: Zehnerwerte gemischt ja, ungleiche Werte nein, nur einmal pro Runde', () => {
  let s = run(start({ players: 2 }, ['KS', '7H', 'TH', 'TD']), bet(10));
  assert.ok(types(s).includes('split'));
  s = run(start({ players: 2 }, ['KS', '7H', '9H', 'TD']), bet(10));
  assert.ok(!types(s).includes('split'));
  assert.ok(!B.isLegal(s, M('split')));
  s = run(start({ players: 2 }, ['8S', 'TH', '8H', '7H', '8D', '8C']), bet(10), M('split'));
  assert.deepEqual(s.hands[1][0].cards, ['8S', '8D']);
  assert.ok(!types(s).includes('split'));   // wieder ein Paar, aber nur einmal
  s = run(s, M('stand'));
  assert.deepEqual(s.hands[1][1].cards, ['8H', '8C']);
  assert.ok(!types(s).includes('split'));
});

test('Geteilte Asse: je genau eine Karte, fertig; 21 nach Teilen ist kein Black Jack', () => {
  const s = run(start({ players: 2 }, ['AS', 'TH', 'AH', '7H', 'KS', '5S']), bet(10), M('split'));
  assert.equal(B.phase(s), 'bet');   // beide Hände automatisch fertig, Runde abgerechnet
  assert.deepEqual(s.lastRound.hands[1].map(h => h.cards), [['AS', 'KS'], ['AH', '5S']]);
  assert.deepEqual(results(s, 1), ['win', 'lose']);   // 21 gegen 17 zahlt 1:1, 16 verliert
  assert.deepEqual(s.lastRound.hands[1].map(h => h.win), [10, -10]);
  assert.deepEqual(s.beans, [100, 100]);
});

test('Verdoppeln: genau eine Karte, doppelter Einsatz, Gewinn/Verlust doppelt; nur auf 2 Karten', () => {
  let s = run(start({ players: 2 }, ['5S', 'TH', '6S', '8H', 'TS']), bet(10), M('double'));
  assert.deepEqual(s.lastRound.hands[1][0].cards, ['5S', '6S', 'TS']);
  assert.equal(s.lastRound.hands[1][0].bet, 20);
  assert.equal(s.lastRound.hands[1][0].doubled, true);
  assert.deepEqual(s.beans, [80, 120]);
  s = run(start({ players: 2 }, ['5S', 'TH', '5H', '8H', '2S']), bet(10), M('double'));
  assert.deepEqual(s.lastRound.hands[1][0].cards, ['5S', '5H', '2S']);   // 12, keine weitere Karte
  assert.deepEqual(s.beans, [120, 80]);
  s = run(start({ players: 2 }, ['2S', 'TH', '3H', '8H', '2D']), bet(10), M('hit'));
  assert.deepEqual(types(s), ['hit', 'stand']);
  assert.ok(!B.isLegal(s, M('double')));
});

// ---------- Deckung, Aussetzen ----------

test('Deckung der Bank begrenzt Einsätze, Verdoppeln und Teilen; wer nichts setzen kann, setzt aus', () => {
  const base = start({ players: 3 }, []);
  let s = { ...base, beans: [10, 100, 100] };   // Bank hat 10 → höchstens 6 (6 × 1,5 = 9)
  assert.equal(B.maxBet(s, 1), 6);
  assert.equal(B.legalMoves(s).length, 6);
  s = run(s, bet(6));
  assert.equal(B.maxBet(s, 2), 0);
  assert.equal(B.phase(s), 'play');   // Sitz 2 setzt aus
  assert.deepEqual(s.hands.map(h => h.length), [0, 1, 0]);
  assert.equal(B.maxBet({ ...base, beans: [7.5, 100, 100] }, 1), 5);
  // Verdoppeln braucht Deckung: Bank 20, Einsatz 10 (nach dem Austeilen 10 gebunden, Rest 10 → ok);
  // Bank 19: Rest 9 < 10 → nicht erlaubt
  const deal = ['5S', 'TH', '6S', '8H'];
  s = run(setShoe({ ...start({ players: 2 }), beans: [20, 100] }, deal), bet(10));
  assert.ok(types(s).includes('double'));
  s = run(setShoe({ ...start({ players: 2 }), beans: [19, 100] }, deal), bet(10));
  assert.ok(!types(s).includes('double'));
  // eigene Bohnen: 15 Bohnen, Einsatz 10 → Verdoppeln/Teilen nicht möglich
  s = run(setShoe({ ...start({ players: 2 }), beans: [185, 15] }, ['8S', 'TH', '8H', '8D']), bet(10));
  assert.deepEqual(types(s), ['hit', 'stand']);
});

test('Sitze ohne Bohnen setzen aus', () => {
  // Sitz 2 verliert zweimal 50 (16 gegen 20) und hat 0 Bohnen; Sitz 1: 20 gegen 20
  let s = start({ players: 3, start: 100 }, []);
  for (let r = 0; r < 2; r++) {
    s = setShoe(s, ['TS', '9S', 'TH', 'TD', '7D', 'KC']);
    s = run(s, bet(1), bet(50), M('stand'), M('stand'));
    assert.deepEqual([results(s, 1), results(s, 2)], [['push'], ['lose']]);
  }
  assert.deepEqual(s.beans, [200, 100, 0]);
  assert.equal(B.currentPlayer(s), 1);   // Sitz 2 hat 0 Bohnen: nur Sitz 1 setzt
  s = setShoe(s, ['TS', 'TH', '9S', '8D']);
  s = run(s, bet(3));
  assert.equal(B.phase(s), 'play');
  assert.deepEqual(s.hands.map(h => h.length), [0, 1, 0]);
});

// ---------- Bank-Rotation und Ende ----------

function playRound(s, rng, level = 1) {
  const r = s.round;
  while (s.round === r && !B.result(s)) {
    const c = B.chance(s);
    if (c) {
      const a = [...Array(c.n).keys()];
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
      s = B.applyChance(s, a);
      continue;
    }
    s = B.applyMove(s, chooseMove(B.viewFor(s, B.currentPlayer(s)), { level, rng }));
  }
  return s;
}

test('Bank wechselt reihum alle 5 Runden; Ende nach players × 5 Runden', () => {
  const rng = mulberry32(7);
  let s = B.initialState({ players: 3 });
  const banks = [];
  while (!B.result(s)) {
    banks.push(s.bank);
    s = playRound(s, rng);
  }
  assert.deepEqual(banks, [0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2]);
  assert.equal(s.round, 15);
  assert.equal(sum(s.beans), 300);
  assert.equal(B.currentPlayer(s), null);
  assert.deepEqual(B.legalMoves(s), []);
  assert.equal(B.chance(s), null);
  const r = B.result(s), best = Math.max(...s.beans);
  if (s.beans.filter(b => b === best).length === 1) {
    assert.equal(r.winner, s.beans.indexOf(best));
    assert.equal(r.reason, `hat die meisten Bohnen (${String(best).replace('.', ',')})`);
  } else assert.equal(r.winner, null);
});

test('wechselBJ: Spieler mit Black Jack wird ab der nächsten Runde Bank, Zähler neu; ohne Option nicht', () => {
  // 4 Sitze, Bank 0; Karte 1 an 1,2,3, Bank; Karte 2 an 1,2,3, Bank. Sitz 2 und 3 haben BJ, Sitz 1 steht.
  const top = ['TS', 'AS', 'KS', '9H', '9S', 'KD', 'AD', '8H'];
  let s = run(start({ players: 4, wechselBJ: true }, top), bet(5), bet(5), bet(5));
  s = run(s, M('stand'));
  assert.equal(s.bank, 2);   // erster BJ in Sitzreihenfolge nach der Bank
  assert.equal(s.bankRounds, 0);
  assert.equal(s.lastRound.nextBank, 2);
  assert.equal(B.currentPlayer(s), 3);   // Sitz nach der neuen Bank setzt zuerst
  let t = run(start({ players: 4 }, top), bet(5), bet(5), bet(5), M('stand'));
  assert.equal(t.bank, 0);
  assert.equal(t.bankRounds, 1);
  // Bank selbst mit BJ wechselt nicht; Zähler zählt in der neuen Bank weiter bis 5
  const rng = mulberry32(3);
  for (let i = 0; i < 3; i++) s = playRound(setShoe(s, ['2S', '3S', '4S', '9C', '9D', '9H']), rng);
  assert.equal(s.bank, 2);
  assert.equal(s.bankRounds, 3);
});

test('Partieende, wenn nur noch ein Sitz Bohnen hat; Gleichstand → winner null', () => {
  let s = start({ players: 2 }, []);
  s = setShoe({ ...s, beans: [150, 50] }, ['TS', 'TH', '6S', 'KH']);   // 16 gegen 20
  s = run(s, bet(50), M('stand'));
  assert.deepEqual(s.beans, [200, 0]);
  assert.deepEqual(B.result(s), { winner: 0, reason: 'hat die meisten Bohnen (200)', points: 200 });
  assert.equal(B.phase(s), 'over');
  let u = start({ players: 2 }, []);
  u = setShoe({ ...u, round: 9, bankRounds: 4, bank: 1 }, ['TS', 'TH', '8S', '8H']);
  u = run(u, bet(10), M('stand'));
  assert.equal(B.result(u).winner, null);
  assert.equal(B.result(u).reason, 'Gleichstand mit je 100 Bohnen');
});

test('Bank ohne Deckung (< 1,5 Bohnen) gibt an den nächsten Sitz weiter', () => {
  let s = start({ players: 3 }, []);
  // Bank hat 30: Sitz 1 setzt 20 (Deckung 30), Sitz 2 kann nichts mehr setzen; Sitz 1 hat BJ → Bank 0
  s = setShoe({ ...s, beans: [30, 100, 170] }, ['AS', 'TH', 'KS', '9C']);
  s = run(s, bet(20));
  assert.deepEqual(s.lastRound.hands.map(h => h.length), [0, 1, 0]);
  assert.deepEqual(s.beans, [0, 130, 170]);
  assert.equal(s.bank, 1);
  assert.equal(s.bankRounds, 0);
  assert.equal(B.currentPlayer(s), 2);   // Sitz 0 hat 0 Bohnen und setzt aus
  assert.equal(B.result(s), null);
});

// ---------- Mischen ----------

test('Mischgrenze: < 26 Karten → vor der Runde neu mischen (104), ≥ 26 nicht', () => {
  const deal = ['TS', 'TH', '9S', '8H'];   // 4 Karten, beide stehen
  let s = run(setShoe(start({ players: 2 }), deal, 30), bet(5), M('stand'));
  assert.equal(s.shoe.length, 26);
  assert.equal(B.chance(s), null);
  assert.equal(B.currentPlayer(s), 1);
  assertCards(s);
  s = run(setShoe(start({ players: 2 }), deal, 29), bet(5), M('stand'));
  assert.equal(s.shoe.length, 25);
  assert.deepEqual(B.chance(s), { kind: 'shuffle', n: 104 });
  assert.equal(B.currentPlayer(s), null);
  assert.deepEqual(B.legalMoves(s), []);
  s = B.applyChance(s, [...Array(104).keys()]);
  assert.equal(s.shoe.length, 104);
  assert.equal(s.discard.length, 0);
  assert.equal(B.currentPlayer(s), 1);
});

test('Schuh leer mitten in der Runde: Ablage wird gemischt (n = Ablage), Spiel geht weiter', () => {
  let s = run(setShoe(start({ players: 2 }), ['TS', 'TH', '6S', '7H'], 4), bet(5));
  assert.equal(s.shoe.length, 0);
  assert.deepEqual(B.chance(s), { kind: 'shuffle', n: 100 });
  assert.equal(B.currentPlayer(s), null);
  assertCards(s);
  const disc = s.discard.slice();
  s = B.applyChance(s, [...Array(100).keys()]);
  assert.deepEqual(s.shoe, disc);
  assert.equal(B.currentPlayer(s), 1);
  s = run(s, M('hit'), M('stand'));   // 16 + Ass = 17
  assert.deepEqual(s.lastRound.hands[1][0].cards, ['TS', '6S', 'AS']);
  assertCards(s);
  // Bank braucht Karten, Schuh leer: Bank 12 + 2 = 14, dann ist der Schuh leer
  s = run(setShoe(start({ players: 2 }), ['TS', 'TH', '9S', '2H', '2C'], 5), bet(5), M('stand'));
  assert.equal(B.phase(s), 'bank');
  assert.deepEqual(B.chance(s), { kind: 'shuffle', n: 99 });
  s = B.applyChance(s, [...Array(99).keys()]);
  assert.equal(B.phase(s), 'bet');
  assert.ok(s.lastRound.bankCards.length >= 4);
  assertCards(s);
});

// ---------- Sicht ----------

test('viewFor verrät Loch-Karte und Schuh nicht (JSON-Suche); nach Aufdecken sichtbar', () => {
  const s = run(start({ players: 3 }, ['TS', '9S', '7H', '8S', '8D', 'QD', '5C', '4C']), bet(5), bet(5));
  assert.equal(B.phase(s), 'play');
  for (const seat of [0, 1, 2, null]) {
    const v = B.viewFor(s, seat), json = JSON.stringify(v);
    assert.equal(v.bankCards[1], null);
    assert.equal(v.bankCards[0], '7H');
    assert.ok(!json.includes('QD'), 'Loch-Karte im JSON');
    assert.ok(!json.includes('5C') && !json.includes('4C'), 'Schuh im JSON');
    assert.equal(v.shoe.length, s.shoe.length);
    assert.ok(v.shoe.every(c => c === null));
    assert.deepEqual(v.hands, s.hands);
    assert.deepEqual(B.legalMoves(v), B.legalMoves(s));
    assert.equal(B.currentPlayer(v), B.currentPlayer(s));
    assert.equal(B.evaluate(v, 1), B.evaluate(s, 1));
  }
  const e = run(s, M('stand'), M('stand'));
  assert.deepEqual(B.viewFor(e, 0).lastRound.bankCards.slice(0, 2), ['7H', 'QD']);
});

test('Engine-Funktionen auf viewFor(state, currentPlayer) wie auf dem vollen Zustand', () => {
  const rng = mulberry32(11);
  let n = 0;
  for (let g = 0; g < 20; g++) {
    let s = B.initialState({ players: 2 + (g % 5) });
    while (!B.result(s)) {
      const c = B.chance(s);
      if (c) {
        const a = [...Array(c.n).keys()];
        for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
        s = B.applyChance(s, a);
        continue;
      }
      const p = B.currentPlayer(s), v = B.viewFor(s, p);
      assert.equal(B.currentPlayer(v), p);
      assert.deepEqual(B.legalMoves(v), B.legalMoves(s));
      assert.equal(B.chance(v) === null, true);
      const m = chooseMove(v, { level: 1 + (n % 3), rng });
      assert.ok(B.isLegal(v, m) && B.isLegal(s, m));
      assert.equal(B.describeMove(v, m), B.describeMove(s, m));
      for (let q = 0; q < s.opts.players; q++) assert.equal(B.evaluate(B.viewFor(s, q), q), B.evaluate(s, q));
      s = B.applyMove(s, m);
      n++;
    }
    assert.deepEqual(B.result(B.viewFor(s, 0)), B.result(s));
  }
  return `${n} Züge`;
});

// ---------- Robustheit, Texte ----------

test('isLegal wirft nie; Müll → false; unbekannte Felder abgelehnt', () => {
  const s = start({ players: 2 }, []);
  const junk = [null, undefined, 0, 'bet', [], {}, { type: 'bet' }, { type: 'bet', amount: '5' }, { type: 'bet', amount: 5, x: 1 },
    { type: 'hit', amount: 1 }, { type: 'toString' }, { type: '__proto__' }, { type: 'constructor' }, { type: 'hit' },
    { type: 'bet', amount: NaN }, { type: 'bet', amount: Infinity }, { type: 'bet', amount: -1 }];
  for (const m of junk) assert.equal(B.isLegal(s, m), false, JSON.stringify(m));
  for (const st of [null, undefined, {}, [], 5, { phase: 'bet' }, { ...s, hands: null }, { ...s, beans: 'x' }]) {
    assert.equal(B.isLegal(st, bet(5)), false);
    assert.deepEqual(B.legalMoves(st), []);
  }
  assert.equal(B.isLegal(s, bet(5)), true);
  assert.throws(() => B.applyMove(s, M('hit')));
  assert.throws(() => B.applyMove(s, bet(51)));
});

test('describeMove deutsch, evaluate in Bohnen', () => {
  const s = start({ players: 2 }, []);
  assert.equal(B.describeMove(s, bet(5)), 'setzt 5 Bohnen');
  assert.equal(B.describeMove(s, bet(1)), 'setzt 1 Bohne');
  assert.equal(B.describeMove(s, M('hit')), 'zieht');
  assert.equal(B.describeMove(s, M('stand')), 'bleibt stehen');
  assert.equal(B.describeMove(s, M('double')), 'verdoppelt');
  assert.equal(B.describeMove(s, M('split')), 'teilt');
  const e = run(start({ players: 2 }, ['AS', 'TH', 'KS', '5H']), bet(5));
  assert.equal(B.evaluate(e, 1), 7.5);
  assert.equal(B.evaluate(e, 0), -7.5);
  assert.equal(typeof B.positionKey(e), 'string');
  assert.equal(B.fmtBeans(7.5), '7,5');
});

// ---------- Bot ----------

test('Bot: Basic Strategy (Stichproben) und Einsätze je Stufe', () => {
  const st = (cards, up, o) => strategy(cards, up, o);
  assert.equal(st(['TS', '6H'], 10), 'hit');
  assert.equal(st(['TS', '6H'], 6), 'stand');
  assert.equal(st(['TS', '2H'], 3), 'hit');
  assert.equal(st(['TS', '2H'], 4), 'stand');
  assert.equal(st(['5S', '6H'], 6), 'double');
  assert.equal(st(['5S', '6H'], 6, { canDouble: false }), 'hit');
  assert.equal(st(['5S', '5H'], 6), 'double');   // 5/5 nie teilen
  assert.equal(st(['AS', '7H'], 9), 'hit');
  assert.equal(st(['AS', '7H'], 2), 'stand');
  assert.equal(st(['AS', '7H'], 5), 'double');
  assert.equal(st(['AS', '7H'], 5, { canDouble: false }), 'stand');
  assert.equal(st(['8S', '8H'], 10), 'split');
  assert.equal(st(['AS', 'AH'], 1), 'split');
  assert.equal(st(['AS', 'AH'], 1, { canSplit: false }), 'hit');
  assert.equal(st(['TS', 'KH'], 6), 'stand');
  assert.equal(st(['9S', '9H'], 7), 'stand');
  assert.equal(st(['9S', '9H'], 8), 'split');
  assert.equal(st(['AS', '9H'], 6), 'stand');
  const s = start({ players: 2 }, []);
  const v = B.viewFor(s, 1);
  assert.deepEqual(chooseMove(v, { level: 1 }), bet(5));
  for (let i = 0; i < 20; i++) {
    const m = chooseMove(v, { level: 2, rng: mulberry32(i) });
    assert.ok(m.amount >= 5 && m.amount <= 7, String(m.amount));
  }
  const m3 = chooseMove(v, { level: 3 });
  assert.ok(m3.amount >= 4 && m3.amount <= 10);
  const low = B.viewFor({ ...s, beans: [100, 3] }, 1);
  assert.deepEqual(chooseMove(low, { level: 1 }), bet(3));
  // Stufe 1 verdoppelt/teilt nie, zieht mit 12 gegen 7
  const p = run(start({ players: 2 }, ['8S', '7H', '8H', 'TH']), bet(5));
  assert.deepEqual(chooseMove(B.viewFor(p, 1), { level: 1 }), M('hit'));   // 16 gegen 7: Stufe 1 zieht
  assert.deepEqual(chooseMove(B.viewFor(p, 1), { level: 2 }), M('split'));
});

console.log(`\n${passed} ✅, ${failed} ❌ – ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
