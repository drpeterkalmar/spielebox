// n11: Daten für die Kalibrierung von „Wer gewinnt?“ – Selbstspiel Stufe a gegen Stufe b (beide Seiten, Zufall in der
// Eröffnung), je Stellung die Zahl der Anzeige und das spätere Endergebnis. Auswertung: tools/n11/kalib_fit.mjs.
// Aufruf: node tools/n11/kalibrieren.mjs --game=reversi [--n=500] [--pairs=3:2,3:3] [--ms=15,40,120] [--workers=5]
//         [--sample=1] [--seed=1] [--out=tests/out/kalib_reversi.json]
//   Rechenzeit je Zug wie tools/selfplay.mjs verkürzt (1/10 der App). Jede Stellung wird aus Sicht beider Sitze
//   eingetragen (Kartenspiele: nur mit der Sicht des Sitzes, viewFor). Datensatz: [Partie, Sitz, x, y, Phase, exact, …]
//   y = 1 Sieg, ½ Remis, 0 Niederlage des Sitzes; Phase = leere Felder (Reversi) bzw. Anteil der Partie (0…1).
//   Reversi zusätzlich: x_heur (immer Schätzung) und x_alt (Bewertung vor n11: ab 8 leeren Feldern exakt).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../../src/rng.js';

const OPTS = { halma: { players: 2 }, ludo: { players: 2 }, maumau: { players: 2 }, wuerfel: { players: 2 }, paare: { players: 2 } };
const OPENING = { reversi: 4, schach: 2, dame: 2, muehle: 2, vier: 2, halma: 2 };   // so viele Zufallszüge zu Beginn
const SAMPLE = { schach: 0.12 };   // Schach: Anzeige rechnet 160 ms je Stellung – nur jede ~8. Stellung

function perm(rng, n) {
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}
const chanceValue = (c, rng) => (c.kind === 'shuffle' ? perm(rng, c.n) : Array.from({ length: c.n || 2 }, () => 1 + Math.floor(rng() * 6)));

async function playOne(game, levels, seed, ms, sample) {
  const E = await import(`../../src/games/${game}/engine.js`);
  const { chooseMove } = await import(`../../src/games/${game}/bot.js`);
  const { evalPosition } = await import('../../src/evalpos.js');
  const rng = mulberry32(seed), world = mulberry32(seed * 31 + 7);
  let s = E.initialState(E.normalizeOptions(OPTS[game] || {}));
  const rows = [];
  let plies = 0, open = OPENING[game] || 0;
  while (!E.result(s) && plies < 4000) {
    const c = E.chance ? E.chance(s) : null;
    if (c) { s = E.applyChance(s, chanceValue(c, world)); continue; }
    const seat = E.currentPlayer(s);
    if (rng() < (sample ?? SAMPLE[game] ?? 1)) {
      for (const k of [0, 1]) {
        const v = E.HIDDEN ? E.viewFor(s, k) : s;
        const r = evalPosition(game, v, k);
        const row = [k, r.x, null, null, r.exact ? 1 : 0, plies];
        if (game === 'reversi') {
          const e = E.empties(s);
          row[3] = e;
          const xh = E.evaluateInfo(s, k, { solve: 0 }).x;
          let xa = xh;
          if (e <= 8) { const ex = E.solveExact(s, Infinity); xa = (s.turn === k ? ex : -ex) + 0; }
          row.push(xh, xa);
        }
        rows.push(row);
      }
    }
    let m;
    const legal = E.legalMoves(s);
    if (open > 0) { m = legal[Math.floor(rng() * legal.length)]; open--; }
    else {
      const view = E.HIDDEN ? E.viewFor(s, seat) : s;
      m = chooseMove(view, { level: levels[seat], rng, timeMs: ms[levels[seat]], fehler: 0 });
    }
    s = E.applyMove(s, m);
    plies++;
  }
  const res = E.result(s);
  const w = res ? res.winner : null;
  for (const row of rows) {
    const k = row[0];
    row[2] = w === null || w === undefined ? 0.5 : w === k ? 1 : 0;
    if (game !== 'reversi') row[3] = plies ? +(row[5] / plies).toFixed(3) : 0;
  }
  return rows;
}

if (isMainThread) {
  const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const game = arg('game', 'reversi'), N = +arg('n', 500), workers = +arg('workers', 5), seed0 = +arg('seed', 1);
  const pairs = arg('pairs', '3:2,3:3').split(',').map((p) => p.split(':').map(Number));
  const msl = arg('ms', '15,40,120').split(',').map(Number), ms = { 1: msl[0], 2: msl[1], 3: msl[2] };
  const sample = arg('sample', '') === '' ? undefined : +arg('sample', '');
  const out = arg('out', `tests/out/kalib_${game}.json`);
  // Partie g: Paar g % pairs, Stufe a abwechselnd auf Sitz 0 und 1
  const jobs = Array.from({ length: N }, (_, g) => { const [a, b] = pairs[g % pairs.length]; const swap = Math.floor(g / pairs.length) % 2; return { g, levels: swap ? [b, a] : [a, b], seed: seed0 * 100003 + g }; });
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => new Promise((res, rej) => {
    const wk = new Worker(fileURLToPath(import.meta.url), { workerData: { game, ms, sample, jobs: jobs.filter((j) => j.g % workers === w) } });
    wk.on('message', res);
    wk.on('error', rej);
  })));
  const rows = parts.flat().sort((a, b) => a[0] - b[0]);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ game, n: N, pairs, ms, cols: ['partie', 'sitz', 'x', 'y', 'phase', 'exact', 'zug', ...(game === 'reversi' ? ['x_heur', 'x_alt'] : [])], rows }));
  console.log(`${game}: ${N} Partien, ${rows.length} Einträge, ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
} else {
  const { game, ms, sample, jobs } = workerData;
  const all = [];
  for (const j of jobs) for (const r of await playOne(game, j.levels, j.seed, ms, sample)) all.push([j.g, ...r]);
  parentPort.postMessage(all);
}
