// Übungs-Bot für Mau-Mau (rein, ohne DOM). Bekommt nur die Sicht (viewFor) des Sitzes am Zug.
// level 1 = leicht: legt irgendeine passende Karte (zieht nur, wenn nichts passt), wünscht zufällig,
//           vergisst „Mau“ manchmal (etwa jedes fünfte Mal)
// level 2 = mittel: hebt Unter auf, legt Karten so, dass möglichst viele eigene danach noch passen,
//           wünscht die häufigste eigene Farbe, setzt 7 und Daus gezielt gegen Spieler mit wenig Karten, sagt immer Mau
// level 3 = stark: zählt Karten (alles außer eigener Hand und Ablage ist unbekannt), verteilt die unbekannten
//           Karten zufällig passend zu den Kartenzahlen und spielt jede Stichprobe für jeden Kandidaten mit Stufe 2
//           bis zum Ende (gleiche Zufallszahlen für alle Kandidaten), so lange timeMs erlaubt (höchstens 1,2 s).
//           Option samples: genau so viele Stichproben, unabhängig von der Uhr (für reproduzierbare Tests).
import * as E from './engine.js';

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const isCard = c => typeof c === 'string' && E.DECK.includes(c);
const isPlay = m => m.type === 'play';

export function chooseMove(view, { level = 2, rng = Math.random, timeMs = 400, samples = 0 } = {}) {
  const moves = E.legalMoves(view);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const r = typeof rng === 'function' ? rng : Math.random;
  if (level <= 1) return easy(view, moves, r);
  if (level === 2) return heuristic(view, moves);
  const ms = Math.min(1200, Number.isFinite(timeMs) && timeMs > 0 ? timeMs : 400);
  const fixed = Number.isInteger(samples) && samples > 0 ? Math.min(samples, 2000) : 0;
  return sampling(view, moves, r, ms, fixed);
}

// ---------- Stufe 1 ----------

function easy(view, moves, rng) {
  const plays = moves.filter(isPlay);
  if (!plays.length) return moves.find(m => !isPlay(m));
  const cards = [...new Set(plays.map(m => m.card))];
  const card = cards[Math.floor(rng() * cards.length)];
  let cand = plays.filter(m => m.card === card);
  if (cand.some(m => m.wish)) {
    const w = E.SUITS[Math.floor(rng() * 4)];
    cand = cand.filter(m => m.wish === w);
  }
  if (cand.length > 1) {   // mit und ohne Mau: meistens daran denken
    const say = rng() < 0.8;
    cand = cand.filter(m => (m.mau === true) === say);
  }
  return cand[0];
}

// ---------- Stufe 2 ----------

// häufigste Farbe der Karten (ohne Unter); bei Gleichstand die erste in SUITS
function bestSuit(cards) {
  const cnt = { H: 0, S: 0, L: 0, E: 0 };
  for (const c of cards) if (c[1] !== 'U') cnt[c[0]]++;
  return E.SUITS.reduce((a, b) => (cnt[b] > cnt[a] ? b : a), E.SUITS[0]);
}

// Bewertung, eine Karte zu legen (höher = besser)
function scoreCard(s, seat, card, hand) {
  const o = s.opts, n = s.n;
  const rest = hand.filter(c => c !== card);
  const next = (seat + 1) % n, nextLen = s.hands[next].length;
  if (!rest.length) return 1000;   // letzte Karte: gewonnen
  const unter = o.unter && card[1] === 'U';
  const suit = unter ? bestSuit(rest) : card[0];
  // wie viele eigene Karten passen danach noch (falls die Farbe/der Wert liegen bleibt)?
  let sc = 0;
  for (const c of rest) {
    if (o.unter && c[1] === 'U') sc += unter ? 0 : 1;
    else if (c[0] === suit) sc += 1;
    else if (!unter && c[1] === card[1]) sc += 0.6;
  }
  if (unter) sc -= rest.length <= 1 ? 0 : 4;   // Unter aufheben, außer kurz vor Schluss
  if (o.sieben && card[1] === '7') sc += nextLen <= 3 ? 3 : 0.8;
  if (o.ass && card[1] === 'A') sc += n === 2 ? 2.5 : nextLen <= 2 ? 3 : 0.5;
  // hohe Kartenzahl einer Farbe abbauen: Karten aus der eigenen Hauptfarbe zuletzt
  sc += 0.01 * E.RANKS.indexOf(card[1]);
  return sc;
}

