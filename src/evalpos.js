// „Wer gewinnt?“: Einschätzung einer Stellung aus Sicht eines Sitzes, in der Einheit des Spiels, plus Gewinnchance.
// Läuft im Bot-Worker (≤ ~200 ms). Schach: kurze Suche des Übungs-Bots (Centipawns), sonst evaluate() der Engine.
// Kartenspiele bekommen nur die Sicht des Spielers (viewFor), nie verdeckte Karten.
// n11: Ergebnis { x, p, exact }. exact = der Wert ist bewiesen (Partie aus, Endspiel gelöst, Matt/Gewinn gefunden) –
// dann zeigt die Anzeige „Sieg sicher bei bestem Spiel“ statt einer Prozentzahl, und p ist P_SICHER bzw. 1 − P_SICHER.
// Die Steilheit der Kurven (Zahl → Gewinnchance) ist aus Selbstspiel-Partien kalibriert (tools/n11/kalibrieren.mjs,
// Tabelle in N11_BERICHT.md); wo die Kalibrierung keinen deutlichen Gewinn brachte (Brier < 0,005 besser), steht noch der
// alte Wert (Schiffe, Würfelglück, Vier, Schnapsen).
import { GAMES } from './games/registry.js';
import { chooseMove as schachBot, stats as schachStats } from './games/schach/bot.js';
import { equity as holdemEquity } from './games/holdem/equity.js';
import { liveSeats as holdemLive } from './games/holdem/engine.js';
import { SOLVE_EMPTIES as RV_SOLVE, WLD_EMPTIES as RV_WLD } from './games/reversi/engine.js';

export const P_SICHER = 0.99;   // Balken bei bewiesenem Sieg (bewiesene Niederlage: 1 %)
const logistic = (k) => (x) => 1 / (1 + Math.exp(-k * x));

// Reversi (n11, kalibriert an 600 Partien Stufe 3 gegen Stufe 2/3, tools/n11/kalib_fit.mjs): Steilheit je Spielphase
// (leere Felder), Stützstellen = Mitte der Messbereiche, dazwischen linear. Kurz vor der Lösungsgrenze (13–16 leer)
// und in der Eröffnung ist dieselbe Zahl weniger sicher als im Mittelspiel.
export const RV_STEIL = [[14.5, 0.118], [18.5, 0.254], [24.5, 0.296], [32.5, 0.296], [40.5, 0.238], [52.5, 0.064]];
export function rvSteil(empty) {
  const T = RV_STEIL;
  if (empty <= T[0][0]) return T[0][1];
  for (let k = 1; k < T.length; k++) {
    if (empty <= T[k][0]) { const [e0, s0] = T[k - 1], [e1, s1] = T[k]; return s0 + (s1 - s0) * (empty - e0) / (e1 - e0); }
  }
  return T[T.length - 1][1];
}
const rvEmpty = (gs) => (gs && Array.isArray(gs.board) ? gs.board.filter((v) => v === null).length : 30);

// Einheit (unit; leer = ohne), Wort davor (prefix), Nachkommastellen und Abbildung auf eine Gewinnchance pct(x, gs)
export const EVAL = {
  schach: { unit: 'Bauern', digits: 1, pct: logistic(0.157), win: ['Matt in Sicht', 'Matt droht'] },   // n11: vorher 10^(−x/4)
  muehle: { unit: 'Steine', digits: 0, pct: logistic(0.43) },   // n11 kalibriert, vorher 0,7
  dame: { unit: 'Steine', digits: 0, pct: logistic(1.1) },   // n11 kalibriert, vorher 0,55
  backgammon: { unit: 'Pips', digits: 0, pct: logistic(0.046) },   // n11 kalibriert, vorher 1/14
  halma: { unit: 'Felder', digits: 0, pct: logistic(0.156) },   // n11 kalibriert, vorher 1/9
  schnapsen: { unit: 'Punkte', digits: 1, pct: logistic(0.55) },
  ludo: { unit: 'Felder', digits: 0, pct: logistic(0.019) },   // n11 kalibriert, vorher 1/14
  schiffe: { unit: 'Felder', digits: 0, pct: logistic(1 / 3.5) },
  paare: { unit: 'Paare', digits: 0, pct: logistic(0.4) },   // n11 kalibriert, vorher 1/1,5
  // Reversi: Mittelspiel-Zahl ist ein geschätzter Vorteil (kein Steinstand); exakt gelöst = End-Differenz in Steinen
  reversi: {
    unit: '', prefix: 'Vorteil', digits: 0, pct: (x, gs) => logistic(rvSteil(rvEmpty(gs)))(x), exactUnit: 'Steine',
    title: `Schätzung; ab ${RV_SOLVE} leeren Feldern exakt gelöst, meist schon ab ${RV_WLD - 2} bewiesen, wer gewinnt`
  },
  wuerfel: { unit: 'Punkte', digits: 0, pct: logistic(1 / 22) },
  maumau: { unit: 'Karten', digits: 1, pct: logistic(0.2) },   // n11 kalibriert, vorher 1/1,6
  vier: { unit: '', prefix: 'Vorteil', digits: 0, pct: logistic(1 / 8), title: 'Schätzung; ein erzwungener Gewinn wird bis 8 Züge voraus erkannt' },
  // Hold'em: Gewinnchance der eigenen Hand gegen zufällige Hände der Mitspieler, die noch dabei sind (fremde Karten
  // kennt niemand – es ist eine Schätzung, kein Wissen)
  holdem: {
    unit: '%', digits: 0, pct: (x) => x / 100,
    label: (r) => (r.over ? 'Wer gewinnt? – Turnier vorbei' : r.none ? 'Wer gewinnt? – nicht in dieser Hand' : `Wer gewinnt? ${Math.round(r.x)} % gegen ${r.opp === 1 ? 'eine zufällige Hand' : `${r.opp} zufällige Hände`}`),
    title: 'Gewinnchance deiner Hand, wenn die anderen irgendwelche Karten hätten (Monte-Carlo, 4000 Durchgänge)'
  }
};

