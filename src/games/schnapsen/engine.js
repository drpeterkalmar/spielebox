// Schnapsen (österreichisch, 20 Blatt, 2 Spieler) – reine Regel-Engine ohne DOM (Spiel-API der Spielebox).
// Quelle der Regeln: de.wikipedia.org/wiki/Schnapsen (abgerufen 29.09.2026).
//
// Entscheidungen bei unklaren Regeln:
// - Irrtümliches Ausmelden (< 66): Spiel endet trotzdem. Wikipedia: „In diesem Fall gewinnt der Gegner so viele
//   Punkte, wie der Spieler gewonnen hätte.“ → Punkte werden so berechnet, als wäre das Ausmelden richtig gewesen
//   (3 wenn der Gegner stichlos, 2 wenn Gegner ≤ 32 Augen, sonst 1), gehen aber an den Gegner.
//   Nach Zudrehen gilt die Zudreh-Wertung (Gegner des Zudrehers stichlos beim Zudrehen → 3, sonst 2).
// - Letzter Stich ohne Ausmelden: Wikipedia nennt keine eigene Wertung → wie Ausmelden, nach den Augen des Gegners.
//   Nach Zudrehen gewinnt der Zudreher nur, wenn er mit dem letzten Stich 66 erreicht; sonst Zudreh-Wertung.
// - Sind alle Karten gespielt, wird automatisch gewertet (kein eigener Ausmelde-Zug nötig).
// - Ausmelden ist für den Ausspielenden immer erlaubt (Oberfläche zeigt den Knopf nur bei canDeclare);
//   nach einer offenen Ansage nur, wenn damit wirklich ≥ 66 erreicht sind (Ansager hat schon einen Stich).
//
// Zustand (reines JSON):
//   { opts: {hart, schneider, bummerl, stiche, augenHilfe}, phase: 'deal'|'play'|'spielende'|'over',
//     dealer: Sitz des Teilers, spielNr, bummerlNr (laufendes Bummerl, ab 1),
//     points: [a, b] Punkte im laufenden Bummerl, bummerl: [a, b] gewonnene Bummerl,
//     games: [{ bummerl, spiel, winner, points, reason }] alle Spielergebnisse (Bummerl-Tafel),
//     hands: [[Karten], [Karten]], talon: [verdeckte Karten, Index 0 = oben], atout: Farbe,
//     atoutCard: offene Atoutkarte | null, turn: Sitz am Zug,
//     trick: [{ seat, card }] laufender Stich, lastTrick: null | { cards: [{seat, card}×2], winner },
//     won: [[Karten], [Karten]] gewonnene Karten (je Stich: ausgespielte, dann zugegebene Karte),
//     wonTricks: [[{ lead }], [{ lead }]] je gewonnenem Stich, wer ausgespielt hat (Reihenfolge wie won),
//     augen: [a, b] Stichaugen, tricks: [a, b] Anzahl Stiche,
//     ansagen: [{ seat, suit, points }], openAnsage: null | Farbe (muss jetzt König/Ober davon spielen),
//     closed: null | { by, oppAugen, oppTricks } (Zudrehen; Augen/Stiche des Gegners beim Zudrehen),
//     spiel: null | { winner, points, reason, augen: [a, b], stiche: [a, b], bummerl? } (Ergebnis des Spiels),
//     over: null | { winner, reason, points } }
// Züge: { type: 'play', card: 'HA' } | { type: 'ansagen', suit: 'H' } | { type: 'tauschen' } |
//       { type: 'zudrehen' } | { type: 'ausmelden' } | { type: 'weiter' }

export const id = 'schnapsen';
export const title = 'Schnapsen';
export const PLAYERS = ['Spieler 1', 'Spieler 2'];
export const HIDDEN = true;

