// Mau-Mau (32 Blatt doppeldeutsch, 2–5 Spieler) – reine Regel-Engine ohne DOM (Spiel-API der Spielebox).
// Quelle der Regeln: https://de.wikipedia.org/wiki/Mau-Mau_(Kartenspiel) (abgerufen 01.10.2026).
//   Grundregel: Karte gleicher Farbe oder gleichen Werts auf die oberste offene Karte. „Kann oder will“ man nicht,
//   zieht man eine Karte und darf sie sofort ablegen, wenn sie passt. Ist der Talon aufgebraucht, werden die
//   abgelegten Karten außer der obersten neu gemischt. Wer zuerst keine Karten mehr hat, gewinnt.
//   Sonderregeln laut Quelle: 7 = zwei ziehen (mit einer 7 kontern → vier usw.), Bube/Unter = wünschen
//   (auf jede Karte, „oft verboten, Bube auf Bube“), „Mau“ nach der vorletzten Karte (sonst eine oder zwei
//   Strafkarten). Die Quelle nennt fürs Aussetzen meist die 8 – hier ist es (Peters Hausregel) das Ass/der Daus.
//
// Entscheidungen bei unklaren Regeln:
// - Austeilen: 5 Karten je Spieler (Quelle: „oft fünf oder sechs“), reihum ab Spieler 1; dann eine Karte offen
//   als Ablage, der Rest ist der Stapel. Geber ist immer der letzte Sitz, Spieler 1 beginnt (eine Partie = ein Spiel).
// - Erste aufgedeckte Karte: bleibt wirkungslos (Quelle: „dass die Funktion der ersten offenen Karte zu
//   Spielbeginn wirkungslos bleibt“). Also: 7 → niemand zieht, Daus → niemand setzt aus, Unter → kein Wunsch,
//   es gilt seine eigene Farbe (und Unter auf Unter bleibt verboten).
// - Gezogen wird immer nur eine Karte; danach darf NUR diese gezogene Karte gelegt werden, sonst „passen“.
//   Ziehen ist immer erlaubt („kann oder will“). Gibt es gar nichts mehr zu ziehen, ist der Nächste dran.
// - 7: Wer die Strafe nicht mit einer 7 kontert, zieht ALLE Strafkarten mit einem Zug und ist danach fertig
//   (darf nichts mehr legen). Die liegende 7 ist danach eine normale Karte.
// - Unter (Option an): darf auf jede Karte außer einen Unter (ein Wunsch liegt immer auf einem Unter, also passt
//   auf einen Wunsch nie ein Unter); der Spieler wünscht
//   immer eine Farbe (auch die eigene, auch mit der letzten Karte). Auf einen Wunsch passt nur die Wunschfarbe.
//   Unter-Option aus: Unter ist eine normale Karte (auch Unter auf Unter nach Wert).
// - Daus (Option an): der Nächste wird übersprungen (zu zweit ist man also gleich noch einmal dran).
// - Mau: Wer mit einem Zug seine vorletzte Karte legt, muss `mau: true` mitgeben. Vergessen → 2 Strafkarten
//   (Quelle: „eine oder zwei“) sofort nach dem Zug. Für die letzte Karte ist nichts zu sagen. `mau: true` ist
//   nur bei der vorletzten Karte erlaubt.
// - Sieg mit der letzten Karte sofort, auch wenn es eine 7 oder ein Daus ist.
// - Reicht der Stapel beim Ziehen nicht, wird die Ablage außer der obersten Karte gemischt
//   (chance { kind: 'shuffle', n: pile.length − 1 }, perm[i] = Index in der Ablage ohne oberste Karte,
//   Index 0 = oberste Stapelkarte), dann wird weitergezogen; reicht auch das nicht, zieht man weniger.
// - Sicherheitsgrenze: nach MAX_PLY Zügen (nur möglich, wenn alle ständig ziehen statt zu legen) endet die Partie;
//   es gewinnt, wer die wenigsten Karten hat (gleich wenige → unentschieden).
//
// Zustand (reines JSON):
//   { n: Spielerzahl, opts: { players, sieben, unter, ass, mau }, phase: 'deal'|'play'|'over',
//     hands: [[Karten] je Sitz], stock: [verdeckter Stapel, Index 0 = oben], pile: [Ablage, letzte = oben],
//     turn: Sitz am Zug, wish: null | Farbe (gewünschte Farbe nach einem Unter), penalty: 0|2|4… (offene 7er-Strafe
//     für den Sitz am Zug), drawn: null | Karte (gerade gezogen, nur sie darf noch gelegt werden),
//     mau: [bool] je Sitz (hat Mau gesagt und noch genau 1 Karte),
//     owed: null | { seat, n, keep, got } (Karten, die gerade gezogen werden; wartet ggf. auf das Mischen;
//           keep = gewöhnliches Ziehen, die Karte wird zu drawn),
//     last: null | { seat, type: 'play'|'draw'|'pass', card?, wish?, mau?, mauMissed?, skipped?, penalty?, strafe?, n? }
//           (letzter Zug: n = tatsächlich gezogene Karten (auch Mau-Strafkarten), penalty = offene 7er-Strafe nach
//           dem Zug, strafe = Größe der genommenen 7er-Strafe, skipped = übersprungener Sitz),
//     winner: null | Sitz, over: null | { winner, reason, points }, ply: Zahl der Züge, dealer: Geber-Sitz }
// Züge: { type: 'play', card: 'HA' [, wish: 'L'] [, mau: true] } | { type: 'draw' } | { type: 'pass' }
//   wish ist bei einem Unter (Option unter) Pflicht und sonst verboten.

