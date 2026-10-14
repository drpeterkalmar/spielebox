// Kinder-Stufe mit menschlichen Fehlern (n10 E4): Der leichte Computer (Stufe 1) übersieht mit Wahrscheinlichkeit
// fehler (Standard 0,15, Link ?fehler=0.15, 0 = aus) einen Schlag bzw. einen Gewinnzug. Er spielt dann nicht irgendetwas,
// sondern den besten anderen Zug nach der Stellungsbewertung der Engine (1 Zug tief) – nie absichtlich lächerlich.
// Nur Brett- und Würfelspiele mit „Schlägen“; Kartenspiele und Würfelglück bleiben unverändert. Rein, ohne DOM.
export const FEHLER = 0.15;
export const FEHLER_SPIELE = new Set(['muehle', 'dame', 'schach', 'vier', 'reversi', 'halma', 'ludo', 'backgammon']);

// ist m ein Schlag oder Gewinnzug für seat?
export function bigMove(id, E, gs, m, seat) {
  try {
    switch (id) {
      case 'muehle': if (m.remove !== undefined) return true; break;
      case 'dame': if (m.cap && m.cap.length) return true; break;
      case 'schach': if (/[x#]/.test(E.describeMove(gs, m))) return true; break;
      case 'backgammon': if (m.type === 'play' && m.steps && m.steps.length && (E.applySteps(gs, m.steps).hits || 0) > 0) return true; break;
    }
    const next = E.applyMove(gs, m);
    if (id === 'ludo' && next.last && next.last.capture) return true;
    const r = E.result(next);
    return !!r && r.winner === seat;
  } catch { return false; }
}

// Zug m des Bots ggf. durch einen „übersehenen“ ersetzen
export function overlook(id, E, gs, m, { level, fehler = 0, rng = Math.random } = {}) {
  if (level !== 1 || !(fehler > 0) || !m || !FEHLER_SPIELE.has(id)) return m;
  const seat = E.currentPlayer(gs);
  if (seat === null || seat === undefined || !bigMove(id, E, gs, m, seat)) return m;
  if (rng() >= fehler) return m;
  const rest = E.legalMoves(gs).filter((x) => !bigMove(id, E, gs, x, seat));
  if (!rest.length) return m;
  let best = rest[0], bv = -Infinity;
  for (const x of rest) {
    let v;
    try { v = E.evaluate(E.applyMove(gs, x), seat); } catch { v = -Infinity; }
    if (v > bv) { bv = v; best = x; }
  }
  return best;
}
