// Schwarm-Test Mühle: Zufallspartien mit Invarianten nach jedem Halbzug, Fuzz mit illegalen Zügen,
// dazu Bot-Stärke (Stufe 2 gegen Zufall, Stufe 3 gegen Stufe 1). Verteilt auf bis zu 4 Worker;
// dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/muehle.swarm.test.mjs [seed] [--games=10000] [--bot2=200] [--bot3=20] [--workers=4]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as M from '../../src/games/muehle/engine.js';
import { chooseMove, stats, _moves } from '../../src/games/muehle/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const SAFETY = 5000;       // Sicherheitsgrenze Halbzüge je Partie
const BOT3_MS = 100;       // Bedenkzeit Stufe 3 im Test
const REASONS = ['weniger als 3 Steine', 'zugunfähig', 'dreifache Wiederholung', '50 Züge ohne Mühle'];

// Seed je Partie aus Grund-Seed, Art und Nummer (unabhängig von der Verteilung auf Worker)
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
  if (task.kind === 'swarm') return runSwarm(task, seed);
  if (task.kind === 'bot2') return runBot(task, seed, 2);
  return runBot(task, seed, 3);
}

// Unabhängige Mühlenprüfung (ohne Engine-Interna)
function inMill(board, i) {
  const c = board[i];
  return c >= 0 && M.MILLS.some(m => m.includes(i) && m.every(j => board[j] === c));
}

// Eingefrorener Zustand: jeder Schreibversuch der Engine würde werfen
function freeze(s) {
  for (const k of ['board', 'hand', 'lost', 'rep', 'last', 'over']) if (s[k]) Object.freeze(s[k]);
  return Object.freeze(s);
}

function checkState(s) {
  assert.equal(s.board.length, 24);
  for (const c of s.board) assert.ok(c === -1 || c === 0 || c === 1, `Brettwert ${c}`);
  assert.ok(s.turn === 0 || s.turn === 1, 'turn');
  const c = M.countStones(s);
  for (const p of [0, 1]) {
    assert.equal(c.board[p] + c.hand[p] + c.lost[p], 9, 'Brett + Hand + geschlagen ≠ 9');
    assert.ok(c.hand[p] >= 0 && c.lost[p] >= 0, 'negative Zähler');
  }
  assert.ok(s.sinceMill >= 0 && s.sinceMill <= 100, 'sinceMill außerhalb 0..100');
  assert.ok(s.rep[M.positionKey(s)] >= 1, 'aktuelle Stellung fehlt in rep');
  assert.deepEqual(M.result(s), s.over, 'result ≠ over');
}

function checkStep(s, m, n) {
  const p = s.turn, o = 1 - p, placing = m.from === undefined, taking = m.remove !== undefined;
  checkState(n);
  assert.equal(n.turn, o, 'Spielerwechsel');
  assert.equal(n.ply, s.ply + 1, 'ply');
  assert.equal(n.lost[p], s.lost[p], 'eigene geschlagene Steine geändert');
  assert.equal(n.lost[o], s.lost[o] + (taking ? 1 : 0), 'geschlagen steigt nur durch remove, um genau 1');
  assert.equal(n.hand[p], s.hand[p] - (placing ? 1 : 0), 'Handsteine');
  assert.equal(n.hand[o], s.hand[o], 'gegnerische Handsteine');
  const exp = s.board.slice();
  if (!placing) exp[m.from] = -1;
  exp[m.to] = p;
  if (taking) exp[m.remove] = -1;
  assert.deepEqual(n.board, exp, 'Brett ändert mehr als den Zug');
  assert.deepEqual(n.last, m, 'last');
  // Regeln unabhängig nachrechnen
  assert.equal(M.phase(s, p) === 'setzen', placing, 'Setzen genau in der Setzphase');
  if (!placing && M.phase(s, p) === 'ziehen') assert.ok(M.ADJ[m.from].includes(m.to), 'Ziehen nur zum Nachbarn');
  const mill = inMill(n.board, m.to);
  assert.equal(taking, mill && s.board.includes(o), 'remove ⇔ Mühle geschlossen und Gegner auf dem Brett');
  if (taking) {
    assert.equal(s.board[m.remove], o, 'nur gegnerische Steine schlagen');
    if (inMill(s.board, m.remove)) {
      assert.ok(s.board.every((c, i) => c !== o || inMill(s.board, i)), 'aus Mühle geschlagen trotz freier Steine');
    }
  }
  if (placing || taking) assert.equal(Object.keys(n.rep).length, 1, 'rep nach unumkehrbarem Zug nicht geleert');
  const counting = s.hand[0] === 0 && s.hand[1] === 0;
  assert.equal(n.sinceMill, mill ? 0 : counting ? s.sinceMill + 1 : 0, 'sinceMill');
  if (!n.over) return;
  assert.deepEqual(M.legalMoves(n), [], 'Züge nach Partieende');
  const { winner, reason } = n.over, c = M.countStones(n);
  assert.ok(REASONS.includes(reason), `Grund ${reason}`);
  if (reason === 'weniger als 3 Steine') {
    assert.equal(winner, p);
    assert.ok(c.board[o] + c.hand[o] < 3);
  } else if (reason === 'zugunfähig') {
    assert.equal(winner, p);
    assert.equal(M.phase(n, o), 'ziehen');
    assert.ok(n.board.every((v, i) => v !== o || M.ADJ[i].every(j => n.board[j] !== -1)), 'doch beweglich');
  } else if (reason === 'dreifache Wiederholung') {
    assert.equal(winner, null);
    assert.equal(n.rep[M.positionKey(n)], 3);
  } else {
    assert.equal(winner, null);
    assert.equal(n.sinceMill, 100);
  }
}

