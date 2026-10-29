// n11 Gate „Wer gewinnt?“ Reversi: Zufallspartien wie Hermes' Probe (tools/n11/rv_eval_hermes.mjs), aber viele.
// Je Partie der Sprung der Anzeige (Prozentpunkte, Sicht Schwarz) zwischen 9 und 8 leeren Feldern und an der
// Lösungsgrenze des jeweiligen Stands; außerdem die Anzeige in exakt gewonnenen Stellungen.
// Ein Sprung heißt „echt“, wenn sich zwischen den beiden Stellungen das exakte Ergebnis (Referenz: neuer Löser ohne
// Budget) geändert hat – der Zug davor hat einen Sieg verschenkt; dann MUSS die Anzeige springen. Sonst „Anzeige-Sprung“.
// Aufruf: node tools/n11/rv_gate.mjs [--root=/pfad/zum/stand] [--n=300] [--grenze=12] [--seed=7] [--spiel=zufall|stufe2]
//   --spiel=stufe2: beide Seiten spielen wie der mittlere Computer (Zufallseröffnung 6 Züge) statt Zufallszügen
//   --root: Stand, dessen engine.js/evalpos.js gemessen wird (vorher: Hauptordner auf main vor n11)
const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const root = arg('root', new URL('../..', import.meta.url).pathname.replace(/\/$/, ''));
const N = +arg('n', 300), G = +arg('grenze', 12);
const E = await import(`${root}/src/games/reversi/engine.js`);
const { evalPosition } = await import(`${root}/src/evalpos.js`);
let seed = +arg('seed', 7);
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const ref = await import('../../src/games/reversi/engine.js');
const { chooseMove: bot2 } = await import('../../src/games/reversi/bot.js');
const { mulberry32 } = await import('../../src/rng.js');
const SPIEL = arg('spiel', 'zufall'), botRng = mulberry32(+arg('seed', 7));
const exactSign = (s) => { const v = ref.solveExact(s, Infinity, true); return Math.sign(s.turn === 0 ? v : -v); };   // nur wer gewinnt
const J98 = [], JG = [], JX = [], WIN = [];
for (let g = 0; g < N; g++) {
  let s = E.initialState();
  const at = {};
  let prev = null, firstX = null;   // Übergang Schätzung → bewiesen (erste exakte Anzeige nach einer Schätzung)
  while (!E.result(s)) {
    const l = E.legalMoves(s);
    s = E.applyMove(s, SPIEL === 'stufe2' && ref.empties(s) < 54 ? bot2(s, { level: 2, rng: botRng }) : l[Math.floor(rnd() * l.length)]);
    if (E.result(s)) break;
    const c = E.counts(s), e = 64 - c[0] - c[1];
    if (at[e] === undefined && [8, 9, G, G + 1].includes(e)) at[e] = { ...evalPosition('reversi', s, 0), sign: exactSign(s) };
    if (!firstX && e <= 24) {
      const r0 = evalPosition('reversi', s, 0), r = { ...r0, exact: r0.exact ?? ref.empties(s) <= 8 };   // vor n11: ab 8 leer exakt
      if (r.exact && prev && !prev.exact) firstX = [{ ...prev, sign: exactSign(prev.s) }, { ...r, sign: exactSign(s) }];
      prev = { ...r, s };
    }
    if (e <= 8 && e >= 1) {
      // exakt gewonnen (Referenz: neuer Löser ohne Budget) → was zeigt der Balken?
      const v = ref.solveExact(s, Infinity), x0 = s.turn === 0 ? v : -v;
      const p = evalPosition('reversi', s, 0).p;
      if (x0 > 0) WIN.push(p); else if (x0 < 0) WIN.push(1 - p);
    }
  }
  const jump = (a, b) => ({ d: Math.abs(a.p - b.p) * 100, echt: a.sign !== b.sign, kippt: (a.p - 0.5) * (b.p - 0.5) < 0 && Math.abs(a.p - 0.5) > 0.05 });
  if (at[9] && at[8]) J98.push(jump(at[9], at[8]));
  if (at[G + 1] && at[G]) JG.push(jump(at[G + 1], at[G]));
  if (firstX) JX.push(jump(...firstX));
}
const share = (a, f) => a.filter(f).length / a.length;
const q = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const sum = (J) => {
  const ruhig = J.filter((j) => !j.echt);
  return {
    n: J.length, median: +q(J.map((j) => j.d), 0.5).toFixed(1), p90: +q(J.map((j) => j.d), 0.9).toFixed(1),
    anteilOhneSprung25: +share(J, (j) => j.d <= 25).toFixed(3),
    echteWechsel: J.filter((j) => j.echt).length,
    anteilOhneAnzeigeSprung25: +share(ruhig, (j) => j.d <= 25).toFixed(3),
    // irreführend: Anzeige zeigte klar die falsche Seite vorn (> 55 %), obwohl sich am Ausgang nichts geändert hat
    anteilFalscheSeite: +share(ruhig, (j) => j.kippt).toFixed(3)
  };
};
const out = {
  root, spiel: SPIEL, partien: N,
  sprung9zu8: sum(J98),
  [`sprung${G + 1}zu${G}`]: sum(JG),
  sprungSchaetzungZuBewiesen: sum(JX),
  exaktGewonnen: { n: WIN.length, anteilMind97: +share(WIN, (p) => p >= 0.97).toFixed(3), median: +q(WIN, 0.5).toFixed(3) }
};
console.log(JSON.stringify(out, null, 1));
