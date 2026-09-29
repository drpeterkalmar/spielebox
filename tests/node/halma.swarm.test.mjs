// Schwarm-Test Stern-Halma: viele Partien für 2, 3, 4 und 6 Spieler (gemischt Zufall/Bot), Invarianten nach
// jedem Halbzug, Vergleich mit einer unabhängigen Referenz (Geometrie nur aus HOLES-Koordinaten), Fuzz mit
// illegalen Zügen, dazu Bot-Stärke. Ein Thread (keine Worker).
// Aufruf: node tests/node/halma.swarm.test.mjs [seed] [--games=500] [--vsrand=200] [--selfplay=60]
import assert from 'node:assert/strict';
import * as E from '../../src/games/halma/engine.js';
import { chooseMove } from '../../src/games/halma/bot.js';
import { mulberry32, randInt, pick } from '../../src/rng.js';

const args = process.argv.slice(2);
const num = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? Number(a.split('=')[1]) : def;
};
const SEED = Number(args.find(a => /^\d+$/.test(a)) ?? 20260929);
const GAMES = num('games', 500);        // Partien je Spielerzahl (gemischt)
const VSRAND = num('vsrand', 200);      // Stufe 2 gegen Zufall, 2 Spieler
const SELF = num('selfplay', 60);       // reine Stufe-2-Partien je Spielerzahl
const REF_EVERY = 5;                    // Referenzvergleich jeden 5. Halbzug
const REASONS = new Set([E.REASON_HOME, E.REASON_BLOCK, E.REASON_LIMIT]);

const t0 = performance.now();
let passed = 0, failed = 0;
function test(name, fn) {
  try {
    const info = fn();
    passed++;
    console.log(`✅ ${name}${info ? ` (${info})` : ''}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${name}\n   ${String((e && e.stack) || e).split('\n').slice(0, 6).join('\n   ')}`);
  }
}

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

// ---------- unabhängige Referenz (nur Koordinaten) ----------

const key = (x, y) => `${Math.round(x * 2)},${Math.round(y / (Math.sqrt(3) / 2))}`;
const BY_XY = new Map(E.HOLES.map((p, i) => [key(p.x, p.y), i]));
const UNIT = [0, 60, 120, 180, 240, 300].map(a => [Math.cos(a * Math.PI / 180), Math.sin(a * Math.PI / 180)]);
const hole = (x, y) => BY_XY.get(key(x, y)) ?? -1;
const REF_NB = E.HOLES.map(p => UNIT.map(([ux, uy]) => hole(p.x + ux, p.y + uy)));
const REF_JP = E.HOLES.map(p => UNIT.map(([ux, uy]) => hole(p.x + 2 * ux, p.y + 2 * uy)));

// Alle Ziele (from → Menge) per Tiefensuche über einfache Pfade
function refTargets(board, seat) {
  const out = new Map();
  for (let from = 0; from < 121; from++) {
    if (board[from] !== seat) continue;
    const set = new Set();
    for (const t of REF_NB[from]) if (t >= 0 && board[t] === -1) set.add(t);
    const b = board.slice();
    b[from] = -1;
    const seen = new Set([from]);
    const dfs = cur => {
      for (let d = 0; d < 6; d++) {
        const over = REF_NB[cur][d], land = REF_JP[cur][d];
        if (over < 0 || land < 0 || b[over] === -1 || b[land] !== -1 || seen.has(land)) continue;
        seen.add(land);
        set.add(land);
        dfs(land);
        // kein seen.delete: Erreichbarkeit genügt (jedes erreichbare Loch hat einen einfachen Pfad)
      }
    };
    dfs(from);
    if (set.size) out.set(from, set);
  }
  return out;
}

// Referenzprüfung eines Zugs (nur Form { from, path } bzw. { pass: true })
function refLegal(state, move, hasAny) {
  if (move === null || typeof move !== 'object' || Array.isArray(move)) return false;
  const keys = Object.keys(move);
  if (keys.length === 1 && keys[0] === 'pass') return move.pass === true && !hasAny;
  if (keys.length !== 2 || !keys.includes('from') || !keys.includes('path')) return false;
  const { from, path } = move, b = state.board.slice(), ok = v => Number.isInteger(v) && v >= 0 && v < 121;
  if (!ok(from) || b[from] !== state.turn || !Array.isArray(path) || !path.length || !path.every(ok)) return false;
  b[from] = -1;
  if (path.length === 1 && REF_NB[from].includes(path[0])) return b[path[0]] === -1;
  const seen = new Set([from]);
  let cur = from;
  for (const land of path) {
    const d = REF_JP[cur].indexOf(land);
    if (d < 0 || seen.has(land) || b[land] !== -1 || b[REF_NB[cur][d]] === -1) return false;
    seen.add(land);
    cur = land;
  }
  return true;
}

