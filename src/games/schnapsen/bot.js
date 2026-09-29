// Übungs-Bot für Schnapsen (rein, ohne DOM). Bekommt nur die Sicht (viewFor) des Sitzes am Zug.
// level 1 = leicht: regelsicher, wirft niedrig ab, sagt immer an, meldet sich bei ≥ 66 aus
// level 2 = mittel: zählt Augen, tauscht aus, sagt an, dreht bei sicheren Atouts zu, sticht Zehner/Daus mit
//           kleinem Atout, holt bei Farbzwang Atouts und sichere Stiche
// level 3 = stark: Stichproben über die unbekannten Karten (Gegnerhand, Talon, Gegnerstiche) und Ausspielen
//           jeder Stichprobe mit Stufe 2 bis Spielende, so lange timeMs erlaubt
import * as E from './engine.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const val = c => E.VALUE[c[1]];
const isCard = c => typeof c === 'string' && E.DECK.includes(c);
const byVal = (a, b) => val(a) - val(b);

export function chooseMove(view, { level = 2, rng = Math.random, timeMs = 400 } = {}) {
  const moves = E.legalMoves(view);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (level <= 1) return easy(view, moves, r);
  if (level === 2) return heuristic(view, moves);
  const ms = Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400;
  return sampling(view, moves, r, ms);
}

const find = (moves, type) => moves.find(m => m.type === type);
const plays = moves => moves.filter(m => m.type === 'play').map(m => m.card);
const playMove = card => ({ type: 'play', card });

// ---------- Stufe 1 ----------

function easy(view, moves, rng) {
  const decl = find(moves, 'ausmelden');
  if (decl && E.canDeclare(view)) return decl;
  const ans = moves.filter(m => m.type === 'ansagen');
  if (ans.length) return ans[0];
  const cards = plays(moves);
  const low = Math.min(...cards.map(val));
  const cand = cards.filter(c => val(c) === low);
  return playMove(cand[Math.floor(rng() * cand.length)]);
}

// ---------- Stufe 2 ----------

// Karten, deren Verbleib seat nicht kennt (Gegnerhand, Talon, fremde Stiche)
function unknownCards(s, seat) {
  const known = new Set();
  for (const c of s.hands[seat]) if (c) known.add(c);
  for (const c of s.won[seat] || []) if (c) known.add(c);
  for (const t of s.trick) known.add(t.card);
  if (s.lastTrick) for (const t of s.lastTrick.cards) known.add(t.card);
  if (s.atoutCard) known.add(s.atoutCard);
  return E.DECK.filter(c => !known.has(c));
}

// Karte ist die höchste noch mögliche ihrer Farbe (keine unbekannte höhere)
const isTop = (card, unknown) => !unknown.some(u => u[0] === card[0] && val(u) > val(card));

function pairs(hand) {
  return E.SUITS.filter(s => hand.includes(s + 'K') && hand.includes(s + 'O'));
}

// Sichere Augen mit Atout: eigene Atouts von oben, solange keine höhere unbekannt ist
function sureTrumps(s, hand, unknown) {
  let n = 0, augen = 0;
  for (const r of E.RANKS) {
    const c = s.atout + r;
    if (hand.includes(c)) { n++; augen += val(c) + 4; }
    else if (unknown.includes(c)) break;
  }
  return { n, augen };
}

function shouldClose(s, seat, hand, unknown) {
  const my = E.cardPoints(s, seat), { n, augen } = sureTrumps(s, hand, unknown);
  let est = my + augen;
  if (s.tricks[seat] > 0 || n > 0) {
    est += E.pendingPoints(s, seat);
    for (const p of pairs(hand)) est += p === s.atout ? 40 : 20;
  }
  // sichere Daus-Stiche in Fehlfarben zählen halb
  for (const c of hand) if (c[0] !== s.atout && c[1] === 'A') est += 0.5 * (11 + 3);
  return est >= 66 && n >= 1;
}

// Niedrigste Abwurfkarte: keine Atouts, keine Karte aus einem König-Ober-Paar, keine Dause
function lowDiscard(s, cards, hand) {
  const pr = new Set(pairs(hand));
  const score = c => val(c) + (c[0] === s.atout ? 30 : 0) + (pr.has(c[0]) && (c[1] === 'K' || c[1] === 'O') ? 12 : 0);
  return cards.slice().sort((a, b) => score(a) - score(b) || byVal(a, b))[0];
}

function heuristic(s, moves) {
  const seat = E.currentPlayer(s);
  if (find(moves, 'weiter')) return find(moves, 'weiter');
  const hand = s.hands[seat].filter(isCard), unknown = unknownCards(s, seat);
  const my = E.cardPoints(s, seat), strict = E.mustFollow(s);
  const cards = plays(moves);
  if (s.openAnsage) {
    if (find(moves, 'ausmelden')) return find(moves, 'ausmelden');
    // König oder Ober der Ansage: bei Zwang den höheren, falls er oben ist, sonst den Ober
    const k = cards.find(c => c[1] === 'K'), o = cards.find(c => c[1] === 'O');
    if (strict && k && isTop(k, unknown)) return playMove(k);
    return playMove(o || k);
  }
  if (s.trick.length === 0) {
    if (E.canDeclare(s)) return { type: 'ausmelden' };
    if (find(moves, 'tauschen')) return { type: 'tauschen' };
    const ans = moves.filter(m => m.type === 'ansagen')
      .sort((a, b) => (b.suit === s.atout) - (a.suit === s.atout));
    if (ans.length && s.tricks[seat] > 0 && my + (ans[0].suit === s.atout ? 40 : 20) >= 66) return ans[0];
    if (find(moves, 'zudrehen') && shouldClose(s, seat, hand, unknown)) return { type: 'zudrehen' };
    if (ans.length) return ans[0];
    return playMove(lead(s, cards, hand, unknown, strict));
  }
  return playMove(follow(s, seat, cards, hand, my, strict));
}

