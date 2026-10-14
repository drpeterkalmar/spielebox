// Spannung + KI (n10 E4): Würfel rollen aus, Kinder-Stufe übersieht manchmal einen Schlag (nie lächerlich),
// Auszeichnungen (nur Anzeige, Gleichstand → alle), Statistik je Gerät.
// Aufruf: node tests/node/spannung.test.mjs
import assert from 'node:assert/strict';
import { diceSchedule, AUSROLLEN, TEMPO, OWN } from '../../src/tempo.js';
import { overlook, bigMove, FEHLER, FEHLER_SPIELE } from '../../src/games/fehler.js';
import { tallyStep, awards, EHRUNGEN } from '../../src/ehrung.js';
import { addResult, emptyStats } from '../../src/store.js';
import { GAMES } from '../../src/games/registry.js';
import { mulberry32 } from '../../src/rng.js';

let fails = 0;
async function ok(name, fn) {
  try { const info = await fn(); console.log('✅ ' + name + (info ? ` (${info})` : '')); } catch (e) { fails++; console.log('❌ ' + name + '\n   ' + (e && e.stack || e)); }
}
const perm = (rng, n) => { const p = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } return p; };
const chanceValue = (c, rng) => (c.kind === 'shuffle' ? perm(rng, c.n) : Array.from({ length: c.n || 2 }, () => 1 + Math.floor(rng() * 6)));

await ok('Messgröße 9: Würfel gemütlich 1,0 s, die letzten 3 Wechsel (120 → 180 → 260 ms) länger als die ersten 3', () => {
  assert.equal(TEMPO.gemuetlich.dice, 1000, 'Gesamtdauer unverändert 1,0 s');
  assert.deepEqual(AUSROLLEN, [120, 180, 260]);
  for (const dur of [TEMPO.gemuetlich.dice, TEMPO.normal.dice, TEMPO.flott.dice, OWN.dice]) {
    const s = diceSchedule(dur, true);
    const gaps = s.slice(1).map((x, i) => x - s[i]);
    assert.ok(s[s.length - 1] <= dur && s[s.length - 1] >= dur * 0.9, `${dur}: letzter Wechsel ${s[s.length - 1]}`);
    const first = gaps.slice(0, 3), last = gaps.slice(-3);
    assert.ok(Math.min(...last) > Math.max(...first) || dur < 900, `${dur}: ${gaps}`);
    assert.ok(last[0] < last[1] && last[1] < last[2], `${dur}: Auslauf wird langsamer ${last}`);
  }
  const g = diceSchedule(1000, true), gaps = g.slice(1).map((x, i) => x - g[i]);
  assert.deepEqual(gaps.slice(-3), [120, 180, 260]);
  assert.deepEqual(diceSchedule(1000, false), [150, 300, 450, 600], '?ausrollen=0: wie bisher');
  assert.deepEqual(diceSchedule(0), []);
  return `Wechsel bei ${g.join(', ')} ms`;
});

// Stellungen mit mindestens einem Schlag/Gewinnzug und einer Alternative
function bigPositions(id, count, seed) {
  const E = GAMES[id].engine, rng = mulberry32(seed), out = [];
  for (let g = 0; g < 400 && out.length < count; g++) {
    // Dame: Schlagzwang – „übersehen“ geht nur mit der Hausregel Pusten (ohne Zwang)
    let s = E.initialState(E.normalizeOptions(id === 'dame' ? { pusten: true } : { players: 2 }));
    for (let k = 0; k < 400 && !E.result(s) && out.length < count; k++) {
      const c = E.chance ? E.chance(s) : null;
      if (c) { s = E.applyChance(s, chanceValue(c, rng)); continue; }
      const ms = E.legalMoves(s);
      if (!ms.length) break;
      const seat = E.currentPlayer(s);
      const big = ms.filter((m) => bigMove(id, E, s, m, seat));
      if (big.length && big.length < ms.length && rng() < 0.5) out.push({ s, big });
      s = E.applyMove(s, ms[Math.floor(rng() * ms.length)]);
    }
  }
  return out;
}

