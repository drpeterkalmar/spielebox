// Schwarm-Test Vier in einer Reihe: 10 000 Zufallspartien (mulberry32) mit Invarianten nach jedem Zug
// (Steinzahl = ply, Spaltenhöhe ≤ 6, Gewinn ⇔ unabhängig gezählte Viererlinie, Remis nur bei vollem Brett,
// Abwechseln, isLegal lehnt volle Spalten und Müll ab, positionKey stabil, JSON-Rundreise), dazu Bot-Partien
// Stufe 1/2 gegen Zufall und gegeneinander (nur legale Züge, Stufe 2 schlägt Zufall fast immer).
// 10 000 Partien sind billig (≤ 42 Züge); Stufe 2 (feste Tiefe 7) nur in wenigen Partien.
// Höchstens 2 Worker (8-GB-Mac); dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/vier.swarm.test.mjs [seed] [--games=10000] [--bot1=300] [--bot2=150] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as V from '../../src/games/vier/engine.js';
import { chooseMove } from '../../src/games/vier/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

const { COLS, ROWS } = V;
const BOT_MS = 50;   // Bedenkzeit im Test (Stufe 2 rechnet ohnehin feste Tiefe 7)

function mix(...xs) {
  let h = 0x811c9dc5;
  for (const x of xs) {
    h = Math.imul(h ^ (x >>> 0), 0x01000193);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return h >>> 0;
}

if (isMainThread) await main();
else parentPort.on('message', task => parentPort.postMessage(runTask(task, workerData.seed)));

// ---------- Worker ----------

function runTask(task, seed) {
  try {
    return task.kind === 'swarm' ? runSwarm(task, seed) : runBot(task, seed);
  } catch (e) {
    return { error: String((e && e.stack) || e) };
  }
}

function freeze(s) {
  for (const col of s.cols) Object.freeze(col);
  Object.freeze(s.cols);
  if (s.win) { for (const x of s.win.line) Object.freeze(x); Object.freeze(s.win.line); Object.freeze(s.win); }
  if (s.over) Object.freeze(s.over);
  return Object.freeze(s);
}

// Unabhängige Zählung: Gitter g[c][r] (−1 leer), alle Steine in Viererlinien je Farbe
function grid(s) {
  return Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => (r < s.cols[c].length ? s.cols[c][r] : -1)));
}
function fours(s) {
  const g = grid(s), cells = [new Set(), new Set()];
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const v = g[c][r];
      if (v < 0) continue;
      for (const [dc, dr] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
        const run = [];
        for (let k = 0; k < 4; k++) {
          const x = c + k * dc, y = r + k * dr;
          if (x < 0 || x >= COLS || y < 0 || y >= ROWS || g[x][y] !== v) break;
          run.push(x * ROWS + y);
        }
        if (run.length === 4) for (const i of run) cells[v].add(i);
      }
    }
  }
  return cells;
}

const JUNK = [
  null, undefined, 3, 'Spalte 3', [], [3], {}, { col: -1 }, { col: 7 }, { col: 2.5 }, { col: '3' }, { col: NaN },
  { col: Infinity }, { col: null }, { col: 3, x: 1 }, { spalte: 3 }, { col: [3] },
];

function checkState(s, ply) {
  assert.equal(s.cols.length, COLS);
  let n = 0, n0 = 0;
  for (const col of s.cols) {
    assert.ok(col.length <= ROWS, 'Spalte höher als 6');
    for (const v of col) { assert.ok(v === 0 || v === 1, 'Steinwert'); if (v === 0) n0++; }
    n += col.length;
  }
  assert.equal(n, ply, 'Steinzahl ≠ Zugzahl');
  assert.equal(s.ply, ply);
  assert.equal(n0, Math.ceil(ply / 2), 'Rot/Gelb-Verhältnis falsch');
  assert.equal(s.turn, ply % 2, 'Abwechseln verletzt');
  // JSON-Rundreise und positionKey
  const j = JSON.parse(JSON.stringify(s));
  assert.deepEqual(j, s, 'JSON-Rundreise verändert den Zustand');
  assert.equal(V.positionKey(j), V.positionKey(s), 'positionKey nach JSON anders');
  assert.equal(V.positionKey(s), V.positionKey(s));
  assert.deepEqual(V.result(s), s.over);
  for (let c = 0; c < COLS; c++) assert.equal(V.dropRow(s, c), s.cols[c].length < ROWS ? s.cols[c].length : -1);
}

