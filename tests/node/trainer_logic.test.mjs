// Schach-Trainer: Leitner-Wiederholung, Taktik-Wertung, Endspiel-Lektionen (Startstellungen, Ziel-Prüfung, Computerzüge).
// Aufruf: node tests/node/trainer_logic.test.mjs
import assert from 'node:assert/strict';
import { Chess } from '../../lib/chess.js';
import * as L from '../../src/trainer/leitner.js';
import { rate, pickNear, START, expectedScore } from '../../src/trainer/rating.js';
import { LESSONS, GROUPS, checkGoal, tbReply, tbProbe, randomFen, mateStars, helpStars, userColorOf, materialOfFen } from '../../src/trainer/lessons.js';
import { bestMove, scoreMoves, probe } from '../../src/trainer/tb.js';
import { PUZZLES } from '../../src/trainer/data/puzzles.js';
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
const D = L.DAY;

// ---------- Leitner ----------
test('Leitner: fehlerfrei gelernt → Fach 1, morgen fällig', () => {
  const c = L.learned(null, 0, 1000);
  assert.equal(c.box, 1);
  assert.equal(c.due, 1000 + D);
  assert.ok(!L.isDue(c, 1000 + D - 1));
  assert.ok(L.isDue(c, 1000 + D));
});
test('Leitner: mit Fehlern gelernt → gleich (nach 10 min) wieder fällig', () => {
  const c = L.learned(null, 2, 0);
  assert.equal(c.box, 1);
  assert.equal(c.due, L.RETRY_MS);
});
test('Leitner: richtig → Fach steigt, Pausen 1/3/7/16/35 Tage, Fach 5 bleibt', () => {
  let c = L.learned(null, 0, 0), now = 0;
  const seen = [];
  for (let i = 0; i < 6; i++) { now = c.due; c = L.review(c, 0, now); seen.push([c.box, (c.due - now) / D]); }
  assert.deepEqual(seen, [[2, 3], [3, 7], [4, 16], [5, 35], [5, 35], [5, 35]]);
});
test('Leitner: Fehler → zurück in Fach 1 (vergessene Linien kommen öfter)', () => {
  let c = { box: 4, due: 0, ok: 3, bad: 0 };
  c = L.review(c, 1, 100);
  assert.equal(c.box, 1);
  assert.equal(c.bad, 1);
  assert.equal(c.due, 100 + L.RETRY_MS);
});
test('Leitner: fällige Karten nach Überfälligkeit, dann Fach; nextDue', () => {
  const cards = { a: { box: 3, due: 50 }, b: { box: 1, due: 10 }, c: { box: 2, due: 10 }, d: { box: 1, due: 500 }, e: { box: 0, due: 0 } };
  assert.deepEqual(L.dueKeys(cards, 100), ['b', 'c', 'a']);
  assert.equal(L.nextDue(cards, 100), 500);
  assert.equal(L.cardKey('it-piano', 'w'), 'it-piano:w');
});
test('Leitner-Simulation: vergessene Linie wird öfter abgefragt als sichere', () => {
  const rng = mulberry32(7);
  let cards = { sicher: L.learned(null, 0, 0), wackelig: L.learned(null, 0, 0) };
  const asked = { sicher: 0, wackelig: 0 };
  for (let day = 1; day <= 120; day++) {
    const now = day * D;
    for (const k of L.dueKeys(cards, now)) {
      asked[k]++;
      const miss = k === 'wackelig' ? rng() < 0.5 : rng() < 0.05;
      cards = { ...cards, [k]: L.review(cards[k], miss ? 1 : 0, now) };
    }
  }
  assert.ok(asked.wackelig > 2 * asked.sicher, JSON.stringify(asked));
  return JSON.stringify(asked);
});