// ---------- Invarianten ----------

function freeze(s) {
  for (const k of ['board', 'moves', 'last', 'over']) if (s[k]) Object.freeze(s[k]);
  if (s.last && s.last.path) Object.freeze(s.last.path);
  return Object.freeze(s);
}

function checkState(s) {
  assert.equal(s.board.length, 121);
  const cnt = Array(s.n).fill(0);
  for (const c of s.board) {
    assert.ok(Number.isInteger(c) && c >= -1 && c < s.n, `Brettwert ${c}`);
    if (c >= 0) cnt[c]++;
  }
  for (let p = 0; p < s.n; p++) assert.equal(cnt[p], 10, `Sitz ${p} hat ${cnt[p]} Steine`);
  assert.equal(s.moves.reduce((a, b) => a + b, 0), s.ply);
  assert.equal(s.turn, s.ply % s.n);
  for (const m of s.moves) assert.ok(m <= E.MOVE_LIMIT);
  const r = E.result(s);
  if (r) {
    assert.ok(REASONS.has(r.reason), r.reason);
    assert.ok(r.winner === null || (r.winner >= 0 && r.winner < s.n));
    assert.equal(E.currentPlayer(s), null);
  }
}

function checkTransition(s, move, n) {
  const seat = s.turn;
  const diff = [];
  for (let i = 0; i < 121; i++) if (s.board[i] !== n.board[i]) diff.push(i);
  if (move.pass) {
    assert.equal(diff.length, 0);
    return;
  }
  const to = move.path[move.path.length - 1];
  assert.equal(s.board[to], -1, 'Stein auf besetztes Loch');
  assert.deepEqual(diff.sort((a, b) => a - b), [move.from, to].sort((a, b) => a - b));
  assert.equal(n.board[move.from], -1);
  assert.equal(n.board[to], seat);
  assert.equal(n.moves[seat], s.moves[seat] + 1);
}

// Zufällige (meist illegale) Züge rund um einen echten Zug
function fuzzMoves(rng, s, legal) {
  const m = pick(rng, legal);
  const out = [];
  const own = [];
  for (let i = 0; i < 121; i++) if (s.board[i] === s.turn) own.push(i);
  if (m.pass) {
    out.push({ pass: true, x: 1 }, { from: own[0], path: [randInt(rng, 121)] }, { pass: false });
    return out;
  }
  const p = m.path;
  out.push({ from: m.from, path: [...p, randInt(rng, 121)] });
  out.push({ from: m.from, path: p.slice(0, -1).concat([randInt(rng, 121)]) });
  out.push({ from: pick(rng, own), path: [randInt(rng, 121)] });
  out.push({ from: randInt(rng, 121), path: p.slice() });
  out.push({ from: m.from, path: [...p, m.from] });
  out.push({ from: m.from, path: p.length > 1 ? [...p, p[0]] : [p[0], p[0]] });
  out.push({ from: m.from, path: p.slice(), extra: 1 });
  out.push({ from: m.from, path: [pick(rng, E.NEIGHBORS[m.from].filter(x => x >= 0)), ...p] });
  out.push({ pass: true });
  if (rng() < 0.1) out.push(null, {}, { from: m.from }, { from: m.from, path: 'x' }, { from: m.from, path: [0.5] });
  return out;
}

// Spieler: 'r' = Zufall, 1/2/3 = Bot-Stufe
function playGame(n, kinds, seed, { check = true, fuzz = true, timeMs = 20 } = {}) {
  const rng = mulberry32(seed);
  let s = freeze(E.initialState({ players: n }));
  let fuzzed = 0;
  while (!E.result(s)) {
    assert.ok(s.ply < E.MOVE_LIMIT * n, 'Partie endet nicht am Limit');
    const legal = E.legalMoves(s);
    assert.ok(legal.length > 0);
    if (check && s.ply % REF_EVERY === 0) {
      const ref = refTargets(s.board, s.turn);
      if (!ref.size) assert.deepEqual(legal, [{ pass: true }]);
      else {
        let total = 0;
        for (const set of ref.values()) total += set.size;
        assert.equal(legal.length, total, 'Zugzahl ≠ Referenz');
        for (const m of legal) {
          assert.ok(ref.get(m.from)?.has(m.path[m.path.length - 1]), 'Zug nicht in Referenz');
          assert.ok(refLegal(s, m, true), 'Pfad laut Referenz ungültig');
        }
      }
    }
    if (fuzz) {
      const hasAny = !(legal.length === 1 && legal[0].pass);
      for (const fm of fuzzMoves(rng, s, legal)) {
        const want = refLegal(s, fm, hasAny), got = E.isLegal(s, fm);
        assert.equal(got, want, `isLegal ${JSON.stringify(fm)}`);
        if (!got) assert.throws(() => E.applyMove(s, fm));
        fuzzed++;
      }
    }
    const kind = kinds[s.turn];
    const move = kind === 'r' ? pick(rng, legal) : chooseMove(s, { level: kind, rng, timeMs });
    assert.ok(E.isLegal(s, move), 'Bot-Zug illegal');
    const next = freeze(E.applyMove(s, move));
    if (check) {
      checkTransition(s, move, next);
      checkState(next);
    }
    s = next;
  }
  return { s, r: E.result(s), fuzzed };
}