export const id = 'maumau';
export const title = 'Mau-Mau';
export const PLAYERS = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4', 'Spieler 5'];
export const HIDDEN = true;

export const SUITS = Object.freeze(['H', 'S', 'L', 'E']);
export const RANKS = Object.freeze(['A', 'Z', 'K', 'O', 'U', '9', '8', '7']);
export const SUIT_NAMES = Object.freeze({ H: 'Herz', S: 'Schellen', L: 'Laub', E: 'Eichel' });
export const RANK_NAMES = Object.freeze({ A: 'Daus', Z: 'Zehner', K: 'König', O: 'Ober', U: 'Unter', 9: 'Neuner', 8: 'Achter', 7: 'Siebener' });
export const DECK = Object.freeze(SUITS.flatMap(s => RANKS.map(r => s + r)));
export const HAND_SIZE = 5;
export const MAU_PENALTY = 2;
export const MAX_PLY = 1500;

const DECK_SET = new Set(DECK);
const PHASES = new Set(['deal', 'play', 'over']);
const FIELDS = { play: new Set(['type', 'card', 'wish', 'mau']), draw: new Set(['type']), pass: new Set(['type']) };
const OPT_KEYS = ['sieben', 'unter', 'ass', 'mau'];

const isCard = c => typeof c === 'string' && DECK_SET.has(c);

export function cardName(card) {
  return isCard(card) ? `${SUIT_NAMES[card[0]]}-${RANK_NAMES[card[1]]}` : '?';
}

const off = v => v === false || v === 'false' || v === 0 || v === '0';

// players: 2–5 (Standard 3); Hausregeln sieben, unter, ass, mau: Standard an
export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const p = Number(o.players);
  const out = { players: Number.isInteger(p) && p >= 2 && p <= 5 ? p : 3 };
  for (const k of OPT_KEYS) out[k] = !off(o[k]);
  return out;
}

export function initialState(opts) {
  const o = normalizeOptions(opts), n = o.players;
  return {
    n, opts: o, phase: 'deal', hands: Array.from({ length: n }, () => []), stock: [], pile: [], turn: 0,
    wish: null, penalty: 0, drawn: null, mau: Array(n).fill(false), owed: null, last: null,
    winner: null, over: null, ply: 0, dealer: n - 1
  };
}

// Flache Kopie; Teilobjekte (owed, last, over) werden nie verändert, nur ersetzt
function clone(s) {
  return {
    ...s, opts: { ...s.opts }, hands: s.hands.map(h => h.slice()), stock: s.stock.slice(), pile: s.pile.slice(),
    mau: s.mau.slice()
  };
}

