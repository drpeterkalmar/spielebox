// Schach-Trainer – lokale Taktik-Wertung (Elo-artig) und Serie, ohne DOM.
// Jede Aufgabe hat eine Lichess-Wertung. Gelöst ohne Fehler und ohne Hilfe = Sieg gegen die Aufgabe, sonst Niederlage.
// Gewertet wird nur der erste Versuch einer Aufgabe. Am Anfang bewegt sich die Zahl schneller (K 40), später ruhiger (K 20).
export const START = 1000;
export const MIN = 400, MAX = 2800;

export const kFactor = (games) => (games < 15 ? 40 : games < 40 ? 28 : 20);
export const expectedScore = (r, pr) => 1 / (1 + 10 ** ((pr - r) / 400));

// st = { rating, games, streak, best }; liefert neuen Stand und die Änderung
export function rate(st, puzzleRating, solved) {
  const s = { rating: START, games: 0, streak: 0, best: 0, ...(st || {}) };
  const e = expectedScore(s.rating, puzzleRating);
  const delta = Math.round(kFactor(s.games) * ((solved ? 1 : 0) - e));
  const out = { ...s, rating: Math.max(MIN, Math.min(MAX, s.rating + delta)), games: s.games + 1 };
  out.streak = solved ? s.streak + 1 : 0;
  out.best = Math.max(s.best, out.streak);
  return { st: out, delta };
}

// Aufgabe passend zur Wertung: ungelöste zuerst, Wertung nah an der eigenen (leicht darüber), etwas Zufall
export function pickNear(puzzles, rating, done, rng = Math.random) {
  const open = puzzles.filter((p) => !done[p[0]]);
  const pool = open.length ? open : puzzles;
  const target = rating + 50;
  const ranked = pool.map((p) => [Math.abs(p[3] - target), p]).sort((a, b) => a[0] - b[0]).slice(0, 6);
  return ranked[Math.floor(rng() * ranked.length)][1];
}
