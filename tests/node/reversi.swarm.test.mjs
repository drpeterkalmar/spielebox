// Schwarm-Test Reversi: 10 000 Zufallspartien (mulberry32) mit Invarianten nach jedem Zug
// (Steinzahl = 4 + gesetzte Züge, umgedrehte Steine = flipsFor vor dem Zug = unabhängig nachgerechnet,
// Pass nur ohne Zug, Ende nur wenn beide nicht können, Sieger = mehr Steine, isLegal lehnt Müll ab,
// positionKey stabil, JSON-Rundreise), dazu Bot-Partien Stufe 1 gegen Zufall (und ein paar Stufe 2 gegen 1).
// 10 000 Partien à ≤ 61 Züge sind billig; die unabhängige Zugsuche (64 Felder × 8 Richtungen) kostet am meisten.
// Höchstens 2 Worker (8-GB-Mac); dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/reversi.swarm.test.mjs [seed] [--games=10000] [--bot1=300] [--bot2=40] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as R from '../../src/games/reversi/engine.js';
import { chooseMove } from '../../src/games/reversi/bot.js';
import { mulberry32, pick } from '../../src/rng.js';

const SAFETY = 200;   // Züge je Partie (höchstens 60 Steine + Pässe)
const BOT_MS = 50;

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
  Object.freeze(s.board);
  if (s.last) { Object.freeze(s.last.flipped); Object.freeze(s.last); }
  if (s.over) { Object.freeze(s.over.score); Object.freeze(s.over); }
  return Object.freeze(s);
}

// Unabhängig: Felder, die `seat` mit einem Stein auf i umdreht (naiv, 8 Richtungen auf r/c)
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function naiveFlips(board, seat, i) {
  if (board[i] !== null) return [];
  const r0 = i >> 3, c0 = i & 7, out = [];
  for (const [dr, dc] of DIRS) {
    const run = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === 1 - seat) {
      run.push(r * 8 + c);
      r += dr; c += dc;
    }
    if (run.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === seat) out.push(...run);
  }
  return out.sort((a, b) => a - b);
}
function naiveMoves(board, seat) {
  const out = [];
  for (let i = 0; i < 64; i++) if (naiveFlips(board, seat, i).length) out.push(i);
  return out;
}
function count(board) {
  let b = 0, w = 0;
  for (const v of board) { if (v === 0) b++; else if (v === 1) w++; }
  return [b, w];
}

const JUNK = [
  null, undefined, 19, 'd3', [], [19], {}, { i: -1 }, { i: 64 }, { i: 2.5 }, { i: '19' }, { i: NaN }, { i: null },
  { pass: false }, { pass: 1 }, { pass: 'ja' }, { i: 19, pass: true }, { i: 19, x: 1 }, { feld: 19 }, { type: 'pass' },
];

