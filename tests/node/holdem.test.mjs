// Hold'em-Engine: Regelfälle mit festen Karten (Blinds, Heads-up-Regel, Mindest-Erhöhung, unvollständiges All-in,
// nicht gegangener Einsatz, Side-Pots mit 3–4 All-ins, Split mit Rest-Chip, Showdown-Reihenfolge und Muck,
// Ausscheiden/Plätze/Turnierende, Blind-Stufen, Sicht, „show“, Determinismus, ungültige Züge).
import * as E from '../../src/games/holdem/engine.js';
import { mulberry32 } from '../../src/rng.js';

let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 7).join('\n   ')}`);
  }
}
const fail = (m) => { throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) fail(`${m}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`); };
const ok = (c, m) => { if (!c) fail(m); };
const sum = (a) => a.reduce((x, y) => x + y, 0);

// Mischung so bauen, dass jeder Sitz die gewünschten Karten bekommt und das Board stimmt.
// holes: { Sitz: 'AS KD' }, board: 'QH JH TH 2C 3D' (5 Karten)
function perm(state, holes, board = '') {
  const n = state.opts.players;
  const order = [];
  for (let p = state.sb, k = 0; k < n; k++, p = (p + 1) % n) if (state.out[p] === null) order.push(p);
  const want = [];
  const H = {};
  for (const p of order) H[p] = (holes[p] || '').split(' ').filter(Boolean);
  for (let r = 0; r < 2; r++) for (const p of order) want.push(H[p][r] || null);
  const b = board.split(' ').filter(Boolean);
  // verbrennen, Flop, verbrennen, Turn, verbrennen, River
  want.push(null, b[0] || null, b[1] || null, b[2] || null, null, b[3] || null, null, b[4] || null);
  const used = new Set(want.filter(Boolean));
  const rest = E.DECK.filter((c) => !used.has(c));
  const cards = want.map((c) => c || rest.shift()).concat(rest);
  return cards.map((c) => E.DECK.indexOf(c));
}
// Regelfälle rechnen mit Blinds 10/20 (erste Hand); die echte erste Stufe ist 5/10 (eigener Test)
function init(opts) {
  const s = E.initialState(opts);
  s.sbAmt = 10; s.bbAmt = 20; s.minRaise = 20;
  return s;
}
const deal = (s, holes, board) => E.applyChance(s, perm(s, holes, board));
const mv = (s, type, to) => E.applyMove(s, to === undefined ? { type } : { type, to });
const chips = (s) => sum(s.stacks) + sum(s.contrib);
function withStacks(opts, stacks) {
  const s = init({ ...opts, players: stacks.length });
  s.stacks = stacks.slice();
  s.startStacks = stacks.slice();
  return s;
}

test('Start: Knopf Platz 1, Blinds 5/10 (100 Big Blinds), Mischen ausstehend', () => {
  const s0 = E.initialState({ players: 4 });
  eq([s0.sbAmt, s0.bbAmt, s0.opts.start], [5, 10, 1000], 'erste Stufe');
  const s = init({ players: 4 });
  eq([s.phase, s.hand, s.button, s.sb, s.bb, s.sbAmt, s.bbAmt], ['deal', 1, 0, 1, 2, 10, 20], 'Start');
  eq(E.chance(s), { kind: 'shuffle', n: 52 }, 'chance');
  eq(E.currentPlayer(s), null, 'niemand am Zug');
  const d = deal(s, { 0: 'AS AD', 1: 'KS KD', 2: 'QS QD', 3: 'JS JD' });
  eq(d.holes, [['AS', 'AD'], ['KS', 'KD'], ['QS', 'QD'], ['JS', 'JD']], 'Karten');
  eq([d.turn, d.bets, d.betTo], [3, [0, 10, 20, 0], 20], 'UTG am Zug');
  eq(E.legalMoves(d), [{ type: 'fold' }, { type: 'call' }, { type: 'raise', to: 40 }, { type: 'raise', to: 1000 }], 'Züge UTG');
  eq(E.raiseRange(d), { min: 40, max: 1000 }, 'Bereich');
});

test('Heads-up: Knopf = Small Blind, handelt vor dem Flop zuerst, danach zuletzt', () => {
  let s = deal(init({ players: 2 }), { 0: 'AS AD', 1: 'KS KD' }, '2C 7D 9H 3S 4S');
  eq([s.button, s.sb, s.bb, s.turn], [0, 0, 1, 0], 'Preflop: Knopf zuerst');
  s = mv(s, 'call');
  eq(s.turn, 1, 'BB hat die Option');
  eq(E.legalMoves(s).map((m) => m.type), ['check', 'raise', 'raise'], 'BB: checken oder erhöhen');
  s = mv(s, 'check');
  eq([s.street, s.turn], [1, 1], 'Flop: BB (kein Knopf) zuerst');
  s = mv(s, 'check');
  eq(s.turn, 0, 'Knopf zuletzt');
  // nächste Hand: Knopf wechselt
  s = mv(s, 'raise', 20); s = mv(s, 'fold');
  eq([s.phase, s.hand, s.button, s.sb, s.bb], ['deal', 2, 1, 1, 0], 'Hand 2');
  eq(s.stacks, [1020, 980], 'Chips');
});

test('Mindest-Erhöhung = letzte volle Erhöhung', () => {
  let s = deal(init({ players: 4 }), {});
  s = mv(s, 'raise', 60);                       // +40
  eq(E.raiseRange(s), { min: 100, max: 1000 }, 'nach Erhöhung auf 60');
  ok(!E.isLegal(s, { type: 'raise', to: 99 }), '99 zu klein');
  ok(E.isLegal(s, { type: 'raise', to: 100 }), '100 erlaubt');
  s = mv(s, 'raise', 200);                      // +140
  eq(E.raiseRange(s), { min: 340, max: 1000 }, 'nach Erhöhung auf 200');
  s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'call');
  eq([s.street, s.betTo, s.minRaise], [1, 0, 20], 'Flop: Mindesteinsatz = Big Blind');
  eq(E.raiseRange(s).min, 20, 'Mindesteinsatz');
  s = mv(s, 'raise', 50);
  eq(E.raiseRange(s).min, 100, 'nach Einsatz 50 → 100');
});

test('Unvollständiges All-in öffnet nicht wieder; zwei kurze All-ins zusammen schon', () => {
  // Platz 3 (UTG) hat nur 130
  let s = withStacks({}, [1000, 1000, 1000, 130]);
  s = deal(s, {});
  s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'check');   // UTG, Knopf, SB, BB
  // Flop: SB (1) zuerst
  eq([s.street, s.turn], [1, 1], 'Flop SB');
  s = mv(s, 'raise', 100);               // SB setzt 100
  s = mv(s, 'call');                     // BB geht mit
  eq(s.turn, 3, 'UTG');
  s = mv(s, 'raise', 110);               // UTG All-in 110 (nur +10, keine volle Erhöhung)
  ok(s.allin[3], 'UTG All-in');
  eq(s.turn, 0, 'Knopf hat noch nicht gehandelt');
  eq(E.raiseRange(s), { min: 210, max: 980 }, 'Knopf darf normal erhöhen (noch nicht gehandelt)');
  s = mv(s, 'call');
  eq(s.turn, 1, 'SB muss 10 nachlegen');
  eq(E.legalMoves(s).map((m) => m.type), ['fold', 'call'], 'SB darf nicht erhöhen');
  s = mv(s, 'call');
  eq(E.legalMoves(s).map((m) => m.type), ['fold', 'call'], 'BB darf nicht erhöhen');
  s = mv(s, 'call');
  eq(s.street, 2, 'Turn');

  // zwei kurze All-ins hintereinander ergeben zusammen eine volle Erhöhung → wieder offen
  let t = withStacks({}, [1000, 1000, 160, 125]);
  t = deal(t, {});
  // Preflop: UTG(3) callt 20, Knopf(0) callt, SB(1) callt, BB(2) checkt
  t = mv(t, 'call'); t = mv(t, 'call'); t = mv(t, 'call'); t = mv(t, 'check');
  // Flop: SB setzt 100, BB All-in 140 (+40), UTG All-in 105 (< 140: nur Mitgehen)… stattdessen andere Reihenfolge:
  t = mv(t, 'raise', 100);               // SB 100
  t = mv(t, 'raise', 140);               // BB All-in 140 (+40, kurz)
  ok(t.allin[2], 'BB All-in');
  t = mv(t, 'call');                     // UTG 105 → geht mit All-in (weniger)
  t = mv(t, 'raise', 300);               // Knopf erhöht auf 300 (+160 ≥ 100: volle Erhöhung)
  eq(t.turn, 1, 'SB wieder dran');
  ok(E.raiseRange(t) !== null, 'SB darf nach voller Erhöhung wieder erhöhen');
  // Variante: Knopf geht nur mit 140 mit → SB steht vor +40 (kurz) → nur mitgehen/aussteigen
  let u = withStacks({}, [1000, 1000, 160, 125]);
  u = deal(u, {});
  u = mv(u, 'call'); u = mv(u, 'call'); u = mv(u, 'call'); u = mv(u, 'check');
  u = mv(u, 'raise', 100); u = mv(u, 'raise', 140); u = mv(u, 'call'); u = mv(u, 'call');
  eq(u.turn, 1, 'SB');
  eq(E.raiseRange(u), null, 'kurze Erhöhung +40 öffnet nicht');
  // zwei kurze Erhöhungen, die zusammen ≥ Mindest-Erhöhung sind: SB 100, BB 140 (+40), UTG-Variante mit 200 (+60)
  let w = withStacks({}, [1000, 1000, 160, 220]);
  w = deal(w, {});
  w = mv(w, 'call'); w = mv(w, 'call'); w = mv(w, 'call'); w = mv(w, 'check');
  w = mv(w, 'raise', 100); w = mv(w, 'raise', 140); w = mv(w, 'raise', 200);   // UTG All-in 200 (+60, kurz)
  ok(w.allin[3], 'UTG All-in 200');
  w = mv(w, 'call');                     // Knopf geht mit 200
  eq(w.turn, 1, 'SB');
  eq(E.raiseRange(w), { min: 300, max: 980 }, 'SB steht vor +100 (= volle Erhöhung) → darf erhöhen');
});

test('Nicht gegangener Einsatz geht zurück', () => {
  let s = deal(init({ players: 3 }), {});
  s = mv(s, 'raise', 300); s = mv(s, 'fold'); s = mv(s, 'fold');
  eq(s.lastHand.returned, [{ seat: 0, amount: 280 }], 'zurück');
  eq(s.lastHand.pots, [{ amount: 50, eligible: [0], winners: [0], value: null, name: null }], 'Pot 10+20+20');
  eq(s.stacks, [1030, 990, 980], 'Chips');
});

test('Side-Pots: vier All-ins verschiedener Höhe', () => {
  // Stacks: 0: 100, 1: 250, 2: 600, 3: 1000. Hände: 0 bester, dann 1, dann 2, 3 schlechtester
  let s = withStacks({}, [100, 250, 600, 1000]);
  s = deal(s, { 0: 'AS AH', 1: 'KS KH', 2: 'QS QH', 3: '7C 2D' }, '3C 8D 9S JC 4H');
  // UTG (3) All-in 1000, Knopf (0) All-in 100, SB (1) All-in 250, BB (2) All-in 600
  s = mv(s, 'raise', 1000); s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'call');
  const lh = s.lastHand;
  eq(lh.returned, [{ seat: 3, amount: 400 }], 'Überschuss von Platz 4 zurück');
  eq(lh.pots.map((p) => [p.amount, p.eligible, p.winners]), [
    [400, [0, 1, 2, 3], [0]], [450, [1, 2, 3], [1]], [700, [2, 3], [2]]], 'Pots');
  eq(lh.delta, [300, 200, 100, -600], 'Delta');
  eq(s.stacks, [400, 450, 700, 400 + 50 - 50].map((x, i) => (i === 3 ? 400 : x)), 'Chips');
  eq(sum(s.stacks), 1950, 'Summe');
  ok(lh.allin && Object.keys(lh.shown).length === 4, 'alle aufgedeckt');
});

test('Side-Pots: drei All-ins, Hauptpot und Side-Pot an verschiedene Gewinner', () => {
  let s = withStacks({}, [1000, 300, 150, 1000]);
  // kurzer Stack (2) hat die beste Hand, Platz 3 die zweitbeste
  s = deal(s, { 0: '7C 2D', 1: 'KS KH', 2: 'AS AH', 3: 'QS QH' }, '3C 8D 9S JC 4H');
  s = mv(s, 'raise', 1000);   // UTG (3) All-in
  s = mv(s, 'fold');           // Knopf (0) raus
  s = mv(s, 'call');           // SB (1) All-in 300
  s = mv(s, 'call');           // BB (2) All-in 150
  const lh = s.lastHand;
  eq(lh.pots.map((p) => [p.amount, p.winners]), [[450, [2]], [300, [1]]], 'Pots');
  eq(lh.returned, [{ seat: 3, amount: 700 }], 'Rückgabe');
  eq(s.stacks, [1000, 300, 450, 700], 'Chips');
  eq(s.out, [null, null, null, null], 'niemand raus (Platz 3 hat 700 zurück)');
});

test('Split-Pot: gleiche Straße auf dem Board', () => {
  // 3 Spieler, Board-Straße für alle; ungerader Pot durch kurzen Blind
  let s = withStacks({}, [1000, 1000, 1000]);
  s = deal(s, { 0: '2C 3D', 1: '2D 3C', 2: '2H 3H' }, 'TS JD QC KH AS');
  // alle gehen mit, Knopf (0) setzt am River 15 ... Pot muss ungerade sein: Preflop 20×3 = 60
  s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'check');
  s = mv(s, 'check'); s = mv(s, 'check'); s = mv(s, 'check');
  s = mv(s, 'check'); s = mv(s, 'check'); s = mv(s, 'check');
  s = mv(s, 'raise', 25); s = mv(s, 'call'); s = mv(s, 'fold');   // SB setzt 25, BB geht mit, Knopf raus
  const lh = s.lastHand;
  eq(lh.pots[0].amount, 110, 'Pot 60 + 50');
  eq(lh.pots[0].winners, [1, 2], 'Split SB/BB');
});

test('Split-Pot mit Rest-Chip: ab links vom Knopf', () => {
  // Knopf 0, SB 1, BB 2; Pot 3 × 20 + Kurzstapel-Trick: SB hat 15 → kurzer Blind 10 … einfacher: Pot = 20+20+15 (Knopf All-in 15)
  let s = withStacks({}, [15, 1000, 1000]);
  s = deal(s, { 0: '7C 4D', 1: '2D 3C', 2: '2H 3H' }, 'TS JD QC KH AS');
  s = mv(s, 'call');          // Knopf All-in 15
  s = mv(s, 'call');          // SB auf 20
  s = mv(s, 'check');         // BB
  for (let i = 0; i < 6; i++) s = mv(s, 'check');
  const lh = s.lastHand;
  // Hauptpot 45 (15×3): alle drei haben die Board-Straße → Split auf drei, je 15
  // Side-Pot 10 (je 5 von SB/BB): SB/BB je 5
  eq(lh.pots.map((p) => [p.amount, p.winners]), [[45, [1, 2, 0]], [10, [1, 2]]], 'Pots');
  eq(s.stacks, [15, 1000, 1000], 'alle gleich');
  // jetzt ungerade: Hauptpot 45 auf 2 Gewinner
  let t = withStacks({}, [15, 1000, 1000]);
  t = deal(t, { 0: '7C 2D', 1: 'AD 9C', 2: 'AH 9H' }, 'TS JD QC KH 2S');
  t = mv(t, 'call'); t = mv(t, 'call'); t = mv(t, 'check');
  for (let i = 0; i < 6; i++) t = mv(t, 'check');
  const l2 = t.lastHand;
  eq(l2.pots.map((p) => [p.amount, p.winners]), [[45, [1, 2]], [10, [1, 2]]], 'Split');
  // 45 / 2 = 22 Rest 1 → SB (links vom Knopf) bekommt 23
  eq(t.stacks, [0, 980 + 23 + 5, 980 + 22 + 5], 'Rest-Chip an SB');
  eq(t.out[0], 3, 'Knopf ist ausgeschieden (Platz 3)');
});

test('Showdown: letzter Aggressor zeigt zuerst, Verlierer legt weg, „show“ danach', () => {
  let s = deal(init({ players: 3 }), { 0: 'AS AH', 1: '7C 2D', 2: 'KS KH' }, '3C 8D 9S JC 4H');
  s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'check');     // Preflop
  for (let i = 0; i < 6; i++) s = mv(s, 'check');                // Flop, Turn
  s = mv(s, 'check');                                            // River: SB checkt
  s = mv(s, 'raise', 40);                                        // BB setzt
  s = mv(s, 'call');                                             // Knopf geht mit
  s = mv(s, 'call');                                             // SB geht mit
  const lh = s.lastHand;
  eq(lh.order, [2, 0, 1], 'BB (Aggressor) zuerst');
  eq(Object.keys(lh.shown).map(Number).sort(), [0, 2], 'BB zeigt, Knopf zeigt (besser)');
  eq(lh.mucked, [1], 'SB legt weg');
  eq(lh.pots[0].winners, [0], 'Knopf gewinnt');
  eq(lh.pots[0].name, 'Paar Asse', 'Name');
  // Sicht: weggelegte Karten nicht sichtbar, außer für den Besitzer
  ok(!E.viewFor(s, 0).lastHoles[1], 'fremde weggelegte Karten fehlen');
  eq(E.viewFor(s, 1).lastHoles[1], ['7C', '2D'], 'eigene sichtbar');
  ok(E.isLegalAct(s, 1, 'show') && !E.isLegalAct(s, 0, 'show'), 'show nur für Weggelegtes');
  const s2 = E.applyAct(s, 1, 'show');
  eq(s2.lastHand.shown[1], ['7C', '2D'], 'gezeigt');
  ok(!E.isLegalAct(s2, 1, 'show'), 'nur einmal');
  eq(s.lastHand.shown[1], undefined, 'alter Zustand unverändert');
});

test('Gewinn ohne Showdown: nichts gezeigt, „show“ möglich', () => {
  let s = deal(init({ players: 2 }), { 0: '7C 2D', 1: 'AS AH' });
  s = mv(s, 'raise', 60); s = mv(s, 'fold');
  eq([s.lastHand.uncontested, s.lastHand.shown], [0, {}], 'uncontested');
  ok(E.isLegalAct(s, 0, 'show'), 'Sieger darf zeigen');
  ok(!E.isLegalAct(s, 1, 'show'), 'Ausgestiegener nicht');
  eq(E.viewFor(E.applyAct(s, 0, 'show'), 1).lastHand.shown[0], ['7C', '2D'], 'Gegner sieht es dann');
});

test('Sicht: fremde Hole Cards und Stapel verdeckt, Zuschauer sieht keine; All-in deckt auf', () => {
  let s = deal(init({ players: 3 }), { 0: 'AS AH', 1: 'KS KH', 2: 'QS QH' });
  const v = E.viewFor(s, 1);
  eq(v.holes, [[null, null], ['KS', 'KH'], [null, null]], 'Sitz 1');
  ok(v.deck.every((c) => c === null) && v.deck.length === s.deck.length, 'Stapel verdeckt');
  eq(E.viewFor(s, null).holes, [[null, null], [null, null], [null, null]], 'Zuschauer');
  ok(!JSON.stringify(E.viewFor(s, null)).match(/"(AS|AH|KS|KH|QS|QH)"/), 'keine Hole Card im Zuschauer-JSON');
  s = mv(s, 'raise', 1000); s = mv(s, 'call'); s = mv(s, 'fold');
  // Hand ist sofort durch (alle All-in) – Ergebnis offen
  eq(Object.keys(s.lastHand.shown).map(Number).sort(), [0, 1], 'beide offen');
});

test('Ausscheiden, Plätze, Turnierende, Rangliste', () => {
  let s = withStacks({}, [100, 200, 1000, 300]);
  s = deal(s, { 0: '7C 2D', 1: '8C 3D', 2: 'AS AH', 3: '9C 4D' }, 'KC QD 5S JC 6H');
  s = mv(s, 'raise', 300); s = mv(s, 'call'); s = mv(s, 'call'); s = mv(s, 'call');
  eq(s.lastHand.busted, [3, 1, 0], 'alle drei raus (sortiert nach Start-Chips)');
  eq(s.places, [4, 3, 1, 2], 'Plätze');
  eq(s.phase, 'over', 'Turnier vorbei');
  eq(E.result(s).winner, 2, 'Sieger');
  eq(E.result(s).ranking, [2, 3, 1, 0], 'Rangliste');
  eq(E.legalMoves(s), [], 'keine Züge');
  eq(E.chance(s), null, 'kein Mischen');
});

test('Gleich viele Chips beim Ausscheiden → gleicher Platz; Knopf überspringt Ausgeschiedene', () => {
  let s = withStacks({}, [1000, 100, 100, 1000]);
  s = deal(s, { 0: 'AS AH', 1: '7C 2D', 2: '8C 3D', 3: 'KS KH' }, 'KC QD 5S JC 6H');
  s = mv(s, 'fold');          // UTG (3) raus
  s = mv(s, 'raise', 1000);   // Knopf All-in
  s = mv(s, 'call');          // SB All-in 100
  s = mv(s, 'call');          // BB All-in 100
  eq(s.places, [null, 3, 3, null], 'gleicher Platz 3');
  eq([s.phase, s.hand, s.button, s.sb, s.bb], ['deal', 2, 3, 3, 0], 'zu zweit: Knopf (3) = SB');
});

test('Blinds steigen nach Händen (normal: alle 20, langsam: 30, schnell: 12, aus: nie)', () => {
  const lv = (b, h) => E.levelFor(E.normalizeOptions({ blinds: b }), h);
  eq([lv('normal', 1), lv('normal', 20), lv('normal', 21), lv('normal', 41)], [0, 0, 1, 2], 'normal');
  eq([lv('schnell', 12), lv('schnell', 13), lv('langsam', 30), lv('langsam', 31)], [0, 1, 0, 1], 'schnell/langsam');
  eq(lv('aus', 500), 0, 'aus');
  let s = init({ players: 2, blinds: 'schnell' });
  const rng = mulberry32(5);
  for (let h = 0; h < 13; h++) {
    s = E.applyChance(s, [...Array(52).keys()].sort(() => rng() - 0.5));
    while (s.phase === 'bet') s = mv(s, E.legalMoves(s).some((m) => m.type === 'check') ? 'check' : 'call');
  }
  eq([s.hand, s.level, s.sbAmt, s.bbAmt], [14, 1, 10, 20], 'Hand 14: Stufe 2');
  eq(E.handsToNextLevel(s), 11, 'noch 11 Hände');
});

test('Kurzer Blind: All-in mit weniger, Mitgehen kostet trotzdem den vollen Big Blind', () => {
  let s = withStacks({}, [1000, 1000, 12]);
  s = deal(s, { 0: 'AS AH', 1: 'KS KH', 2: '7C 2D' }, '3C QD 5S JC 6H');
  eq([s.bets[2], s.allin[2], s.betTo], [12, true, 20], 'BB All-in 12');
  s = mv(s, 'call');    // Knopf 20
  s = mv(s, 'call');    // SB 20
  // BB All-in → Flop mit zwei aktiven Spielern
  eq(s.street, 1, 'Flop');
  for (let i = 0; i < 6; i++) s = mv(s, 'check');
  eq(s.lastHand.pots.map((p) => [p.amount, p.winners]), [[36, [0]], [16, [0]]], 'Haupt- und Side-Pot');
  eq(s.out[2], 3, 'BB raus');
});

test('Erhöhen verboten, wenn alle anderen All-in sind; Check-Pflicht statt Aussteigen ohne Einsatz', () => {
  let s = withStacks({}, [1000, 50]);
  s = deal(s, {});
  s = mv(s, 'raise', 50);      // Knopf (0) erhöht auf 50 = SB? (Knopf = SB zu zweit) → BB 50 All-in möglich
  eq(s.turn, 1, 'BB');
  s = mv(s, 'call');           // BB All-in 50
  eq(s.phase, 'deal', 'alles ausgeteilt, Hand vorbei');
  let t = withStacks({}, [1000, 1000, 30]);
  t = deal(t, {});
  t = mv(t, 'raise', 1000);    // Knopf All-in
  t = mv(t, 'fold');           // SB raus
  eq(E.legalMoves(t).map((m) => m.type), ['fold', 'call'], 'BB (30) nur mitgehen/aussteigen');
  ok(!E.isLegal(t, { type: 'fold', extra: 1 }), 'Zusatzfeld');
  let u = deal(init({ players: 3 }), {});
  u = mv(u, 'call'); u = mv(u, 'call');
  ok(!E.isLegal(u, { type: 'fold' }), 'BB darf ohne Einsatz nicht aussteigen');
  eq(E.timeoutMove(u), { type: 'check' }, 'Zeitlimit: checken');
  u = mv(u, 'raise', 40);
  eq(E.timeoutMove(u), { type: 'fold' }, 'Zeitlimit: aussteigen');
});

test('Ungültige Züge und Müll werden abgelehnt', () => {
  const s = deal(init({ players: 3 }), {});
  for (const m of [null, 1, 'call', [], {}, { type: 'x' }, { type: 'raise' }, { type: 'raise', to: 39 }, { type: 'raise', to: 1001 },
    { type: 'raise', to: 40.5 }, { type: 'raise', to: '40' }, { type: 'check' }]) {
    ok(!E.isLegal(s, m), `abgelehnt: ${JSON.stringify(m)}`);
    let threw = false;
    try { E.applyMove(s, m); } catch { threw = true; }
    ok(threw, 'applyMove wirft');
  }
  ok(!E.isLegal({}, { type: 'call' }), 'kaputter Zustand');
  ok(E.legalMoves(null).length === 0, 'null');
});

test('Determinismus: gleiche Mischungen + gleiche Züge = gleicher Verlauf', () => {
  const run = () => {
    const rng = mulberry32(99);
    let s = init({ players: 5, blinds: 'schnell', start: 500 });
    let steps = 0;
    while (s.phase !== 'over' && steps < 20000) {
      if (E.chance(s)) {
        const p = [...Array(52).keys()];
        for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
        s = E.applyChance(s, p);
      } else {
        const lm = E.legalMoves(s);
        let m = lm[Math.floor(rng() * lm.length)];
        if (m.type === 'raise') { const r = E.raiseRange(s); m = { type: 'raise', to: r.min + Math.floor(rng() * (r.max - r.min + 1)) }; }
        s = E.applyMove(s, m);
      }
      steps++;
    }
    return s;
  };
  const a = run(), b = run();
  eq(JSON.stringify(a), JSON.stringify(b), 'gleich');
  ok(a.phase === 'over', 'Turnier zu Ende');
  return `${a.hand} Hände`;
});

test('Texte: describeMove, Kartennamen, Chips', () => {
  let s = deal(init({ players: 3 }), {});
  eq(E.describeMove(s, { type: 'call' }), 'geht mit (20)', 'call');
  eq(E.describeMove(s, { type: 'raise', to: 60 }), 'erhöht auf 60', 'raise');
  eq(E.describeMove(s, { type: 'raise', to: 1000 }), 'geht All-in (1.000)', 'allin');
  eq(E.describeMove(s, { type: 'fold' }), 'steigt aus', 'fold');
  eq(E.cardName('QH'), 'Herz-Dame', 'Karte');
  eq(E.fmtChips(12500), '12.500', 'Chips');
});

console.log(`\n${passed} ✅, ${failed} ❌`);
process.exit(failed ? 1 : 0);