// Müll, der in jeder Stellung illegal ist
const JUNK = [
  () => null, () => undefined, () => 'd7', () => 7, () => NaN, () => true, () => [], () => [3, 4], () => ({}),
  () => ({ to: 1.5 }), () => ({ to: -1 }), () => ({ to: 24 }), () => ({ to: '3' }), () => ({ to: NaN }),
  () => ({ to: null }), () => ({ to: { i: 3 } }), () => ({ from: null, to: 3 }), () => ({ from: 0.5, to: 1 }),
  () => ({ from: Infinity, to: 1 }), () => ({ to: 3, remove: null }), () => ({ to: 3, extra: true }),
  () => ({ from: 1, to: 2, remove: 'x' })
];
const POOL = [undefined, undefined, undefined, null, -1, 24, 2.5, '5', ...Array.from({ length: 24 }, (_, i) => i)];

// Gezielte illegale Züge je Kategorie + zufällige Beinahe-Züge
function fuzz(s, legal, keySet, rng, r) {
  const p = s.turn, o = 1 - p, b = s.board, ph = M.phase(s, p);
  const own = [], opp = [], empty = [];
  b.forEach((c, i) => (c === p ? own : c === o ? opp : empty).push(i));
  const bad = [];
  if (opp.length) bad.push(['falscher Spieler', { from: pick(rng, opp), to: pick(rng, empty) }]);
  const occ = own.concat(opp);
  if (occ.length) {
    bad.push(['besetzt', ph === 'setzen' ? { to: pick(rng, occ) } : { from: pick(rng, own), to: pick(rng, occ) }]);
  }
  if (ph === 'ziehen') {
    const pairs = [];
    for (const f of own) for (const t of empty) if (!M.ADJ[f].includes(t)) pairs.push({ from: f, to: t });
    if (pairs.length) bad.push(['kein Nachbar', pick(rng, pairs)]);
  }
  if (ph !== 'setzen') bad.push(['Setzen statt Ziehen', { to: pick(rng, empty) }]);
  else if (own.length) bad.push(['Ziehen statt Setzen', { from: pick(rng, own), to: pick(rng, empty) }]);
  const withRem = legal.filter(m => m.remove !== undefined), without = legal.filter(m => m.remove === undefined);
  if (withRem.length) {
    const m = pick(rng, withRem);
    const { remove, ...rest } = m;
    bad.push(['remove fehlt', rest]);
    const ok = new Set(withRem.filter(x => x.from === m.from && x.to === m.to).map(x => x.remove));
    const wrong = [...Array(24).keys()].filter(i => !ok.has(i));   // eigene, leere oder geschützte Steine
    bad.push(['falsches remove', { ...m, remove: pick(rng, wrong) }]);
  }
  if (without.length) bad.push(['überflüssiges remove', { ...pick(rng, without), remove: randInt(rng, 24) }]);
  bad.push(['Müll', pick(rng, JUNK)()]);
  for (const [cat, m] of bad) {
    assert.equal(keySet.has(M.moveKey(m)), false, `${cat}: ${M.moveKey(m)} steht in legalMoves`);
    assert.equal(M.isLegal(s, m), false, `${cat}: isLegal akzeptiert ${M.moveKey(m)}`);
    assert.throws(() => M.applyMove(s, m), /Illegaler Zug/, `${cat}: applyMove wirft nicht`);
    r.fuzz++;
    r.fuzzCats[cat] = (r.fuzzCats[cat] || 0) + 1;
  }
  // zufällige Beinahe-Züge: isLegal ⇔ Schlüssel unter den legalen
  for (let k = 0; k < 8; k++) {
    const m = {};
    for (const f of ['from', 'to', 'remove']) {
      const v = pick(rng, POOL);
      if (v !== undefined) m[f] = v;
    }
    const legalKey = keySet.has(M.moveKey(m));
    assert.equal(M.isLegal(s, m), legalKey, `isLegal ≠ legalMoves für ${M.moveKey(m)}`);
    if (!legalKey) {
      assert.throws(() => M.applyMove(s, m), /Illegaler Zug/);
      r.fuzz++;
      r.fuzzCats['zufällig'] = (r.fuzzCats['zufällig'] || 0) + 1;
    }
  }
}

