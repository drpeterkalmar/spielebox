// n11: Auswertung der Kalibrier-Daten (tools/n11/kalibrieren.mjs). Logistische Kurve p = 1/(1+e^(−k·x)) per
// Brier-Score angepasst – auf der einen Hälfte der Partien, geprüft auf der anderen (ehrlich, nicht auf den
// Trainingsdaten). Vergleich: Kurve bisher, eine Steilheit für alles, Steilheit je Spielphase.
// Bewiesene Stellungen (exact) fließen mit P_SICHER (99 % / 1 % / 50 %) ein, nicht in die Anpassung.
// Aufruf: node tools/n11/kalib_fit.mjs tests/out/kalib_<spiel>.json [...] [--json=docs/n11/kalibrierung.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { EVAL, rvSteil } from '../../src/evalpos.js';

const OLD_K = { schach: Math.LN10 / 4, muehle: 0.7, dame: 0.55, backgammon: 1 / 14, halma: 1 / 9, schnapsen: 0.55, ludo: 1 / 14, schiffe: 1 / 3.5, paare: 1 / 1.5, reversi: 1 / 9, wuerfel: 1 / 22, maumau: 1 / 1.6, vier: 1 / 8 };
const P_SICHER = 0.99;
const sig = (k, x) => 1 / (1 + Math.exp(-k * x));
const brier = (rows, pf) => { let s = 0; for (const r of rows) { const d = pf(r) - r.y; s += d * d; } return rows.length ? s / rows.length : NaN; };
const exactP = (x) => (x > 0 ? P_SICHER : x < 0 ? 1 - P_SICHER : 0.5);

// beste Steilheit k für die Zeilen (x, y): Gitter auf log-Skala, dann Goldener Schnitt
function fitK(rows) {
  if (!rows.length) return null;
  const f = (k) => brier(rows, (r) => sig(k, r.x));
  let best = 0.01, bv = Infinity;
  for (let i = 0; i <= 300; i++) { const k = 10 ** (-3.5 + (4.5 * i) / 300); const v = f(k); if (v < bv) { bv = v; best = k; } }
  let a = best / 1.05, b = best * 1.05;
  for (let i = 0; i < 40; i++) { const c = b - (b - a) / 1.618, d = a + (b - a) / 1.618; if (f(c) < f(d)) b = d; else a = c; }
  return (a + b) / 2;
}

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const jsonOut = (process.argv.find((a) => a.startsWith('--json=')) || '').slice(7);
const summary = existsSync(jsonOut) ? JSON.parse(readFileSync(jsonOut, 'utf8')) : {};
for (const file of files) {
  const d = JSON.parse(readFileSync(file, 'utf8'));
  const game = d.game, rv = game === 'reversi';
  const all = d.rows.map((r) => ({ g: r[0], seat: r[1], x: rv ? r[7] : r[2], y: r[3], phase: r[4], exact: !!r[5], xEx: r[2], xAlt: rv ? r[8] : r[2] }));
  // Aufteilung in Viererblöcken: jede Hälfte enthält alle Paarungen und beide Platzbelegungen (kalibrieren.mjs)
  const half = (r) => Math.floor(r.g / 4) % 2;
  const train = all.filter((r) => half(r) === 0), test = all.filter((r) => half(r) === 1);
  const fitRows = (rs) => rs.filter((r) => !r.exact && Math.abs(r.x) < 99);
  // Phasen: Reversi nach leeren Feldern, sonst Drittel der Partie
  const buckets = rv ? [[13, 16], [17, 20], [21, 28], [29, 36], [37, 44], [45, 60]] : [[0, 0.333], [0.333, 0.667], [0.667, 1.01]];
  const inB = (r, [lo, hi]) => (rv ? r.phase >= lo && r.phase <= hi : r.phase >= lo && r.phase < hi);
  const kOld = OLD_K[game];
  const kAll = fitK(fitRows(train));
  const kB = buckets.map((b) => fitK(fitRows(train).filter((r) => inB(r, b))));
  const kFor = (r) => { const i = buckets.findIndex((b) => inB(r, b)); return i >= 0 && kB[i] ? kB[i] : kAll; };
  // Vorher: Reversi = alte Anzeige (alter Wert, bis 8 leere Felder exakt, alles durch dieselbe Kurve)
  const pOld = (r) => (rv ? sig(kOld, r.xAlt) : r.exact && Math.abs(r.x) >= 99 ? exactP(r.x) : sig(kOld, r.x));
  const pNewAll = (r) => (r.exact ? exactP(rv ? r.xEx : r.x) : sig(kAll, r.x));
  const pNewB = (r) => (r.exact ? exactP(rv ? r.xEx : r.x) : sig(kFor(r), r.x));
  // so, wie die App jetzt rechnet (Kurve aus src/evalpos.js + Exakt-Regel) = „nachher“
  const pApp = (r) => (r.exact ? exactP(rv ? r.xEx : r.x) : rv ? sig(rvSteil(r.phase), r.x) : EVAL[game].pct(r.x));
  const pOldEx = (r) => (r.exact ? exactP(rv ? r.xEx : r.x) : sig(kOld, r.x));   // nur die Exakt-Regel, alte Kurve
  const res = {
    game, partien: d.n, stellungen: all.length / 2, exaktAnteil: +(all.filter((r) => r.exact).length / all.length).toFixed(3),
    kAlt: +kOld.toFixed(4), kNeu: +kAll.toFixed(4), kPhase: kB.map((k, i) => ({ von: buckets[i][0], bis: buckets[i][1], k: k && +k.toFixed(4), n: fitRows(train).filter((r) => inB(r, buckets[i])).length })),
    brier: {
      konstant50: +brier(test, () => 0.5).toFixed(4),
      vorher: +brier(test, pOld).toFixed(4),
      nurExakt: +brier(test, pOldEx).toFixed(4),
      kalibriert: +brier(test, pNewAll).toFixed(4),
      jePhase: +brier(test, pNewB).toFixed(4),
      app: +brier(test, pApp).toFixed(4)
    }
  };
  // Phasenweise Brier (Test) vorher/nachher
  res.jePhaseBrier = buckets.map((b) => { const rs = test.filter((r) => inB(r, b)); return { von: b[0], bis: b[1], n: rs.length, vorher: +brier(rs, pOld).toFixed(4), kalibriert: +brier(rs, pNewAll).toFixed(4), jePhase: +brier(rs, pNewB).toFixed(4), app: +brier(rs, pApp).toFixed(4) }; });
  summary[game] = res;
  console.log(JSON.stringify(res));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 1));
