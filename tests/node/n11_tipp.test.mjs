// n11 Etappe B: „💡 Tipp“ – Tipp = Zug des starken Computers (Stufe 3, ohne Fehler, Rechenzeit Stufe 3) mit der Sicht
// des Spielers, für alle 15 Spiele; Tipp unabhängig davon, wie verdeckte Karten/Schiffe liegen; der Tipp zieht nie
// (Zustand unverändert); Markierungen/Knöpfe/Texte passen zum Zug.
// Aufruf: node tests/node/n11_tipp.test.mjs
import assert from 'node:assert/strict';
import { GAMES } from '../../src/games/registry.js';
import { suggest, tipView, TIPP_LEVEL } from '../../src/tipp.js';
import { TIME } from '../../src/games/bots.js';
import { mulberry32 } from '../../src/rng.js';
import { valueFor } from '../../src/net/fair.js';

let fails = 0;
async function test(name, fn) {
  try { const info = await fn(); console.log(`✅ ${name}${info ? ` (${info})` : ''}`); } catch (e) { fails++; console.log(`❌ ${name}\n   ${String(e && e.stack || e).split('\n').slice(0, 5).join('\n   ')}`); }
}
const hex = (rng) => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
const OPTS = { halma: { players: 2 }, ludo: { players: 2 }, maumau: { players: 3 }, wuerfel: { players: 2 }, paare: { players: 2 }, holdem: { players: 4 }, blackjack: { players: 3 } };
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// Stellungen aus Zufallspartien, in denen jemand am Zug ist
function states(game, n, seed) {
  const E = GAMES[game].engine, out = [];
  for (let g = 0; out.length < n && g < n * 20; g++) {
    const rng = mulberry32(seed * 7919 + g);
    let s = E.initialState(E.normalizeOptions(OPTS[game] || {}));
    const stop = 2 + Math.floor(rng() * 40);
    for (let k = 0; k < 400 && !E.result(s); k++) {
      const c = E.chance && E.chance(s);
      if (c) { s = E.applyChance(s, valueFor(c, hex(rng))); continue; }
      const seat = E.currentPlayer(s);
      if (seat === null || seat === undefined) break;
      const legal = E.legalMoves(s);
      if (!legal.length) break;
      if (k >= stop) { out.push({ s, seat }); break; }
      s = E.applyMove(s, legal[Math.floor(rng() * legal.length)]);
    }
  }
  return out;
}

const ids = Object.keys(GAMES);

await test(`Tipp = Bot-Zug Stufe ${TIPP_LEVEL}, fehler 0, Rechenzeit Stufe 3, Sicht des Spielers (alle ${ids.length} Spiele)`, async () => {
  let n = 0;
  for (const game of ids) {
    const E = GAMES[game].engine;
    for (const { s, seat } of states(game, 4, 1)) {
      const before = JSON.stringify(s);
      const calls = [];
      const legal = E.legalMoves(tipView(game, s, seat));
      const pickM = legal[legal.length - 1];
      const t = await suggest(game, s, seat, { bot: (view, o) => { calls.push({ view, o }); return pickM; } });
      if (!(game === 'schiffe' && legal.every((m) => m.type === 'place'))) assert.equal(calls.length, 1, game);
      assert.deepEqual(calls[0].view, E.HIDDEN ? E.viewFor(s, seat) : s, `${game}: Sicht`);
      assert.equal(calls[0].o.level, 3, game);
      assert.equal(calls[0].o.fehler, 0, game);
      assert.equal(calls[0].o.timeMs, TIME[3], game);
      if (game === 'schiffe' && legal.every((m) => m.type === 'place')) { assert.equal(t.move, null, 'Aufstellen: kein Tipp'); assert.equal(calls.length, 0); n++; continue; }
      // Blackjack-Einsatz: nächstliegender Knopf (pickM = höchster Einsatz gibt es immer als Knopf)
      assert.deepEqual(t.move, pickM, `${game}: Tipp ist der Bot-Zug`);
      assert.equal(JSON.stringify(s), before, `${game}: Tipp zieht nie (Zustand unverändert)`);
      n++;
    }
  }
  return `${n} Stellungen`;
});

await test('echter Stufe-3-Computer: Tipp ist ein erlaubter Zug, Markierung/Knopf/Text passen, Zustand unverändert', async () => {
  const per = {};
  for (const game of ids) {
    const E = GAMES[game].engine;
    for (const { s, seat } of states(game, 3, 2)) {
      const before = JSON.stringify(s);
      const t = await suggest(game, s, seat, { timeMs: 40, rng: mulberry32(5) });
      if (t && t.none) { assert.equal(game, 'schiffe'); continue; }
      assert.ok(t && t.move, `${game}: Tipp vorhanden`);
      assert.ok(E.isLegal(s, t.move), `${game}: erlaubt ${JSON.stringify(t.move)}`);
      assert.equal(JSON.stringify(s), before, `${game}: unverändert`);
      assert.ok(Array.isArray(t.marks) && Array.isArray(t.acts) && Array.isArray(t.els) && typeof t.text === 'string', game);
      assert.ok(t.marks.length || t.acts.length || t.els.length || game === 'schiffe' || game === 'backgammon', `${game}: etwas wird markiert ${JSON.stringify(t)}`);
      assert.ok(t.text.length <= 60, `${game}: kurzer Satz „${t.text}“`);
      for (const mk of t.marks) assert.ok(['von', 'nach', 'weg'].includes(mk.kind), game);
      per[game] = t.text || JSON.stringify(t.acts);
    }
  }
  return Object.entries(per).map(([g, x]) => `${g}: ${x}`).join(' | ');
});