function validState(s) {
  return !!s && typeof s === 'object' && PHASES.has(s.phase) && Number.isInteger(s.n) && s.n >= 2 && s.n <= 5 &&
    !!s.opts && typeof s.opts === 'object' && Array.isArray(s.hands) && s.hands.length === s.n &&
    s.hands.every(Array.isArray) && Array.isArray(s.stock) && Array.isArray(s.pile) && Array.isArray(s.mau) &&
    Number.isInteger(s.turn) && s.turn >= 0 && s.turn < s.n;
}

// Für den Tisch: Nachmischen der Ablage mitten im Spiel heißt 'nachmischen', nicht 'deal' – der Tisch veröffentlicht
// beim Austeilen ('deal') die alten Mischungen, und die erste Mischung verriete sonst alle Starthände.
export function phase(state) {
  return state.phase === 'deal' && state.pile.length ? 'nachmischen' : state.phase;
}

const nextSeat = (s, p) => (p + 1) % s.n;

// ---------- Hilfen für Regeln und Oberfläche ----------

export function topCard(state) {
  return state && Array.isArray(state.pile) && state.pile.length ? state.pile[state.pile.length - 1] : null;
}

// Farbe, die gerade bedient werden muss: Wunschfarbe oder Farbe der obersten Karte
export function effectiveSuit(state) {
  if (!state) return null;
  if (state.wish) return state.wish;
  const t = topCard(state);
  return t ? t[0] : null;
}

// Passt card jetzt auf die Ablage? (ohne Rücksicht auf drawn)
export function fits(state, card) {
  if (!isCard(card)) return false;
  const top = topCard(state);
  if (!top) return false;
  const o = state.opts;
  if (state.penalty > 0) return card[1] === '7';
  if (o.unter && card[1] === 'U') return top[1] !== 'U';
  if (state.wish) return card[0] === state.wish;
  return card[0] === top[0] || card[1] === top[1];
}

// Karten der eigenen Hand (Sitz am Zug), die gerade gelegt werden dürfen
export function playable(state) {
  try {
    if (!validState(state) || state.phase !== 'play') return [];
    if (state.drawn) return isCard(state.drawn) && fits(state, state.drawn) ? [state.drawn] : [];
    return state.hands[state.turn].filter(c => isCard(c) && fits(state, c));
  } catch {
    return [];
  }
}

// Kartenzahlen je Sitz (öffentlich)
export function handSizes(state) {
  return state.hands.map(h => h.length);
}

// ---------- Zufall ----------

export function chance(state) {
  if (!state || state.phase !== 'deal') return null;
  return { kind: 'shuffle', n: state.pile.length ? state.pile.length - 1 : DECK.length };
}

function checkPerm(perm, n) {
  if (!Array.isArray(perm) || perm.length !== n) throw new Error(`Permutation mit ${n} Einträgen erwartet`);
  const seen = new Set();
  for (const i of perm) {
    if (!Number.isInteger(i) || i < 0 || i >= n || seen.has(i)) throw new Error('Ungültige Permutation');
    seen.add(i);
  }
}

// Austeilen: perm[i] = Index in DECK der i-ten Karte von oben (Karte i an Sitz i mod n, 5 Runden, dann
// Ablage, Rest Stapel). Neu mischen: perm[i] = Index in der Ablage ohne oberste Karte.
export function applyChance(state, perm) {
  const c = chance(state);
  if (!c) throw new Error('Kein Zufall ausstehend');
  checkPerm(perm, c.n);
  const s = clone(state);
  if (!state.pile.length) {
    const st = perm.map(i => DECK[i]), n = s.n;
    s.hands = Array.from({ length: n }, (_, q) => st.filter((_, i) => i < HAND_SIZE * n && i % n === q));
    s.pile = [st[HAND_SIZE * n]];
    s.stock = st.slice(HAND_SIZE * n + 1);
    s.turn = 0;
    s.phase = 'play';
    return s;
  }
  const under = state.pile.slice(0, -1);
  s.stock = [...s.stock, ...perm.map(i => under[i])];
  s.pile = [state.pile[state.pile.length - 1]];
  s.phase = 'play';
  return runOwed(s);
}