function playRandom(gseed, r) {
  const rng = mulberry32(gseed);
  let s = freeze(R.initialState()), placed = 0, acts = 0;
  while (true) {
    if (++acts > SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} erreicht`);
    // Grundinvarianten
    assert.equal(s.board.length, 64);
    for (const v of s.board) assert.ok(v === null || v === 0 || v === 1, 'Feldwert');
    const [b, w] = count(s.board);
    assert.equal(b + w, 4 + placed, 'Steinzahl ≠ 4 + gesetzte Züge');
    assert.deepEqual(R.counts(s), [b, w]);
    assert.equal(s.ply, acts - 1, 'ply zählt nicht jeden Zug');
    const j = JSON.parse(JSON.stringify(s));
    assert.deepEqual(j, s, 'JSON-Rundreise verändert den Zustand');
    assert.equal(R.positionKey(j), R.positionKey(s), 'positionKey nach JSON anders');
    assert.deepEqual(R.result(s), s.over);
    const mine = naiveMoves(s.board, s.turn), theirs = naiveMoves(s.board, 1 - s.turn);
    if (s.over) {
      assert.ok(!mine.length && !theirs.length, 'Partie aus, obwohl noch jemand setzen kann');
      assert.equal(R.currentPlayer(s), null);
      assert.deepEqual(R.legalMoves(s), []);
      assert.deepEqual(s.over.score, [b, w], 'Endstand falsch');
      assert.equal(s.over.winner, b > w ? 0 : w > b ? 1 : null, 'Sieger ≠ mehr Steine');
      assert.equal(R.isLegal(s, { pass: true }), false);
      const d = b - w, e = 64 - b - w, v = d > 0 ? d + e : d < 0 ? d - e : 0;
      assert.equal(R.evaluate(s, 0), v, 'evaluate am Ende ≠ Differenz (leere für den Sieger)');
      assert.equal(R.evaluate(s, 1), -v || 0);
      r.ends[s.over.winner === null ? 'remis' : s.over.winner]++;
      if (b + w < 64) r.early++;
      break;
    }
    assert.ok(mine.length || theirs.length, 'Partie läuft, obwohl keiner setzen kann');
    assert.equal(R.currentPlayer(s), s.turn);
    assert.ok(s.passes <= 1, 'zwei Pässe in Folge, Partie läuft weiter');
    // legalMoves = unabhängig gefundene Felder, sonst genau Pass
    const legal = R.legalMoves(s);
    if (mine.length) {
      assert.deepEqual(legal, mine.map(i => ({ i })), 'legalMoves ≠ unabhängige Zugsuche');
      assert.equal(R.isLegal(s, { pass: true }), false, 'Pass trotz möglichem Zug erlaubt');
      assert.throws(() => R.applyMove(s, { pass: true }));
    } else {
      assert.deepEqual(legal, [{ pass: true }], 'kein Zug, aber kein Pflicht-Pass');
      r.passes++;
    }
    // Felder ohne Umdrehen, belegte Felder und Müll ablehnen (stichprobenhaft)
    if (acts % 7 === 0) {   // jeder 7. Zug (Laufzeit)
      for (let i = 0; i < 64; i++) {
        const ok = mine.includes(i);
        assert.equal(R.isLegal(s, { i }), ok, `isLegal Feld ${i}`);
        if (!ok && (i + acts) % 9 === 0) { assert.throws(() => R.applyMove(s, { i })); r.badSq++; }
      }
      for (const m of JUNK) {
        assert.equal(R.isLegal(s, m), false, `isLegal akzeptiert ${String(JSON.stringify(m))}`);
        assert.throws(() => R.applyMove(s, m));
        r.junk++;
      }
    }
    const m = pick(rng, legal), seat = s.turn;
    const before = m.pass ? [] : R.flipsFor(s, m.i);
    const n = freeze(R.applyMove(s, m));
    assert.equal(n.turn, 1 - seat, 'Abwechseln verletzt');
    if (m.pass) {
      assert.deepEqual(n.board, s.board, 'Pass verändert das Brett');
      assert.deepEqual(n.last, { seat, i: null, flipped: [] });
      assert.equal(n.passes, s.passes + 1);
    } else {
      const exp = naiveFlips(s.board, seat, m.i);
      assert.ok(exp.length > 0);
      assert.deepEqual(before, exp, 'flipsFor ≠ unabhängig nachgerechnet');
      assert.deepEqual([...n.last.flipped].sort((a, b) => a - b), exp, 'last.flipped ≠ flipsFor');
      assert.equal(n.last.seat, seat);
      assert.equal(n.last.i, m.i);
      // neues Brett: gesetzter Stein + genau die umgedrehten, sonst alles gleich
      const flip = new Set(exp);
      for (let i = 0; i < 64; i++) {
        const want = i === m.i || flip.has(i) ? seat : s.board[i];
        assert.equal(n.board[i], want, `Feld ${i} falsch nach Zug ${m.i}`);
      }
      const [nb, nw] = count(n.board), [ob, ow] = [b, w];
      const gain = seat === 0 ? nb - ob : nw - ow, loss = seat === 0 ? ow - nw : ob - nb;
      assert.equal(gain, exp.length + 1);
      assert.equal(loss, exp.length);
      assert.equal(n.passes, 0);
      placed++;
      r.flips += exp.length;
      r.maxFlips = Math.max(r.maxFlips, exp.length);
    }
    if (acts % 11 === 0) assert.deepEqual(R.applyMove(JSON.parse(JSON.stringify(s)), m), n, 'Zug auf JSON-Kopie anders');
    s = n;
    r.moves++;
  }
  r.maxActs = Math.max(r.maxActs, acts);
}

function runSwarm({ from, to }, seed) {
  const r = { games: 0, moves: 0, passes: 0, flips: 0, maxFlips: 0, badSq: 0, junk: 0, early: 0, maxActs: 0,
    ends: { 0: 0, 1: 0, remis: 0 } };
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
  const r = { games: 0, winsA: 0, draws: 0, maxMs: 0 };
  for (let g = from; g < to; g++) {
    const rng = mulberry32(mix(seed, 2 + a * 10 + b, g));
    const lv = g % 2 ? [b, a] : [a, b];
    let s = R.initialState(), acts = 0;
    while (!s.over) {
      if (++acts > SAFETY) throw new Error('Bot-Partie endet nicht');
      const L = lv[R.currentPlayer(s)];
      const t = performance.now();
      const m = L === 0 ? pick(rng, R.legalMoves(s)) : chooseMove(s, { level: L, rng, timeMs: BOT_MS });
      r.maxMs = Math.max(r.maxMs, performance.now() - t);
      if (!R.isLegal(s, m)) throw new Error(`Partie ${g}: Stufe ${L} spielt illegal ${JSON.stringify(m)}`);
      s = R.applyMove(s, m);
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
  const GAMES = opt('games', 10000), BOT1 = opt('bot1', 300), BOT2 = opt('bot2', 40);
  const W = Math.max(1, Math.min(opt('workers', 2), 2, os.availableParallelism?.() ?? 2));
  const t0 = performance.now();
  const tasks = [];
  const CH = 500;
  for (let i = 0; i < GAMES; i += CH) tasks.push({ kind: 'swarm', from: i, to: Math.min(GAMES, i + CH) });
  const pairs = [[1, 0, BOT1], [2, 1, BOT2]];
  for (const [a, b, n] of pairs) for (let i = 0; i < n; i += 20) tasks.push({ kind: 'bot', a, b, from: i, to: Math.min(n, i + 20) });
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
  ok(`Schwarm ${GAMES} Zufallspartien: Steinzahl = 4 + Züge, legalMoves = unabhängige Zugsuche, JSON/positionKey stabil`, () => {
    if (errs.length) throw new Error(errs.map(([, r]) => r.error).join('\n'));
    assert.equal(sum('games'), GAMES);
    return `${sum('moves')} Züge, längste Partie ${maxOf('maxActs')} Züge`;
  });
  ok('Umgedrehte Steine = flipsFor = unabhängig nachgerechnet', () => {
    assert.ok(sum('flips') > 0);
    return `${sum('flips')} Steine umgedreht, max ${maxOf('maxFlips')} in einem Zug`;
  });
  ok('Pass nur ohne Zug, Ende nur wenn beide nicht können, Sieger = mehr Steine', () => {
    const e = sw.reduce((a, r) => ({ 0: a[0] + r.ends[0], 1: a[1] + r.ends[1], remis: a.remis + r.ends.remis }), { 0: 0, 1: 0, remis: 0 });
    assert.equal(e[0] + e[1] + e.remis, GAMES);
    assert.ok(sum('passes') > 0 && sum('early') > 0, 'Pässe und vorzeitige Enden sollten vorkommen');
    return `Schwarz ${e[0]}, Weiß ${e[1]}, Remis ${e.remis}; ${sum('passes')} Pässe, ${sum('early')} Enden vor vollem Brett`;
  });
  ok('isLegal lehnt Müll und Felder ohne Umdrehen ab, applyMove wirft', () => {
    assert.ok(sum('junk') > 0 && sum('badSq') > 0);
    return `${sum('junk')} Müll-Züge, ${sum('badSq')} falsche Felder abgelehnt`;
  });
  const bot = (a, b) => {
    const rs = results.filter(([t, r]) => t.kind === 'bot' && t.a === a && t.b === b && !r.error).map(([, r]) => r);
    const s = k => rs.reduce((x, r) => x + r[k], 0);
    return { games: s('games'), wins: s('winsA'), draws: s('draws'), ms: Math.max(0, ...rs.map(r => r.maxMs)) };
  };
  const pct = x => `${x.wins}/${x.games} = ${(100 * x.wins / x.games).toFixed(1)} % (Remis ${x.draws}), langsamster Zug ${x.ms.toFixed(0)} ms`;
  ok(`Bot nur legale Züge (${BOT1 + BOT2} Partien)`, () => {
    for (const [a, b, n] of pairs) assert.equal(bot(a, b).games, n, `Stufe ${a} gegen ${b}`);
  });
  ok(`Bot Stufe 1 gegen Zufall (${BOT1} Partien, > 60 %)`, () => {
    const x = bot(1, 0);
    assert.ok(x.wins / x.games > 0.6, pct(x));
    return pct(x);
  });
  ok(`Bot Stufe 2 gegen Stufe 1 (${BOT2} Partien, > 75 %)`, () => {
    const x = bot(2, 1);
    assert.ok(x.wins / x.games > 0.75, pct(x));
    assert.ok(x.ms < 1500, `langsamster Zug ${x.ms.toFixed(0)} ms`);
    return pct(x);
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