function lead(s, cards, hand, unknown, strict) {
  const trumps = cards.filter(c => c[0] === s.atout).sort(byVal);
  const side = cards.filter(c => c[0] !== s.atout);
  if (strict) {
    // Atouts ziehen, solange der Gegner welche haben kann und wir oben sind
    const oppTrumps = unknown.filter(c => c[0] === s.atout);
    const topTrump = trumps.filter(c => isTop(c, unknown)).sort(byVal).pop();
    if (topTrump && oppTrumps.length) return topTrump;
    const tops = side.filter(c => isTop(c, unknown)).sort(byVal);
    if (tops.length) return tops[tops.length - 1];
    if (topTrump) return topTrump;
    return lowDiscard(s, cards, hand);
  }
  // Talon offen: niedrige Fehlfarbe ausspielen, Zehner nur wenn der Daus weg ist
  const safe = side.filter(c => c[1] !== 'Z' || isTop(c, unknown));
  if (safe.length) return lowDiscard(s, safe, hand);
  return lowDiscard(s, cards, hand);
}

function follow(s, seat, cards, hand, my, strict) {
  const led = s.trick[0].card, atout = s.atout;
  const beats = c => (c[0] === led[0] ? val(c) > val(led) : c[0] === atout && led[0] !== atout);
  const winners = cards.filter(beats).sort((a, b) => (a[0] === atout) - (b[0] === atout) || byVal(a, b));
  // Stich reicht zum Ausmelden → billigster Sieger
  if (winners.length && my + val(led) + val(winners[0]) >= 66) return winners[0];
  if (strict) return winners.length ? winners[0] : lowDiscard(s, cards, hand);
  const same = winners.filter(c => c[0] === led[0] && led[0] !== atout);
  if (same.length) return same[same.length - 1];   // mit der Farbe stechen: höchste Karte sichern
  const trumps = winners.filter(c => c[0] === atout);
  if (trumps.length && val(led) >= 10) return trumps[0];   // Zehner/Daus mit kleinem Atout
  return lowDiscard(s, cards, hand);
}

// ---------- Stufe 3 ----------

function shuffle(list, rng) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Vollständiger Zustand, der zur Sicht passt (unbekannte Karten zufällig verteilt)
function sampleWorld(view, seat, rng) {
  const o = 1 - seat, s = structuredClone(view);
  const pool = shuffle(unknownCards(view, seat), rng);
  s.hands[o] = pool.splice(0, view.hands[o].length);
  s.talon = pool.splice(0, view.talon.length);
  const knownWon = view.lastTrick && view.lastTrick.winner === o ? view.lastTrick.cards.map(t => t.card) : [];
  s.won[o] = [...knownWon, ...pool.splice(0, view.won[o].length - knownWon.length)];
  s.augen[o] = s.won[o].reduce((a, c) => a + val(c), 0);
  if (s.closed && s.closed.oppAugen === null) s.closed = { ...s.closed, oppAugen: E.cardPoints(s, o) };
  return s;
}

function rollout(s, seat) {
  for (let guard = 0; s.phase === 'play' && guard < 60; guard++) {
    s = E.applyMove(s, heuristic(s, E.legalMoves(s)));
  }
  if (!s.spiel) return 0;
  return s.spiel.winner === seat ? s.spiel.points : -s.spiel.points;
}

function sampling(view, moves, rng, timeMs) {
  const seat = E.currentPlayer(view);
  if (view.phase !== 'play') return heuristic(view, moves);
  if (E.canDeclare(view)) return { type: 'ausmelden' };
  // irrtümliches Ausmelden nie in Betracht ziehen
  const cand = moves.filter(m => m.type !== 'ausmelden');
  if (cand.length === 1) return cand[0];
  const base = heuristic(view, moves);
  const t0 = now(), sum = new Array(cand.length).fill(0);
  let n = 0;
  while (n < 3000 && (n < 8 || now() - t0 < timeMs)) {
    const world = sampleWorld(view, seat, rng);
    for (let i = 0; i < cand.length; i++) sum[i] += rollout(E.applyMove(world, cand[i]), seat);
    n++;
  }
  let best = cand.findIndex(m => E.moveKey(m) === E.moveKey(base));
  for (let i = 0; i < cand.length; i++) if (best < 0 || sum[i] > sum[best] + 1e-9) best = i;
  return cand[best];
}

// Für Tests
export const _heuristic = heuristic;
export const _unknownCards = unknownCards;
