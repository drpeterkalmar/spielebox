// Schwarm Paare finden: 10 000 Zufallspartien (8/12/18 Paare, 1–4 Spieler, zufällige Züge und Computer gemischt)
// mit Invarianten nach jedem Zug; Sicht verrät nie eine verdeckte Karte; Müll-Züge werden abgelehnt.
// Aufruf: node tests/node/paare.swarm.test.mjs [seed]
import assert from 'node:assert/strict';
import * as P from '../../src/games/paare/engine.js';
import { chooseMove } from '../../src/games/paare/bot.js';
import { mulberry32, pick } from '../../src/rng.js';
import { valueFor } from '../../src/net/fair.js';

const seed = Number(process.argv[2]) || 20261001;
const rng = mulberry32(seed);
const hex = () => Array.from({ length: 64 }, () => '0123456789abcdef'[Math.floor(rng() * 16)]).join('');
const t0 = Date.now();
let fails = 0, games = 0, moves = 0, junk = 0, views = 0;
const JUNK = [null, {}, { flip: -1 }, { flip: 99 }, { flip: '1' }, { flip: 1, x: 2 }, [], 'flip'];

try {
  for (let g = 0; g < 10000; g++) {
    const opts = { paare: [8, 12, 18][g % 3], players: 1 + (g % 4) };
    let s = P.initialState(opts);
    s = P.applyChance(s, valueFor(P.chance(s), hex()));
    const k = s.cards.length;
    const botLv = g % 5 === 0 ? 1 + (g % 3) : 0;
    for (let step = 0; !P.result(s); step++) {
      assert.ok(step < 4000, 'Partie endet');
      const legal = P.legalMoves(s);
      assert.ok(legal.length > 0 && P.currentPlayer(s) === s.turn);
      const v = P.viewFor(s, s.turn);
      const vis = (i) => s.found[i] !== null || s.open.includes(i) || (s.shown && s.shown.includes(i));
      for (let i = 0; i < k; i++) assert.equal(v.cards[i], vis(i) ? s.cards[i] : null, 'Sicht = nur offene Karten');
      views++;
      if (step % 7 === 0) for (const m of JUNK) { assert.equal(P.isLegal(s, m), false); junk++; }
      const m = botLv ? chooseMove(v, { level: botLv, rng }) : pick(rng, legal);
      assert.ok(P.isLegal(s, m), 'nur legale Züge');
      const n = JSON.parse(JSON.stringify(P.applyMove(s, m)));
      assert.deepEqual(n, P.applyMove(s, m), 'JSON-Rundreise');
      // Invarianten
      for (let x = 0; x < P.normalizeOptions(opts).paare; x++) assert.equal(n.cards.filter((c) => c === x).length, 2);
      const foundCount = n.found.filter((x) => x !== null).length;
      assert.equal(foundCount % 2, 0);
      assert.equal(n.scores.reduce((a, b) => a + b, 0) * 2, foundCount, 'Punkte = gefundene Paare');
      for (let i = 0; i < k; i++) if (n.found[i] !== null) assert.ok(n.found.some((y, j) => j !== i && y === n.found[i] && n.cards[j] === n.cards[i]), 'Paare liegen zusammen');
      assert.ok(n.open.length <= 1);
      assert.ok(n.memory.every(([i, c]) => n.found[i] === null && n.cards[i] === c), 'Gedächtnis stimmt');
      s = n;
      moves++;
    }
    assert.ok(s.found.every((x) => x !== null), 'Ende = alle gefunden');
    games++;
  }
  console.log(`✅ ${games} Partien, ${moves} Züge, ${views} Sichten, ${junk} Müll-Züge abgelehnt`);
} catch (e) {
  fails++;
  console.log(`❌ Schwarm nach ${games} Partien\n   ${String(e && e.stack || e).split('\n').slice(0, 5).join('\n   ')}`);
}
console.log(`${fails ? 0 : 1} ✅, ${fails} ❌ (Seed ${seed}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
process.exit(fails ? 1 : 0);