// ---------- Tests ----------

let totalGames = 0;
for (const n of [2, 3, 4, 6]) {
  test(`${n} Spieler: ${GAMES} gemischte Partien (Zufall/Stufe 1–3), Invarianten, Referenz, Fuzz`, () => {
    const reasons = {};
    let plies = 0, fuzzed = 0;
    for (let g = 0; g < GAMES; g++) {
      const rng = mulberry32(mix(SEED, n, g));
      // ein Viertel reine Zufallspartien (laufen bis zum Zuglimit), sonst gemischte Sitze
      const kinds = Array.from({ length: n }, () => {
        if (g % 4 === 0) return 'r';
        const x = rng();
        return x < 0.35 ? 'r' : x < 0.65 ? 1 : x < 0.97 ? 2 : 3;
      });
      const { s, r, fuzzed: f } = playGame(n, kinds, mix(SEED, n, g, 1), { fuzz: g % 2 === 0 });
      reasons[r.reason] = (reasons[r.reason] || 0) + 1;
      plies += s.ply;
      fuzzed += f;
      totalGames++;
    }
    return `${Object.entries(reasons).map(([k, v]) => `${k}: ${v}`).join(', ')}; ⌀ ${(plies / GAMES).toFixed(0)} Halbzüge, ${fuzzed} Fuzz-Züge`;
  });
}

test(`Stufe 2 schlägt Zufall (2 Spieler, ${VSRAND} Partien, beide Sitze) > 95 %`, () => {
  let wins = 0;
  for (let g = 0; g < VSRAND; g++) {
    const botSeat = g % 2;
    const kinds = botSeat === 0 ? [2, 'r'] : ['r', 2];
    const { r } = playGame(2, kinds, mix(SEED, 99, g), { check: g % 10 === 0, fuzz: false });
    if (r.winner === botSeat) wins++;
    totalGames++;
  }
  assert.ok(wins / VSRAND > 0.95, `${wins}/${VSRAND}`);
  return `${wins}/${VSRAND}`;
});

test(`Reine Stufe-2-Partien (${SELF} je Spielerzahl) enden überwiegend mit echtem Sieg`, () => {
  const out = [];
  for (const n of [2, 3, 4, 6]) {
    let real = 0, plies = 0;
    const wins = Array(n).fill(0);
    for (let g = 0; g < SELF; g++) {
      const { s, r } = playGame(n, Array(n).fill(2), mix(SEED, 77, n, g), { check: g % 5 === 0, fuzz: false });
      if (r.reason !== E.REASON_LIMIT) real++;
      if (r.winner !== null) wins[r.winner]++;
      plies += s.ply;
      totalGames++;
    }
    assert.ok(real / SELF >= 0.9, `${n} Spieler: nur ${real}/${SELF} echte Siege`);
    out.push(`${n}er ${real}/${SELF} echt, ⌀ ${(plies / SELF / n).toFixed(0)} Züge je Spieler, Siege ${wins.join('/')}`);
  }
  return out.join('; ');
});

test('Stufe 3 gegen Stufe 2 (2 Spieler, 20 Partien)', () => {
  let wins = 0;
  for (let g = 0; g < 20; g++) {
    const s3 = g % 2;
    const kinds = s3 === 0 ? [3, 2] : [2, 3];
    const { r } = playGame(2, kinds, mix(SEED, 33, g), { check: false, fuzz: false, timeMs: 100 });
    if (r.winner === s3) wins++;
    totalGames++;
  }
  assert.ok(wins >= 14, `${wins}/20`);
  return `${wins}/20`;
});

test(`insgesamt ≥ 2000 Partien, Laufzeit < 3 min`, () => {
  const sec = (performance.now() - t0) / 1000;
  assert.ok(totalGames >= 2000, `${totalGames}`);
  assert.ok(sec < 180, `${sec.toFixed(0)} s`);
  return `${totalGames} Partien, ${sec.toFixed(1)} s`;
});

console.log(`\n${passed} ✅, ${failed} ❌ (${((performance.now() - t0) / 1000).toFixed(1)} s, Seed ${SEED})`);
process.exit(failed ? 1 : 0);