function playRandom(gseed, r) {
  const rng = mulberry32(gseed);
  let s = freeze(V.initialState()), ply = 0;
  const keys = new Set();
  while (true) {
    checkState(s, ply);
    const key = V.positionKey(s);
    assert.ok(!keys.has(key), 'positionKey wiederholt sich in einer Partie');
    keys.add(key);
    const [red, yellow] = fours(s);
    if (s.over) {
      assert.equal(V.currentPlayer(s), null);
      assert.deepEqual(V.legalMoves(s), []);
      for (let c = 0; c < COLS; c++) assert.equal(V.isLegal(s, { col: c }), false, 'Zug nach Partieende erlaubt');
      if (s.over.winner === null) {
        assert.equal(ply, COLS * ROWS, 'Remis ohne volles Brett');
        assert.ok(!red.size && !yellow.size, 'Remis trotz Viererlinie');
        assert.equal(s.win, null);
        assert.equal(V.evaluate(s, 0), 0);
        r.draws++;
      } else {
        const w = s.over.winner, mine = w === 0 ? red : yellow;
        assert.equal(w, 1 - s.turn, 'Sieger ist nicht der letzte Zieher');
        assert.ok(mine.size >= 4, 'Sieg ohne Viererlinie');
        assert.equal((w === 0 ? yellow : red).size, 0, 'Verlierer hat auch eine Viererlinie');
        const line = [...mine].sort((a, b) => a - b).map(i => [Math.floor(i / ROWS), i % ROWS]);
        assert.deepEqual(V.winLine(s), line, 'Gewinnsteine ≠ unabhängig gezählte');
        assert.equal(V.evaluate(s, w), 99);
        assert.equal(V.evaluate(s, 1 - w), -99);
        r.wins[w]++;
        r.maxLine = Math.max(r.maxLine, line.length);
      }
      break;
    }
    assert.ok(!red.size && !yellow.size, 'Viererlinie, aber Partie läuft weiter');
    assert.equal(V.currentPlayer(s), s.turn);
    // legalMoves = genau die nicht vollen Spalten; volle Spalten und Müll abgelehnt
    const legal = V.legalMoves(s), open = [];
    for (let c = 0; c < COLS; c++) {
      const free = s.cols[c].length < ROWS;
      if (free) open.push({ col: c });
      assert.equal(V.isLegal(s, { col: c }), free, `isLegal Spalte ${c}`);
      if (!free) { assert.throws(() => V.applyMove(s, { col: c }), /Illegaler Zug/); r.full++; }
    }
    assert.deepEqual(legal, open, 'legalMoves ≠ freie Spalten');
    if (ply % 5 === 0) {
      for (const b of JUNK) {
        assert.equal(V.isLegal(s, b), false, `isLegal akzeptiert ${String(JSON.stringify(b))}`);
        assert.throws(() => V.applyMove(s, b), /Illegaler Zug/);
        r.junk++;
      }
    }
    const m = pick(rng, legal), h = s.cols[m.col].length;
    const n = freeze(V.applyMove(s, m));
    // genau ein Stein des Ziehers oben auf der gewählten Spalte, Rest unverändert
    for (let c = 0; c < COLS; c++) {
      if (c === m.col) assert.deepEqual(n.cols[c], [...s.cols[c], s.turn], 'Stein nicht oben in der Spalte');
      else assert.deepEqual(n.cols[c], s.cols[c], 'fremde Spalte verändert');
    }
    assert.equal(n.cols[m.col].length, h + 1);
    // dieselbe Stellung über JSON-Kopie gezogen = gleiches Ergebnis
    if (ply % 7 === 0) assert.deepEqual(V.applyMove(JSON.parse(JSON.stringify(s)), m), n, 'Zug auf JSON-Kopie anders');
    s = n;
    ply++;
    r.moves++;
  }
  r.maxPly = Math.max(r.maxPly, ply);
}