// verdeckte Informationen anders verteilen, Sicht des Spielers bleibt gleich
const SCRAMBLE = {
  schnapsen(s, seat, rng) { const o = 1 - seat; const pool = shuffle([...s.hands[o], ...s.talon], rng); s.hands[o] = pool.splice(0, s.hands[o].length); s.talon = pool; },
  maumau(s, seat, rng) { const qs = [...Array(s.n).keys()].filter((q) => q !== seat); const pool = shuffle([...qs.flatMap((q) => s.hands[q]), ...s.stock], rng); for (const q of qs) s.hands[q] = pool.splice(0, s.hands[q].length); s.stock = pool; },
  holdem(s, seat, rng) { const qs = s.holes.map((_, q) => q).filter((q) => q !== seat && !s.shown[q] && s.holes[q].length); const pool = shuffle([...qs.flatMap((q) => s.holes[q]), ...s.deck], rng); for (const q of qs) s.holes[q] = pool.splice(0, s.holes[q].length); s.deck = pool; },
  blackjack(s, seat, rng) { const hole = !s.holeOpen && s.bankCards.length >= 2; const pool = shuffle([...(hole ? [s.bankCards[1]] : []), ...s.shoe], rng); if (hole) s.bankCards[1] = pool.shift(); s.shoe = pool; },
  paare(s, seat, rng) { const E = GAMES.paare.engine, v = E.viewFor(s, seat); const hid = s.cards.map((_, i) => i).filter((i) => v.cards[i] === null); const faces = shuffle(hid.map((i) => s.cards[i]), rng); hid.forEach((i, k) => { s.cards[i] = faces[k]; }); },
  schiffe(s, seat, rng) { const E = GAMES.schiffe.engine, o = 1 - seat; if (!s.fleets[o]) return; const want = JSON.stringify(E.viewFor(s, seat)); for (let k = 0; k < 400; k++) { const t = { ...s, fleets: s.fleets.slice() }; t.fleets[o] = E.randomFleet(s.opts, rng); if (JSON.stringify(E.viewFor(t, seat)) === want) { s.fleets[o] = t.fleets[o]; return; } } }
};

await test('Fair Play: Tipp identisch, egal wie verdeckte Karten/Schiffe liegen (Schnapsen, Mau-Mau, Hold\'em, Blackjack, Paare, Schiffe)', async () => {
  const done = {};
  for (const game of Object.keys(SCRAMBLE)) {
    const E = GAMES[game].engine;
    done[game] = 0;
    for (const { s, seat } of states(game, 12, 3)) {
      const s2 = JSON.parse(JSON.stringify(s));
      SCRAMBLE[game](s2, seat, mulberry32(done[game] + 11));
      if (JSON.stringify(s2) === JSON.stringify(s)) continue;          // nichts Verdecktes zum Vertauschen
      assert.deepEqual(E.viewFor(s2, seat), E.viewFor(s, seat), `${game}: Sicht gleich`);
      const seen = [];
      const spy = (view) => { seen.push(JSON.stringify(view)); return E.legalMoves(view)[0]; };
      if (game === 'schiffe' && E.legalMoves(E.viewFor(s, seat)).every((m) => m.type === 'place')) continue;
      const a = await suggest(game, s, seat, { bot: spy }), b = await suggest(game, s2, seat, { bot: spy });
      assert.equal(seen[0], seen[1], `${game}: der Computer bekommt in beiden Fällen dasselbe zu sehen`);
      assert.deepEqual(a, b, `${game}: Tipp gleich`);
      // echte Bots ohne Zeitabhängigkeit: auch das Ergebnis selbst gleich
      if (game === 'blackjack' || game === 'paare') {
        const r1 = await suggest(game, s, seat, { rng: mulberry32(9) }), r2 = await suggest(game, s2, seat, { rng: mulberry32(9) });
        assert.deepEqual(r1, r2, `${game}: echter Tipp gleich`);
      }
      done[game]++;
    }
    assert.ok(done[game] >= 3, `${game}: genug Stellungen mit verdeckten Karten (${done[game]})`);
  }
  return Object.entries(done).map(([g, n]) => `${g} ${n}`).join(', ');
});

await test('kein Tipp, wenn jemand anderes am Zug ist', async () => {
  const E = GAMES.reversi.engine;
  const s = E.initialState();
  assert.equal(await suggest('reversi', s, 1, { bot: () => { throw new Error('darf nicht rechnen'); } }), null);
});

console.log(fails ? `\n${fails} rot` : '\nn11 Tipp grün');
process.exit(fails ? 1 : 0);
