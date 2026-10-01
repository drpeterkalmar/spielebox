// Schwarm-Test Würfelglück: 10 000 Zufallspartien (1–6 Spieler, alle Optionen gemischt, Würfel über
// chance/applyChance mit mulberry32), Züge gemischt aus Zufall und Bot-Stufe 1/2 (Stufe 3 in jeder 100. Partie).
// Invarianten nach jedem Schritt: jedes Feld höchstens einmal und nie überschrieben, Würfel 1..6, rolls ≤ 3,
// Punkte = unabhängige Nachrechnung (inkl. Joker-Varianten und Streich-Regel), Summen = totals, Zugreihenfolge
// und Runden stimmen, nur legale Züge, isLegal lehnt verfälschte Züge ab, JSON-Rundreise und positionKey stabil.
// Nach dem Ende: alle 13 Felder je Spieler gefüllt, result passt zu den Summen.
// Höchstens 2 Worker (8-GB-Mac, mehrere Agenten parallel); dieselbe Datei läuft im Worker.
// Aufruf: node tests/node/wuerfel.swarm.test.mjs [seed] [--games=10000] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import assert from 'node:assert/strict';
import * as W from '../../src/games/wuerfel/engine.js';
import { chooseMove } from '../../src/games/wuerfel/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const KEYS = W.CAT_KEYS;
const UP = { einser: 1, zweier: 2, dreier: 3, vierer: 4, fuenfer: 5, sechser: 6 };
const MAXP = { einser: 5, zweier: 10, dreier: 15, vierer: 20, fuenfer: 25, sechser: 30, dreierpasch: 30,
  viererpasch: 30, fullhouse: 25, kleine: 30, grosse: 40, fuenferpasch: 50, chance: 30 };

if (isMainThread) await main();
else parentPort.on('message', task => parentPort.postMessage(runTask(task)));

// ---------- unabhängige Wertung ----------

function plain(dice, cat) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  dice.forEach(d => c[d]++);
  const s = dice.reduce((a, b) => a + b, 0);
  const has = n => c.some(x => x >= n);
  const str = len => [1, 2, 3].some(a => a + len - 1 <= 6 && Array.from({ length: len }, (_, i) => c[a + i]).every(Boolean));
  if (cat in UP) return c[UP[cat]] * UP[cat];
  return {
    dreierpasch: has(3) ? s : 0, viererpasch: has(4) ? s : 0,
    fullhouse: c.includes(3) && c.includes(2) ? 25 : 0,
    kleine: str(4) ? 30 : 0, grosse: str(5) ? 40 : 0, fuenferpasch: has(5) ? 50 : 0, chance: s
  }[cat];
}
function expect(dice, cat, sheet, opts) {
  const five = dice.every(d => d === dice[0]);
  const joker = five && sheet.fuenferpasch === 50 && opts.joker !== 'aus';
  return { points: joker && opts.joker === 'grund' ? MAXP[cat] : plain(dice, cat), extra: joker ? 50 : 0 };
}
function allowed(dice, sheet, opts) {
  const free = KEYS.filter(k => sheet[k] === null);
  if (opts.freiStreichen) return free;
  const fit = free.filter(k => expect(dice, k, sheet, opts).points > 0);
  return fit.length ? fit : free;
}
function sumSheet(sh) {
  let oben = 0, unten = 0;
  for (const k of KEYS) if (sh[k] !== null) { if (k in UP) oben += sh[k]; else unten += sh[k]; }
  return oben + unten + sh.extra + (oben >= 63 ? 35 : 0);
}

// ---------- Prüfungen ----------