await ok('Kinder-Stufe: übersieht ~15 % der Schläge/Gewinnzüge, sonst unverändert; Stufe 2/3 nie; Ersatz = bester anderer Zug', () => {
  assert.equal(FEHLER, 0.15);
  const rep = [];
  for (const id of FEHLER_SPIELE) {
    const E = GAMES[id].engine;
    const ps = bigPositions(id, 40, 7);
    // Reversi/Halma: nur Gewinnzüge ganz am Ende – selten in Zufallspartien
    assert.ok(ps.length >= (id === 'reversi' || id === 'halma' ? 1 : 10), `${id}: Stellungen ${ps.length}`);
    let missed = 0, tries = 0;
    const rng = mulberry32(3);
    for (const { s, big } of ps) {
      const m = big[0], seat = E.currentPlayer(s);
      assert.deepEqual(overlook(id, E, s, m, { level: 2, fehler: 1, rng }), m, 'Stufe 2 unverändert');
      assert.deepEqual(overlook(id, E, s, m, { level: 1, fehler: 0, rng }), m, 'fehler 0 = wie bisher');
      const alt = overlook(id, E, s, m, { level: 1, fehler: 1, rng });
      assert.ok(E.isLegal(s, alt) && !bigMove(id, E, s, alt, seat), `${id}: Ersatz ist erlaubt und kein Schlag`);
      // Ersatz = bester Nicht-Schlag nach evaluate
      const rest = E.legalMoves(s).filter((x) => !bigMove(id, E, s, x, seat));
      const best = Math.max(...rest.map((x) => E.evaluate(E.applyMove(s, x), seat)));
      assert.equal(E.evaluate(E.applyMove(s, alt), seat), best, `${id}: nicht lächerlich`);
      for (let k = 0; k < 25; k++) { tries++; if (JSON.stringify(overlook(id, E, s, m, { level: 1, fehler: FEHLER, rng })) !== JSON.stringify(m)) missed++; }
    }
    const q = missed / tries;
    if (tries >= 400) assert.ok(q > 0.11 && q < 0.19, `${id}: Quote ${q}`);
    rep.push(`${id} ${(q * 100).toFixed(0)} %`);
  }
  // Kartenspiele bleiben unberührt
  assert.equal(FEHLER_SPIELE.has('schnapsen') || FEHLER_SPIELE.has('maumau') || FEHLER_SPIELE.has('holdem'), false);
  return rep.join(', ');
});

await ok('Auszeichnungen: Zählen, nur > 0, Gleichstand → alle', () => {
  assert.deepEqual(Object.keys(EHRUNGEN).sort(), ['ludo', 'maumau', 'wuerfel']);
  let t = null;
  t = tallyStep('maumau', t, {}, { x: 1 }, { type: 'play', card: 'H7' }, 0);
  t = tallyStep('maumau', t, { x: 1 }, { x: 2 }, { type: 'play', card: 'S7' }, 1);
  t = tallyStep('maumau', t, { x: 2 }, { x: 3 }, { type: 'play', card: 'SA' }, 1);
  assert.deepEqual(awards('maumau', t, 3), [{ icon: '7️⃣', title: 'Meiste Siebener', value: 1, seats: [0, 1] }]);
  assert.deepEqual(awards('maumau', null, 2), []);
  assert.deepEqual(awards('schach', { x: [1] }, 2), []);
  // Ludo: gleicher Wurf wird nicht doppelt gezählt
  let u = tallyStep('ludo', null, null, { ply: 3, lastRoll: { seat: 1, value: 6, moved: false }, last: null });
  u = tallyStep('ludo', u, {}, { ply: 3, lastRoll: { seat: 1, value: 6, moved: false }, last: null });
  assert.deepEqual(u.sechs, [0, 1]);
});

await ok('Statistik: Siege/Niederlagen/Remis, Serie und längste Serie je Spiel und Gegner', () => {
  const st = emptyStats();
  for (const o of ['w', 'w', 'l', 'w', 'w', 'w', 'd']) addResult(st, 'muehle', 'computer2', o);
  addResult(st, 'muehle', 'mensch', 'l');
  assert.deepEqual(st.g.muehle.computer2, { w: 5, l: 1, d: 1, serie: 0, best: 3 });
  assert.deepEqual(st.g.muehle.mensch, { w: 0, l: 1, d: 0, serie: 0, best: 0 });
});

console.log(fails ? `\n${fails} rot` : '\nSpannung + KI grün');
process.exit(fails ? 1 : 0);
