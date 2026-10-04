// Selbstspiel der Hold'em-Computer: Stufen-Vergleich mit Chips/100 Hände und 95-%-Konfidenz.
// Duplicate-Verfahren (weniger Glück im Ergebnis): Jede Mischung wird so oft gespielt, wie Plätze am Tisch sind,
// jedes Mal mit um einen Platz weitergedrehter Sitzordnung – jede Stufe bekommt also dieselben Karten auf jedem Platz.
// Jede Hand beginnt mit 100 Big Blinds (10/20, Stack 2000) wie im Cash Game; gezählt wird das Chip-Ergebnis je Hand.
// Prüft nebenbei: jeder Zug legal (gegen den vollen Zustand), keine Hand hängt (Schrittgrenze).
// Aufruf: node tools/holdem_selfplay.mjs [--hu=1,3] [--hands=10000] [--table=1,2,3,1,2,3] [--workers=6] [--seed=1]
//   --hu=a,b       Heads-up Stufe a gegen b; --table=… Sitzordnung eines Tischs (Stufen); Hände = Hände je Stufe/Platz
// Ausgabe: JSON-Zeile + Klartext.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as E from '../src/games/holdem/engine.js';
import { chooseMove } from '../src/games/holdem/bot.js';
import { mulberry32 } from '../src/rng.js';

const STACK = 2000;

function shuffled(rng) {
  const p = [...Array(52).keys()];
  for (let i = 51; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

// eine Hand spielen; levels[seat]; liefert delta je Sitz
function playHand(levels, perm, rng, iters) {
  const n = levels.length;
  let s = E.initialState({ players: n, start: STACK, blinds: 'aus' });
  // Statistik über die Hände hinweg mitgeben (Gegner-Tendenzen), wird vom Aufrufer gesetzt
  if (playHand.stats) s.stats = playHand.stats.map((x) => ({ ...x }));
  s = E.applyChance(s, perm);
  let steps = 0;
  while (s.phase === 'bet') {
    const seat = s.turn;
    const view = E.viewFor(s, seat);
    const m = chooseMove(view, { level: levels[seat], rng, iters: iters[levels[seat]] });
    if (!E.isLegal(s, m)) throw new Error(`ungültiger Zug Stufe ${levels[seat]}: ${JSON.stringify(m)}`);
    s = E.applyMove(s, m);
    if (++steps > 400) throw new Error('Hand hängt');
  }
  playHand.stats = s.stats;
  return s.lastHand.delta;
}

function runChunk({ arrangement, from, to, seed, iters }) {
  const n = arrangement.length;
  const levels = [...new Set(arrangement)];
  const perDeck = [];   // je Mischung: Summe je Stufe (über alle Drehungen)
  let hands = 0;
  // getrennte Statistik je Drehung (die Sitzordnung ist ja eine andere Partie)
  const statsByRot = Array.from({ length: n }, () => null);
  for (let d = from; d < to; d++) {
    const deckRng = mulberry32(seed * 1000003 + d);
    const perm = shuffled(deckRng);
    const res = Object.fromEntries(levels.map((l) => [l, 0]));
    for (let r = 0; r < n; r++) {
      const lv = arrangement.map((_, i) => arrangement[(i + r) % n]);
      playHand.stats = statsByRot[r];
      const delta = playHand(lv, perm, mulberry32(seed * 7919 + d * 31 + r), iters);
      statsByRot[r] = playHand.stats;
      // Statistik nicht unendlich wachsen lassen: nach 300 Händen halbieren (neuere Hände zählen mehr)
      if (statsByRot[r][0].h > 300) statsByRot[r] = statsByRot[r].map((x) => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, Math.round(v / 2)])));
      delta.forEach((x, seat) => { res[lv[seat]] += x; });
      hands++;
    }
    perDeck.push(res);
  }
  return { perDeck, hands };
}

if (!isMainThread) {
  parentPort.postMessage(runChunk(workerData));
} else {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
  const hu = arg('hu', null), table = arg('table', null);
  const arrangement = (table || hu || '3,2').split(',').map(Number);
  const handsWanted = Number(arg('hands', 10000));
  const workers = Number(arg('workers', Math.max(1, Math.min(6, cpus().length - 2))));
  const seed = Number(arg('seed', 1));
  const iters = { 1: 0, 2: Number(arg('it2', 600)), 3: Number(arg('it3', 900)) };
  const n = arrangement.length;
  const decks = Math.ceil(handsWanted / n);
  const t0 = Date.now();
  const per = Math.ceil(decks / workers);
  const jobs = [];
  for (let w = 0; w < workers; w++) {
    const from = w * per, to = Math.min(decks, from + per);
    if (from >= to) break;
    jobs.push(new Promise((res, rej) => {
      const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { arrangement, from, to, seed, iters } });
      wk.on('message', res); wk.on('error', rej);
    }));
  }
  const parts = await Promise.all(jobs);
  const perDeck = parts.flatMap((p) => p.perDeck);
  const hands = parts.reduce((a, p) => a + p.hands, 0);
  const levels = [...new Set(arrangement)];
  const copies = (l) => arrangement.filter((x) => x === l).length;   // Plätze mit dieser Stufe
  const out = { arrangement, hands, decks: perDeck.length, seconds: Math.round((Date.now() - t0) / 100) / 10, levels: {} };
  for (const l of levels) {
    // Ergebnis je Mischung und Platz dieser Stufe: Summe / (Drehungen × Plätze dieser Stufe) = Chips je Hand und Platz
    const xs = perDeck.map((r) => r[l] / (n * copies(l)));
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
    const se = sd / Math.sqrt(xs.length);
    out.levels[l] = { chipsPer100: Math.round(mean * 100), ci95: Math.round(1.96 * se * 100), bbPer100: Math.round(mean * 100 / 20 * 10) / 10 };
  }
  console.log(JSON.stringify(out));
  const NAME = { 1: 'leicht', 2: 'mittel', 3: 'stark' };
  for (const l of levels) {
    const x = out.levels[l];
    console.log(`  ${NAME[l]}: ${x.chipsPer100 >= 0 ? '+' : ''}${x.chipsPer100} Chips/100 Hände (± ${x.ci95}, 95 %) = ${x.bbPer100} BB/100`);
  }
  console.log(`  ${hands} Hände (${out.decks} Mischungen × ${n} Drehungen) in ${out.seconds} s, alle Züge legal, keine Hand hing`);
}
