// Selbstspiel der Übungs-Computer (n10): Stufe gegen Stufe je Spiel, Gewinnanteil mit 95-%-Intervall.
// Jede Partie zweimal mit getauschten Plätzen (gleicher Zufalls-Seed) – so zählt der Anzugsvorteil nicht.
// Remis = ½. Rechenzeit je Zug verkürzt (Standard 1/10 der App-Zeit: 15/40/120 ms), damit eine Tabelle in Minuten läuft;
// vorher/nachher daher nur mit denselben Einstellungen vergleichen.
// Aufruf: node tools/selfplay.mjs [--games=muehle,dame] [--pairs=2:1,3:2] [--n=40] [--ms=15,40,120] [--seed=1]
//         [--workers=6] [--fehler=0.15] [--aopt='{…}'] [--bopt='{…}'] [--json=docs/n10/selfplay_vorher.json]
//   --fehler      Fehlerquote der Stufe 1 (n10, wie in der App; 0 = Stand vor n10)
//   --pairs=a:b   Stufe a (gezählt) gegen Stufe b; --n = Partien je Paar (gerade Zahl, je Hälfte mit Platztausch)
//   --aopt/--bopt zusätzliche Bot-Optionen für Seite a bzw. b (z. B. Schnapsen {"exakt":false} = bisherige Stufe 3)
// Hold'em hat ein eigenes Werkzeug (tools/holdem_selfplay.mjs), Blackjack spielt gegen die Bank (kein Duell).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { cpus } from 'node:os';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from '../src/rng.js';
import { overlook, FEHLER } from '../src/games/fehler.js';

export const GAMES = ['muehle', 'dame', 'schach', 'schnapsen', 'backgammon', 'halma', 'ludo', 'schiffe', 'vier', 'maumau', 'wuerfel', 'reversi', 'paare'];
// Optionen für ein Duell zu zweit
const OPTS = { halma: { players: 2 }, ludo: { players: 2 }, maumau: { players: 2 }, wuerfel: { players: 2 }, paare: { players: 2 } };
const MAX_STEPS = 6000;

function perm(rng, n) {
  const p = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  return p;
}

function chanceValue(c, rng) {
  if (c.kind === 'shuffle') return perm(rng, c.n);
  const n = c.n || 2;
  return Array.from({ length: n }, () => 1 + Math.floor(rng() * 6));
}

// eine Partie: sides[seat] = { level, opt }; liefert Punkte für Sitz 0 (1 / ½ / 0) und Zahl der Züge
export async function playGame(game, sides, seed, ms) {
  const E = await import(`../src/games/${game}/engine.js`);
  const { chooseMove } = await import(`../src/games/${game}/bot.js`);
  const world = mulberry32(seed);              // Würfel/Mischen: für beide Platzbelegungen gleich
  const botRng = [mulberry32(seed * 7 + 1), mulberry32(seed * 7 + 2)];
  let s = E.initialState(E.normalizeOptions(OPTS[game] || {}));
  let steps = 0;
  while (!E.result(s)) {
    if (++steps > MAX_STEPS) return { score: 0.5, steps, hang: true };
    const c = E.chance ? E.chance(s) : null;
    if (c) { s = E.applyChance(s, chanceValue(c, world)); continue; }
    const seat = E.currentPlayer(s);
    if (seat === null || seat === undefined) throw new Error(`${game}: niemand am Zug, aber kein Ende`);
    const view = E.HIDDEN ? E.viewFor(s, seat) : s;
    const side = sides[seat];
    const o = { level: side.level, rng: botRng[seat], timeMs: ms[side.level], fehler: ms.fehler ?? FEHLER, ...(side.opt || {}) };
    const m = overlook(game, E, view, chooseMove(view, o), o);   // wie in der App: Stufe 1 übersieht manchmal einen Schlag
    if (!E.isLegal(s, m)) throw new Error(`${game}: ungültiger Zug Stufe ${side.level}: ${JSON.stringify(m)}`);
    s = E.applyMove(s, m);
  }
  const r = E.result(s);
  const score = r.winner === null || r.winner === undefined ? 0.5 : r.winner === 0 ? 1 : 0;
  return { score, steps };
}

// 95-%-Intervall (Normalnäherung) für einen Anteil p aus n Partien
export function ci95(p, n) {
  if (!n) return [0, 1];
  const se = Math.sqrt(Math.max(p * (1 - p), 1e-9) / n);
  return [Math.max(0, p - 1.96 * se), Math.min(1, p + 1.96 * se)];
}