// sheets = true: auch alle Blöcke prüfen (nur nötig, wenn sich ein Block geändert haben kann)
function checkState(s, sheets) {
  assert.ok(['roll', 'rolling', 'choose', 'over'].includes(s.phase), 'Phase');
  assert.equal(s.sheets.length, s.n);
  assert.ok(Number.isInteger(s.rolls) && s.rolls >= 0 && s.rolls <= 3, 'rolls ≤ 3');
  assert.ok(Array.isArray(s.held) && s.held.length === 5 && s.held.every(h => typeof h === 'boolean'), 'held');
  assert.ok(s.round >= 1 && s.round <= 13, 'Runde');
  if (s.dice !== null) {
    assert.equal(s.dice.length, 5);
    assert.ok(s.dice.every(d => Number.isInteger(d) && d >= 1 && d <= 6), 'Würfel 1..6');
  }
  if (s.phase === 'roll' || s.phase === 'over') { assert.equal(s.dice, null); assert.equal(s.rolls, 0); }
  if (s.phase === 'choose') { assert.ok(s.dice && s.rolls >= 1); }
  if (s.phase === 'rolling') {
    assert.ok(s.rolls >= 1);
    assert.deepEqual(W.chance(s), { kind: 'dice', n: s.held.filter(h => !h).length });
    if (s.rolls === 1) assert.ok(s.held.every(h => !h), 'erster Wurf mit allen');
  } else assert.equal(W.chance(s), null);
  // Felder je Sitz passend zu Runde und Zugreihenfolge
  for (let i = 0; sheets && i < s.n; i++) {
    const sh = s.sheets[i];
    const filled = KEYS.filter(k => sh[k] !== null).length;
    for (const k of KEYS) assert.ok(sh[k] === null || (Number.isInteger(sh[k]) && sh[k] >= 0 && sh[k] <= MAXP[k]), `Feld ${k}`);
    assert.ok(Number.isInteger(sh.extra) && sh.extra >= 0 && sh.extra % 50 === 0);
    const want = s.phase === 'over' ? 13 : i < s.turn ? s.round : s.round - 1;
    assert.equal(filled, want, `Sitz ${i}: ${filled} Felder statt ${want}`);
    const t = W.totals(sh);
    assert.equal(t.gesamt, sumSheet(sh), 'Summe');
    assert.equal(t.gesamt, t.oben + t.bonus + t.unten + t.extra);
  }
  const cp = W.currentPlayer(s);
  if (s.phase === 'rolling' || s.phase === 'over') {
    assert.equal(cp, null);
    assert.deepEqual(W.legalMoves(s), []);
  } else assert.equal(cp, s.turn);
  if (s.phase === 'over') {
    const r = W.result(s), sums = s.sheets.map(sumSheet), best = Math.max(...sums);
    assert.equal(r.points, best);
    if (s.n === 1) assert.equal(r.winner, 0);
    else if (sums.filter(x => x === best).length > 1) assert.equal(r.winner, null);
    else assert.equal(r.winner, sums.indexOf(best));
  } else assert.equal(W.result(s), null);
}

