// Schwarm-Test Backgammon: Zufallspartien (Würfel über chance/applyChance, mulberry32) mit Invarianten
// nach jedem Zug, Fuzz mit verfälschten Zügen, dazu Bot-Stärke (Stufe 2 gegen Zufall, Stufe 3 gegen Stufe 2).
// Verteilt auf bis zu 3 Worker (8-GB-Mac); dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/backgammon.swarm.test.mjs [seed] [--games=10000] [--bot2=200] [--bot3=40] [--workers=3]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as B from '../../src/games/backgammon/engine.js';
import { chooseMove } from '../../src/games/backgammon/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const SAFETY = 6000;      // Sicherheitsgrenze Aktionen je Partie
const BOT3_MS = 100;      // Bedenkzeit Stufe 3 im Test
const REASONS = { 'alle Steine abgetragen': 1, 'Gammon (×2)': 2, 'Backgammon (×3)': 3 };

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
    if (task.kind === 'swarm') return runSwarm(task, seed);
    return runBot(task, seed);
  } catch (e) {
    return { error: String((e && e.stack) || e) };
  }
}

const dice = rng => [1 + randInt(rng, 6), 1 + randInt(rng, 6)];
const boardKey = s => `${s.points}|${s.bar}|${s.off}`;

function freeze(s) {
  for (const k of ['points', 'bar', 'off', 'dice', 'cube', 'options', 'over', 'last']) if (s[k]) Object.freeze(s[k]);
  return Object.freeze(s);
}

function checkState(s) {
  assert.equal(s.points.length, 24);
  const n = [s.bar[0] + s.off[0], s.bar[1] + s.off[1]];
  for (const v of s.points) {
    assert.ok(Number.isInteger(v), 'Punktwert');
    if (v > 0) n[0] += v; else n[1] -= v;
  }
  assert.deepEqual(n, [15, 15], 'nicht je 15 Steine (Brett + Bar + ab)');
  for (const p of [0, 1]) assert.ok(s.bar[p] >= 0 && s.off[p] >= 0 && s.off[p] <= 15);
  const ch = B.chance(s), cp = B.currentPlayer(s);
  if (ch || s.over) {
    assert.equal(cp, null, 'currentPlayer trotz Zufall/Ende');
    assert.deepEqual(B.legalMoves(s), []);
  } else assert.ok(cp === 0 || cp === 1, 'niemand am Zug');
  assert.deepEqual(B.result(s), s.over);
  const c = s.cube;
  assert.ok([1, 2, 4, 8, 16, 32, 64].includes(c.value) && (c.owner === null || c.owner === 0 || c.owner === 1));
  if (!s.options.cube) assert.deepEqual(c, { value: 1, owner: null });
}

// Unabhängige Prüfung eines Brettzugs: Richtung, Würfel, Bar zuerst, Abtragen nur aus dem Heimfeld
function checkPlay(s, m, n) {
  const p = s.turn, sign = p === 0 ? 1 : -1;
  const rel = x => (x === 'bar' ? 25 : x === 'off' ? 0 : p === 0 ? x : 25 - x);
  const pool = s.dice[0] === s.dice[1] ? Array(4).fill(s.dice[0]) : s.dice.slice();
  const pts = s.points.slice(), bar = s.bar.slice(), off = s.off.slice();
  for (const st of n.last.steps) {
    const r = rel(st.from), t = rel(st.to);
    assert.ok(t < r, 'Schritt rückwärts');
    const i = pool.indexOf(st.die);
    assert.ok(i >= 0, `Würfel ${st.die} nicht im Wurf ${s.dice}`);
    pool.splice(i, 1);
    if (t > 0) assert.equal(r - t, st.die, 'Entfernung ≠ Würfel');
    else assert.ok(st.die >= r, 'Abtragen mit zu kleiner Zahl');
    if (r === 25) { assert.ok(bar[p] > 0); bar[p]--; }
    else {
      assert.ok(bar[p] === 0, 'gezogen, obwohl Stein auf der Bar');
      assert.ok(pts[st.from - 1] * sign > 0, 'kein eigener Stein');
      pts[st.from - 1] -= sign;
    }
    if (t === 0) {
      let out = bar[p];
      for (let q = 7; q <= 24; q++) { const v = pts[(p === 0 ? q : 25 - q) - 1] * sign; if (v > 0) out += v; }
      assert.equal(out, 0, 'Abtragen mit Stein außerhalb');
      off[p]++;
    } else {
      const j = st.to - 1, v = pts[j] * sign;
      assert.ok(v >= -1, 'auf gegnerischen Punkt gezogen');
      assert.equal(st.hit, v === -1, 'Schlag falsch vermerkt');
      if (v === -1) { pts[j] = 0; bar[1 - p]++; }
      pts[j] += sign;
    }
  }
  assert.deepEqual([pts, bar, off], [n.points, n.bar, n.off], 'Brett ≠ nachgerechnete Schritte');
}

