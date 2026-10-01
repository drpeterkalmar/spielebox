// Computer für Paare finden: spielt nur mit dem, was alle gesehen haben (Sicht + memory).
// Stufe 1 merkt sich die letzten 3 aufgedeckten Karten, Stufe 2 die letzten 12, Stufe 3 alles.
// Bekanntes Paar → aufdecken; erste Karte: bekannte Partnerin suchen, sonst unbekannte Karte;
// zweite Karte: passende aus dem Gedächtnis, sonst eine unbekannte (Stufe 3: lieber eine bekannte, siehe unten).
import { legalMoves } from './engine.js';

const SPAN = { 1: 3, 2: 12, 3: Infinity };

export function chooseMove(view, { level = 2, rng = Math.random } = {}) {
  const moves = legalMoves(view);
  if (!moves.length) return null;
  const r = typeof rng === 'function' ? rng : Math.random;
  const span = SPAN[level] || 12;
  const mem = new Map();   // Feld → Motiv (was der Computer noch weiß)
  const list = view.memory || [];
  for (const [i, m] of list.slice(Math.max(0, list.length - span))) if (view.found[i] === null) mem.set(i, m);
  const free = new Set(moves.map((x) => x.flip));
  const unknown = [...free].filter((i) => !mem.has(i));
  const pick = (arr) => arr[Math.floor(r() * arr.length)];
  if (view.open.length) {
    const a = view.open[0], m = view.cards[a];
    for (const [i, x] of mem) if (i !== a && x === m && free.has(i)) return { flip: i };
    // Stufe 3: keine Partnerin bekannt → lieber eine schon bekannte Karte umdrehen; eine neue verriete dem Gegner,
    // der als Nächster dran ist, mehr als sie einem selbst nützt
    const known = [...mem.keys()].filter((i) => i !== a && free.has(i));
    if (level >= 3 && known.length) return { flip: pick(known) };
    const pool = unknown.filter((i) => i !== a);
    return { flip: pool.length ? pick(pool) : pick([...free]) };
  }
  // bekanntes Paar?
  const by = new Map();
  for (const [i, m] of mem) { if (!free.has(i)) continue; if (by.has(m)) return { flip: by.get(m) }; by.set(m, i); }
  if (unknown.length) return { flip: pick(unknown) };
  return { flip: pick([...free]) };
}
