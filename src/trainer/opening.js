// Schach-Trainer – Eröffnungen: reine Logik ohne DOM.
// Daten: ./data/openings.js (erzeugt von tools/build_openings.mjs).
// Halbzug-Zählung überall 0-basiert: ply 0 = erster weißer Zug; checkMove(line, n, …) prüft den Zug,
// der nach n gespielten Halbzügen dran ist. lineMoves(line)[line.lichessPly].fen ist die Stellung,
// die lichess unter line.lichess führt.
import { Chess } from '../../lib/chess.js';
import { sanDe } from '../games/schach/engine.js';
import { FAMILIES, LINES } from './data/openings.js';

export { FAMILIES, LINES, sanDe };

const cache = new Map();

// Züge der Linie: [{ san, de, from, to, promo?, fen (nach dem Zug), ply }]
export function lineMoves(line) {
  const key = line.id + '|' + line.moves;
  let res = cache.get(key);
  if (res) return res;
  const c = new Chess();
  res = line.moves.split(/\s+/).filter(Boolean).map((s, ply) => {
    const m = c.move(s); // wirft bei illegalem Zug
    const out = { san: m.san, de: sanDe(m.san), from: m.from, to: m.to, fen: c.fen(), ply };
    if (m.promotion) out.promo = m.promotion;
    return Object.freeze(out);
  });
  Object.freeze(res);
  cache.set(key, res);
  return res;
}

export function familyOf(line) {
  return FAMILIES.find((f) => f.id === line.family) || null;
}

export function lineById(id) {
  return LINES.find((l) => l.id === id) || null;
}

// deutscher Anzeigename „Familie – Name“
export function lineName(line) {
  const f = familyOf(line);
  return f ? `${f.name} – ${line.name}` : line.name;
}

// true, wenn move { from, to, promo? } der Linienzug im Halbzug ply ist
export function checkMove(line, ply, move) {
  const m = lineMoves(line)[ply];
  if (!m || !move) return false;
  return m.from === move.from && m.to === move.to && (m.promo || '') === (move.promo || '');
}

// Familien in Katalog-Reihenfolge, je mit ihren Linien: [{ ...familie, lines: [...] }]
export function byFamily() {
  return FAMILIES.map((f) => ({ ...f, lines: LINES.filter((l) => l.family === f.id) }));
}