function runSwarm({ from, to }, seed) {
  const r = { games: 0, moves: 0, draws: 0, wins: [0, 0], full: 0, junk: 0, maxPly: 0, maxLine: 0 };
  for (let g = from; g < to; g++) {
    try {
      playRandom(mix(seed, 1, g), r);
    } catch (e) {
      return { error: `Partie ${g}: ${String((e && e.stack) || e)}` };
    }
    r.games++;
  }
  return r;
}

// Bot-Partien, Seiten abwechselnd. a = geprüfte Stufe, b = Gegner (0 = Zufall)
function runBot({ a, b, from, to }, seed) {
  const r = { games: 0, winsA: 0, draws: 0, maxMs: 0, moves: 0 };
  for (let g = from; g < to; g++) {
    const rng = mulberry32(mix(seed, 2 + a * 10 + b, g));
    const lv = g % 2 ? [b, a] : [a, b];
    let s = V.initialState();
    while (!s.over) {
      const L = lv[V.currentPlayer(s)];
      const t = performance.now();
      const m = L === 0 ? pick(rng, V.legalMoves(s)) : chooseMove(s, { level: L, rng, timeMs: BOT_MS });
      r.maxMs = Math.max(r.maxMs, performance.now() - t);
      if (!V.isLegal(s, m)) throw new Error(`Partie ${g}: Stufe ${L} spielt illegal ${JSON.stringify(m)}`);
      s = V.applyMove(s, m);
      r.moves++;
    }
    r.games++;
    if (s.over.winner === null) r.draws++;
    else if (s.over.winner === (g % 2 ? 1 : 0)) r.winsA++;
  }
  return r;
}

