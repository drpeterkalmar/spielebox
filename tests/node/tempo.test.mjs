// Computer-Tempo (src/tempo.js): Denkzeit je Stufe, Dauer der Zug-Animationen (Schrittfolge), Denkzeit am Tisch,
// Ereignisse für Banner/Liste (src/events.js).
// Aufruf: node tests/node/tempo.test.mjs
import assert from 'node:assert/strict';
import { TEMPO, OWN, LEVELS, DEFAULT_LEVEL, params, thinkMs, animMs, botDelay, bankReveal, trickDone, levelFrom } from '../../src/tempo.js';
import { moveEvents } from '../../src/events.js';
import { TableSession, newTable, TIMING } from '../../src/net/table.js';
import * as muehleBot from '../../src/games/muehle/bot.js';
import * as SN from '../../src/games/schnapsen/engine.js';
import * as SCH from '../../src/games/schach/engine.js';
import * as BG from '../../src/games/backgammon/engine.js';

let fails = 0, passed = 0;
async function ok(name, fn) {
  try { const info = await fn(); passed++; console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}

await ok('Stufen: gemütlich ist Standard, Werte wie bestellt (1,5 s / 0,9 s / 0,45 s), Test = 0', () => {
  assert.deepEqual(LEVELS, ['gemuetlich', 'normal', 'flott']);
  assert.equal(DEFAULT_LEVEL, 'gemuetlich');
  assert.equal(levelFrom(undefined), 'gemuetlich');
  assert.equal(levelFrom('flott'), 'flott');
  assert.equal(levelFrom('quatsch'), 'gemuetlich');
  assert.equal(TEMPO.gemuetlich.think, 1500);
  assert.equal(TEMPO.normal.think, 900);
  assert.equal(TEMPO.flott.think, 450);
  for (const k of Object.keys(TEMPO.test)) if (k !== 'banner') assert.equal(TEMPO.test[k], 0, k);
  assert.ok(TEMPO.gemuetlich.banner >= 4000, 'Banner gemütlich ≥ 4 s');
  assert.ok(TEMPO.gemuetlich.trickHold >= 2000, 'Stich bleibt ≥ 2 s liegen');
  assert.ok(TEMPO.gemuetlich.slide >= 500 && TEMPO.gemuetlich.slide <= 700, 'Gleiten 0,5–0,7 s');
  assert.ok(Math.abs(TEMPO.gemuetlich.pause - 600) <= 100, 'Pause ≈ 0,6 s');
  assert.ok(Math.abs(TEMPO.gemuetlich.bankGap - 1000) <= 100, 'Bank ≈ 1 s je Karte');
});

await ok('Denkzeit: gemütlich 1,5–2,0 s leicht zufällig, normal ≈ 0,9 s, flott 0,45 s, test 0', () => {
  assert.equal(thinkMs('gemuetlich', () => 0), 1500);
  assert.equal(thinkMs('gemuetlich', () => 0.999), 2000);
  const seen = new Set();
  for (let i = 0; i < 200; i++) { const t = thinkMs('gemuetlich'); assert.ok(t >= 1500 && t <= 2000); seen.add(t); }
  assert.ok(seen.size > 20, 'streut');
  assert.ok(thinkMs('normal', () => 0) === 900 && thinkMs('normal', () => 0.99) <= 1050);
  assert.equal(thinkMs('flott', () => 0.7), 450);
  assert.equal(thinkMs('test', () => 0.7), 0);
});

await ok('Eigene Züge kurz, fremde im eingestellten Tempo', () => {
  assert.equal(params('gemuetlich').slide, 600);
  assert.equal(params('gemuetlich', true).slide, OWN.slide);
  assert.equal(params('gemuetlich', true).own, true);
  assert.equal(params('test', true).slide, 0);
});

await ok('Schrittfolge: Dame-/Halma-Kette Station für Station, Backgammon erst Würfeln dann je Teilzug, Mühle erst Setzen dann Schlagen', () => {
  const a = params('gemuetlich');
  // Dame: 3 Sprünge = 3 × Sprung + 2 × Pause (+ Ausblenden des letzten Steins)
  const dame3 = { from: 40, path: [22, 4, 26], cap: [31, 13, 15] };
  assert.equal(animMs('dame', dame3, null, {}, a), 3 * a.hop + 2 * a.pause + a.fade / 2);
  assert.equal(animMs('dame', { from: 40, path: [33], cap: [] }, null, {}, a), a.slide);
  assert.ok(animMs('dame', dame3, null, {}, a) >= 2500, 'Kette dauert sichtbar');
  // Halma: Sprungkette 4 Stationen
  assert.equal(animMs('halma', { from: 1, path: [2, 3, 4, 5] }, null, {}, a), 4 * a.hop + 3 * a.pause);
  // Backgammon: Würfeln, dann 4 Teilzüge (Pasch) mit Pausen; eigene Teilzüge nicht nochmal
  assert.equal(animMs('backgammon', { type: 'roll' }, null, {}, a), a.dice);
  const pasch = { type: 'play', steps: [{ from: 13, to: 9 }, { from: 13, to: 9 }, { from: 6, to: 2 }, { from: 6, to: 2 }] };
  assert.equal(animMs('backgammon', pasch, null, {}, a), 4 * a.slide + 3 * a.pause);
  assert.equal(animMs('backgammon', pasch, null, {}, params('gemuetlich', true)), 0);
  // Mühle: Setzen, Pause, Schlagen
  assert.equal(animMs('muehle', { to: 3, remove: 9 }, null, {}, a), a.slide + a.pause + a.fade);
  assert.equal(animMs('muehle', { from: 1, to: 2 }, null, {}, a), a.slide);
  // Schach, Schnapsen-Karte
  assert.equal(animMs('schach', { from: 'e2', to: 'e4' }, null, {}, a), a.slide);
  assert.equal(animMs('schnapsen', { type: 'play', card: 'HA' }, null, {}, a), a.slide);
  assert.equal(animMs('schnapsen', { type: 'ansagen', suit: 'H' }, null, {}, a), 0);
  // Test-Tempo: nichts dauert
  for (const [g, m] of [['dame', dame3], ['backgammon', pasch], ['muehle', { to: 3, remove: 9 }]]) assert.equal(animMs(g, m, null, {}, params('test')), 0);
});

await ok('Blackjack-Bank: Karte für Karte (≈ 1 s Abstand), nur wenn die Runde gerade endet', () => {
  const a = params('gemuetlich');
  const prev = { phase: 'play', lastRound: { round: 2, bankCards: ['TS', '6H'] } };
  const gs = { phase: 'bet', lastRound: { round: 3, bankCards: ['TS', '6H', '3C', 'KD'], bankTotal: 29, bankBust: true } };
  assert.equal(bankReveal(prev, gs), 3);                        // Loch-Karte + 2 gezogene
  assert.equal(animMs('blackjack', { type: 'stand' }, prev, gs, a), a.slide + 3 * a.bankGap + a.pause);
  assert.equal(bankReveal(gs, gs), 0);                          // gleiche Runde: nichts Neues
  assert.equal(bankReveal(null, gs, { type: 'stand' }), 3);     // ohne Vorstand: Spielzug → Runde zu Ende
  assert.equal(bankReveal(null, gs, { type: 'bet', amount: 5 }), 0);
  assert.equal(animMs('blackjack', { type: 'hit' }, { phase: 'play', lastRound: gs.lastRound }, { phase: 'play', lastRound: gs.lastRound }, a), a.slide);
});

await ok('Denkzeit am Tisch: erst vorigen Zug ausspielen, fertiger Stich bleibt ≥ 2 s liegen', () => {
  const r0 = { rand: () => 0 };
  const stich = { game: 'schnapsen', last: { m: { type: 'play', card: 'HA' }, by: 0 }, gs: { trick: [], lastTrick: { cards: [], winner: 1 } } };
  assert.ok(trickDone('schnapsen', stich.last.m, stich.gs));
  // gemütlich: Karte fliegt (0,6 s) + Stich liegt (2 s ≥ Denkzeit 1,5 s)
  assert.equal(botDelay(stich, 'gemuetlich', r0), TEMPO.gemuetlich.slide + TEMPO.gemuetlich.trickHold);
  // eigener Zug: kurzer Flug
  assert.equal(botDelay(stich, 'gemuetlich', { ...r0, isLocal: () => true }), OWN.slide + TEMPO.gemuetlich.trickHold);
  // ausgespielt, Stich noch offen: nur Denkzeit
  const half = { game: 'schnapsen', last: { m: { type: 'play', card: 'HA' }, by: 0 }, gs: { trick: [{ seat: 0, card: 'HA' }], lastTrick: null } };
  assert.equal(botDelay(half, 'gemuetlich', r0), TEMPO.gemuetlich.slide + 1500);
  assert.equal(botDelay(half, 'flott', r0), TEMPO.flott.slide + 450);
  assert.equal(botDelay(stich, 'test', r0), 0);
  assert.equal(botDelay({ game: 'muehle', last: null, gs: {} }, 'normal', r0), 900);
  // Backgammon: nach dem eigenen Wurf des Computers erst die Würfel ausrollen lassen
  assert.equal(botDelay({ game: 'backgammon', last: { m: { type: 'roll' }, by: 1 }, gs: {} }, 'gemuetlich', r0), TEMPO.gemuetlich.dice + 1500);
});

await ok('TableSession mit Tempo: Computer wartet Animation + Denkzeit (Uhr des Tischs), Test-Tempo ohne Wartezeit', async () => {
  for (const [level, want] of [['gemuetlich', OWN.slide + 1500], ['flott', OWN.slide + 450], ['test', 0]]) {
    const table = newTable({ game: 'muehle', host: { pid: 'me', name: 'Ich' } });
    table.seats[1] = { pid: 'bot', name: 'Computer', bot: 1 };
    table.status = 'play';
    const waits = [];
    const timers = { setTimeout: (fn, ms) => { waits.push(ms); return setTimeout(fn, 0); }, clearTimeout, setInterval, clearInterval };
    const s = new TableSession({ mode: 'bot', me: { pid: 'me', name: 'Ich' }, table, timers, save: () => {},
      bot: { choose: async (g, gs, lv) => muehleBot.chooseMove(gs, { level: lv, timeMs: 10 }) } });
    s.botDelayFor = (t) => botDelay(t, level, { rand: () => 0, isLocal: (by) => by === 0 });
    s.start();
    const m = s.engine.legalMoves(s.table.gs)[0];
    assert.ok(s.submitMove(m).ok);
    for (let i = 0; i < 200 && s.table.nmoves < 2; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(s.table.nmoves, 2, 'Computer hat gezogen');
    assert.equal(waits.length, 1);
    assert.ok(waits[0] <= want && waits[0] >= want - 60, `${level}: ${waits[0]} ms statt ~${want}`);
    s.close();
  }
  assert.equal(TIMING.botDelay >= 0, true);
});

// ---------- Ereignisse ----------
const names = (s) => ['Anna', 'Computer'][s];
const youIs0 = (s) => s === 0;

await ok('Ereignisse Schnapsen: Ansage, Zudrehen, Tauschen des Computers, Stich, Spielende', () => {
  const perm = ['HK', 'HO', 'SA', 'EU', 'EO', 'HU', 'SZ', 'LA', 'LZ', 'EK', 'HZ', 'SU', 'SK', 'EZ', 'EA', 'LK', 'LO', 'LU', 'SO', 'HA'].map((c) => SN.DECK.indexOf(c));
  // Teiler = 1 (Computer) → Vorhand 0: HK HO SA, Teiler HU SZ LA, Atout = LZ …
  let s = SN.applyChance(SN.initialState(), perm);
  const ev = (move, by, prev, gs) => moveEvents({ game: 'schnapsen', move, by, prevGs: prev, gs, name: names, you: youIs0 });
  const an = ev({ type: 'ansagen', suit: 'H' }, 1, s, s);
  assert.equal(an[0].text, 'Computer sagt 20 an (Herz)');
  assert.equal(an[0].big, true);
  assert.equal(ev({ type: 'ansagen', suit: 'H' }, 0, s, s)[0].text, 'Du sagst 20 an (Herz)');
  assert.equal(ev({ type: 'zudrehen' }, 1, s, s)[0].text, 'Computer dreht zu');
  assert.equal(ev({ type: 'tauschen' }, 1, s, s)[0].text, 'Computer tauscht den Atout-Unter');
  // ein Stich: Vorhand spielt, Teiler gibt zu
  const lead = SN.legalMoves(s).find((m) => m.type === 'play');
  const s1 = SN.applyMove(s, lead);
  const follow = SN.legalMoves(s1).find((m) => m.type === 'play');
  const s2 = SN.applyMove(s1, follow);
  const st = ev(follow, 1, s1, s2);
  assert.equal(st.length, 1);
  assert.match(st[0].text, /^(Dein Stich|Stich für Computer) \(/);
  assert.equal(st[0].big, false);
});

await ok('Ereignisse Schach, Mühle, Backgammon, Blackjack, Dame', () => {
  let g = SCH.initialState();
  for (const [from, to] of [['e2', 'e4'], ['f7', 'f6'], ['d1', 'h5']]) {
    const prev = g;
    g = SCH.applyMove(g, { from, to });
    if (to === 'h5') {
      const e = moveEvents({ game: 'schach', move: { from, to }, by: 0, prevGs: prev, gs: g, d: SCH.describeMove(prev, { from, to }), name: (s) => ['Computer', 'Anna'][s], you: (s) => s === 1 });
      assert.equal(e[0].text, 'Schach! Dein König wird angegriffen');
      assert.equal(e[0].big, true);
    }
  }
  assert.equal(moveEvents({ game: 'muehle', move: { to: 4, remove: 9 }, by: 1, gs: {}, name: names, you: youIs0 })[0].text, 'Mühle – Computer nimmt einen Stein');
  assert.equal(moveEvents({ game: 'muehle', move: { to: 4, remove: 9 }, by: 0, gs: {}, name: names, you: youIs0 })[0].text, 'Mühle – du nimmst einen Stein');
  assert.equal(moveEvents({ game: 'muehle', move: { to: 4 }, by: 1, gs: {}, name: names, you: youIs0 }).length, 0);
  const bgp = moveEvents({ game: 'backgammon', move: { type: 'roll' }, by: 1, prevGs: { phase: 'roll' }, gs: { dice: [4, 4] }, name: names, you: youIs0 });
  assert.equal(bgp[0].text, 'Pasch! Computer würfelt 4 × 4');
  assert.equal(bgp[0].big, true);
  assert.equal(moveEvents({ game: 'backgammon', move: { type: 'roll' }, by: 1, gs: { dice: [3, 5] }, name: names, you: youIs0 })[0].big, false);
  // Backgammon: Computer schlägt einen Stein auf die Bar
  const bg = BG.setup({ w: { 14: 1, 6: 5 }, b: { 13: 2 }, turn: 1, dice: [3, 1] });
  const hit = BG.legalMoves(bg).find((m) => m.type === 'play' && BG.applySteps(bg, m.steps).hits);
  assert.ok(hit, 'Schlagzug vorhanden');
  assert.match(moveEvents({ game: 'backgammon', move: hit, by: 1, prevGs: bg, gs: BG.applyMove(bg, hit), name: names, you: youIs0 }).map((e) => e.text).join('|'), /Computer schlägt einen Stein auf die Bar/);
  const bj = moveEvents({ game: 'blackjack', move: { type: 'stand' }, by: 0, prevGs: { lastRound: { round: 1 } },
    gs: { phase: 'bet', lastRound: { round: 2, bank: 1, bankCards: ['TS', '6H', '6C'], bankTotal: 22, bankBust: true, hands: [[{}], []], delta: [5, -5] } }, name: names, you: youIs0 });
  assert.equal(bj[0].text, 'Bank hat 22 – überkauft – du gewinnst 5');
  assert.equal(bj[0].seat, 1);
  assert.equal(moveEvents({ game: 'dame', move: { from: 1, path: [2, 3], cap: [7, 8] }, by: 1, prevGs: { board: [0, -1, 0, 0] }, gs: { board: [0, 0, 0, -1] }, name: names, you: youIs0 })[0].text, 'Computer schlägt 2 Steine');
  // Ereignisse stören nie: kaputte Eingaben → leere Liste
  assert.deepEqual(moveEvents({ game: 'schach', move: { from: 'x' }, by: 0, gs: { fen: 'kaputt' } }), []);
});

console.log(fails ? `\n${fails} Tempo-Test(s) rot` : `\nTempo-Tests: ${passed} grün`);
process.exitCode = fails ? 1 : 0;