function playRandom(gseed, r) {
  const rng = mulberry32(gseed);
  let s = freeze(M.initialState());
  checkState(s);
  while (!s.over) {
    if (s.ply >= SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} Halbzüge erreicht`);
    try {
      const legal = M.legalMoves(s);
      assert.ok(legal.length > 0, 'keine legalen Züge, obwohl die Partie läuft');
      const keySet = new Set(legal.map(M.moveKey));
      assert.equal(keySet.size, legal.length, 'moveKey nicht eindeutig');
      if (s.ply % 2 === 0) {   // jeder Zug aus legalMoves ist isLegal
        for (const m of legal) assert.ok(M.isLegal(s, m), `legaler Zug ${M.moveKey(m)} abgelehnt`);
        r.legalChecks += legal.length;
      }
      if (s.ply % 6 === 0) {   // … und applyMove wirft nicht
        for (const m of legal) checkState(M.applyMove(s, m));
        r.applyChecks += legal.length;
      }
      if (s.ply % 5 === 0) {   // Bot-Zugerzeugung = Engine
        const bot = _moves(s).map(M.moveKey).sort().join(' ');
        assert.equal(bot, [...keySet].sort().join(' '), 'Bot-Zugerzeugung ≠ legalMoves');
        r.genChecks++;
      }
      if (s.ply === 0 || rng() < 0.08) fuzz(s, legal, keySet, rng, r);
      const m = pick(rng, legal);
      assert.ok(M.isLegal(s, m), 'gewählter Zug nicht isLegal');
      const snap = s.ply % 10 === 0 ? JSON.stringify(s) : null;
      const n = M.applyMove(s, m);
      if (snap) {
        assert.equal(JSON.stringify(s), snap, 'Eingabezustand verändert');
        assert.deepStrictEqual(JSON.parse(JSON.stringify(n)), n, 'JSON-Rundreise');
        r.jsonChecks++;
      }
      checkStep(s, m, n);
      s = freeze(n);
    } catch (e) {
      e.message = `Halbzug ${s.ply + 1} (${M.positionKey(s)}): ${e.message}`;
      throw e;
    }
  }
  return s;
}

function runSwarm({ from, to }, seed) {
  const r = {
    kind: 'swarm', games: 0, failed: 0, plies: 0, maxLen: 0, wins: [0, 0], draws: 0, reasons: {},
    fuzz: 0, fuzzCats: {}, legalChecks: 0, applyChecks: 0, genChecks: 0, jsonChecks: 0, failures: []
  };
  for (let g = from; g < to; g++) {
    const gs = mix(seed, 1, g);
    try {
      const s = playRandom(gs, r);
      r.games++;
      r.plies += s.ply;
      r.maxLen = Math.max(r.maxLen, s.ply);
      if (s.over.winner === null) r.draws++;
      else r.wins[s.over.winner]++;
      r.reasons[s.over.reason] = (r.reasons[s.over.reason] || 0) + 1;
    } catch (e) {
      r.failed++;
      if (r.failures.length < 5) r.failures.push(`Partie ${g} (Seed ${gs}): ${String(e.message).slice(0, 400)}`);
    }
  }
  return r;
}

// Stufe 2 gegen Zufall bzw. Stufe 3 gegen Stufe 1; Farbe des geprüften Bots wechselt
function runBot({ from, to }, seed, level) {
  const r = { kind: `bot${level}`, games: 0, w: 0, d: 0, l: 0, plies: 0, moves: 0, maxMs: 0, slow: 0, depth: 0, failures: [] };
  for (let g = from; g < to; g++) {
    const me = g % 2, rMe = mulberry32(mix(seed, 10 + level, g)), rOp = mulberry32(mix(seed, 20 + level, g));
    let s = M.initialState();
    try {
      while (!s.over) {
        if (s.ply >= SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} Halbzüge erreicht`);
        let m;
        if (s.turn === me) {
          const t = performance.now();
          m = chooseMove(s, { level, rng: rMe, timeMs: BOT3_MS });
          const dt = performance.now() - t;
          r.maxMs = Math.max(r.maxMs, dt);
          if (level === 3 && dt > BOT3_MS + 50) r.slow++;
          r.moves++;
          r.depth += stats.depth;
        } else {
          m = level === 3 ? chooseMove(s, { level: 1, rng: rOp }) : pick(rOp, M.legalMoves(s));
        }
        assert.ok(M.isLegal(s, m), `illegaler Zug ${M.moveKey(m)}`);
        s = M.applyMove(s, m);
      }
      r.games++;
      r.plies += s.ply;
      if (s.over.winner === me) r.w++;
      else if (s.over.winner === null) r.d++;
      else r.l++;
    } catch (e) {
      if (r.failures.length < 5) r.failures.push(`Bot-Partie ${g}: ${String(e.message).slice(0, 300)}`);
    }
  }
  return r;
}