export const SUITS = Object.freeze(['H', 'S', 'L', 'E']);
export const RANKS = Object.freeze(['A', 'Z', 'K', 'O', 'U']);   // Rangfolge absteigend
export const VALUE = Object.freeze({ A: 11, Z: 10, K: 4, O: 3, U: 2 });
export const SUIT_NAMES = Object.freeze({ H: 'Herz', S: 'Schellen', L: 'Laub', E: 'Eichel' });
export const RANK_NAMES = Object.freeze({ A: 'Daus', Z: 'Zehner', K: 'König', O: 'Ober', U: 'Unter' });
export const DECK = Object.freeze(SUITS.flatMap(s => RANKS.map(r => s + r)));

const DECK_SET = new Set(DECK);
const PHASES = new Set(['deal', 'play', 'spielende', 'over']);
const WIN_POINTS = 7;   // Punkte für ein Bummerl
const FIELDS = {
  play: new Set(['type', 'card']), ansagen: new Set(['type', 'suit']), tauschen: new Set(['type']),
  zudrehen: new Set(['type']), ausmelden: new Set(['type']), weiter: new Set(['type'])
};

const val = c => VALUE[c[1]];
const isCard = c => typeof c === 'string' && DECK_SET.has(c);
const sumCards = list => list.reduce((a, c) => a + (c ? val(c) : 0), 0);

export function cardName(card) {
  return isCard(card) ? `${SUIT_NAMES[card[0]]}-${RANK_NAMES[card[1]]}` : '?';
}

// stiche: eigene gewonnene Stiche ansehen (Standard an; aus = klassische Turnierregel)
// augenHilfe: eigene Augensumme anzeigen (Standard aus – Mitzählen bleibt Teil des Spiels)
export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  return {
    hart: o.hart === true,
    schneider: o.schneider === true,
    bummerl: o.bummerl === 3 || o.bummerl === '3' ? 3 : 2,
    stiche: o.stiche !== false,
    augenHilfe: o.augenHilfe === true
  };
}

function emptyGame() {
  return {
    hands: [[], []], talon: [], atout: null, atoutCard: null, turn: 0, trick: [], lastTrick: null,
    won: [[], []], wonTricks: [[], []], augen: [0, 0], tricks: [0, 0], ansagen: [], openAnsage: null, closed: null, spiel: null
  };
}

export function initialState(opts) {
  return {
    opts: normalizeOptions(opts), phase: 'deal', dealer: 1, spielNr: 0, bummerlNr: 1,
    points: [0, 0], bummerl: [0, 0], games: [], ...emptyGame(), over: null
  };
}

// Flache Kopie; Teilobjekte (Stich-Einträge, closed, spiel, games-Einträge) werden nie verändert, nur ersetzt
function clone(s) {
  return {
    ...s, opts: { ...s.opts }, points: s.points.slice(), bummerl: s.bummerl.slice(), games: s.games.slice(),
    hands: s.hands.map(h => h.slice()), talon: s.talon.slice(), trick: s.trick.slice(),
    won: s.won.map(w => w.slice()), wonTricks: (s.wonTricks || [[], []]).map(w => w.slice()),
    augen: s.augen.slice(), tricks: s.tricks.slice(), ansagen: s.ansagen.slice()
  };
}

function validState(s) {
  return !!s && typeof s === 'object' && PHASES.has(s.phase) && (s.dealer === 0 || s.dealer === 1) &&
    Array.isArray(s.hands) && s.hands.length === 2 && s.hands.every(Array.isArray) &&
    Array.isArray(s.talon) && Array.isArray(s.trick) && Array.isArray(s.ansagen) &&
    Array.isArray(s.tricks) && Array.isArray(s.augen) && Array.isArray(s.points) && Array.isArray(s.bummerl) &&
    !!s.opts && typeof s.opts === 'object';
}

export function phase(state) {
  return state.phase;
}

// ---------- Zufall ----------

export function chance(state) {
  return state && state.phase === 'deal' ? { kind: 'shuffle', n: 20 } : null;
}

