// Schwarm-Test Mau-Mau: 10 000 Zufallspartien über alle Spielerzahlen (2–5) und alle 16 Options-Kombinationen
// (sieben/unter/ass/mau), Mischen über chance/applyChance mit mulberry32. Zugwahl je Partie wechselnd: ganz zufällig
// (auch viel Ziehen → oft Nachmischen), „lieber legen“, Bots Stufe 1/2 und selten Stufe 3 mit wenigen Stichproben.
// Invarianten nach jedem Schritt: 32 verschiedene Karten in Händen + Stapel + Ablage (owed hält keine Karten, nur eine
// Zahl), Zugliste = unabhängiger Nachbau, Übergänge (Karte wandert, 7er-Strafe, Wunsch, Daus, Mau-Strafe, Ziehen),
// Müll-Züge werden abgelehnt, jede Partie endet, Sicht ohne fremde Hand-/Stapelkarte mit richtigen Längen,
// evaluate auf Sicht = voll, JSON-Rundreise und positionKey stabil.
// 10 000 Partien: eine Partie ≈ 30–300 Züge, die Prüfungen sind billig → mit 2 Workern deutlich unter 60 s.
// Höchstens 2 Worker (8-GB-Mac, mehrere Agenten parallel); dieselbe Datei läuft im Worker (isMainThread = false).
// Aufruf: node tests/node/maumau.swarm.test.mjs [seed] [--games=10000] [--workers=2]
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import assert from 'node:assert/strict';
import * as M from '../../src/games/maumau/engine.js';
import { chooseMove } from '../../src/games/maumau/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const SAFETY = 5000;   // Sicherheitsgrenze Schritte je Partie (Engine selbst endet nach MAX_PLY = 1500 Zügen)
const SUITS = ['H', 'S', 'L', 'E'];

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
else parentPort.on('message', task => parentPort.postMessage(runSwarm(task, workerData.seed)));

// ---------- Worker ----------

