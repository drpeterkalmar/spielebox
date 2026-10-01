// Schwarm-Test Ludo: 10 000 Zufallspartien (gemischt 2/3/4 Spieler, Optionen zufällig; Würfel über chance/applyChance,
// mulberry32) mit Invarianten nach jedem Schritt und einem unabhängig nachgebauten Zuggenerator, dazu Bot-Stärke in
// 4er-Partien (Stufe 3 gegen 3× Stufe 1 bzw. 3× Stufe 2, Stufe 2 gegen 3× Stufe 1).
// 10 000 Partien schaffen 2 Worker in deutlich unter 60 s (eine Partie ≈ 300–900 Aktionen, Prüfungen sind billig).
// Höchstens 2 Worker (8-GB-Mac, mehrere Agenten parallel); dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/ludo.swarm.test.mjs [seed] [--games=10000] [--bot=…] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as L from '../../src/games/ludo/engine.js';
import { chooseMove } from '../../src/games/ludo/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const SAFETY = 20000;   // Sicherheitsgrenze Aktionen je Partie
const H = -1;

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
  for (const a of s.pieces) Object.freeze(a);
  for (const k of ['pieces', 'colors', 'opts', 'lastRoll', 'last']) if (s[k]) Object.freeze(s[k]);
  return Object.freeze(s);
}

// Unabhängiger Nachbau der Zugregeln (Schmidt): Kandidaten → Rauskommen → Startfeld räumen → ggf. Schlagpflicht
const absOf = (s, seat, p) => (s.colors[seat] * 10 + p) % 40;
function refMoves(s, seat, d) {
  const mine = s.pieces[seat], o = s.opts;
  const c = [];
  mine.forEach((p, k) => {
    const to = p === H ? (d === 6 ? 0 : null) : p + d;
    if (to === null || to > 43) return;
    if (mine.some((q, j) => j !== k && q === to)) return;
    if (to >= 40 && !o.zielspringen && mine.some(q => q >= Math.max(40, p + 1) && q < to)) return;
    let cap = null;
    if (to < 40) {
      for (let t = 0; t < s.n; t++) {
        if (t === seat) continue;
        s.pieces[t].forEach((q, j) => { if (q >= 0 && q < 40 && absOf(s, t, q) === absOf(s, seat, to)) cap = [t, j]; });
      }
    }
    c.push({ k, from: p, to, cap });
  });
  let list = c;
  if (mine.includes(H)) {
    if (list.some(m => m.from === H)) list = list.filter(m => m.from === H);
    else if (list.some(m => m.from === 0)) list = list.filter(m => m.from === 0);
  }
  if (o.schlagpflicht && list.some(m => m.cap)) list = list.filter(m => m.cap);
  return list;
}
const refThrice = (s, seat) => s.opts.dreimal && s.pieces[seat].every(p => p === H || p >= 40) &&
  ![1, 2, 3].some(d => refMoves(s, seat, d).some(m => m.from >= 40));

function checkState(s) {
  assert.equal(s.pieces.length, s.n);
  assert.deepEqual(s.colors, { 2: [0, 2], 3: [0, 1, 2], 4: [0, 1, 2, 3] }[s.n]);
  const track = new Map();
  for (let seat = 0; seat < s.n; seat++) {
    const ps = s.pieces[seat];
    assert.equal(ps.length, 4, 'nicht 4 Figuren');
    const seen = new Set();
    for (const p of ps) {
      assert.ok(Number.isInteger(p) && p >= -1 && p <= 43, `Feld ${p}`);
      if (p === H) continue;
      assert.ok(!seen.has(p), 'zwei eigene Figuren auf einem Feld');
      seen.add(p);
      if (p < 40) {
        const a = absOf(s, seat, p);
        assert.ok(!track.has(a), `zwei Figuren auf Bahnfeld ${a}`);
        track.set(a, seat);
      }
    }
  }
  assert.ok(Number.isInteger(s.tries) && s.tries >= 0 && s.tries <= 2, 'tries');
  const cp = L.currentPlayer(s);
  if (s.phase === 'rolling' || s.phase === 'over') {
    assert.equal(cp, null);
    assert.deepEqual(L.legalMoves(s), []);
  } else assert.equal(cp, s.turn);
  assert.equal(L.chance(s) !== null, s.phase === 'rolling');
  assert.equal(s.phase === 'move', s.die !== null);
  if (s.phase === 'over') {
    assert.ok(s.pieces[s.winner].every(p => p >= 40), 'Sieger nicht komplett im Ziel');
    assert.deepEqual(L.result(s).winner, s.winner);
  } else {
    assert.equal(L.result(s), null);
    for (let seat = 0; seat < s.n; seat++) assert.ok(!s.pieces[seat].every(p => p >= 40), 'fertig, aber Partie läuft');
  }
}