// perm[i] = Index in DECK der i-ten Karte von oben. Vorhand 3, Teiler 3, Atout, Vorhand 2, Teiler 2, Rest Talon.
export function applyChance(state, perm) {
  if (!chance(state)) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(perm) || perm.length !== 20) throw new Error('Permutation mit 20 Einträgen erwartet');
  const seen = new Set();
  for (const i of perm) {
    if (!Number.isInteger(i) || i < 0 || i >= 20 || seen.has(i)) throw new Error('Ungültige Permutation');
    seen.add(i);
  }
  const st = perm.map(i => DECK[i]);
  const s = { ...clone(state), ...emptyGame() };
  const d = s.dealer, v = 1 - d;
  s.hands[v] = [...st.slice(0, 3), ...st.slice(7, 9)];
  s.hands[d] = [...st.slice(3, 6), ...st.slice(9, 11)];
  s.atoutCard = st[6];
  s.atout = st[6][0];
  s.talon = st.slice(11);
  s.turn = v;
  s.phase = 'play';
  s.spielNr = state.spielNr + 1;
  return s;
}

// ---------- Hilfen für Regeln und Oberfläche ----------

function ansageSum(state, seat) {
  let n = 0;
  for (const a of state.ansagen) if (a.seat === seat) n += a.points;
  return n;
}

// Augen inkl. gültiger Ansagen (Ansagen zählen erst ab dem ersten eigenen Stich); null, wenn verborgen
export function cardPoints(state, seat) {
  if (!state || (seat !== 0 && seat !== 1) || !Array.isArray(state.augen)) return null;
  const a = state.augen[seat];
  if (typeof a !== 'number') return null;
  return a + (state.tricks[seat] > 0 ? ansageSum(state, seat) : 0);
}

// Schwebende Ansage-Augen (Ansager noch stichlos)
export function pendingPoints(state, seat) {
  return state.tricks[seat] > 0 ? 0 : ansageSum(state, seat);
}

// Talon offen = nicht zugedreht und noch Karten (verdeckt oder Atoutkarte) vorhanden
export function talonOpen(state) {
  return !state.closed && (state.talon.length > 0 || !!state.atoutCard);
}

// Farb- und Stichzwang gilt, sobald der Talon zugedreht oder aufgebraucht ist
export function mustFollow(state) {
  return state.phase === 'play' && !talonOpen(state);
}

// Stichsieger eines vollständigen Stichs [{seat, card}, {seat, card}] bei Atoutfarbe atout
export function trickWinner(trick, atout) {
  const [a, b] = trick;
  if (b.card[0] === a.card[0]) return val(b.card) > val(a.card) ? b.seat : a.seat;
  return b.card[0] === atout ? b.seat : a.seat;
}

// Erlaubte Karten beim Zugeben unter Farb- vor Stichzwang, dann Trumpfzwang
export function followCards(hand, led, atout) {
  const same = hand.filter(c => c[0] === led[0]);
  if (same.length) {
    const higher = same.filter(c => val(c) > val(led));
    return higher.length ? higher : same;
  }
  const trumps = hand.filter(c => c[0] === atout);
  return trumps.length ? trumps : hand;
}

function canTausch(state, hand) {
  const need = state.opts.hart ? 2 : 1;
  return !state.closed && !!state.atoutCard && state.talon.length >= need && hand.includes(state.atout + 'U');
}

function canClose(state) {
  return !state.closed && !!state.atoutCard && state.talon.length >= 2;
}

// Darf der Ausspielende sich jetzt (berechtigt) ausmelden? (≥ 66 Augen inkl. gültiger Ansagen)
export function canDeclare(state) {
  try {
    if (!validState(state) || state.phase !== 'play' || state.trick.length) return false;
    const p = state.turn, a = cardPoints(state, p);
    return a !== null && a >= 66;
  } catch {
    return false;
  }
}

// ---------- API ----------

export function currentPlayer(state) {
  if (!state) return null;
  if (state.phase === 'play') return state.turn;
  if (state.phase === 'spielende') return state.dealer;   // Vorhand des nächsten Spiels
  return null;
}