// Offene Ziehschuld abarbeiten; wartet ggf. auf das Mischen (phase 'deal')
function runOwed(s) {
  const ow = s.owed;
  if (!ow) return s;
  let { n, got } = ow;
  while (n > 0) {
    if (s.stock.length) {
      const card = s.stock.shift();
      s.hands[ow.seat].push(card);
      if (ow.keep) s.drawn = card;
      n--;
      got++;
    } else if (s.pile.length > 1) {
      s.owed = { ...ow, n, got };
      s.phase = 'deal';
      // Fehlerbehebung: auch beim Warten aufs Mischen gilt „Mau“ nur mit genau einer Karte
      // (sonst blieb mau = true, wenn schon eine Strafkarte gezogen war)
      syncMau(s);
      return s;
    } else break;
  }
  s.owed = null;
  s.phase = 'play';
  if (s.last && s.last.seat === ow.seat) s.last = { ...s.last, n: (s.last.n || 0) + got };
  if (ow.keep && got === 0) {   // nichts mehr zu ziehen: der Nächste ist dran
    s.drawn = null;
    s.turn = nextSeat(s, ow.seat);
  }
  syncMau(s);
  return s;
}

function syncMau(s) {
  for (let q = 0; q < s.n; q++) if (s.hands[q].length !== 1) s.mau[q] = false;
}

// ---------- API ----------

export function currentPlayer(state) {
  if (!state || state.phase !== 'play') return null;
  return state.turn;
}

export function result(state) {
  return (state && state.over) || null;
}

// Zug-Varianten für eine Karte (Wunsch, Mau)
function playVariants(state, card, handLen, out) {
  const o = state.opts;
  const wishes = o.unter && card[1] === 'U' ? SUITS : [null];
  const sayMau = o.mau && handLen === 2;
  for (const w of wishes) {
    const m = { type: 'play', card };
    if (w) m.wish = w;
    out.push(m);
    if (sayMau) out.push({ ...m, mau: true });
  }
}

export function legalMoves(state) {
  try {
    if (!validState(state) || state.phase !== 'play') return [];
    const hand = state.hands[state.turn], out = [];
    for (const c of playable(state)) playVariants(state, c, hand.length, out);
    out.push({ type: state.drawn ? 'pass' : 'draw' });
    return out;
  } catch {
    return [];
  }
}

export function moveKey(move) {
  try {
    if (!move || typeof move !== 'object') return '!';
    if (move.type !== 'play') return String(move.type);
    return `play:${move.card}${move.wish ? '/' + move.wish : ''}${move.mau === true ? '!' : ''}`;
  } catch {
    return '!';
  }
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state)) return false;
    if (!move || typeof move !== 'object' || Array.isArray(move)) return false;
    if (typeof move.type !== 'string' || !Object.hasOwn(FIELDS, move.type)) return false;
    const allowed = FIELDS[move.type];
    for (const k of Object.keys(move)) if (!allowed.has(k)) return false;
    if (move.type === 'play') {
      if (!isCard(move.card)) return false;
      if ('wish' in move && !SUITS.includes(move.wish)) return false;
      if ('mau' in move && move.mau !== true) return false;
    }
    const key = moveKey(move);
    return legalMoves(state).some(m => moveKey(m) === key);
  } catch {
    return false;
  }
}

function finish(s, winner, reason) {
  s.phase = 'over';
  s.winner = winner;
  s.owed = null;
  s.drawn = null;
  syncMau(s);   // Fehlerbehebung: der Sieger (0 Karten) behielt sonst sein mau = true
  const points = s.hands.reduce((a, h, q) => a + (q === winner ? 0 : h.length), 0);
  s.over = { winner, reason, points };
  return s;
}

