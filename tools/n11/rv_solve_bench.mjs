// n11: Laufzeit des exakten Reversi-Lösers je Zahl leerer Felder (Median, p95, Knoten), Stellungen aus Partien
// Stufe 2 gegen Stufe 2 mit zufälliger Eröffnung (je Partie die Stellungen mit 8…18 leeren Feldern).
// Aufruf: node tools/n11/rv_solve_bench.mjs [--n=200] [--from=8] [--to=16] [--json=docs/n11/rv_solve_bench.json]
import * as E from '../../src/games/reversi/engine.js';
import { chooseMove } from '../../src/games/reversi/bot.js';
import { mulberry32 } from '../../src/rng.js';
import { writeFileSync, mkdirSync } from 'node:fs';
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.split('=')[1] : d; };
const N = +arg('n', 200), FROM = +arg('from', 8), TO = +arg('to', 16), JSON_OUT = arg('json', '');
const pos = {};
for (let e = FROM; e <= TO; e++) pos[e] = [];
let seed = 1;
while (Object.values(pos).some((l) => l.length < N)) {
  const rng = mulberry32(seed++);
  let s = E.initialState();
  for (let k = 0; k < 6 && !E.result(s); k++) { const l = E.legalMoves(s); s = E.applyMove(s, l[Math.floor(rng() * l.length)]); }
  while (!E.result(s)) {
    const e = E.empties(s);
    if (pos[e] && pos[e].length < N && !E.legalMoves(s)[0].pass) pos[e].push(s);
    s = E.applyMove(s, chooseMove(s, { level: 2, rng }));
  }
}
const q = (a, p) => a[Math.min(a.length - 1, Math.floor(p * a.length))];
const out = [];
console.log('leer | Median ms | p95 ms | max ms | Median Knoten | p95 Knoten');
for (let e = FROM; e <= TO; e++) {
  const ms = [], kn = [];
  for (const s of pos[e]) {
    const t0 = performance.now();
    E.solveExact(s, Infinity);
    ms.push(performance.now() - t0);
    kn.push(E.SOLVE_STAT.nodes);
  }
  ms.sort((a, b) => a - b); kn.sort((a, b) => a - b);
  const row = { empties: e, n: ms.length, medMs: +q(ms, 0.5).toFixed(2), p95Ms: +q(ms, 0.95).toFixed(2), maxMs: +ms[ms.length - 1].toFixed(1), medNodes: q(kn, 0.5), p95Nodes: q(kn, 0.95), maxNodes: kn[kn.length - 1] };
  out.push(row);
  console.log(`${e} | ${row.medMs} | ${row.p95Ms} | ${row.maxMs} | ${row.medNodes} | ${row.p95Nodes}`);
}
if (JSON_OUT) { mkdirSync('docs/n11', { recursive: true }); writeFileSync(JSON_OUT, JSON.stringify(out, null, 1)); }
