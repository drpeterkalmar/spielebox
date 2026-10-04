// Erzeugt src/games/holdem/preflop.js: Gewinnchance (Equity) aller 169 Startkarten-Klassen gegen 1, 2 und 4
// zufällige Hände (Monte-Carlo mit dem eigenen Evaluator, je Klasse 120 000 Durchgänge, fester Seed).
// Aufruf: node tools/holdem_preflop.mjs   (~1 min)
import { writeFileSync } from 'node:fs';
import { evalMasks } from '../src/games/holdem/eval.js';
import { mulberry32 } from '../src/rng.js';

const R = '23456789TJQKA';
const N = 120000;
const OPP = [1, 2, 4];
const rng = mulberry32(169);

// Klassen in fester Reihenfolge: Paare, suited, offsuit (hoch → niedrig)
const classes = [];
for (let i = 12; i >= 0; i--) for (let j = i; j >= 0; j--) {
  if (i === j) classes.push({ name: R[i] + R[j], hi: i, lo: j, suited: false, pair: true });
  else {
    classes.push({ name: R[i] + R[j] + 's', hi: i, lo: j, suited: true });
    classes.push({ name: R[i] + R[j] + 'o', hi: i, lo: j, suited: false });
  }
}

function equity(cl, nOpp) {
  let win = 0;
  const used = new Uint8Array(52);
  for (let it = 0; it < N; it++) {
    used.fill(0);
    const s1 = Math.floor(rng() * 4);
    const s2 = cl.suited ? s1 : (s1 + 1 + Math.floor(rng() * 3)) % 4;
    const a = cl.hi * 4 + s1, b = cl.lo * 4 + s2;
    used[a] = used[b] = 1;
    const draw = () => { let c; do c = Math.floor(rng() * 52); while (used[c]); used[c] = 1; return c; };
    const board = [draw(), draw(), draw(), draw(), draw()];
    const bm = [0, 0, 0, 0];
    for (const c of board) bm[c & 3] |= 1 << (c >> 2);
    const me = (() => { const m = bm.slice(); m[a & 3] |= 1 << (a >> 2); m[b & 3] |= 1 << (b >> 2); return evalMasks(m[0], m[1], m[2], m[3]); })();
    let best = 0, ties = 0, lose = false;
    for (let o = 0; o < nOpp; o++) {
      const x = draw(), y = draw();
      const m = bm.slice(); m[x & 3] |= 1 << (x >> 2); m[y & 3] |= 1 << (y >> 2);
      const v = evalMasks(m[0], m[1], m[2], m[3]);
      if (v > me) { lose = true; break; }
      if (v === me) ties++;
      best = Math.max(best, v);
    }
    if (!lose) win += 1 / (ties + 1);
  }
  return win / N;
}

const t0 = Date.now();
const rows = classes.map((cl) => [cl.name, ...OPP.map((k) => Math.round(equity(cl, k) * 10000) / 10000)]);
// Rangliste nach Equity gegen eine Hand (für „Top x %“-Bereiche) mit Kombinationszahl je Klasse
const order = rows.slice().sort((x, y) => y[1] - x[1]).map((r) => r[0]);
const out = `// Erzeugt von tools/holdem_preflop.mjs (${new Date().toISOString().slice(0, 10)}): Gewinnchance (Equity) der 169 Startkarten-
// Klassen gegen 1, 2 und 4 zufällige Hände, Monte-Carlo mit ${N} Durchgängen je Klasse. Nicht von Hand ändern.
// EQ[Klasse] = [gegen 1, gegen 2, gegen 4]; ORDER = Klassen nach Equity gegen 1 Hand (beste zuerst).
export const EQ = ${JSON.stringify(Object.fromEntries(rows.map((r) => [r[0], r.slice(1)])))};
export const ORDER = ${JSON.stringify(order)};
`;
writeFileSync(new URL('../src/games/holdem/preflop.js', import.meta.url), out);
console.log(`fertig in ${((Date.now() - t0) / 1000).toFixed(1)} s; AA ${rows[0].slice(1)}; 72o ${rows.find((r) => r[0] === '72o').slice(1)}`);