function limitReached(s) {
  const sizes = handSizes(s), min = Math.min(...sizes);
  const best = sizes.map((x, q) => (x === min ? q : -1)).filter(q => q >= 0);
  if (best.length === 1) return finish(s, best[0], `hat nach ${MAX_PLY} Zügen die wenigsten Karten`);
  s.phase = 'over';
  s.winner = null;
  s.owed = null;
  s.drawn = null;
  s.over = { winner: null, reason: `nach ${MAX_PLY} Zügen unentschieden`, points: 0 };
  return s;
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${moveKey(move)}`);
  const s = clone(state), p = s.turn, o = s.opts;
  s.ply++;
  if (move.type === 'pass') {
    s.drawn = null;
    s.turn = nextSeat(s, p);
    s.last = { seat: p, type: 'pass' };
  } else if (move.type === 'draw') {
    if (s.penalty > 0) {
      const n = s.penalty;
      s.penalty = 0;
      s.turn = nextSeat(s, p);
      s.last = { seat: p, type: 'draw', n: 0, strafe: n };
      s.owed = { seat: p, n, keep: false, got: 0 };
    } else {
      s.last = { seat: p, type: 'draw', n: 0 };
      s.owed = { seat: p, n: 1, keep: true, got: 0 };
    }
    runOwed(s);
  } else {
    const card = move.card, hand = s.hands[p];
    hand.splice(hand.indexOf(card), 1);
    s.pile.push(card);
    s.drawn = null;
    s.wish = o.unter && card[1] === 'U' ? move.wish : null;
    const last = { seat: p, type: 'play', card };
    if (s.wish) last.wish = s.wish;
    if (move.mau) last.mau = true;
    s.last = last;
    if (!hand.length) return finish(s, p, 'hat keine Karten mehr');
    s.penalty = o.sieben && card[1] === '7' ? s.penalty + 2 : 0;
    if (s.penalty) last.penalty = s.penalty;
    let next = nextSeat(s, p);
    if (o.ass && card[1] === 'A') {
      last.skipped = next;
      next = nextSeat(s, next);
    }
    s.turn = next;
    if (o.mau && hand.length === 1) {
      if (move.mau) s.mau[p] = true;
      else {
        last.mauMissed = true;
        last.n = 0;
        s.owed = { seat: p, n: MAU_PENALTY, keep: false, got: 0 };
        runOwed(s);
      }
    }
    syncMau(s);
  }
  if (s.phase !== 'over' && s.ply >= MAX_PLY) return limitReached(s);
  return s;
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object') return '?';
  switch (move.type) {
    case 'play': {
      let t = cardName(move.card);
      if (move.wish) t += ` – wünscht ${SUIT_NAMES[move.wish] || '?'}`;
      if (move.mau === true) t += ' – „Mau!“';
      return t;
    }
    case 'draw': {
      const n = state && state.penalty > 0 ? state.penalty : 0;
      return n ? `zieht ${n} Strafkarten` : 'zieht eine Karte';
    }
    case 'pass': return 'passt';
    default: return '?';
  }
}

// Vollständige Stellung (nur Host; enthält verdeckte Karten)
export function positionKey(state) {
  const s = state;
  return JSON.stringify([s.phase, s.n, s.hands, s.stock, s.pile, s.turn, s.wish, s.penalty, s.drawn, s.mau, s.owed]);
}

// ---------- Sicht ----------

// Fremde Hände und Stapel werden null (Längen bleiben), die Ablage ist offen. seat = null: Zuschauer.
export function viewFor(state, seat) {
  const s = clone(state);
  const me = Number.isInteger(seat) && seat >= 0 && seat < s.n ? seat : -1;
  s.stock = s.stock.map(() => null);
  for (let q = 0; q < s.n; q++) if (q !== me) s.hands[q] = s.hands[q].map(() => null);
  if (me !== s.turn) s.drawn = null;
  return s;
}

// ---------- Bewertung ----------

// Einheit: Karten. (Durchschnittliche Kartenzahl der Gegner) − (eigene Kartenzahl); offene 7er-Strafe zählt für den
// Sitz am Zug halb mit (er kann noch kontern), Karten, die gerade gezogen werden (owed), voll.
// Nutzt nur Kartenzahlen (öffentlich) → Sicht und voller Zustand ergeben dasselbe.
export function evaluate(state, seat) {
  if (!state || !Array.isArray(state.hands) || !state.hands[seat]) return 0;
  const n = state.hands.length;
  const cnt = state.hands.map(h => h.length);
  if (state.phase === 'play' && state.penalty > 0) cnt[state.turn] += state.penalty / 2;
  if (state.owed) cnt[state.owed.seat] += state.owed.n;
  let opp = 0;
  for (let q = 0; q < n; q++) if (q !== seat) opp += cnt[q];
  return Math.round((opp / (n - 1) - cnt[seat]) * 1000) / 1000;
}
