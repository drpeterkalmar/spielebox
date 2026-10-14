// Klänge, Vibration und Brett-Spielzeug (n10 E1): welcher Ton je Zug (src/movesound.js), Abstand ≥ 120 ms,
// 15/15 Spiele mit Zug-Ton, Vibration nur bei großen Momenten gegen mich, Spielzeug-Zone nur am Rand.
// Aufruf: node tests/node/klang.test.mjs
import assert from 'node:assert/strict';
import { moveCues, hapticCue, spaced, KINDS, MIN_GAP, HAPTIK } from '../../src/movesound.js';
import { params, animMs, LEVELS } from '../../src/tempo.js';
import { inToyZone, RAND_SPIELE } from '../../src/ui/spielzeug.js';
import { GAMES } from '../../src/games/registry.js';
import { mulberry32 } from '../../src/rng.js';
import * as SCH from '../../src/games/schach/engine.js';
import * as MU from '../../src/games/muehle/engine.js';

let fails = 0, passed = 0;
async function ok(name, fn) {
  try { const info = await fn(); passed++; console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}

const perm = (rng, n) => { const p = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
const chanceValue = (c, rng) => (c.kind === 'shuffle' ? perm(rng, c.n) : Array.from({ length: c.n || 2 }, () => 1 + Math.floor(rng() * 6)));

// Zufallspartie (zufällige erlaubte Züge); fn(move, prevGs, gs, d) je Zug
function randomGame(E, seed, maxMoves, fn) {
  const rng = mulberry32(seed);
  let s = E.initialState(E.normalizeOptions({}));
  for (let k = 0; k < maxMoves && !E.result(s); k++) {
    const c = E.chance ? E.chance(s) : null;
    if (c) { s = E.applyChance(s, chanceValue(c, rng)); k--; continue; }
    const moves = E.legalMoves(s);
    if (!moves.length) break;
    const m = moves[Math.floor(rng() * moves.length)];
    const d = E.describeMove(s, m);
    const next = E.applyMove(s, m);
    fn(m, s, next, d);
    s = next;
  }
}

await ok('Messgröße 1: alle 15 Spiele haben Zug-Töne, nur bekannte Klänge, Abstand ≥ 120 ms, nie nach Zugende', () => {
  const ids = Object.keys(GAMES);
  assert.equal(ids.length, 15);
  const withSound = [];
  for (const id of ids) {
    const E = GAMES[id].engine;
    let n = 0, cues = 0;
    for (const lv of [...LEVELS, 'test']) for (const own of [false, true]) {
      const a = params(lv, own);
      randomGame(E, 7 + lv.length, 160, (m, prev, gs, d) => {
        n++;
        const list = moveCues({ game: id, move: m, prevGs: prev, gs, a, d });
        cues += list.length;
        for (let i = 0; i < list.length; i++) {
          assert.ok(KINDS.includes(list[i].k), `${id}: unbekannter Klang ${list[i].k}`);
          assert.ok(list[i].at >= 0, `${id}: Zeit ≥ 0`);
          if (i) assert.ok(list[i].at - list[i - 1].at >= MIN_GAP, `${id}: Abstand ${list[i].at - list[i - 1].at} ms`);
          // Hold'em/Blackjack: Bank-Karten bzw. Hand-Ende laufen nach; sonst liegt jeder Ton innerhalb der Zug-Animation
          const dur = animMs(id, m, prev, gs, a);
          if (id !== 'holdem' && dur > 0) assert.ok(list[i].at <= dur + 1, `${id}: Ton bei ${list[i].at} ms nach Zugende ${dur} ms`);
        }
      });
    }
    assert.ok(n > 0, `${id}: Züge gespielt`);
    if (cues > 0) withSound.push(id);
  }
  assert.equal(withSound.length, 15, `ohne Ton: ${ids.filter((x) => !withSound.includes(x)).join(', ')}`);
  return `${withSound.length}/15`;
});

await ok('Klänge passen zum Zug: Schlagen tiefer (Schach x, Mühle nimmt), Karte wischt sofort, Würfel rattern', () => {
  const a = params('gemuetlich');
  assert.deepEqual(moveCues({ game: 'schach', move: { from: 'e4', to: 'd5' }, a, d: 'exd5' }).map((c) => c.k), ['schlag']);
  assert.deepEqual(moveCues({ game: 'schach', move: { from: 'e2', to: 'e4' }, a, d: 'e4' }).map((c) => c.k), ['klack']);
  assert.deepEqual(moveCues({ game: 'muehle', move: { to: 3, remove: 5 }, a }).map((c) => c.k), ['klack', 'schlag']);
  assert.deepEqual(moveCues({ game: 'schnapsen', move: { type: 'play', card: 'HA' }, a }), [{ at: 0, k: 'karte' }]);
  assert.deepEqual(moveCues({ game: 'ludo', move: { type: 'roll' }, a }), [{ at: 0, k: 'wuerfel' }]);
  // Stein klackt, wenn er landet (kurz vor Ende des Gleitens)
  const [c] = moveCues({ game: 'muehle', move: { to: 3 }, a });
  assert.ok(c.at > a.slide * 0.8 && c.at <= a.slide, `Landung ${c.at}`);
  // Dame-Sprungkette: ein Ton je Sprung
  assert.equal(moveCues({ game: 'dame', move: { from: 1, path: [10, 19, 28], cap: [5, 14, 23] }, a }).length, 3);
});

await ok('höchstens ein Ton je 120 ms: spaced() lässt zu dichte fallen, sortiert nach Zeit', () => {
  assert.deepEqual(spaced([{ at: 200, k: 'klack' }, { at: 0, k: 'karte' }, { at: 50, k: 'karte' }, { at: 130, k: 'klack' }]).map((c) => c.at), [0, 130]);
  // Test-Tempo (alles 0): nur ein Ton
  assert.equal(moveCues({ game: 'muehle', move: { to: 3, remove: 5 }, a: params('test') }).length, 1);
});

await ok('Vibration: Schach gegen mich 30 ms, eigener Zug/Zuschauer nie, Mühle gegen mich, Sieg 35 ms, Abstand 1,5 s', () => {
  assert.equal(HAPTIK.sieg, 35);
  assert.equal(HAPTIK.gross, 30);
  assert.ok(HAPTIK.abstand >= 1500);
  // Schäfermatt-Vorstufe: Schwarz (1) bekommt Schach
  let s = SCH.initialState({});
  for (const [from, to] of [['e2', 'e4'], ['f7', 'f6'], ['d1', 'h5']]) s = SCH.applyMove(s, { from, to });
  assert.ok(SCH.inCheck(s));
  const mv = { from: 'd1', to: 'h5' };
  assert.equal(hapticCue({ game: 'schach', move: mv, by: 0, gs: s, me: 1 }), 30);
  assert.equal(hapticCue({ game: 'schach', move: mv, by: 0, gs: s, me: 0 }), 0, 'eigenes Schach geben vibriert nicht');
  assert.equal(hapticCue({ game: 'schach', move: mv, by: 0, gs: s, me: null }), 0, 'Zuschauer');
  assert.equal(hapticCue({ game: 'muehle', move: { to: 1, remove: 4 }, by: 1, gs: MU.initialState({}), me: 0 }), 30);
  assert.equal(hapticCue({ game: 'muehle', move: { to: 1 }, by: 1, gs: MU.initialState({}), me: 0 }), 0);
  assert.equal(hapticCue({ game: 'ludo', move: { type: 'move', piece: 0 }, by: 1, gs: { last: { capture: { seat: 0 } } }, me: 0 }), 30);
  assert.equal(hapticCue({ game: 'ludo', move: { type: 'move', piece: 0 }, by: 1, gs: { last: { capture: { seat: 2 } } }, me: 0 }), 0);
});

await ok('Brett-Spielzeug: nur Holzrand (3 %) bzw. Fläche neben dem Brett, Kartentische nur daneben', () => {
  const w = { left: 0, top: 0, right: 400, bottom: 500 };
  const r = { left: 0, top: 50, right: 400, bottom: 450 };
  assert.ok(RAND_SPIELE.has('muehle') && !RAND_SPIELE.has('schnapsen') && !RAND_SPIELE.has('backgammon'));
  assert.equal(inToyZone(200, 250, r, w, 'muehle'), false, 'Brettmitte');
  assert.equal(inToyZone(5, 250, r, w, 'muehle'), true, 'linker Rand');
  assert.equal(inToyZone(20, 250, r, w, 'muehle'), false, 'schon auf dem Spielfeld (> 12 px)');
  assert.equal(inToyZone(200, 20, r, w, 'muehle'), true, 'über dem Brett');
  assert.equal(inToyZone(5, 250, r, w, 'schnapsen'), false, 'Kartentisch: Rand gehört den Karten');
  assert.equal(inToyZone(200, 470, r, w, 'schnapsen'), true, 'Kartentisch: neben dem Brett');
  assert.equal(inToyZone(500, 20, r, w, 'muehle'), false, 'außerhalb des Behälters');
});

console.log(`\n${passed} ✅, ${fails} ❌`);
process.exit(fails ? 1 : 0);