function parse(argv) {
  const arg = (k, d) => { const a = argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
  const ms = arg('ms', '15,40,120').split(',').map(Number);
  return {
    games: arg('games', GAMES.join(',')).split(',').filter(Boolean),
    pairs: arg('pairs', '2:1,3:2').split(',').map((p) => p.split(':').map(Number)),
    n: Math.max(2, Number(arg('n', '40')) & ~1),
    ms: { 1: ms[0], 2: ms[1], 3: ms[2], fehler: Number(arg('fehler', String(FEHLER))) },
    seed: Number(arg('seed', '1')),
    workers: Number(arg('workers', String(Math.max(1, Math.min(6, cpus().length - 2))))),
    aopt: JSON.parse(arg('aopt', '{}')),
    bopt: JSON.parse(arg('bopt', '{}')),
    json: arg('json', '')
  };
}

if (isMainThread && process.argv[1] === fileURLToPath(import.meta.url)) {
  const cfg = parse(process.argv.slice(2));
  // Aufgaben: je Spiel, Paar und Partie-Nummer k (gerade k: a auf Sitz 0, ungerade: a auf Sitz 1, gleicher Seed)
  const jobs = [];
  for (const game of cfg.games) for (const [a, b] of cfg.pairs) for (let k = 0; k < cfg.n; k++) jobs.push({ game, a, b, k });
  const res = {};
  const t0 = Date.now();
  let next = 0, done = 0;
  await new Promise((resolve, reject) => {
    let live = 0;
    const start = () => {
      if (next >= jobs.length) { if (!live) resolve(); return; }
      const job = jobs[next++];
      live++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { job, cfg } });
      w.once('message', (r) => {
        const key = `${job.game} ${job.a}:${job.b}`;
        const e = (res[key] ||= { game: job.game, a: job.a, b: job.b, n: 0, pts: 0, steps: 0, hang: 0, ms: 0 });
        e.n++; e.pts += r.aScore; e.steps += r.steps; e.hang += r.hang ? 1 : 0; e.ms += r.ms;
        done++;
        if (done % 50 === 0) process.stderr.write(`${done}/${jobs.length} (${Math.round((Date.now() - t0) / 1000)} s)\n`);
      });
      w.once('error', reject);
      w.once('exit', () => { live--; start(); });
    };
    for (let i = 0; i < cfg.workers; i++) start();
  });
  const rows = Object.values(res).map((e) => {
    const p = e.pts / e.n, [lo, hi] = ci95(p, e.n);
    return { ...e, p: +p.toFixed(3), lo: +lo.toFixed(3), hi: +hi.toFixed(3), zuege: Math.round(e.steps / e.n), msJePartie: Math.round(e.ms / e.n) };
  });
  for (const r of rows) console.log(`${r.game.padEnd(11)} Stufe ${r.a} gegen ${r.b}: ${(r.p * 100).toFixed(1).padStart(5)} %  [${(r.lo * 100).toFixed(0)}–${(r.hi * 100).toFixed(0)} %]  n=${r.n}  Ø ${r.zuege} Züge, ${r.msJePartie} ms${r.hang ? `  ⚠ ${r.hang} ohne Ende` : ''}`);
  const out = { when: new Date().toISOString(), cfg: { ...cfg, json: undefined }, sekunden: Math.round((Date.now() - t0) / 1000), rows };
  if (cfg.json) { mkdirSync(dirname(cfg.json), { recursive: true }); writeFileSync(cfg.json, JSON.stringify(out, null, 1)); }
  console.log(JSON.stringify({ sekunden: out.sekunden, paare: rows.length }));
}

if (!isMainThread) {
  const { job, cfg } = workerData;
  const t = Date.now();
  const aSeat = job.k % 2;
  const sides = [];
  sides[aSeat] = { level: job.a, opt: cfg.aopt };
  sides[1 - aSeat] = { level: job.b, opt: cfg.bopt };
  const seed = cfg.seed * 100003 + Math.floor(job.k / 2) * 7919 + job.game.length;
  playGame(job.game, sides, seed, cfg.ms).then((r) => {
    const aScore = aSeat === 0 ? r.score : 1 - r.score;
    parentPort.postMessage({ aScore, steps: r.steps, hang: !!r.hang, ms: Date.now() - t });
  });
}