// Erlaubte Züge unabhängig nachrechnen und verfälschte Züge ablehnen
function checkMoves(s, ms, rng) {
  const sheet = s.sheets[s.turn];
  const rolls = ms.filter(m => m.type === 'roll'), scores = ms.filter(m => m.type === 'score');
  if (s.phase === 'roll') {
    assert.deepEqual(ms, [{ type: 'roll', hold: [false, false, false, false, false] }]);
  } else {
    assert.equal(rolls.length, s.rolls < 3 ? 31 : 0);
    assert.deepEqual(scores.map(m => m.cat).sort(), allowed(s.dice, sheet, s.opts).sort(), 'erlaubte Felder');
  }
  const m = pick(rng, ms);
  assert.ok(W.isLegal(s, m), 'legalMoves-Zug nicht legal');
  const bad = [
    { type: 'roll', hold: [false, false, false, false] },
    { type: 'roll', hold: [false, false, false, false, false, false] },
    { type: 'roll', hold: [0, 0, 0, 0, 0] },
    { type: 'roll', hold: [true, true, true, true, true] },
    { type: 'roll', hold: [false, false, false, false, false], x: 1 },
    { type: 'score', cat: pick(rng, ['nix', 'extra', '', 'Chance', '__proto__']) },
    { type: 'score', cat: 'chance', points: 99 },
    { type: pick(rng, ['pass', 'hold', 'Roll', '']) },
    pick(rng, [null, 7, 'roll', [], {}])
  ];
  const full = KEYS.filter(k => sheet[k] !== null);
  if (full.length) bad.push({ type: 'score', cat: pick(rng, full) });
  if (s.phase === 'roll') bad.push({ type: 'score', cat: 'chance' }, { type: 'roll', hold: [true, false, false, false, false] });
  if (s.phase === 'choose' && s.rolls >= 3) bad.push({ type: 'roll', hold: [true, false, false, false, false] });
  if (s.phase === 'choose') {
    const forbidden = KEYS.filter(k => sheet[k] === null && !allowed(s.dice, sheet, s.opts).includes(k));
    if (forbidden.length) bad.push({ type: 'score', cat: pick(rng, forbidden) });
  }
  for (const b of bad) assert.equal(W.isLegal(s, b), false, `illegal angenommen: ${JSON.stringify(b)}`);
}

// ---------- Partie ----------

function playGame(seed, g) {
  const rng = mulberry32(seed);
  const opts = {
    players: 1 + randInt(rng, 6),
    joker: pick(rng, ['grund', 'meister', 'aus']),
    freiStreichen: rng() < 0.5
  };
  // Spielweise je Sitz: Zufall oder Bot (Stufe 3 nur in jeder 100. Partie, sonst zu teuer)
  const style = Array.from({ length: opts.players }, () => {
    const r = rng();
    return r < 0.4 ? 0 : r < 0.7 ? 1 : 2;
  });
  if (g % 100 === 0) style[0] = 3;
  let s = W.initialState(opts);
  checkState(s, true);
  let steps = 0, lastScore = 0;
  const seen = s.sheets.map(() => ({}));
  while (!W.result(s)) {
    assert.ok(++steps < 2000, 'Partie endet nicht');
    const ch = W.chance(s);
    if (ch) {
      const before = s;
      const v = Array.from({ length: ch.n }, () => 1 + randInt(rng, 6));
      s = W.applyChance(s, v);
      for (let i = 0; i < 5; i++) if (before.held[i]) assert.equal(s.dice[i], before.dice[i], 'gehaltener Würfel verändert');
      assert.deepEqual(s.dice.filter((_, i) => !before.held[i]), v, 'Würfel nicht in Reihenfolge gefüllt');
      checkState(s, false);
      continue;
    }
    const ms = W.legalMoves(s);
    assert.ok(ms.length > 0, 'keine Züge');
    if (steps % 5 === 0) checkMoves(s, ms, rng);
    let m;
    const st = style[s.turn];
    if (st === 0) {
      // Zufall: lieber würfeln als sofort eintragen
      const rolls = ms.filter(x => x.type === 'roll');
      m = rolls.length && rng() < 0.6 ? pick(rng, rolls) : pick(rng, ms.filter(x => x.type === 'score').length ? ms.filter(x => x.type === 'score') : ms);
    } else m = chooseMove(s, { level: st, rng });
    assert.ok(W.isLegal(s, m), `Zug nicht legal: ${JSON.stringify(m)}`);
    assert.equal(typeof W.describeMove(s, m), 'string');
    const prev = s;
    s = W.applyMove(s, m);
    assert.equal(s.ply, prev.ply + 1);
    if (m.type === 'score') {
      const p = prev.turn, want = expect(prev.dice, m.cat, prev.sheets[p], prev.opts);
      assert.equal(seen[p][m.cat], undefined, 'Feld doppelt');
      seen[p][m.cat] = true;
      assert.equal(s.sheets[p][m.cat], want.points, `Punkte ${m.cat} ${prev.dice}`);
      assert.equal(s.sheets[p].extra, prev.sheets[p].extra + want.extra, 'Zusatzpunkte');
      for (const k of KEYS) if (k !== m.cat) assert.equal(s.sheets[p][k], prev.sheets[p][k], 'anderes Feld verändert');
      for (let i = 0; i < s.n; i++) if (i !== p) assert.deepEqual(s.sheets[i], prev.sheets[i]);
      assert.deepEqual(s.last, { seat: p, cat: m.cat, points: want.points, extra: want.extra, dice: prev.dice });
      assert.equal(s.turn, (p + 1) % s.n, 'Zugreihenfolge');
      lastScore++;
    } else {
      assert.equal(s.turn, prev.turn);
      assert.equal(s.rolls, prev.rolls + 1);
    }
    checkState(s, m.type === 'score');
    if (steps % 7 === 0) {
      const j = JSON.parse(JSON.stringify(s));
      assert.deepEqual(j, s, 'JSON-Rundreise');
      assert.equal(W.positionKey(j), W.positionKey(s), 'positionKey');
      for (let k = 0; k < s.n; k++) assert.ok(Number.isFinite(W.evaluate(s, k)), 'evaluate endlich');
      if (s.n === 2) assert.ok(Math.abs(W.evaluate(s, 0) + W.evaluate(s, 1)) < 1e-9, 'evaluate symmetrisch');
    }
  }
  assert.equal(lastScore, 13 * s.n, 'genau 13 Einträge je Spieler');
  assert.ok(s.sheets.every(sh => KEYS.every(k => sh[k] !== null)), 'alle 13 Felder gefüllt');
  return { players: opts.players, total: Math.max(...s.sheets.map(sumSheet)), steps };
}

