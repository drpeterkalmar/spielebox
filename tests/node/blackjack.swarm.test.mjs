// Schwarmtest Blackjack: 10 000 ganze Partien (2–6 Sitze, mit/ohne wechselBJ) mit Zufalls- und Bot-Zügen
// (mulberry32). Invarianten nach JEDEM Schritt: Bohnen-Summe exakt erhalten, nie negativ, Deckung der Bank reicht,
// Schuh + im Spiel + abgelegt = 104 (genau die Karten des Schuhs; jede 5. Partie mit künstlich knappem Schuh, damit
// die Ablage auch mitten in der Runde gemischt wird), Zufall ⇒ niemand am Zug, Sicht verrät weder
// Schuh noch Loch-Karte; illegale Züge werden abgelehnt; jede Partie endet (höchstens players × 5 Runden).
// Ein Thread, Laufzeit ca. 10–30 s. Aufruf: node tests/node/blackjack.swarm.test.mjs [seed] [--games=10000]
import * as B from '../../src/games/blackjack/engine.js';
import { chooseMove } from '../../src/games/blackjack/bot.js';
import { mulberry32 } from '../../src/rng.js';

const args = process.argv.slice(2);
const SEED = Number(args.find(a => /^\d+$/.test(a)) || 20260929);
const GAMES = Number((args.find(a => a.startsWith('--games=')) || '--games=10000').split('=')[1]);
const DUEL = 5000;

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} – ${((performance.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}
const fail = msg => { throw new Error(msg); };
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
function shuffled(rng, n) {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

const SHOE_COUNT = {};
for (const c of B.SHOE) SHOE_COUNT[c] = (SHOE_COUNT[c] || 0) + 1;

function check(s, ctx, total) {
  const n = s.opts.players;
  let sum = 0;
  for (const b of s.beans) {
    if (!(b >= 0)) fail(`${ctx}: Bohnen negativ ${s.beans}`);
    if (b * 2 !== Math.round(b * 2)) fail(`${ctx}: Bohnen keine halben ${s.beans}`);
    sum += b;
  }
  if (sum !== total) fail(`${ctx}: Bohnen-Summe ${sum} ≠ ${total}`);
  if (s.phase !== 'over' && B.exposure(s) > s.beans[s.bank]) fail(`${ctx}: Deckung ${B.exposure(s)} > Bank ${s.beans[s.bank]}`);
  const cnt = {};
  let k = 0;
  const add = c => { cnt[c] = (cnt[c] || 0) + 1; k++; };
  s.shoe.forEach(add);
  s.discard.forEach(add);
  s.bankCards.forEach(add);
  for (const hs of s.hands) for (const h of hs) h.cards.forEach(add);
  if (k === 0 && s.round === 0 && s.shuffle === 'new') return;   // vor dem ersten Mischen liegt nichts auf dem Tisch
  if (k !== 104) fail(`${ctx}: ${k} Karten statt 104`);
  for (const c in cnt) if (cnt[c] !== SHOE_COUNT[c]) fail(`${ctx}: Karte ${c} ${cnt[c]}×`);
  if (B.chance(s) && B.currentPlayer(s) !== null) fail(`${ctx}: Zufall offen, aber Spieler am Zug`);
  if (s.phase === 'play' && !B.chance(s) && B.currentPlayer(s) === null) fail(`${ctx}: niemand am Zug`);
  if (s.round > n * 5) fail(`${ctx}: zu viele Runden`);
  if (s.bank < 0 || s.bank >= n || s.bets[s.bank] !== 0 || s.hands[s.bank].length) fail(`${ctx}: Bank spielt mit`);
}

// Illegale Züge müssen abgelehnt werden
function probeIllegal(s, rng, ctx) {
  const legal = B.legalMoves(s);
  const keys = new Set(legal.map(m => JSON.stringify(m)));
  const cands = [{ type: 'hit' }, { type: 'stand' }, { type: 'double' }, { type: 'split' },
    { type: 'bet', amount: Math.floor(rng() * 60) - 5 }, { type: 'bet', amount: 51 }, { type: 'bet', amount: 2.5 },
    { type: 'weiter' }, { type: 'hit', x: 1 }, null, 'hit'];
  const m = pick(rng, cands);
  if (keys.has(JSON.stringify(m))) return;
  if (B.isLegal(s, m)) fail(`${ctx}: illegaler Zug erlaubt ${JSON.stringify(m)}`);
  let threw = false;
  try { B.applyMove(s, m); } catch { threw = true; }
  if (!threw) fail(`${ctx}: applyMove nahm ${JSON.stringify(m)} an`);
}

function playGame(g, stats) {
  const rng = mulberry32((SEED ^ Math.imul(g + 1, 0x9e3779b1)) >>> 0);
  const players = 2 + (g % 5), wechselBJ = g % 3 === 0;
  const start = g % 7 === 0 ? 20 : 100;   // wenig Bohnen → mehr Pleiten, Bank-Weitergabe
  const kinds = Array.from({ length: players }, () => pick(rng, ['zufall', 'zufall', 1, 2, 3]));
  const total = players * start;
  let s = B.initialState({ players, wechselBJ, start });
  const stress = g % 5 === 4;   // jede 5. Partie mit knappem Schuh
  const deep = g < 500;   // Sicht-Vergleich bei den ersten 500 Partien in jedem Schritt
  let steps = 0;
  while (!B.result(s)) {
    if (++steps > 5000) fail(`Partie ${g}: endet nicht`);
    const ctx = `Partie ${g} Schritt ${steps}`;
    check(s, ctx, total);
    const c = B.chance(s);
    if (c) {
      if (c.kind !== 'shuffle') fail(`${ctx}: chance ${JSON.stringify(c)}`);
      if (c.n === 104) stats.shuffles++; else stats.midShuffles++;
      s = B.applyChance(s, shuffled(rng, c.n));
      continue;
    }
    if (stress && s.phase === 'bet' && rng() < 0.3) {
      // Knapper Schuh (Test-Eingriff, Kartenzahl bleibt 104): reicht fürs Austeilen, aber kaum für mehr →
      // die Ablage muss mitten in der Runde gemischt werden
      const L = Math.min(s.shoe.length, 2 * players + 2 + Math.floor(rng() * 6));
      s = { ...s, shoe: s.shoe.slice(0, L), discard: [...s.discard, ...s.shoe.slice(L)] };
    }
    const p = B.currentPlayer(s), v = B.viewFor(s, p);
    if (v.shoe.some(x => x !== null)) fail(`${ctx}: Schuh sichtbar`);
    if (!s.holeOpen && s.bankCards.length && v.bankCards[1] !== null) fail(`${ctx}: Loch-Karte sichtbar`);
    const legal = B.legalMoves(v);
    if (!legal.length) fail(`${ctx}: keine Züge`);
    if (deep && JSON.stringify(legal) !== JSON.stringify(B.legalMoves(s))) fail(`${ctx}: Sicht ≠ Zustand`);
    if (rng() < 0.2) probeIllegal(s, rng, ctx);
    const kind = kinds[p];
    const m = kind === 'zufall' ? pick(rng, legal) : chooseMove(v, { level: kind, rng });
    if (!B.isLegal(v, m) || !B.isLegal(s, m)) fail(`${ctx}: Bot-Zug illegal ${JSON.stringify(m)}`);
    stats[m.type] = (stats[m.type] || 0) + 1;
    s = B.applyMove(s, m);
  }
  check(s, `Partie ${g} Ende`, total);
  const r = B.result(s), best = Math.max(...s.beans);
  if (r.winner !== null && s.beans[r.winner] !== best) fail(`Partie ${g}: Sieger hat nicht die meisten Bohnen`);
  if (r.winner === null && s.beans.filter(b => b === best).length < 2) fail(`Partie ${g}: Gleichstand falsch`);
  if (s.round < players * 5) stats.early++;
  stats.rounds += s.round;
  stats.moves += steps;
  if (s.beans.some(b => b !== Math.floor(b))) stats.halves++;
}

test(`${GAMES} ganze Partien (2–6 Sitze, Zufall + Bot 1–3), Invarianten nach jedem Schritt`, () => {
  const stats = { shuffles: 0, midShuffles: 0, early: 0, rounds: 0, moves: 0, halves: 0 };
  for (let g = 0; g < GAMES; g++) playGame(g, stats);
  if (!stats.split || !stats.double || !stats.midShuffles || !stats.early) fail(`zu wenig Abdeckung ${JSON.stringify(stats)}`);
  return `${stats.rounds} Runden, ${stats.moves} Schritte, ${stats.shuffles} Mischungen, ${stats.midShuffles} × Ablage ` +
    `gemischt, ${stats.early} vorzeitig beendet, ${stats.halves} mit halben Bohnen, ${stats.split} × geteilt, ` +
    `${stats.double} × verdoppelt`;
});

test(`Bot Stufe 2 (Basic Strategy) verliert weniger als Stufe 1 (${DUEL} Partien, 2 Sitze, je 10 Runden)`, () => {
  // Beide Stufen spielen gegen dieselbe automatische Bank; gemessen: Bohnen-Änderung je gesetzter Bohne
  const res = {};
  for (const level of [1, 2]) {
    let won = 0, staked = 0;
    for (let g = 0; g < DUEL; g++) {
      const rng = mulberry32(SEED + 7 * g + 1);
      let s = B.initialState({ players: 2, start: 1000 }), last = 0;
      while (!B.result(s)) {
        const c = B.chance(s);
        if (c) { s = B.applyChance(s, shuffled(rng, c.n)); continue; }
        const p = B.currentPlayer(s);
        s = B.applyMove(s, s.phase === 'bet' ? { type: 'bet', amount: 10 } : chooseMove(B.viewFor(s, p), { level, rng }));
        if (s.round !== last) {
          last = s.round;
          const lr = s.lastRound, bank = lr.bank;
          for (let q = 0; q < 2; q++) if (q !== bank) {
            won += lr.delta[q];
            staked += 10;
          }
        }
      }
    }
    res[level] = won / staked;
  }
  if (!(res[2] > res[1])) fail(`Stufe 2 ${res[2]} nicht besser als Stufe 1 ${res[1]}`);
  if (!(res[2] > -0.03)) fail(`Stufe 2 verliert zu viel: ${res[2]}`);
  return `Ertrag je Bohne: Stufe 1 ${(100 * res[1]).toFixed(1)} %, Stufe 2 ${(100 * res[2]).toFixed(1)} %`;
});

console.log(`\n${passed} ✅, ${failed} ❌ – ${((performance.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