function fuzz(s, legal, rng, r) {
  const bad = [{ type: 'roll' }, { type: 'move' }, { type: 'move', piece: 4 }, { type: 'move', piece: '1' },
    { type: 'move', piece: legal[0].piece, to: 3 }, { type: 'pass' }];
  for (let k = 0; k < 4; k++) if (!legal.some(m => m.piece === k)) bad.push({ type: 'move', piece: k });
  bad.push({ type: 'move', piece: pick(rng, legal).piece, extra: 1 });
  for (const b of bad) {
    assert.equal(L.isLegal(s, b), false, `isLegal akzeptiert ${JSON.stringify(b)}`);
    assert.throws(() => L.applyMove(s, b), /Illegaler Zug/);
    r.fuzz++;
  }
}

function playRandom(gseed, r) {
  const rng = mulberry32(gseed);
  const n = 2 + (gseed % 3);
  const opts = { players: n, schlagpflicht: rng() < 0.3, dreimal: rng() < 0.7, startfigur: rng() < 0.7, zielspringen: rng() < 0.7 };
  let s = freeze(L.initialState(opts));
  let acts = 0;
  while (s.phase !== 'over') {
    if (++acts > SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} erreicht`);
    checkState(s);
    if (acts % 31 === 0) {   // JSON-Rundreise, positionKey stabil
      const j = JSON.parse(JSON.stringify(s));
      assert.equal(L.positionKey(j), L.positionKey(s));
      assert.deepEqual(L.legalMoves(j), L.legalMoves(s));
    }
    if (L.chance(s)) {
      const d = 1 + randInt(rng, 6), seat = s.turn;
      const ref = refMoves(s, seat, d), thrice = refThrice(s, seat);
      const t = freeze(L.applyChance(s, [d]));
      r.rolls++;
      assert.equal(t.lastRoll.seat, seat); assert.equal(t.lastRoll.value, d); assert.equal(t.lastRoll.moved, false);
      if (ref.length) {
        assert.equal(t.phase, 'move'); assert.equal(t.turn, seat); assert.equal(t.die, d);
        assert.deepEqual(L.legalMoves(t).map(m => m.piece), ref.map(m => m.k), 'Zugliste ≠ Nachbau');
        const tg = L.targets(t);
        assert.deepEqual(tg.map(x => [x.piece, x.from, x.to, x.capture ? [x.capture.seat, x.capture.piece] : null]),
          ref.map(m => [m.k, m.from, m.to, m.cap]));
      } else {
        r.noMove++;
        assert.equal(t.phase, 'roll'); assert.equal(t.die, null);
        assert.ok(typeof t.lastRoll.reason === 'string' && t.lastRoll.reason.length > 0, 'Grund fehlt');
        if (thrice && s.tries < 2) { assert.equal(t.turn, seat); assert.equal(t.tries, s.tries + 1); r.retry++; }
        else { assert.equal(t.turn, (seat + 1) % s.n); assert.equal(t.tries, 0); }
      }
      s = t;
      continue;
    }
    const legal = L.legalMoves(s);
    assert.ok(legal.length > 0, 'keine legalen Züge, obwohl die Partie läuft');
    let m;
    if (s.phase === 'roll') {
      assert.deepEqual(legal, [{ type: 'roll' }]);
      m = legal[0];
    } else {
      assert.equal(new Set(legal.map(x => x.piece)).size, legal.length, 'Figur doppelt');
      for (const x of legal) assert.ok(L.isLegal(s, x));
      if (r.moves % 25 === 0) fuzz(s, legal, rng, r);
      m = pick(rng, legal);
      assert.notEqual(L.describeMove(s, m), '?');
    }
    const n2 = freeze(L.applyMove(s, m));
    assert.equal(n2.ply, s.ply + 1);
    if (m.type === 'move') {
      r.moves++;
      const ref = refMoves(s, s.turn, s.die).find(x => x.k === m.piece);
      assert.equal(n2.pieces[s.turn][m.piece], ref.to);
      for (let t = 0; t < s.n; t++) {
        for (let k = 0; k < 4; k++) {
          if (t === s.turn && k === m.piece) continue;
          const want = ref.cap && ref.cap[0] === t && ref.cap[1] === k ? H : s.pieces[t][k];
          assert.equal(n2.pieces[t][k], want, 'andere Figur verändert');
        }
      }
      if (ref.cap) r.captures++;
      if (ref.to >= 40 && ref.from < 40) r.goals++;
      if (n2.phase !== 'over') {
        assert.equal(n2.turn, s.die === 6 ? s.turn : (s.turn + 1) % s.n, 'falscher Sitz nach dem Zug');
        if (s.die === 6) r.extra++;
      }
    }
    s = n2;
  }
  checkState(s);
  r.ends[s.n] = (r.ends[s.n] || 0) + 1;
  r.maxActs = Math.max(r.maxActs, acts);
}

function runSwarm({ from, to }, seed) {
  const r = { games: 0, moves: 0, rolls: 0, noMove: 0, retry: 0, captures: 0, goals: 0, extra: 0, fuzz: 0, maxActs: 0, ends: {} };
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

// 4er-Partien: Stufe a auf einem (wechselnden) Sitz gegen 3× Stufe b. Stufe 3 mit Tiefe 1 (ein Wurf voraus):
// in Messläufen genauso stark wie Tiefe 2, aber viel schneller.
function runBot({ a, b, from, to }, seed) {
  const r = { games: 0, winsA: 0, maxMs: 0 };
  for (let g = from; g < to; g++) {
    const rng = mulberry32(mix(seed, 2 + a * 10 + b, g)), me = g % 4;
    let s = L.initialState({ players: 4 }), acts = 0;
    while (s.phase !== 'over') {
      if (++acts > SAFETY) throw new Error('Bot-Partie endet nicht');
      if (L.chance(s)) { s = L.applyChance(s, [1 + randInt(rng, 6)]); continue; }
      const lv = L.currentPlayer(s) === me ? a : b;
      const t = performance.now();
      const m = chooseMove(s, { level: lv, rng, timeMs: 1000, depth: 1 });
      r.maxMs = Math.max(r.maxMs, performance.now() - t);
      s = L.applyMove(s, m);
    }
    r.games++;
    if (s.winner === me) r.winsA++;
  }
  return r;
}

// ---------- Hauptprozess ----------

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(x => /^\d+$/.test(x)) ?? 20261001);
  const GAMES = opt('games', 10000), BOT = opt('bot', 1);
  const W = Math.max(1, Math.min(opt('workers', 2), 2, os.availableParallelism?.() ?? 2));
  const MATCHES = [[3, 1, Math.round(600 * BOT)], [3, 2, Math.round(1600 * BOT)], [2, 1, Math.round(600 * BOT)]];
  const t0 = performance.now();
  const tasks = [];
  for (const [a, b, n] of MATCHES) for (let i = 0; i < n; i += 100) tasks.push({ kind: 'bot', a, b, from: i, to: Math.min(n, i + 100) });
  for (let i = 0; i < GAMES; i += 250) tasks.push({ kind: 'swarm', from: i, to: Math.min(GAMES, i + 250) });
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
    catch (e) { failed++; console.log(`❌ ${name}\n   ${String((e && e.message) || e).split('\n').slice(0, 8).join('\n   ')}`); }
  };
  const errs = results.filter(([, r]) => r.error);
  const sw = results.filter(([t, r]) => t.kind === 'swarm' && !r.error).map(([, r]) => r);
  const sum = k => sw.reduce((a, r) => a + r[k], 0);
  const ends = {};
  for (const r of sw) for (const [k, v] of Object.entries(r.ends)) ends[k] = (ends[k] || 0) + v;
  ok(`Schwarm ${GAMES} Zufallspartien (2/3/4 Spieler): 4 Figuren je Sitz, keine Doppelbelegung, Ziel 40–43, jede Partie endet`, () => {
    if (errs.length) throw new Error(errs.map(([, r]) => r.error).join('\n'));
    assert.equal(sum('games'), GAMES);
    return `zu zweit ${ends[2] || 0}, zu dritt ${ends[3] || 0}, zu viert ${ends[4] || 0}; ${sum('moves')} Züge, ` +
      `${sum('rolls')} Würfe, längste Partie ${Math.max(0, ...sw.map(r => r.maxActs))} Aktionen`;
  });
  ok('Zugliste = unabhängiger Nachbau, Schläge/Ziel/Extrawurf/3× würfeln/kein Zug', () => {
    for (const k of ['captures', 'goals', 'extra', 'noMove', 'retry']) assert.ok(sum(k) > 0, k);
    return `${sum('captures')} Schläge, ${sum('goals')} ins Ziel, ${sum('extra')} Extrawürfe nach 6, ` +
      `${sum('noMove')} Würfe ohne Zug, davon ${sum('retry')} mit neuem Versuch`;
  });
  ok('isLegal lehnt verfälschte Züge ab, JSON-Rundreise und positionKey stabil', () => {
    assert.ok(sum('fuzz') > 0);
    return `${sum('fuzz')} illegale abgelehnt`;
  });
  const bot = (a, b) => {
    const rs = results.filter(([t, r]) => t.kind === 'bot' && t.a === a && t.b === b && !r.error).map(([, r]) => r);
    const g = rs.reduce((x, r) => x + r.games, 0), w = rs.reduce((x, r) => x + r.winsA, 0);
    return { g, w, ms: Math.max(0, ...rs.map(r => r.maxMs)), pct: (100 * w / Math.max(1, g)).toFixed(1) };
  };
  const [[, , n31], [, , n32], [, , n21]] = MATCHES;
  const b31 = bot(3, 1), b32 = bot(3, 2), b21 = bot(2, 1);
  ok(`4er-Partien: Stufe 3 gegen 3× Stufe 1 (${n31} Partien, fair wären 25 %, > 45 %)`, () => {
    assert.equal(b31.g, n31);
    assert.ok(b31.w / b31.g > 0.45, `${b31.w}/${b31.g}`);
    return `${b31.w}/${b31.g} = ${b31.pct} %`;
  });
  ok(`4er-Partien: Stufe 2 gegen 3× Stufe 1 (${n21} Partien, > 40 %)`, () => {
    assert.equal(b21.g, n21);
    assert.ok(b21.w / b21.g > 0.4, `${b21.w}/${b21.g}`);
    return `${b21.w}/${b21.g} = ${b21.pct} %`;
  });
  ok(`4er-Partien: Stufe 3 gegen 3× Stufe 2 (${n32} Partien, über 25 %)`, () => {
    assert.equal(b32.g, n32);
    assert.ok(b32.w / b32.g > 0.25, `${b32.w}/${b32.g}`);
    return `${b32.w}/${b32.g} = ${b32.pct} %, langsamster Zug ${Math.max(b31.ms, b32.ms).toFixed(0)} ms`;
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