export function result(state) {
  return (state && state.over) || null;
}

export function legalMoves(state) {
  try {
    if (!validState(state)) return [];
    if (state.phase === 'spielende') return [{ type: 'weiter' }];
    if (state.phase !== 'play') return [];
    const p = state.turn, hand = state.hands[p].filter(isCard), moves = [];
    if (state.openAnsage) {
      const s = state.openAnsage;
      for (const c of hand) if (c[0] === s && (c[1] === 'K' || c[1] === 'O')) moves.push({ type: 'play', card: c });
      if (state.tricks[p] > 0 && cardPoints(state, p) >= 66) moves.push({ type: 'ausmelden' });
      return moves;
    }
    if (state.trick.length === 0) {
      for (const c of hand) moves.push({ type: 'play', card: c });
      for (const s of SUITS) {
        if (hand.includes(s + 'K') && hand.includes(s + 'O')) moves.push({ type: 'ansagen', suit: s });
      }
      if (canTausch(state, hand)) moves.push({ type: 'tauschen' });
      if (canClose(state)) moves.push({ type: 'zudrehen' });
      if (hand.length) moves.push({ type: 'ausmelden' });
      return moves;
    }
    const led = state.trick[0].card;
    const cards = mustFollow(state) ? followCards(hand, led, state.atout) : hand;
    for (const c of cards) moves.push({ type: 'play', card: c });
    return moves;
  } catch {
    return [];
  }
}

export function moveKey(move) {
  try {
    if (!move || typeof move !== 'object') return '!';
    const x = move.card || move.suit;
    return x ? `${move.type}:${x}` : String(move.type);
  } catch {
    return '!';
  }
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state)) return false;
    if (!move || typeof move !== 'object' || Array.isArray(move)) return false;
    const allowed = FIELDS[move.type];
    if (typeof move.type !== 'string' || !allowed || !Object.hasOwn(FIELDS, move.type)) return false;
    for (const k of Object.keys(move)) if (!allowed.has(k)) return false;
    if (move.type === 'play' && !isCard(move.card)) return false;
    if (move.type === 'ansagen' && !SUITS.includes(move.suit)) return false;
    const key = moveKey(move);
    return legalMoves(state).some(m => moveKey(m) === key);
  } catch {
    return false;
  }
}

const scoreFor = (oppTricks, oppAugen) => (oppTricks === 0 ? 3 : oppAugen <= 32 ? 2 : 1);

function finishGame(s, winner, points, reason) {
  const loser = 1 - winner;
  s.openAnsage = null;
  s.spiel = { winner, points, reason, augen: [cardPoints(s, 0), cardPoints(s, 1)], stiche: s.tricks.slice() };
  s.games.push({ bummerl: s.bummerlNr, spiel: s.spielNr, winner, points, reason });
  s.points[winner] += points;
  s.phase = 'spielende';
  if (s.points[winner] >= WIN_POINTS) {
    const n = s.opts.schneider && s.points[loser] === 0 ? 2 : 1;
    s.bummerl[winner] += n;
    s.spiel = { ...s.spiel, bummerl: { winner, count: n, schneider: n === 2 } };
    if (s.bummerl[winner] >= s.opts.bummerl) {
      s.phase = 'over';
      s.over = { winner, reason: `gewinnt ${s.bummerl[winner]}:${s.bummerl[loser]} Bummerl`, points: s.bummerl[winner] };
    }
  }
  return s;
}

function declare(s, p) {
  const o = 1 - p, ok = cardPoints(s, p) >= 66;
  if (s.closed) {
    const c = s.closed, failPts = c.oppTricks === 0 ? 3 : 2;
    if (c.by === p) {
      return ok ? finishGame(s, p, scoreFor(c.oppTricks, c.oppAugen), 'zugedreht und ausgemeldet')
        : finishGame(s, o, failPts, 'irrtümlich ausgemeldet – Zudrehen misslungen');
    }
    return ok ? finishGame(s, p, failPts, 'ausgemeldet – Zudrehen des Gegners misslungen')
      : finishGame(s, o, failPts, 'irrtümlich ausgemeldet');
  }
  const pts = scoreFor(s.tricks[o], cardPoints(s, o));
  return ok ? finishGame(s, p, pts, 'ausgemeldet') : finishGame(s, o, pts, 'irrtümlich ausgemeldet');
}