function checkEnd(s) {
  const { winner, reason, points } = s.over;
  assert.ok(winner === 0 || winner === 1);
  if (reason === 'Verdopplung abgelehnt') {
    assert.equal(points, s.cube.value);
    return 'drop';
  }
  const m = REASONS[reason];
  assert.ok(m, `Grund ${reason}`);
  assert.equal(s.off[winner], 15);
  const l = 1 - winner, sign = l === 0 ? 1 : -1;
  let inHome = false;
  for (let q = 1; q <= 6; q++) if (s.points[(winner === 0 ? q : 25 - q) - 1] * sign > 0) inHome = true;
  const exp = s.off[l] > 0 ? 1 : s.bar[l] > 0 || inHome ? 3 : 2;
  assert.equal(m, exp, 'Gammon/Backgammon falsch');
  assert.equal(points, m * s.cube.value, 'Punkte ≠ Faktor × Würfel');
  return m;
}

// Verfälschte Züge: nur legal, wenn die Endstellung zu einem legalen Zug gehört
function fuzz(s, legal, finals, rng, r) {
  const bad = [];
  const m = pick(rng, legal);
  bad.push({ type: 'roll' }, { type: 'take' }, { type: 'play', steps: m.steps, x: 1 });
  if (m.steps.length) {
    bad.push({ type: 'play', steps: m.steps.slice(0, -1) });
    bad.push({ type: 'play', steps: [...m.steps, m.steps[0]] });
    const i = randInt(rng, m.steps.length), st = m.steps[i];
    const shifted = { ...st, to: st.to === 'off' ? pick(rng, [1, 24, 3, 22]) : st.to + pick(rng, [-2, -1, 1, 2]) };
    const steps = m.steps.slice(); steps[i] = shifted;
    const cand = { type: 'play', steps };
    if (B.isLegal(s, cand)) assert.ok(finals.has(boardKey(B.applyMove(s, cand))), 'verfälschter Zug legal, Stellung fremd');
    else r.fuzz++;
    const rev = { type: 'play', steps: m.steps.slice().reverse() };
    if (B.isLegal(s, rev)) assert.ok(finals.has(boardKey(B.applyMove(s, rev))));
  } else bad.push({ type: 'play', steps: [{ from: 'bar', to: pick(rng, [1, 24]) }] });
  for (const b of bad) {
    assert.equal(B.isLegal(s, b), false, `isLegal akzeptiert ${JSON.stringify(b)}`);
    assert.throws(() => B.applyMove(s, b), /Illegaler Zug/);
    r.fuzz++;
  }
}