function pickVariant(moves, card, wish) {
  const cand = moves.filter(m => isPlay(m) && m.card === card && (!m.wish || m.wish === wish));
  return cand.find(m => m.mau === true) || cand[0];
}

function heuristic(s, moves) {
  const seat = E.currentPlayer(s);
  const plays = moves.filter(isPlay);
  const other = moves.find(m => !isPlay(m));
  if (!plays.length) return other;
  const hand = s.hands[seat].filter(isCard);
  const cards = [...new Set(plays.map(m => m.card))];
  if (s.drawn) {
    // gezogene Karte: legen, außer es ist ein Unter und es gibt noch viele Karten
    const c = cards[0];
    if (s.opts.unter && c[1] === 'U' && hand.length > 3) return other;
    return pickVariant(moves, c, bestSuit(hand.filter(x => x !== c)));
  }
  let best = null, bs = -Infinity;
  for (const c of cards) {
    const v = scoreCard(s, seat, c, hand);
    if (v > bs) { bs = v; best = c; }
  }
  return pickVariant(moves, best, bestSuit(hand.filter(x => x !== best)));
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

// Karten, deren Ort seat nicht kennt (fremde Hände und Stapel)
export function unknownCards(view, seat) {
  const known = new Set([...view.hands[seat].filter(isCard), ...view.pile]);
  return E.DECK.filter(c => !known.has(c));
}

// Vollständiger Zustand, der zur Sicht passt
function sampleWorld(view, seat, rng) {
  const s = { ...view, hands: view.hands.slice(), mau: view.mau.slice(), pile: view.pile.slice() };
  const pool = shuffle(unknownCards(view, seat), rng);
  for (let q = 0; q < s.n; q++) if (q !== seat) s.hands[q] = pool.splice(0, view.hands[q].length);
  s.stock = pool.splice(0, view.stock.length);
  return s;
}

function perm(n, rng) {
  return shuffle([...Array(n).keys()], rng);
}

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ergebnis aus Sicht von seat: Sieg 1, sonst Anteil nach Kartenzahl (evaluate klein gewichtet)
function rollout(s, seat, rng) {
  for (let guard = 0; guard < 400; guard++) {
    if (E.result(s)) break;
    const c = E.chance(s);
    if (c) { s = E.applyChance(s, perm(c.n, rng)); continue; }
    s = E.applyMove(s, heuristic(s, E.legalMoves(s)));
  }
  const r = E.result(s);
  if (r) return r.winner === seat ? 1 : 0;
  return 0.5 + 0.02 * E.evaluate(s, seat);
}

function sampling(view, moves, rng, timeMs, fixed) {
  const seat = E.currentPlayer(view);
  // Kandidaten: Mau immer sagen; je Karte (und Wunsch) eine Variante, dazu Ziehen/Passen
  const seen = new Set(), cand = [];
  for (const m of moves) {
    const k = isPlay(m) ? m.card + (m.wish || '') : m.type;
    if (seen.has(k)) continue;
    seen.add(k);
    cand.push(isPlay(m) ? (moves.find(x => isPlay(x) && x.card === m.card && x.wish === m.wish && x.mau === true) || m) : m);
  }
  const plays = cand.filter(isPlay);
  if (plays.length && view.hands[seat].length === 1) return plays[0];   // letzte Karte: gewonnen
  if (cand.length === 1) return cand[0];
  const base = heuristic(view, moves);
  const t0 = now(), sum = new Array(cand.length).fill(0);
  let n = 0;
  while (fixed ? n < fixed : n < 2000 && (n < 6 || now() - t0 < timeMs)) {
    const world = sampleWorld(view, seat, rng);
    const seed = Math.floor(rng() * 2 ** 32);
    for (let i = 0; i < cand.length; i++) sum[i] += rollout(E.applyMove(world, cand[i]), seat, seeded(seed));
    n++;
  }
  const key = E.moveKey(base);
  let best = cand.findIndex(m => E.moveKey(m) === key);
  for (let i = 0; i < cand.length; i++) if (best < 0 || sum[i] > sum[best] + 1e-9) best = i;
  return cand[best];
}

// Für Tests
export const _heuristic = heuristic;