// ---------- Wertung ----------
test('Wertung: Sieg gegen gleich starke Aufgabe +20, Niederlage −20 (K 40), Serie zählt', () => {
  let { st, delta } = rate(null, START, true);
  assert.equal(delta, 20);
  assert.equal(st.rating, START + 20);
  assert.equal(st.streak, 1);
  ({ st } = rate(st, 1000, true));
  ({ st } = rate(st, 1000, true));
  assert.equal(st.streak, 3);
  assert.equal(st.best, 3);
  const r = rate(st, st.rating, false);
  assert.equal(r.delta, -20);
  assert.equal(r.st.streak, 0);
  assert.equal(r.st.best, 3);
});
test('Wertung: schwere Aufgabe gelöst bringt mehr als leichte, K sinkt mit Erfahrung', () => {
  assert.ok(rate({ rating: 1000, games: 0 }, 1600, true).delta > rate({ rating: 1000, games: 0 }, 700, true).delta);
  assert.ok(Math.abs(rate({ rating: 1000, games: 100 }, 1000, true).delta) < 20);
  assert.ok(Math.abs(expectedScore(1200, 1200) - 0.5) < 1e-9);
});
test('Wertung konvergiert: Spieler mit echter Stärke 1500 landet nahe 1500', () => {
  const rng = mulberry32(3);
  let st = null;
  for (let i = 0; i < 400; i++) {
    const p = pickNear(PUZZLES, st ? st.rating : START, {}, rng);
    const solved = rng() < expectedScore(1500, p[3]);
    st = rate(st, p[3], solved).st;
  }
  assert.ok(Math.abs(st.rating - 1500) < 200, String(st.rating));
  return `Wertung ${st.rating}`;
});
test('pickNear: bevorzugt ungelöste Aufgaben nahe der Wertung', () => {
  const p = pickNear(PUZZLES, 1200, {}, () => 0);
  assert.ok(Math.abs(p[3] - 1250) < 120);
  const done = Object.fromEntries(PUZZLES.filter((x) => x[0] !== 'zzz' && Math.abs(x[3] - 1250) < 300).map((x) => [x[0], 1]));
  const q = pickNear(PUZZLES, 1200, done, () => 0);
  assert.ok(!done[q[0]]);
});