const deepFreeze = o => {
  if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); }
  return o;
};
const shufflePerm = (n, rng) => {
  const a = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = randInt(rng, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

// Unabhängiger Nachbau der Zugliste (als sortierte moveKeys)
function refKeys(s) {
  const o = s.opts, top = s.pile[s.pile.length - 1], hand = s.hands[s.turn];
  const fit = c => {
    if (s.penalty > 0) return c[1] === '7';
    if (o.unter && c[1] === 'U') return top[1] !== 'U';
    if (s.wish) return c[0] === s.wish;
    return c[0] === top[0] || c[1] === top[1];
  };
  const out = [];
  for (const c of s.drawn ? [s.drawn] : hand) {
    if (!fit(c)) continue;
    for (const w of o.unter && c[1] === 'U' ? SUITS : ['']) {
      const k = `play:${c}${w ? '/' + w : ''}`;
      out.push(k);
      if (o.mau && hand.length === 2) out.push(k + '!');
    }
  }
  out.push(s.drawn ? 'pass' : 'draw');
  return out.sort();
}

function checkState(s) {
  const all = [...s.hands.flat(), ...s.stock, ...s.pile];
  assert.equal(all.length, 32, 'nicht 32 Karten');
  assert.equal(new Set(all).size, 32, 'Karte doppelt');
  assert.ok(all.every(c => M.DECK.includes(c)), 'fremde Karte');
  assert.equal(s.hands.length, s.n);
  assert.equal(s.mau.length, s.n);
  const top = s.pile[s.pile.length - 1];
  assert.ok(s.pile.length >= 1);
  if (s.wish !== null) assert.ok(s.opts.unter && top[1] === 'U' && SUITS.includes(s.wish), 'Wunsch ohne Unter');
  assert.ok(Number.isInteger(s.penalty) && s.penalty >= 0 && s.penalty % 2 === 0);
  if (s.penalty) assert.ok(s.opts.sieben && top[1] === '7', 'Strafe ohne Siebener');
  for (let q = 0; q < s.n; q++) if (s.mau[q]) assert.equal(s.hands[q].length, 1, 'Mau ohne genau eine Karte');
  const cp = M.currentPlayer(s), ch = M.chance(s);
  if (s.phase === 'play') {
    assert.equal(cp, s.turn);
    assert.equal(ch, null);
    assert.equal(s.owed, null);
    assert.equal(M.result(s), null);
    if (s.drawn) assert.equal(s.hands[s.turn][s.hands[s.turn].length - 1], s.drawn, 'drawn nicht die letzte Handkarte');
    assert.ok(s.hands.every(h => h.length > 0), 'leere Hand, aber Partie läuft');
  } else if (s.phase === 'deal') {
    assert.equal(cp, null);
    assert.deepEqual(M.legalMoves(s), []);
    assert.ok(s.owed && s.owed.n > 0 && s.stock.length === 0 && s.pile.length > 1, 'Mischen ohne Grund');
    assert.deepEqual(ch, { kind: 'shuffle', n: s.pile.length - 1 });
  } else {
    assert.equal(s.phase, 'over');
    assert.equal(cp, null);
    assert.equal(ch, null);
    assert.deepEqual(M.legalMoves(s), []);
    const r = M.result(s);
    assert.ok(r && typeof r.reason === 'string' && r.reason.length > 0);
    if (r.winner !== null && s.ply < M.MAX_PLY) assert.equal(s.hands[r.winner].length, 0, 'Sieger hat noch Karten');
    else assert.ok(s.ply >= M.MAX_PLY);
  }
}

function checkView(s, r) {
  for (let seat = -1; seat < s.n; seat++) {
    const v = M.viewFor(s, seat < 0 ? null : seat), j = JSON.stringify(v);
    for (let q = 0; q < s.n; q++) {
      assert.equal(v.hands[q].length, s.hands[q].length, 'Handlänge in der Sicht');
      if (q === seat) assert.deepEqual(v.hands[q], s.hands[q]);
      else assert.ok(v.hands[q].every(c => c === null), 'fremde Hand sichtbar');
    }
    assert.equal(v.stock.length, s.stock.length);
    assert.ok(v.stock.every(c => c === null), 'Stapel sichtbar');
    const pile = new Set(s.pile);
    for (const c of [...s.stock, ...s.hands.flatMap((h, q) => (q === seat ? [] : h))]) {
      if (!pile.has(c)) assert.ok(!j.includes(`"${c}"`), `${c} steht in der Sicht von ${seat}`);
    }
    if (seat >= 0) assert.equal(M.evaluate(v, seat), M.evaluate(s, seat));
    r.views++;
  }
  if (s.phase === 'play') {
    const v = M.viewFor(s, s.turn);
    assert.deepEqual(M.legalMoves(v), M.legalMoves(s));
    assert.equal(M.currentPlayer(v), s.turn);
  }
}

function fuzz(s, legal, rng, r) {
  const hand = s.hands[s.turn], keys = new Set(legal.map(M.moveKey));
  const bad = [null, 7, 'draw', [], {}, { type: 'Play' }, { type: 'play' }, { type: 'draw', card: hand[0] },
    { type: 'play', card: 'Q9' }, { type: 'play', card: pick(rng, M.DECK), mau: false },
    { type: 'play', card: hand[0], wish: 'X' }, { type: 'play', card: hand[0], extra: 1 }];
  bad.push(s.drawn ? { type: 'draw' } : { type: 'pass' });
  // Karten, die nicht in der Hand sind oder nicht passen
  for (let k = 0; k < 3; k++) {
    const c = pick(rng, M.DECK);
    const m = { type: 'play', card: c };
    if (s.opts.unter && c[1] === 'U') m.wish = pick(rng, SUITS);
    if (!keys.has(M.moveKey(m))) bad.push(m);
  }
  // verfälschte legale Züge: Wunsch dazu/weg, Mau dazu
  const lp = legal.filter(m => m.type === 'play');
  if (lp.length) {
    const m = pick(rng, lp);
    if (m.wish) { const { wish, ...rest } = m; bad.push(rest); } else bad.push({ ...m, wish: 'H' });
    if (!m.mau) { const x = { ...m, mau: true }; if (!keys.has(M.moveKey(x))) bad.push(x); }
  }
  for (const b of bad) {
    assert.equal(M.isLegal(s, b), false, `isLegal akzeptiert ${JSON.stringify(b)}`);
    assert.throws(() => M.applyMove(s, b), /Illegaler Zug/);
    r.fuzz++;
  }
}

// Übergang eines Zuges prüfen
function checkMove(s, m, t, r) {
  const p = s.turn, o = s.opts, hand = s.hands[p];
  assert.equal(t.ply, s.ply + 1);
  if (t.phase === 'over' && t.ply >= M.MAX_PLY && t.hands[p].length > 0) { r.limit++; return; }
  for (let q = 0; q < s.n; q++) {
    if (q === p || (m.type === 'draw' && t.owed)) continue;
    assert.deepEqual(t.hands[q], s.hands[q], 'fremde Hand verändert');
  }
  if (m.type === 'pass') {
    assert.equal(t.turn, (p + 1) % s.n); assert.equal(t.drawn, null);
    assert.deepEqual(t.hands[p], hand);
    r.passes++;
    return;
  }
  if (m.type === 'draw') {
    r.draws++;
    if (s.penalty > 0) {
      r.strafen++;
      assert.equal(t.penalty, 0); assert.equal(t.turn, (p + 1) % s.n); assert.equal(t.drawn, null);
      assert.equal(t.last.strafe, s.penalty);
      if (t.phase === 'play') {
        assert.ok(t.hands[p].length - hand.length <= s.penalty);
        if (t.stock.length || t.hands[p].length - hand.length === s.penalty) assert.equal(t.hands[p].length - hand.length, s.penalty);
      }
    } else if (t.phase === 'play') {
      if (t.hands[p].length === hand.length) {   // nichts mehr zu ziehen
        r.empty++;
        assert.equal(t.turn, (p + 1) % s.n);
        assert.equal(s.stock.length, 0);
      } else {
        assert.equal(t.hands[p].length, hand.length + 1);
        assert.equal(t.turn, p);
        assert.equal(t.drawn, t.hands[p][hand.length]);
        if (s.stock.length) assert.equal(t.drawn, s.stock[0]);
      }
    }
    if (t.phase === 'deal') r.reshuffles++;
    return;
  }
  r.plays++;
  assert.equal(t.pile[t.pile.length - 1], m.card);
  assert.ok(!t.hands[p].includes(m.card));
  if (hand.length === 1) {
    assert.equal(t.phase, 'over'); assert.equal(t.winner, p);
    r.wins++;
    return;
  }
  assert.equal(t.wish, o.unter && m.card[1] === 'U' ? m.wish : null);
  if (t.wish) r.wishes++;
  assert.equal(t.penalty, o.sieben && m.card[1] === '7' ? s.penalty + 2 : 0);
  if (s.penalty > 0) r.counters++;
  const skip = o.ass && m.card[1] === 'A';
  if (skip) r.skips++;
  assert.equal(t.turn, (p + (skip ? 2 : 1)) % s.n);
  const missed = o.mau && hand.length === 2 && m.mau !== true;
  if (o.mau && hand.length === 2) {
    if (missed) { r.mauMissed++; assert.equal(t.last.mauMissed, true); }
    else { r.mauSaid++; assert.equal(t.mau[p], true); }
  }
  if (t.phase === 'play') {
    const extra = missed ? Math.min(M.MAU_PENALTY, s.stock.length + s.pile.length) : 0;
    if (!missed || s.stock.length >= M.MAU_PENALTY) assert.equal(t.hands[p].length, hand.length - 1 + extra);
    else assert.ok(t.hands[p].length >= hand.length - 1);
  }
}

function chooseFor(s, style, rng, legal) {
  if (style === 0) return pick(rng, legal);
  if (style === 1) {
    const plays = legal.filter(m => m.type === 'play');
    return plays.length && rng() < 0.85 ? pick(rng, plays) : pick(rng, legal);
  }
  const p = s.turn, level = style === 2 ? 1 + ((p + s.n) % 2) : p === 0 ? 3 : 2;
  return chooseMove(M.viewFor(s, p), { level, rng, samples: 3 });
}

function playRandom(g, gseed, r) {
  const rng = mulberry32(gseed);
  const n = 2 + (g % 4), bits = (g >> 2) % 16;
  const opts = { players: n, sieben: !!(bits & 1), unter: !!(bits & 2), ass: !!(bits & 4), mau: !!(bits & 8) };
  // Zugwahl: 0 = ganz zufällig, 1 = lieber legen, 2 = Bots 1/2, 3 = Bot 3 (nur jede 40. Partie, teuer)
  const style = g % 40 === 39 ? 3 : (g >> 6) % 3;
  r.combos[`${n}:${bits}`] = (r.combos[`${n}:${bits}`] || 0) + 1;
  let s = deepFreeze(M.initialState(opts));
  assert.deepEqual(M.chance(s), { kind: 'shuffle', n: 32 });
  s = deepFreeze(M.applyChance(s, shufflePerm(32, rng)));
  let steps = 0;
  while (s.phase !== 'over') {
    if (++steps > SAFETY) throw new Error(`Sicherheitsgrenze ${SAFETY} erreicht`);
    checkState(s);
    if (steps % 17 === 0) {   // JSON-Rundreise, positionKey stabil, Sicht
      const j = JSON.parse(JSON.stringify(s));
      assert.deepEqual(j, s);
      assert.equal(M.positionKey(j), M.positionKey(s));
      assert.deepEqual(M.legalMoves(j), M.legalMoves(s));
      checkView(s, r);
    }
    const ch = M.chance(s);
    if (ch) {
      const t = deepFreeze(M.applyChance(s, shufflePerm(ch.n, rng)));
      assert.equal(t.pile.length, 1);
      assert.equal(t.pile[0], s.pile[s.pile.length - 1]);
      s = t;
      continue;
    }
    const legal = M.legalMoves(s);
    assert.deepEqual(legal.map(M.moveKey).sort(), refKeys(s), 'Zugliste ≠ Nachbau');
    for (const m of legal) assert.ok(M.isLegal(s, m));
    assert.equal(new Set(legal.map(M.moveKey)).size, legal.length, 'Zug doppelt');
    if (r.moves % 13 === 0) fuzz(s, legal, rng, r);
    const m = chooseFor(s, style, rng, legal);
    assert.ok(M.isLegal(s, m), `Bot/Zufall wählt illegal: ${JSON.stringify(m)}`);
    assert.notEqual(M.describeMove(s, m), '?');
    const t = deepFreeze(M.applyMove(s, m));
    checkMove(s, m, t, r);
    r.moves++;
    s = t;
  }
  checkState(s);
  checkView(s, r);
  if (style >= 2 && s.ply >= M.MAX_PLY) r.botLimit++;
  r.ends[n] = (r.ends[n] || 0) + 1;
  r.maxPly = Math.max(r.maxPly, s.ply);
}

function runSwarm({ from, to }, seed) {
  const r = { games: 0, moves: 0, plays: 0, draws: 0, passes: 0, strafen: 0, counters: 0, wishes: 0, skips: 0,
    mauSaid: 0, mauMissed: 0, reshuffles: 0, empty: 0, wins: 0, limit: 0, botLimit: 0, fuzz: 0, views: 0, maxPly: 0, ends: {}, combos: {} };
  for (let g = from; g < to; g++) {
    try {
      playRandom(g, mix(seed, g), r);
    } catch (e) {
      return { error: `Partie ${g}: ${String((e && e.stack) || e)}` };
    }
    r.games++;
  }
  return r;
}

// ---------- Hauptprozess ----------

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const a = args.find(x => x.startsWith(`--${k}=`)); return a ? Number(a.split('=')[1]) : d; };
  const seed = Number(args.find(x => /^\d+$/.test(x)) ?? 20261001);
  const GAMES = opt('games', 10000);
  const W = Math.max(1, Math.min(opt('workers', 2), 2, os.availableParallelism?.() ?? 2));
  const t0 = performance.now();
  const tasks = [];
  for (let i = 0; i < GAMES; i += 250) tasks.push({ from: i, to: Math.min(GAMES, i + 250) });
  const results = [];
  await new Promise((resolve, reject) => {
    let next = 0, busy = 0;
    const workers = Array.from({ length: W }, () => new Worker(new URL(import.meta.url), { workerData: { seed } }));
    const feed = w => {
      if (next < tasks.length) { const t = tasks[next++]; busy++; w.once('message', res => { busy--; results.push(res); feed(w); }); w.postMessage(t); }
      else { w.terminate(); if (!busy && results.length === tasks.length) resolve(); }
    };
    for (const w of workers) { w.on('error', reject); feed(w); }
  });
  let passed = 0, failed = 0;
  const ok = (name, fn) => {
    try { const info = fn(); passed++; console.log(`✅ ${name}${info ? ` (${info})` : ''}`); }
    catch (e) { failed++; console.log(`❌ ${name}\n   ${String((e && e.message) || e).split('\n').slice(0, 8).join('\n   ')}`); }
  };
  const errs = results.filter(r => r.error);
  const sw = results.filter(r => !r.error);
  const sum = k => sw.reduce((a, r) => a + r[k], 0);
  const ends = {}, combos = {};
  for (const r of sw) {
    for (const [k, v] of Object.entries(r.ends)) ends[k] = (ends[k] || 0) + v;
    for (const [k, v] of Object.entries(r.combos)) combos[k] = (combos[k] || 0) + v;
  }
  ok(`Schwarm ${GAMES} Partien (2–5 Spieler, alle 16 Options-Kombinationen): 32 verschiedene Karten, jede Partie endet`, () => {
    if (errs.length) throw new Error(errs.map(r => r.error).join('\n'));
    assert.equal(sum('games'), GAMES);
    if (GAMES >= 64 * 20) assert.equal(Object.keys(combos).length, 64, 'nicht alle Kombinationen');
    assert.equal(sum('botLimit'), 0, 'Bot-Partie erst an der Zuggrenze beendet');
    return `2er ${ends[2] || 0}, 3er ${ends[3] || 0}, 4er ${ends[4] || 0}, 5er ${ends[5] || 0}; ${Object.keys(combos).length} Kombinationen; ` +
      `${sum('moves')} Züge, längste Partie ${Math.max(0, ...sw.map(r => r.maxPly))} Züge, ${sum('limit')} Zufallspartien an der Zuggrenze`;
  });
  ok('Zugliste = unabhängiger Nachbau; Übergänge: Strafe/Kontern, Wunsch, Daus, Mau, Ziehen, Nachmischen', () => {
    for (const k of ['strafen', 'counters', 'wishes', 'skips', 'mauSaid', 'mauMissed', 'reshuffles', 'passes', 'empty', 'wins']) {
      assert.ok(sum(k) > 0, k);
    }
    return `${sum('plays')} gelegt, ${sum('draws')} gezogen, ${sum('passes')} gepasst, ${sum('strafen')} 7er-Strafen, ` +
      `${sum('counters')} gekontert, ${sum('wishes')} Wünsche, ${sum('skips')} Aussetzer, Mau ${sum('mauSaid')}× gesagt/` +
      `${sum('mauMissed')}× vergessen, ${sum('reshuffles')}× nachgemischt, ${sum('empty')}× nichts zu ziehen`;
  });
  ok('isLegal lehnt Müll und verfälschte Züge ab; Sicht ohne fremde Karten; JSON-Rundreise, positionKey stabil', () => {
    assert.ok(sum('fuzz') > 0 && sum('views') > 0);
    return `${sum('fuzz')} illegale abgelehnt, ${sum('views')} Sichten geprüft`;
  });
  console.log(`\n${passed} ✅, ${failed} ❌ (Seed ${seed}, ${W} Worker, ${((performance.now() - t0) / 1000).toFixed(1)} s)`);
  process.exit(failed ? 1 : 0);
}
