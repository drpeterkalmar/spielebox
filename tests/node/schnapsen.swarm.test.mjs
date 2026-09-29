// Schwarmtest Schnapsen: 10 000 einzelne Spiele mit Zufalls- und Bot-Zügen (mulberry32), Invarianten nach JEDEM
// Zug (20 verschiedene Karten, 120 Augen im Spiel, Stichaugen = gewonnene Karten, Sicht verrät nichts,
// Engine auf der Sicht wie auf dem vollen Zustand, illegale Züge werden abgelehnt), dazu 200 ganze Partien bis
// zum Ende und Bot-Stärke (Stufe 2 gegen Zufall > 70 % der Spiele). Ein Thread, Laufzeit ca. 20–40 s.
// Aufruf: node tests/node/schnapsen.swarm.test.mjs [seed] [--games=10000]
import * as S from '../../src/games/schnapsen/engine.js';
import { chooseMove } from '../../src/games/schnapsen/bot.js';
import { mulberry32 } from '../../src/rng.js';

const args = process.argv.slice(2);
const SEED = Number(args.find(a => /^\d+$/.test(a)) || 20260929);
const GAMES = Number((args.find(a => a.startsWith('--games=')) || '--games=10000').split('=')[1]);
const PARTIEN = 200;
const DUEL = 2000;

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  const t = performance.now();
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''} – ${((performance.now() - t) / 1000).toFixed(1)} s`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}
const fail = msg => { throw new Error(msg); };

function mix(...xs) {
  let h = 0x9e3779b9;
  for (const x of xs) {
    h ^= x >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
  }
  return h >>> 0;
}
function shuffled(rng) {
  const a = [...Array(20).keys()];
  for (let i = 19; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const V = c => S.VALUE[c[1]];

// Spielertypen: 'zufall' (alles Legale, auch irrtümliches Ausmelden), 'plausibel' (zufällig, meldet sich nur
// berechtigt aus), Bot-Stufen 1/2
function mover(kind, rng) {
  return (state) => {
    const p = S.currentPlayer(state), view = S.viewFor(state, p);
    if (kind === 'zufall') return pick(rng, S.legalMoves(view));
    if (kind === 'plausibel') {
      if (S.canDeclare(view)) return { type: 'ausmelden' };
      return pick(rng, S.legalMoves(view).filter(m => m.type !== 'ausmelden'));
    }
    return chooseMove(view, { level: kind, rng });
  };
}

// Invarianten eines Zustands während des Spiels
function check(s, ctx) {
  const all = [...s.hands[0], ...s.hands[1], ...s.talon, ...s.won[0], ...s.won[1], ...s.trick.map(t => t.card)];
  if (s.atoutCard) all.push(s.atoutCard);
  if (all.length !== 20 || new Set(all).size !== 20 || !all.every(c => S.DECK.includes(c))) fail(`${ctx}: Karten ${all}`);
  if (all.reduce((a, c) => a + V(c), 0) !== 120) fail(`${ctx}: nicht 120 Augen`);
  for (const q of [0, 1]) {
    if (s.won[q].reduce((a, c) => a + V(c), 0) !== s.augen[q]) fail(`${ctx}: Augen ${q} ≠ Stiche`);
    if (s.won[q].length !== 2 * s.tricks[q]) fail(`${ctx}: Stichzahl ${q}`);
  }
  if (s.lastTrick && !s.lastTrick.cards.every(t => s.won[s.lastTrick.winner].includes(t.card))) fail(`${ctx}: letzter Stich`);
  if (s.atoutCard && s.atoutCard[0] !== s.atout) fail(`${ctx}: Atoutkarte`);
  if (S.phase(s) === 'play') {
    const d = s.hands[s.turn].length - s.hands[1 - s.turn].length;
    if (s.trick.length ? d !== 1 : d !== 0) fail(`${ctx}: Handgrößen ${s.hands.map(h => h.length)}`);
    if (!s.closed && s.talon.length && s.hands[s.turn].length !== 5) fail(`${ctx}: 5 Karten bei offenem Talon`);
  }
}

// Sicht: verrät nichts, Engine-Funktionen gleich
function checkView(s, ctx) {
  const p = S.currentPlayer(s), v = S.viewFor(s, p), json = JSON.stringify(v);
  for (const c of [...s.hands[1 - p], ...s.talon]) if (json.includes(`"${c}"`)) fail(`${ctx}: Sicht verrät ${c}`);
  const a = S.legalMoves(s).map(S.moveKey).sort().join(), b = S.legalMoves(v).map(S.moveKey).sort().join();
  if (a !== b) fail(`${ctx}: legalMoves Sicht ${b} ≠ ${a}`);
  for (const q of [0, 1]) if (S.evaluate(S.viewFor(s, q), q) !== S.evaluate(s, q)) fail(`${ctx}: evaluate Sitz ${q}`);
  if (S.canDeclare(v) !== S.canDeclare(s)) fail(`${ctx}: canDeclare`);
  const spec = JSON.stringify(S.viewFor(s, null));
  for (const c of [...s.hands[0], ...s.hands[1], ...s.talon]) if (spec.includes(`"${c}"`)) fail(`${ctx}: Zuschauer sieht ${c}`);
}

// illegale Züge werden abgelehnt
function fuzz(s, rng, ctx) {
  const legal = new Set(S.legalMoves(s).map(S.moveKey));
  const tries = [{ type: 'play', card: pick(rng, S.DECK) }, { type: 'ansagen', suit: pick(rng, S.SUITS) },
    { type: pick(rng, ['tauschen', 'zudrehen', 'ausmelden', 'weiter', 'passen']) }, { type: 'play', card: 'HA', x: 1 }];
  for (const m of tries) {
    if (legal.has(S.moveKey(m)) && Object.keys(m).length <= 2) continue;
    if (S.isLegal(s, m)) fail(`${ctx}: illegaler Zug akzeptiert ${JSON.stringify(m)}`);
    let threw = false;
    try { S.applyMove(s, m); } catch { threw = true; }
    if (!threw) fail(`${ctx}: applyMove ohne Fehler bei ${JSON.stringify(m)}`);
  }
}

const KINDS = ['zufall', 'plausibel', 1, 2];

test(`${GAMES} einzelne Spiele: Invarianten nach jedem Zug, Sicht, Fuzz, Punkte ∈ {1,2,3}`, () => {
  const reasons = {}, pts = { 1: 0, 2: 0, 3: 0 };
  let moves = 0, full120 = 0, closed = 0;
  for (let g = 0; g < GAMES; g++) {
    const rng = mulberry32(mix(SEED, g));
    const opts = { hart: g % 2 === 1 };
    const kinds = [KINDS[g % 4], KINDS[(g >> 2) % 4]];
    const players = kinds.map(k => mover(k, rng));
    let s = S.initialState(opts);
    if (g % 3 === 1) s = { ...s, dealer: 0 };
    s = S.applyChance(s, shuffled(rng));
    let wasClosed = false;
    for (let i = 0; S.phase(s) === 'play'; i++) {
      const ctx = `Spiel ${g} Zug ${i}`;
      if (i > 60) fail(`${ctx}: endet nicht`);
      check(s, ctx);
      checkView(s, ctx);
      if (i % 3 === 0) fuzz(s, rng, ctx);
      const m = players[S.currentPlayer(s)](s);
      if (!S.isLegal(s, m)) fail(`${ctx}: Spieler wählt illegalen Zug ${JSON.stringify(m)}`);
      s = S.applyMove(s, m);
      if (s.closed) wasClosed = true;
      moves++;
    }
    check(s, `Spiel ${g} Ende`);
    if (S.phase(s) !== 'spielende') fail(`Spiel ${g}: Phase ${S.phase(s)}`);
    const sp = s.spiel;
    if (![1, 2, 3].includes(sp.points) || (sp.winner !== 0 && sp.winner !== 1)) fail(`Spiel ${g}: ${JSON.stringify(sp)}`);
    if (s.points[sp.winner] !== sp.points || s.points[1 - sp.winner] !== 0) fail(`Spiel ${g}: Punkte ${s.points}`);
    if (S.currentPlayer(s) !== s.dealer || S.legalMoves(s).length !== 1) fail(`Spiel ${g}: weiter`);
    if (sp.reason === 'letzter Stich') {
      if (s.augen[0] + s.augen[1] !== 120) fail(`Spiel ${g}: letzter Stich, aber ${s.augen} Augen`);
      full120++;
    }
    if (wasClosed) closed++;
    reasons[sp.reason] = (reasons[sp.reason] || 0) + 1;
    pts[sp.points]++;
  }
  console.log('   Gründe:', JSON.stringify(reasons));
  console.log('   Punkte:', JSON.stringify(pts), `– zugedreht in ${closed} Spielen, ${full120} bis zum letzten Stich (120 Augen)`);
  if (!pts[1] || !pts[2] || !pts[3] || !closed || !full120) fail('Wertungsarten nicht alle erreicht');
  return `${moves} Züge`;
});

test(`${PARTIEN} ganze Partien bis zum Ende (Bummerl 2/3, Schneider an/aus)`, () => {
  let games = 0;
  for (let g = 0; g < PARTIEN; g++) {
    const rng = mulberry32(mix(SEED, 777, g));
    const opts = { bummerl: g % 2 ? 3 : 2, schneider: g % 4 >= 2, hart: g % 3 === 0 };
    const kinds = [KINDS[g % 4], KINDS[(g + 1 + (g >> 2)) % 4]];
    const players = kinds.map(k => mover(k, rng));
    let s = S.initialState(opts), n = 0, lastDealer = null;
    while (!S.result(s)) {
      if (++n > 3000) fail(`Partie ${g}: endet nicht`);
      if (S.chance(s)) {
        if (lastDealer !== null && s.dealer === lastDealer) fail(`Partie ${g}: Teiler wechselt nicht`);
        lastDealer = s.dealer;
        s = S.applyChance(s, shuffled(rng));
        continue;
      }
      const p = S.currentPlayer(s);
      if (p === null) fail(`Partie ${g}: niemand am Zug`);
      s = S.applyMove(s, players[p](s));
    }
    const r = S.result(s), o = 1 - r.winner;
    if (s.bummerl[r.winner] < s.opts.bummerl || s.bummerl[o] >= s.opts.bummerl) fail(`Partie ${g}: Bummerl ${s.bummerl}`);
    if (r.points !== s.bummerl[r.winner] || r.reason !== `gewinnt ${s.bummerl[r.winner]}:${s.bummerl[o]} Bummerl`) fail(`Partie ${g}: ${JSON.stringify(r)}`);
    if (!s.games.every(x => [1, 2, 3].includes(x.points))) fail(`Partie ${g}: Spielpunkte`);
    // Bummerl-Tafel nachrechnen
    const tally = [0, 0];
    let nr = 1, pts = [0, 0];
    for (const x of s.games) {
      if (x.bummerl !== nr) fail(`Partie ${g}: Bummerl-Nummer`);
      pts[x.winner] += x.points;
      if (pts[x.winner] >= 7) {
        tally[x.winner] += s.opts.schneider && pts[1 - x.winner] === 0 ? 2 : 1;
        pts = [0, 0];
        nr++;
      }
    }
    if (tally.join() !== s.bummerl.join()) fail(`Partie ${g}: Tafel ${tally} ≠ ${s.bummerl}`);
    if (S.currentPlayer(s) !== null || S.legalMoves(s).length) fail(`Partie ${g}: nach Ende noch Züge`);
    games += s.games.length;
  }
  return `${games} Spiele`;
});

function duel(kindA, kindB, n, salt) {
  let wins = 0, points = [0, 0];
  for (let g = 0; g < n; g++) {
    const rng = mulberry32(mix(SEED, salt, g));
    const a = g % 2;   // Sitz von A wechselt
    const players = [];
    players[a] = mover(kindA, rng);
    players[1 - a] = mover(kindB, rng);
    let s = S.applyChance(S.initialState(), shuffled(rng));
    while (S.phase(s) === 'play') s = S.applyMove(s, players[S.currentPlayer(s)](s));
    if (s.spiel.winner === a) { wins++; points[0] += s.spiel.points; } else points[1] += s.spiel.points;
  }
  return { rate: wins / n, points };
}

test(`Bot Stufe 2 gegen Zufall gewinnt > 70 % der Spiele (${DUEL} Spiele je Gegner)`, () => {
  const r1 = duel(2, 'plausibel', DUEL, 1), r2 = duel(2, 'zufall', DUEL, 2), r3 = duel(2, 1, DUEL, 3);
  const info = `gegen plausibel ${(r1.rate * 100).toFixed(1)} %, gegen zufall ${(r2.rate * 100).toFixed(1)} %, ` +
    `gegen Stufe 1 ${(r3.rate * 100).toFixed(1)} %`;
  if (r1.rate <= 0.7 || r2.rate <= 0.7) fail(info);
  if (r3.rate <= 0.5) fail(info);
  return info;
});

test('Bot Stufe 3 (15 ms) gegen Stufe 2: 100 Spiele (nur Bericht, Mindestmaß 40 %)', () => {
  let wins = 0, pts = [0, 0];
  const n = 100;
  for (let g = 0; g < n; g++) {
    const rng = mulberry32(mix(SEED, 999, g));
    const a = g % 2;
    let s = S.applyChance(S.initialState(), shuffled(rng));
    while (S.phase(s) === 'play') {
      const p = S.currentPlayer(s), v = S.viewFor(s, p);
      s = S.applyMove(s, chooseMove(v, { level: p === a ? 3 : 2, rng, timeMs: 15 }));
    }
    if (s.spiel.winner === a) { wins++; pts[0] += s.spiel.points; } else pts[1] += s.spiel.points;
  }
  const info = `Stufe 3 gewinnt ${wins}/${n} Spiele, Punkte ${pts[0]}:${pts[1]}`;
  if (wins < 40) fail(info);
  return info;
});

const secs = ((performance.now() - t0) / 1000).toFixed(1);
console.log(`\nSchnapsen-Schwarm (Seed ${SEED}): ${passed} bestanden, ${failed} fehlgeschlagen – Laufzeit ${secs} s`);
process.exitCode = failed ? 1 : 0;