// ---------- Hauptprozess ----------

async function main() {
  const t0 = performance.now();
  const args = process.argv.slice(2);
  const opt = (k, d) => {
    const a = args.find(x => x.startsWith(`--${k}=`));
    return a ? Number(a.slice(k.length + 3)) : d;
  };
  const seed = (opt('seed', undefined) ?? Number(args.find(a => /^\d+$/.test(a)) ?? 20260928)) >>> 0;
  const games = opt('games', 10000), nBot2 = opt('bot2', 200), nBot3 = opt('bot3', 20);
  const cores = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
  const nWorkers = Math.max(1, Math.min(4, opt('workers', 4), cores));
  console.log(`Mühle-Schwarm: Seed ${seed}, ${games} Zufallspartien, Bot ${nBot2}×Stufe 2 + ${nBot3}×Stufe 3, ${nWorkers} Worker`);

  // lange Aufgaben zuerst (Stufe 3 rechnet mit Bedenkzeit), dann Pakete
  const tasks = [];
  for (let g = 0; g < nBot3; g++) tasks.push({ kind: 'bot3', from: g, to: g + 1 });
  for (let g = 0; g < nBot2; g += 20) tasks.push({ kind: 'bot2', from: g, to: Math.min(nBot2, g + 20) });
  for (let g = 0; g < games; g += 250) tasks.push({ kind: 'swarm', from: g, to: Math.min(games, g + 250) });

  const results = [], pool = [];
  try {
    await new Promise((resolve, reject) => {
      let next = 0, done = 0;
      if (!tasks.length) resolve();
      for (let k = 0; k < Math.min(nWorkers, tasks.length); k++) {
        const w = new Worker(new URL(import.meta.url), { workerData: { seed } });
        pool.push(w);
        const feed = () => { if (next < tasks.length) w.postMessage(tasks[next++]); };
        w.on('message', res => {
          results.push(res);
          if (++done === tasks.length) resolve();
          else feed();
        });
        w.on('error', reject);
        w.on('exit', code => { if (done < tasks.length) reject(new Error(`Worker vorzeitig beendet (${code})`)); });
        feed();
      }
    });
  } finally {
    await Promise.all(pool.map(w => w.terminate()));
  }

  let failed = 0;
  const line = (ok, text) => {
    if (!ok) failed++;
    console.log(`${ok ? '✅' : '❌'} ${text}`);
  };
  const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0') + ' %';

  // Schwarm
  const sw = results.filter(r => r.kind === 'swarm');
  const sum = k => sw.reduce((a, r) => a + r[k], 0);
  const played = sum('games'), bad = sum('failed'), plies = sum('plies');
  const maxLen = Math.max(0, ...sw.map(r => r.maxLen));
  const wins = [0, 1].map(p => sw.reduce((a, r) => a + r.wins[p], 0)), draws = sum('draws');
  const reasons = {}, cats = {};
  for (const r of sw) {
    for (const [k, v] of Object.entries(r.reasons)) reasons[k] = (reasons[k] || 0) + v;
    for (const [k, v] of Object.entries(r.fuzzCats)) cats[k] = (cats[k] || 0) + v;
  }
  line(bad === 0 && played === games,
    `${played}/${games} Zufallspartien, ${plies} Halbzüge: Invarianten nach jedem Halbzug erfüllt`);
  for (const f of sw.flatMap(r => r.failures).slice(0, 5)) console.log(`   ${f}`);
  console.log(`   Ergebnisse: Weiß ${wins[0]} (${pct(wins[0], played)}) · Schwarz ${wins[1]} (${pct(wins[1], played)}) · Remis ${draws} (${pct(draws, played)})`);
  console.log(`   Gründe: ${REASONS.map(k => `${k} ${reasons[k] || 0}`).join(' · ')}`);
  console.log(`   Partielänge: Mittel ${(plies / Math.max(1, played)).toFixed(1)}, Max ${maxLen} Halbzüge (Grenze ${SAFETY})`);
  line(bad === 0 && maxLen < SAFETY, `Jede Partie endet (längste ${maxLen} < ${SAFETY} Halbzüge)`);
  line(bad === 0 && sum('legalChecks') > 0,
    `Züge aus legalMoves: ${sum('legalChecks')}× isLegal, ${sum('applyChecks')}× applyMove ohne Fehler; ${sum('jsonChecks')} JSON-Rundreisen`);
  line(bad === 0 && sum('fuzz') > 0,
    `Fuzz: ${sum('fuzz')} illegale Züge abgelehnt (isLegal false, applyMove wirft)`);
  console.log(`   ${Object.entries(cats).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  line(bad === 0 && sum('genChecks') > 0, `Bot-Zugerzeugung = legalMoves in ${sum('genChecks')} Stellungen`);

  // Bots
  const agg = kind => {
    const rs = results.filter(r => r.kind === kind);
    const a = { games: 0, w: 0, d: 0, l: 0, plies: 0, moves: 0, maxMs: 0, slow: 0, depth: 0, failures: [] };
    for (const r of rs) {
      for (const k of ['games', 'w', 'd', 'l', 'plies', 'moves', 'slow', 'depth']) a[k] += r[k];
      a.maxMs = Math.max(a.maxMs, r.maxMs);
      a.failures.push(...r.failures);
    }
    return a;
  };
  const b2 = agg('bot2');
  if (nBot2) {
    line(b2.failures.length === 0 && b2.games === nBot2 && b2.w >= 0.9 * nBot2,
      `Bot Stufe 2 gegen Zufall: ${b2.w} S / ${b2.d} R / ${b2.l} N in ${b2.games} Partien (${pct(b2.w, nBot2)}, Soll ≥ 90 %), ` +
      `Ø ${(b2.plies / Math.max(1, b2.games)).toFixed(0)} Halbzüge, Zug max ${b2.maxMs.toFixed(1)} ms`);
    for (const f of b2.failures.slice(0, 5)) console.log(`   ${f}`);
  }
  const b3 = agg('bot3');
  if (nBot3) {
    const net = b3.w - b3.l;
    line(b3.failures.length === 0 && b3.games === nBot3 && net >= 0.5 * nBot3,
      `Bot Stufe 3 (${BOT3_MS} ms) gegen Stufe 1: ${b3.w} S / ${b3.d} R / ${b3.l} N, Bilanz ${net >= 0 ? '+' : ''}${net}, ` +
      `Ø Tiefe ${(b3.depth / Math.max(1, b3.moves)).toFixed(1)}`);
    line(b3.slow === 0, `Antwortzeit Stufe 3: max ${b3.maxMs.toFixed(1)} ms bei timeMs ${BOT3_MS} (Soll ≤ ${BOT3_MS + 50}), ${b3.moves} Züge`);
    for (const f of b3.failures.slice(0, 5)) console.log(`   ${f}`);
  }

  console.log(`\nMühle-Schwarm: ${failed ? `${failed} Prüfung(en) fehlgeschlagen` : 'alles grün'} – Seed ${seed}, Laufzeit ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  process.exitCode = failed ? 1 : 0;
}