function playRandom(gseed, r) {
  const rng = mulberry32(gseed);
  let s = freeze(B.initialState({ cube: gseed % 2 === 0 }));
  let acts = 0;
  while (!s.over) {
    if (++acts > SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} erreicht`);
    checkState(s);
    if (B.chance(s)) { s = freeze(B.applyChance(s, dice(rng))); r.rolls++; continue; }
    const legal = B.legalMoves(s);
    assert.ok(legal.length > 0, 'keine legalen Züge, obwohl die Partie läuft');
    let m;
    if (s.phase === 'roll') m = legal.length > 1 && rng() < 0.08 ? legal[1] : legal[0];
    else if (s.phase === 'double') m = rng() < 0.75 ? legal[0] : legal[1];
    else {
      m = pick(rng, legal);
      if (r.plays % 7 === 0) {   // alle legalen Züge: isLegal, verschiedene Endstellungen, gleich lang
        const finals = new Set();
        for (const x of legal) {
          assert.ok(B.isLegal(s, x), 'legaler Zug abgelehnt');
          assert.equal(x.steps.length, legal[0].steps.length, 'unterschiedlich viele Teilzüge');
          finals.add(boardKey(B.applyMove(s, x)));
        }
        assert.equal(finals.size, legal.length, 'Endstellungen doppelt');
        fuzz(s, legal, finals, rng, r);
        r.legalChecks += legal.length;
      }
      if (!legal[0].steps.length) r.noMove++;
      r.maxLegal = Math.max(r.maxLegal, legal.length);
    }
    assert.ok(B.isLegal(s, m));
    const n = freeze(B.applyMove(s, m));
    if (m.type === 'play') {
      checkPlay(s, m, n);
      r.plays++;
      r.hits += n.last.steps.filter(x => x.hit).length;
    } else r.cubeActs++;
    s = n;
  }
  checkState(s);
  const kind = checkEnd(s);
  r.ends[kind] = (r.ends[kind] || 0) + 1;
  r.maxActs = Math.max(r.maxActs, acts);
  r.maxCube = Math.max(r.maxCube, s.cube.value);
}

function runSwarm({ from, to }, seed) {
  const r = { games: 0, plays: 0, rolls: 0, hits: 0, noMove: 0, cubeActs: 0, legalChecks: 0, fuzz: 0,
    maxLegal: 0, maxActs: 0, maxCube: 1, ends: {} };
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

// Bot-Partien ohne Verdopplungswürfel; Seiten abwechselnd. a = geprüfte Stufe, b = Gegner (0 = Zufall)
function runBot({ a, b, from, to }, seed) {
  const r = { games: 0, winsA: 0, maxMs: 0 };
  for (let g = from; g < to; g++) {
    const rng = mulberry32(mix(seed, 2 + a * 10 + b, g));
    const lv = g % 2 ? [b, a] : [a, b];
    let s = B.initialState({ cube: false }), acts = 0;
    while (!s.over) {
      if (++acts > SAFETY) throw new Error('Bot-Partie endet nicht');
      if (B.chance(s)) { s = B.applyChance(s, dice(rng)); continue; }
      const L = lv[B.currentPlayer(s)];
      const t = performance.now();
      const m = L === 0 ? pick(rng, B.legalMoves(s)) : chooseMove(s, { level: L, rng, timeMs: BOT3_MS });
      r.maxMs = Math.max(r.maxMs, performance.now() - t);
      s = B.applyMove(s, m);
    }
    r.games++;
    if (s.over.winner === (g % 2 ? 1 : 0)) r.winsA++;
  }
  return r;
}

// ---------- Hauptprozess ----------

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(x => /^\d+$/.test(x)) ?? 20260929);
  const GAMES = opt('games', 10000), BOT2 = opt('bot2', 200), BOT3 = opt('bot3', 40);
  const W = Math.max(1, Math.min(opt('workers', 3), os.availableParallelism?.() ?? 3));
  const t0 = performance.now();
  const tasks = [];
  const CH = 250;
  for (let i = 0; i < GAMES; i += CH) tasks.push({ kind: 'swarm', from: i, to: Math.min(GAMES, i + CH) });
  for (let i = 0; i < BOT2; i += 50) tasks.push({ kind: 'bot', a: 2, b: 0, from: i, to: Math.min(BOT2, i + 50) });
  for (let i = 0; i < BOT3; i += 10) tasks.push({ kind: 'bot', a: 3, b: 2, from: i, to: Math.min(BOT3, i + 10) });
  // Bot-3-Blöcke (langsam) zuerst verteilen
  tasks.sort((x, y) => (y.a === 3) - (x.a === 3));
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
  const ends = {};
  for (const r of sw) for (const [k, v] of Object.entries(r.ends)) ends[k] = (ends[k] || 0) + v;
  ok(`Schwarm ${GAMES} Zufallspartien: 15 Steine je Seite, nur legale Züge, jede Partie endet`, () => {
    if (errs.length) throw new Error(errs.map(([, r]) => r.error).join('\n'));
    assert.equal(sum('games'), GAMES);
    return `${sum('plays')} Brettzüge, ${sum('hits')} Schläge, ${sum('noMove')} ohne Zug, max ${maxOf('maxLegal')} Züge/Wurf, ` +
      `längste Partie ${maxOf('maxActs')} Aktionen`;
  });
  ok('isLegal ⇔ legalMoves, Fuzz mit verfälschten Zügen', () => {
    assert.ok(sum('legalChecks') > 0 && sum('fuzz') > 0);
    return `${sum('legalChecks')} legale geprüft, ${sum('fuzz')} illegale abgelehnt`;
  });
  ok('Punkte ∈ {1,2,3} × Würfel bzw. Würfelwert bei Aufgabe', () => {
    assert.ok(ends[1] > 0 && ends[2] > 0 && ends.drop > 0, JSON.stringify(ends));
    return `einfach ${ends[1] || 0}, Gammon ${ends[2] || 0}, Backgammon ${ends[3] || 0}, abgelehnt ${ends.drop || 0}; ` +
      `Würfel bis ${maxOf('maxCube')}, ${sum('cubeActs')} Würfel-Aktionen`;
  });
  const bot = (a, b) => results.filter(([t, r]) => t.kind === 'bot' && t.a === a && t.b === b && !r.error).map(([, r]) => r);
  const b2 = bot(2, 0), b3 = bot(3, 2);
  const g2 = b2.reduce((x, r) => x + r.games, 0), w2 = b2.reduce((x, r) => x + r.winsA, 0);
  const g3 = b3.reduce((x, r) => x + r.games, 0), w3 = b3.reduce((x, r) => x + r.winsA, 0);
  ok(`Bot Stufe 2 gegen Zufall (${BOT2} Partien, > 85 %)`, () => {
    assert.equal(g2, BOT2);
    assert.ok(w2 / g2 > 0.85, `${w2}/${g2}`);
    return `${w2}/${g2} = ${(100 * w2 / g2).toFixed(1)} %`;
  });
  ok(`Bot Stufe 3 gegen Stufe 2 (${BOT3} Partien, ${BOT3_MS} ms)`, () => {
    assert.equal(g3, BOT3);
    assert.ok(w3 / g3 >= 0.4, `${w3}/${g3}`);   // kurzer Lauf: nur grobe Plausibilität
    const ms = Math.max(0, ...b3.map(r => r.maxMs));
    assert.ok(ms < 1500, `langsamster Zug ${ms.toFixed(0)} ms`);
    return `${w3}/${g3} = ${(100 * w3 / g3).toFixed(1)} %, langsamster Zug ${ms.toFixed(0)} ms`;
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