function runTask({ from, to, seed }) {
  try {
    let games = 0, steps = 0;
    const byPlayers = [0, 0, 0, 0, 0, 0, 0];
    for (let g = from; g < to; g++) {
      const r = playGame((seed * 1000003 + g * 7919) >>> 0, g);
      games++; steps += r.steps; byPlayers[r.players]++;
    }
    return { games, steps, byPlayers };
  } catch (e) {
    return { error: String((e && e.stack) || e) };
  }
}

// ---------- Hauptprogramm ----------

async function main() {
  const t0 = performance.now();
  const args = process.argv.slice(2);
  const num = (name, d) => { const a = args.find(x => x.startsWith(`--${name}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(a => /^\d+$/.test(a)) || 2026);
  const games = num('games', 10000);
  const workers = Math.max(1, Math.min(2, num('workers', 2)));
  const chunk = Math.ceil(games / workers);
  const tasks = Array.from({ length: workers }, (_, i) => ({ from: i * chunk, to: Math.min(games, (i + 1) * chunk), seed }));
  const results = await Promise.all(tasks.map(task => new Promise((res, rej) => {
    const w = new Worker(new URL(import.meta.url), { workerData: {} });
    w.once('message', m => { res(m); w.terminate(); });
    w.once('error', rej);
    w.postMessage(task);
  })));
  let failed = 0, total = 0, steps = 0;
  const byPlayers = [0, 0, 0, 0, 0, 0, 0];
  for (const r of results) {
    if (r.error) { failed++; console.log(`❌ ${r.error.split('\n').slice(0, 6).join('\n   ')}`); continue; }
    total += r.games; steps += r.steps;
    r.byPlayers.forEach((n, i) => { byPlayers[i] += n; });
  }
  const sec = ((performance.now() - t0) / 1000).toFixed(1);
  if (!failed) {
    console.log(`✅ ${total} Partien, ${steps} Schritte, Spielerzahlen 1–6: ${byPlayers.slice(1).join('/')} ` +
      `(${workers} Worker, Seed ${seed})`);
  }
  console.log(`\n${failed ? `${failed} ❌` : 'Schwarm grün'} (${sec} s)`);
  process.exit(failed ? 1 : 0);
}