// ---------- Endspiel-Lektionen ----------
test('Lektionen: Startstellungen legal, Gruppen bekannt, Texte da, mindestens 9 Lektionen', () => {
  assert.ok(LESSONS.length >= 9);
  const ids = new Set();
  for (const l of LESSONS) {
    assert.ok(!ids.has(l.id)); ids.add(l.id);
    assert.ok(GROUPS.some((g) => g.id === l.group), l.id);
    new Chess(l.fen);
    assert.ok(l.intro && l.tip && l.title, l.id);
    assert.ok(['mate', 'promote', 'hold'].includes(l.goal));
    assert.ok(['tb', 'bot'].includes(l.engine));
    if (l.goal === 'hold') assert.ok(l.holdMoves > 0);
    if (l.goal === 'mate') assert.ok(l.limit > 0);
  }
  return `${LESSONS.length} Lektionen`;
});
test('Lektionen (Tabelle): Gewinn-Lektionen sind gewonnen, Remis-Lektionen Remis, nur wenige richtige Züge', () => {
  const info = [];
  for (const l of LESSONS.filter((x) => x.engine === 'tb')) {
    const p = probe(l.fen);
    const good = scoreMoves(l.fen).filter((m) => (p.result === 'win' ? m.result === 'win' : m.result !== 'loss'));
    if (l.goal === 'hold') { assert.equal(p.result, 'draw', l.id); assert.ok(good.length <= 2, l.id); }
    else assert.equal(p.result, 'win', l.id);
    if (l.goal === 'promote') assert.equal(good.length, 1, l.id);
    info.push(`${l.id}:${good.map((m) => m.san).join('/')}`);
  }
  return info.join(' ');
});
// Lektion mit der Tabelle durchspielen: Mensch = Strategie, Computer = tbReply
function playTb(l, userMove, fen = l.fen, rng = mulberry32(1)) {
  const user = userColorOf(l);
  const c = new Chess(fen);
  let moves = 0, promoted = false, res = { done: false };
  const reps = {};
  for (let ply = 0; ply < 200 && !res.done; ply++) {
    const byUser = c.turn() === user;
    const m = byUser ? userMove(c.fen()) : tbReply(c.fen(), rng);
    const mv = c.move({ from: m.from, to: m.to, promotion: m.promo });
    if (byUser) { moves++; if (mv.promotion) promoted = true; }
    const k = c.fen().split(' ').slice(0, 4).join(' ');
    reps[k] = (reps[k] || 0) + 1;
    res = checkGoal({ lesson: l, fen: c.fen(), user, moves, promoted, lastBy: byUser ? 'user' : 'cpu', rep: reps[k] });
  }
  return { ...res, moves };
}
test('Lektionen (Tabelle): bestes Spiel erreicht jedes Ziel; K+D/K+T in optimaler Zugzahl = 3 Sterne', () => {
  const info = [];
  for (const l of LESSONS.filter((x) => x.engine === 'tb')) {
    const r = playTb(l, (f) => bestMove(f));
    assert.ok(r.done && r.ok, `${l.id}: ${JSON.stringify(r)}`);
    if (l.goal === 'mate') {
      const opt = probe(l.fen).mateIn;
      assert.equal(r.moves, opt, l.id);
      assert.equal(mateStars(l, r.moves, opt), 3);
    }
    info.push(`${l.id} ${r.moves} Züge`);
  }
  return info.join(', ');
});
test('K+D/K+T-Lektion: 50 Zufallsstellungen, Computer verteidigt maximal, Matt genau in der optimalen Zugzahl', () => {
  const rng = mulberry32(11);
  for (const id of ['kqk', 'krk']) {
    const l = LESSONS.find((x) => x.id === id);
    for (let i = 0; i < 50; i++) {
      const fen = randomFen(l, rng);
      const p = probe(fen);
      assert.equal(p.result, 'win');
      assert.ok(p.mateIn <= l.limit);
      // Computerzug = längster Widerstand
      const c = new Chess(fen);
      const um = bestMove(fen);
      c.move({ from: um.from, to: um.to, promotion: um.promo });
      if (!c.isGameOver()) {
        const cm = tbReply(c.fen(), rng);
        const all = scoreMoves(c.fen());
        const chosen = all.find((m) => m.from === cm.from && m.to === cm.to);
        assert.equal(chosen.dtm, Math.max(...all.map((m) => m.dtm)));
      }
      const r = playTb(l, (f) => bestMove(f), fen, rng);
      assert.ok(r.ok, JSON.stringify(r));
      assert.equal(r.moves, p.mateIn);
    }
  }
});
test('Lektionen (Tabelle): Fehler werden erkannt (Remis verschenkt / Remis-Stellung verdorben)', () => {
  // Opposition: 1.e3? statt 1.Ke4 → Remis → nicht bestanden
  const opp = LESSONS.find((l) => l.id === 'opposition');
  let first = true;
  const r1 = playTb(opp, (f) => { if (first) { first = false; return { from: 'e2', to: 'e3' }; } return bestMove(f); });
  assert.equal(r1.ok, false);
  assert.ok(r1.mistake);
  // Opposition halten: 1…Kd6? (statt Ke5) → Weiß gewinnt → nicht bestanden
  const hold = LESSONS.find((l) => l.id === 'opp-halten');
  first = true;
  const r2 = playTb(hold, (f) => { if (first) { first = false; return { from: 'd5', to: 'c4' }; } return bestMove(f); });
  assert.equal(r2.ok, false);
  // K+D: Patt ist kein Erfolg
  const kqk = LESSONS.find((l) => l.id === 'kqk');
  const r3 = checkGoal({ lesson: kqk, fen: 'k7/2Q5/1K6/8/8/8/8/8 b - - 0 1', user: 'w', moves: 5, promoted: false, lastBy: 'user', rep: 1 });
  assert.deepEqual([r3.done, r3.ok], [true, false]);
  // K+D: Dame eingestellt
  const r4 = checkGoal({ lesson: kqk, fen: '8/8/8/8/8/2k5/8/K7 w - - 0 1', user: 'w', moves: 5, promoted: false, lastBy: 'cpu', rep: 1 });
  assert.deepEqual([r4.done, r4.ok], [true, false]);
});
test('Remis-Lektionen: Computer stellt Fallen, verliert aber nie den Bauern freiwillig', () => {
  for (const l of LESSONS.filter((x) => x.goal === 'hold' && x.engine === 'tb')) {
    const user = userColorOf(l);
    const c = new Chess(l.fen);
    const um = bestMove(l.fen);
    c.move({ from: um.from, to: um.to, promotion: um.promo });
    const cm = tbReply(c.fen(), () => 0.3);
    const c2 = new Chess(c.fen());
    c2.move({ from: cm.from, to: cm.to, promotion: cm.promo });
    assert.equal(materialOfFen(c2.fen())[user === 'w' ? 'bp' : 'wp'], 1, l.id);
    assert.equal(tbProbe(c2.fen()).result, 'draw', l.id);
  }
});
test('Bot-Lektionen: Ziel-Prüfung Durchbruch/Lucena/Philidor', () => {
  const d = LESSONS.find((l) => l.id === 'durchbruch');
  // Hauptlinie 1.b6 axb6 2.c6 bxc6 3.a6 … a8=D
  const c = new Chess(d.fen);
  for (const m of ['b6', 'axb6', 'c6', 'bxc6', 'a6', 'Kf7', 'a7', 'Ke7', 'a8=Q']) c.move(m);
  const ok = checkGoal({ lesson: d, fen: c.fen(), user: 'w', moves: 5, promoted: true, lastBy: 'user', rep: 1 });
  assert.deepEqual([ok.done, ok.ok], [true, true]);
  const bad = checkGoal({ lesson: d, fen: '6k1/8/8/8/8/8/8/6K1 w - - 0 1', user: 'w', moves: 5, promoted: false, lastBy: 'cpu', rep: 1 });
  assert.deepEqual([bad.done, bad.ok], [true, false]);
  const lu = LESSONS.find((l) => l.id === 'lucena');
  const won = checkGoal({ lesson: lu, fen: '1Q6/8/2K5/4k3/8/8/r7/3R4 b - - 0 1', user: 'w', moves: 9, promoted: true, lastBy: 'user', rep: 1 });
  assert.deepEqual([won.done, won.ok], [true, true]);
  const ph = LESSONS.find((l) => l.id === 'philidor');
  const held = checkGoal({ lesson: ph, fen: '4k3/R7/7r/3K4/8/8/8/8 w - - 0 1', user: 'b', moves: 4, promoted: false, lastBy: 'user', rep: 1 });
  assert.deepEqual([held.done, held.ok], [true, true]);
  const lost = checkGoal({ lesson: ph, fen: '4Q3/8/3k4/8/3K4/8/8/7r b - - 0 1', user: 'b', moves: 8, promoted: false, lastBy: 'cpu', rep: 1 });
  assert.deepEqual([lost.done, lost.ok], [true, false]);
  const going = checkGoal({ lesson: ph, fen: '4k3/R7/7r/3KP3/8/8/8/8 w - - 0 1', user: 'b', moves: 1, promoted: false, lastBy: 'user', rep: 1 });
  assert.equal(going.done, false);
  const enough = checkGoal({ lesson: ph, fen: '4k3/R7/7r/3KP3/8/8/8/8 b - - 0 1', user: 'b', moves: 20, promoted: false, lastBy: 'cpu', rep: 1 });
  assert.deepEqual([enough.done, enough.ok], [true, true]);
});
test('Sterne: Zugzahl und Tipps', () => {
  const kqk = LESSONS.find((l) => l.id === 'kqk');
  assert.equal(mateStars(kqk, 9, 7), 3);
  assert.equal(mateStars(kqk, 15, 7), 2);
  assert.equal(mateStars(kqk, 19, 7), 1);
  assert.equal(mateStars(kqk, 21, 7), 0);
  const kb = LESSONS.find((l) => l.id === 'kbbk');
  assert.equal(mateStars(kb, 22, 0), 3);
  assert.equal(mateStars(kb, 31, 0), 1);
  assert.deepEqual([helpStars(0), helpStars(1), helpStars(4)], [3, 2, 1]);
});

console.log(`\n${passed} bestanden, ${failed} fehlgeschlagen (${((performance.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(failed ? 1 : 0);
