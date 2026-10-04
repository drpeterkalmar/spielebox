// Schach-Trainer: Logik für Taktik-Aufgaben (ohne DOM, läuft in Node und im Browser).
// Eine Aufgabe ist eine Zeile aus data/puzzles.js – [id, fen, uciMoves, rating, motifId] – oder das Objekt aus puzzleObj().
// fen = Stellung VOR dem Gegnerzug; moves[0] = Gegnerzug, danach abwechselnd Spielerzug / Antwort.
// Spielerzug Nr. step (0-basiert) = moves[1 + 2*step], Antwort darauf = moves[2 + 2*step].
import { Chess } from '../../lib/chess.js';
import { PUZZLES } from './data/puzzles.js';

/** Map id -> Datenzeile. */
export const PUZZLE_BY_ID = new Map(PUZZLES.map((r) => [r[0], r]));

/** Datenzeile -> { id, fen, moves: [...uci], rating, motif }. Objekte werden unverändert zurückgegeben. */
export function puzzleObj(row) {
  if (!Array.isArray(row)) return row;
  const [id, fen, moves, rating, motif] = row;
  return { id, fen, moves: moves.split(' '), rating, motif };
}

/** 'e7e8q' -> { from: 'e7', to: 'e8', promo: 'q' } */
export function parseUci(uci) {
  const u = String(uci).trim().toLowerCase();
  return { from: u.slice(0, 2), to: u.slice(2, 4), ...(u[4] ? { promo: u[4] } : {}) };
}

const toChessMove = (m) => ({ from: m.from, to: m.to, ...(m.promo ? { promotion: m.promo } : {}) });

/** Partie nach den ersten `ply` Halbzügen der Aufgabe. */
function gameAt(p, ply) {
  const g = new Chess(p.fen);
  for (let i = 0; i < ply; i++) g.move(toChessMove(parseUci(p.moves[i])));
  return g;
}

/** Anzahl der Spielerzüge. */
export function userSteps(p) {
  return Math.floor(puzzleObj(p).moves.length / 2);
}

/** Startstellung für die Anzeige: Stellung nach dem Gegnerzug, Spielerfarbe, der Gegnerzug (für die Animation). */
export function startOf(p) {
  p = puzzleObj(p);
  const g = gameAt(p, 1);
  return { fen: g.fen(), userColor: g.turn(), opp: parseUci(p.moves[0]), prevFen: p.fen };
}

/** FEN der Stellung vor Spielerzug Nr. step. */
export function fenBefore(p, step) {
  p = puzzleObj(p);
  return gameAt(p, 1 + 2 * step).fen();
}

/** Erwarteter Spielerzug Nr. step als { from, to, promo? } (oder null, wenn es ihn nicht gibt). */
export function expected(p, step) {
  p = puzzleObj(p);
  const u = p.moves[1 + 2 * step];
  return u && step >= 0 ? parseUci(u) : null;
}

/** true, wenn Spielerzug Nr. step der letzte der Aufgabe ist. */
export function isLast(p, step) {
  return step >= userSteps(p) - 1;
}

/** Gegnerantwort nach Spielerzug Nr. step als { from, to, promo? }, oder null, wenn die Aufgabe damit gelöst ist. */
export function reply(p, step) {
  p = puzzleObj(p);
  if (isLast(p, step)) return null;
  const u = p.moves[2 + 2 * step];
  return u ? parseUci(u) : null;
}

/** Feld der Figur, die als Nächstes ziehen sollte (für den Hinweis „Figur aufleuchten“). */
export function hintSquare(p, step) {
  const e = expected(p, step);
  return e ? e.from : null;
}

/**
 * Bewertet einen Spielerzug (UCI-String oder { from, to, promo? }) auf der Stellung vor Spielerzug Nr. step.
 * 'correct' = erwarteter Zug, 'mate' = anderer legaler Zug, der sofort mattsetzt (zählt als gelöst), sonst 'wrong'.
 * Umwandlung ohne Angabe gilt als Dame.
 */
export function judge(p, step, uci) {
  p = puzzleObj(p);
  const exp = expected(p, step);
  if (!exp) return 'wrong';
  const m = typeof uci === 'string' ? parseUci(uci) : { from: uci.from, to: uci.to, ...(uci.promo ? { promo: String(uci.promo).toLowerCase() } : {}) };
  const g = gameAt(p, 1 + 2 * step);
  const legal = g.moves({ verbose: true }).filter((x) => x.from === m.from && x.to === m.to);
  if (!legal.length) return 'wrong';
  const isPromo = legal.some((x) => x.promotion);
  const promo = isPromo ? (m.promo || 'q') : undefined;
  if (m.from === exp.from && m.to === exp.to && (promo || undefined) === (exp.promo || (isPromo ? 'q' : undefined))) return 'correct';
  try {
    g.move({ from: m.from, to: m.to, ...(promo ? { promotion: promo } : {}) });
  } catch {
    return 'wrong';
  }
  return g.isCheckmate() ? 'mate' : 'wrong';
}