// ---------- Hauptprozess ----------

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(x => /^\d+$/.test(x)) ?? 20261001);
  const GAMES = opt('games', 10000), BOT1 = opt('bot1', 300), BOT2 = opt('bot2', 150);
  const W = Math.max(1, Math.min(opt('workers', 2), 2, os.availableParallelism?.() ?? 2));
  const t0 = performance.now();
  const tasks = [];
  const CH = 500;
  for (let i = 0; i < GAMES; i += CH) tasks.push({ kind: 'swarm', from: i, to: Math.min(GAMES, i + CH) });
  const pairs = [[1, 0, BOT1], [2, 0, BOT2], [2, 1, BOT2], [1, 1, BOT2]];
  for (const [a, b, n] of pairs) for (let i = 0; i < n; i += 20) tasks.push({ kind: 'bot', a, b, from: i, to: Math.min(n, i + 20) });
  // Stufe-2-Blöcke (langsamer) zuerst verteilen
  tasks.sort((x, y) => (y.a === 2) - (x.a === 2));
  const results = [];
  await new Promise((resolve, reject) => {
    let next = 0, busy = 0;
    const workers = Array.from({ length: W }, () => new Worker(new URL(import.meta.url), { workerData: { seed } }));
    const feed = w => {
      if (next < tasks.length) { const t = tasks[next++]; busy++; w.once('message', res => { busy--; results.push([t, res]); feed(w); }); w.postMessage(t); }
      else { w.terminate(); if (!busy && results.length === tasks.length) resolve(); }
    };
    for (const w of workers) { w.on('error', reject); feed(w); }
  });
  let passed = 0, failed = 0;
  const ok = (name, fn) => {
    try { const info = fn(); passed++; console.log(`✅ ${name}${info ? ` (${info})` : ''}`); }
    catch (e) { failed++; console.log(`❌ ${name}\n   ${String((e && e.message) || e).split('\n').slice(0, 6).join('\n   ')}`); }
  };
  const errs = results.filter(([, r]) => r.error);
  const sw = results.filter(([t, r]) => t.kind === 'swarm' && !r.error).map(([, r]) => r);
  const sum = k => sw.reduce((a, r) => a + r[k], 0);
  const maxOf = k => Math.max(0, ...sw.map(r => r[k]));
  ok(`Schwarm ${GAMES} Zufallspartien: Steinzahl = ply, Höhe ≤ 6, Abwechseln, JSON/positionKey stabil`, () => {
    if (errs.length) throw new Error(errs.map(([, r]) => r.error).join('\n'));
    assert.equal(sum('games'), GAMES);
    return `${sum('moves')} Züge, längste Partie ${maxOf('maxPly')} Steine`;
  });
  ok('Gewinn ⇔ unabhängig gezählte Viererlinie, Remis nur bei vollem Brett', () => {
    const w0 = sw.reduce((a, r) => a + r.wins[0], 0), w1 = sw.reduce((a, r) => a + r.wins[1], 0), d = sum('draws');
    assert.equal(w0 + w1 + d, GAMES);
    assert.ok(w0 > 0 && w1 > 0, 'beide Farben sollten gewinnen');
    return `Rot ${w0}, Gelb ${w1}, Remis ${d}, längste Gewinnlinie ${maxOf('maxLine')} Steine`;
  });
  ok('isLegal lehnt volle Spalten und Müll ab, applyMove wirft', () => {
    assert.ok(sum('full') > 0 && sum('junk') > 0);
    return `${sum('full')} volle Spalten, ${sum('junk')} Müll-Züge abgelehnt`;
  });
  const bot = (a, b) => {
    const rs = results.filter(([t, r]) => t.kind === 'bot' && t.a === a && t.b === b && !r.error).map(([, r]) => r);
    const s = k => rs.reduce((x, r) => x + r[k], 0);
    return { games: s('games'), wins: s('winsA'), draws: s('draws'), ms: Math.max(0, ...rs.map(r => r.maxMs)) };
  };
  const pct = x => `${x.wins}/${x.games} = ${(100 * x.wins / x.games).toFixed(1)} % (Remis ${x.draws}), langsamster Zug ${x.ms.toFixed(0)} ms`;
  ok(`Bot nur legale Züge (${BOT1 + 3 * BOT2} Partien)`, () => {
    for (const [a, b, n] of pairs) assert.equal(bot(a, b).games, n, `Stufe ${a} gegen ${b}`);
  });
  ok(`Bot Stufe 1 gegen Zufall (${BOT1} Partien, > 85 %)`, () => {
    const x = bot(1, 0);
    assert.ok(x.wins / x.games > 0.85, pct(x));
    return pct(x);
  });
  ok(`Bot Stufe 2 gegen Zufall (${BOT2} Partien, ≥ 97 %)`, () => {
    const x = bot(2, 0);
    assert.ok(x.wins / x.games >= 0.97, pct(x));
    assert.ok(x.ms < 1500, `langsamster Zug ${x.ms.toFixed(0)} ms`);
    return pct(x);
  });
  ok(`Bot Stufe 2 gegen Stufe 1 (${BOT2} Partien, > 70 %)`, () => {
    const x = bot(2, 1);
    assert.ok(x.wins / x.games > 0.7, pct(x));
    return pct(x);
  });
  ok(`Bot Stufe 1 gegen Stufe 1 (${BOT2} Partien, beide Seiten gewinnen mal)`, () => {
    const x = bot(1, 1);
    assert.ok(x.wins > 0 && x.wins + x.draws < x.games, pct(x));
    return pct(x);
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