// Anzeigetext einer Bewertung (ohne „Wer gewinnt?“): mode 'pct' = Gewinnchance, sonst Zahl in der Einheit des Spiels
export function evalText(game, r, mode = 'num') {
  const cfg = EVAL[game];
  if (!cfg || !r) return '';
  const x = r.x;
  const signed = (v, digits) => {
    const a = Math.abs(v).toFixed(digits), zero = Number(a) === 0;   // −0,3 → „±0“, nicht „−0“
    return `${zero ? '±' : v > 0 ? '+' : '−'}${a.replace('.', ',')}`;
  };
  if (r.exact) {
    // bewiesen: keine Prozentzahl, sondern das Ergebnis bei bestem Spiel (Einheit nur, wo die Zahl echt ist)
    if (cfg.win && Math.abs(x) >= 99) return x > 0 ? cfg.win[0] : cfg.win[1];
    const n = cfg.exactUnit && !r.wld && Math.abs(x) < 99 ? ` (${signed(x, 0)})` : '';
    if (x > 0) return `Sieg sicher bei bestem Spiel${n}`;
    if (x < 0) return `Niederlage droht${n}`;
    return 'Remis bei bestem Spiel';
  }
  if (mode === 'pct') return `${Math.round(Math.max(0, Math.min(1, r.p)) * 100)} % Gewinnchance`;
  if (Math.abs(x) >= 99) return cfg.win ? (x > 0 ? cfg.win[0] : cfg.win[1]) : x > 0 ? 'Sieg sicher bei bestem Spiel' : 'Niederlage droht';
  return [cfg.prefix, signed(x, cfg.digits), cfg.unit].filter(Boolean).join(' ');
}

// opts.solve: Reversi – höchstens so viele leere Felder exakt lösen (Link ?solve=N)
export function evalPosition(game, gs, seat, opts = {}) {
  const E = GAMES[game].engine;
  let x, exact = false, wld = false;
  const over = E.result(gs);
  if (game === 'holdem') {
    const hole = gs.holes && gs.holes[seat];
    const opp = gs.phase === 'bet' ? holdemLive(gs).filter((q) => q !== seat).length : 0;
    if (over) return { x: over.winner === seat ? 100 : 0, p: over.winner === seat ? 1 : 0, none: true, over: true };
    if (!hole || hole.length !== 2 || !hole[0] || gs.folded[seat] || !opp) return { x: 0, p: 0.5, none: true };
    const { eq } = holdemEquity(hole, gs.board, Array(opp).fill(null), { iters: 4000 });
    return { x: eq * 100, p: eq, opp };
  }
  if (game === 'schach' && !over) {
    schachBot(gs, { level: 2, timeMs: 160 });
    const cp = schachStats.score;   // aus Sicht der Seite am Zug
    x = Math.max(-99, Math.min(99, (gs.turn === seat ? cp : -cp) / 100));
    if (Math.abs(cp) > 90000) { x = (gs.turn === seat) === cp > 0 ? 99 : -99; exact = true; }   // Matt gefunden
  } else if (E.evaluateInfo) {
    const r = E.evaluateInfo(gs, seat, opts);
    x = r.x;
    exact = !!r.exact;
    if (r.wld) wld = true;
  } else {
    x = E.evaluate(gs, seat);
  }
  if (over) exact = true;
  let p = EVAL[game] ? EVAL[game].pct(x, gs) : 0.5;
  if (exact) p = x > 0 ? P_SICHER : x < 0 ? 1 - P_SICHER : 0.5;
  if (over) p = over.winner === null || over.winner === undefined ? 0.5 : over.winner === seat ? 1 : 0;
  return wld ? { x, p, exact, wld } : { x, p, exact };
}