// Alle Karten gespielt: w hat den letzten Stich
function endOfCards(s, w) {
  if (s.closed) {
    const c = s.closed, z = c.by;
    if (w === z && cardPoints(s, z) >= 66) return finishGame(s, z, scoreFor(c.oppTricks, c.oppAugen), 'zugedreht, 66 mit dem letzten Stich');
    return finishGame(s, 1 - z, c.oppTricks === 0 ? 3 : 2, 'Zudrehen misslungen');
  }
  return finishGame(s, w, scoreFor(s.tricks[1 - w], cardPoints(s, 1 - w)), 'letzter Stich');
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${moveKey(move)}`);
  const s = clone(state);
  if (move.type === 'weiter') {
    if (s.points[0] >= WIN_POINTS || s.points[1] >= WIN_POINTS) {
      s.points = [0, 0];
      s.bummerlNr++;
    }
    Object.assign(s, emptyGame());
    s.dealer = 1 - s.dealer;
    s.phase = 'deal';
    return s;
  }
  const p = s.turn, o = 1 - p;
  switch (move.type) {
    case 'ansagen':
      s.ansagen.push({ seat: p, suit: move.suit, points: move.suit === s.atout ? 40 : 20 });
      s.openAnsage = move.suit;
      return s;
    case 'tauschen': {
      const h = s.hands[p], i = h.indexOf(s.atout + 'U');
      h[i] = s.atoutCard;
      s.atoutCard = s.atout + 'U';
      return s;
    }
    case 'zudrehen':
      s.closed = { by: p, oppAugen: cardPoints(s, o), oppTricks: s.tricks[o] };
      return s;
    case 'ausmelden':
      return declare(s, p);
  }
  // play
  const card = move.card;
  s.hands[p].splice(s.hands[p].indexOf(card), 1);
  s.openAnsage = null;
  if (s.trick.length === 0) {
    s.trick = [{ seat: p, card }];
    s.turn = o;
    return s;
  }
  const trick = [s.trick[0], { seat: p, card }];
  const w = trickWinner(trick, s.atout);
  s.won[w].push(trick[0].card, card);
  s.wonTricks[w].push({ lead: trick[0].seat });
  s.augen[w] += val(trick[0].card) + val(card);
  s.tricks[w]++;
  s.lastTrick = { cards: trick, winner: w };
  s.trick = [];
  s.turn = w;
  if (!s.closed) {
    for (const q of [w, 1 - w]) {   // Stichgewinner hebt zuerst; Atoutkarte ist die letzte Talonkarte
      if (s.talon.length) s.hands[q].push(s.talon.shift());
      else if (s.atoutCard) {
        s.hands[q].push(s.atoutCard);
        s.atoutCard = null;
      }
    }
  }
  if (!s.hands[0].length && !s.hands[1].length) return endOfCards(s, w);
  return s;
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object') return '?';
  switch (move.type) {
    case 'play': return cardName(move.card);
    case 'ansagen': {
      const pts = state && move.suit === state.atout ? 40 : 20;
      return `Ansage ${pts} (${SUIT_NAMES[move.suit] || '?'})`;
    }
    case 'tauschen': return 'tauscht den Atout-Unter';
    case 'zudrehen': return 'dreht zu';
    case 'ausmelden': return 'meldet sich aus';
    case 'weiter': return 'nächstes Spiel';
    default: return '?';
  }
}

// Vollständige Stellung (nur Host; enthält verdeckte Karten)
export function positionKey(state) {
  const s = state;
  return JSON.stringify([s.phase, s.dealer, s.spielNr, s.bummerlNr, s.points, s.bummerl, s.hands, s.talon, s.atoutCard,
    s.turn, s.trick, s.won, s.augen, s.tricks, s.ansagen, s.openAnsage, s.closed]);
}

// ---------- Sicht ----------

// Alles, was seat nicht sehen darf, wird null (Längen bleiben). seat = null: Zuschauer.
export function viewFor(state, seat) {
  const s = clone(state);
  const me = seat === 0 || seat === 1 ? seat : -1;
  const reveal = s.phase === 'spielende' || s.phase === 'over';
  s.talon = s.talon.map(() => null);
  for (const q of [0, 1]) {
    if (q === me) continue;
    s.hands[q] = s.hands[q].map(() => null);
    if (!reveal) {
      s.augen[q] = null;
      s.won[q] = s.won[q].map(() => null);
      s.wonTricks[q] = s.wonTricks[q].map(() => null);
    }
  }
  // Augen des Gegners beim Zudrehen kennt nur dieser selbst
  if (s.closed && !reveal && me !== 1 - s.closed.by) s.closed = { ...s.closed, oppAugen: null };
  return s;
}

// Stich-Blatt: die eigenen gewonnenen Stiche in Reihenfolge, je Stich beide Karten (ausgespielte zuerst) und wer
// ausgespielt hat, dazu die eigenen Ansagen. Liest NUR won[seat]/wonTricks[seat] – nie Karten des Gegners.
// null, wenn seat kein Spieler ist oder die Karten in dieser Sicht verdeckt sind (Sichtschutz, Zuschauer).
export function ownTricks(state, seat) {
  if (!state || (seat !== 0 && seat !== 1) || !Array.isArray(state.won)) return null;
  const won = state.won[seat] || [];
  if (!won.every(isCard)) return null;
  const log = (state.wonTricks && state.wonTricks[seat]) || [];
  const tricks = [];
  for (let i = 0; i + 1 < won.length; i += 2) {
    const e = log[i / 2];
    tricks.push({ nr: i / 2 + 1, cards: [won[i], won[i + 1]], lead: e && (e.lead === 0 || e.lead === 1) ? e.lead : null, augen: val(won[i]) + val(won[i + 1]) });
  }
  const ansagen = (state.ansagen || []).filter(a => a.seat === seat).map(a => ({ suit: a.suit, points: a.points }));
  return { tricks, ansagen, augen: sumCards(won), total: sumCards(won) + (tricks.length ? ansagen.reduce((x, a) => x + a.points, 0) : 0), pending: tricks.length ? 0 : ansagen.reduce((x, a) => x + a.points, 0) };
}

// ---------- Bewertung ----------

// Einheit: Bummerl-Punkte aus Sicht von seat. Grundwert = 7 × (Bummerl-Differenz) + Punkte-Differenz im laufenden
// Bummerl; im laufenden Spiel kommt eine grobe Schätzung (±2) dazu: eigene Augen gegenüber 33, schwebende
// Ansagen halb, Anzahl und Augen eigener Atouts. Nutzt nur, was seat sieht (Sicht und voller Zustand gleich).
export function evaluate(state, seat) {
  const o = 1 - seat;
  let e = WIN_POINTS * (state.bummerl[seat] - state.bummerl[o]) + (state.points[seat] - state.points[o]);
  if (state.phase === 'play') {
    const hand = state.hands[seat].filter(isCard);
    const trumps = hand.filter(c => c[0] === state.atout);
    const my = cardPoints(state, seat) + 0.5 * pendingPoints(state, seat);
    let g = (my - 33) / 33 + 0.15 * (trumps.length - 1) + 0.01 * sumCards(trumps);
    if (state.closed) g += state.closed.by === seat ? 0.2 : -0.2;
    e += Math.max(-2, Math.min(2, 1.5 * g));
  }
  return Math.round(e * 1000) / 1000;
}
