// Blackjack mit rotierender Bank (2–6 Sitze, Spielgeld „Bohnen“) – reine Regel-Engine ohne DOM (Spiel-API der Spielebox).
//
// Regeln (Kurzfassung): Ein Sitz ist Bank und spielt automatisch (zieht bis 16, steht ab 17, auch auf weicher 17).
// Die anderen setzen der Reihe nach (Sitz nach der Bank zuerst), bekommen 2 offene Karten, die Bank eine offene und
// eine verdeckte. Bank-Black-Jack wird sofort aufgedeckt (Spieler-BJ unentschieden, alle anderen verlieren).
// Züge: ziehen, stehen, verdoppeln (erste 2 Karten einer Hand), teilen (einmal pro Runde und Spieler, gleicher
// Rang, Zehnerwerte gemischt; geteilte Asse je genau 1 Karte). Auszahlung BJ 3:2, Gewinn 1:1, Gleichstand zurück.
// Bank wechselt reihum alle 5 Runden; Option wechselBJ: Spieler mit Black Jack wird ab der nächsten Runde Bank.
// Ende nach players × 5 Runden oder wenn keine Runde mehr möglich ist (weniger als zwei Sitze mit Bohnen).
//
// Entscheidungen:
// - Bohnen-Summe bleibt exakt gleich: Bohnen wandern nur bei der Abrechnung (Spieler ↔ Bank), nichts wird vorher
//   abgezogen. Einsätze sind Ganzzahlen, BJ-Gewinne können halbe Bohnen sein (x,5) – in Gleitkomma exakt.
// - Bank zahlt immer voll: „Deckung“ (exposure) = höchstmögliche Auszahlung aller offenen Hände (vor dem Austeilen
//   1,5 × Einsatz, danach 1,5 × Einsatz bei BJ, sonst Einsatz inkl. Verdoppeln/Teilen) darf die Bohnen der Bank nie
//   übersteigen. Höchsteinsatz = min(50, eigene Bohnen, (Bankbohnen − Deckung) / 1,5); Verdoppeln/Teilen nur, wenn
//   eigene freie Bohnen UND Deckung der Bank reichen. Wer so nicht mindestens 1 Bohne setzen kann, setzt aus.
// - Setzen braucht mindestens 1 Bohne (Einsätze ganzzahlig). Bank sein braucht mindestens 1,5 Bohnen (sonst kann
//   niemand setzen); kann die fällige Bank das nicht, geht die Bank an den nächsten Sitz, der es kann (Zähler neu).
//   Gibt es keine Bank mit mindestens einem Mitspieler (≥ 1 Bohne), endet die Partie.
// - Gemischt wird VOR der Runde (vor dem Setzen), wenn weniger als 26 Karten im Schuh sind (am Anfang: 0 Karten),
//   immer alle 104 Karten: chance = { kind: 'shuffle', n: 104 }, perm[i] = Index in SHOE.
// - Geht der Schuh mitten in der Runde aus (selten, viele Hände), werden die abgelegten Karten gemischt:
//   chance = { kind: 'shuffle', n: discard.length }, perm[i] = Index in state.discard.
// - Hand mit 21 (auch nach Teilen) ist automatisch fertig. 21 nach Teilen ist kein Black Jack.
// - Verdoppeln nach Teilen ist erlaubt (2 Karten), außer bei geteilten Assen (die sind nach 1 Karte fertig).
// - Die Bank zieht nur, wenn noch eine Spielerhand weder überkauft noch Black Jack ist.
// - Der offene Ablagestapel (discard) bleibt sichtbar (die Karten lagen offen auf dem Tisch).
//
// Zustand (reines JSON):
//   { opts: { players, wechselBJ, start }, phase: 'bet'|'play'|'bank'|'over',
//     shuffle: null | 'new' | 'discard'  (Zufall ausstehend, siehe oben),
//     round: fertig gespielte Runden, bank: Bank-Sitz, bankRounds: fertige Runden der aktuellen Bank,
//     beans: [Bohnen je Sitz], shoe: [Karten, Index 0 = oben], discard: [abgelegte Karten],
//     bets: [Einsatz je Sitz, 0 = setzt nicht / Bank], pos: Index in betOrder (wer setzt als Nächstes),
//     hands: [je Sitz: [{ cards, bet, doubled, split, done }]] (Bank: []),
//     bankCards: [offen, Loch, gezogene …], holeOpen: Loch-Karte aufgedeckt?,
//     turn: Sitz am Zug in 'play' | null, hand: Index der aktiven Hand,
//     lastRound: null | { round, bank, bankCards, bankTotal, bankBJ, bankBust,
//                         hands: [je Sitz: [{ cards, bet, doubled, split, result, win }]], delta: [je Sitz] },
//     over: null | { winner, reason, points } }
//   result je Hand: 'bj' | 'win' | 'push' | 'lose' | 'bust'; win = Bohnen-Änderung dieser Hand (Spielersicht).
// Züge: { type: 'bet', amount } | { type: 'hit' } | { type: 'stand' } | { type: 'double' } | { type: 'split' }

export const id = 'blackjack';
export const title = 'Blackjack';
export const PLAYERS = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4', 'Spieler 5', 'Spieler 6'];
export const HIDDEN = true;

export const SUITS = Object.freeze(['S', 'H', 'D', 'C']);
export const RANKS = Object.freeze(['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K']);
export const SUIT_NAMES = Object.freeze({ S: 'Pik', H: 'Herz', D: 'Karo', C: 'Kreuz' });
export const RANK_NAMES = Object.freeze({ A: 'Ass', T: '10', J: 'Bube', Q: 'Dame', K: 'König' });
const DECK = SUITS.flatMap(s => RANKS.map(r => r + s));
export const SHOE = Object.freeze([...DECK, ...DECK]);   // 2 Blätter, 104 Karten
export const SHOE_SIZE = 104;
export const SHUFFLE_BELOW = 26;                         // < 25 % im Schuh → vor der Runde neu mischen
export const ROUNDS_PER_BANK = 5;
export const MAX_BET = 50;

const CARD_SET = new Set(DECK);
const PHASES = new Set(['bet', 'play', 'bank', 'over']);
const FIELDS = {
  bet: new Set(['type', 'amount']), hit: new Set(['type']), stand: new Set(['type']),
  double: new Set(['type']), split: new Set(['type'])
};

const isCard = c => typeof c === 'string' && CARD_SET.has(c);
const rankOf = c => c[0];
export const cardValue = c => (c[0] === 'A' ? 1 : 'TJQK'.includes(c[0]) ? 10 : Number(c[0]));

export function cardName(card) {
  if (!isCard(card)) return '?';
  return `${SUIT_NAMES[card[1]]}-${RANK_NAMES[card[0]] || card[0]}`;
}

// Bohnen hübsch: 7.5 → „7,5“
export const fmtBeans = x => String(x).replace('.', ',');

// Wert einer Hand; unbekannte Karten (null) werden übersprungen. bj = genau 2 Karten mit 21
// (ob die Hand aus einer Teilung stammt, weiß nur der Aufrufer: dann ist es kein Black Jack).
export function handValue(cards) {
  let total = 0, aces = 0, n = 0;
  for (const c of cards || []) {
    if (!isCard(c)) continue;
    n++;
    const v = cardValue(c);
    if (v === 1) aces++;
    total += v;
  }
  const soft = aces > 0 && total + 10 <= 21;
  if (soft) total += 10;
  return { total, soft, bj: n === 2 && (cards || []).length === 2 && total === 21 };
}

const isBJHand = h => !h.split && handValue(h.cards).bj;
const isBust = h => handValue(h.cards).total > 21;

export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const p = Number(o.players), st = Number(o.start);
  return {
    players: Number.isInteger(p) && p >= 2 && p <= 6 ? p : 4,
    wechselBJ: o.wechselBJ === true || o.wechselBJ === 'true',
    start: Number.isInteger(st) && st >= 1 && st <= 1000000 ? st : 100
  };
}

// Flache Kopie; Teilobjekte (lastRound, over) werden nie verändert, nur ersetzt
function clone(s) {
  return {
    ...s, opts: { ...s.opts }, beans: s.beans.slice(), shoe: s.shoe.slice(), discard: s.discard.slice(),
    bets: s.bets.slice(), hands: s.hands.map(hs => hs.map(h => ({ ...h, cards: h.cards.slice() }))),
    bankCards: s.bankCards.slice()
  };
}

function validState(s) {
  return !!s && typeof s === 'object' && PHASES.has(s.phase) && !!s.opts && Number.isInteger(s.opts.players) &&
    Array.isArray(s.beans) && s.beans.length === s.opts.players && Array.isArray(s.bets) && Array.isArray(s.hands) &&
    s.hands.length === s.opts.players && s.hands.every(Array.isArray) && Array.isArray(s.shoe) &&
    Array.isArray(s.discard) && Array.isArray(s.bankCards) && Number.isInteger(s.bank);
}

export function phase(state) {
  return state.phase;
}

// Nicht-Bank-Sitze in Spielreihenfolge (Sitz nach der Bank zuerst)
export function betOrder(state) {
  const n = state.opts.players, out = [];
  for (let k = 1; k < n; k++) out.push((state.bank + k) % n);
  return out;
}

// Höchstmögliche Auszahlung der Bank für alle offenen Einsätze/Hände
export function exposure(state) {
  if (state.phase === 'bet') return 1.5 * state.bets.reduce((a, b) => a + b, 0);
  let e = 0;
  for (const hs of state.hands) for (const h of hs) e += isBJHand(h) ? 1.5 * h.bet : h.bet;
  return e;
}

// Freie Bohnen eines Spielers (Bohnen minus bereits eingesetzte)
function freeBeans(state, seat) {
  const used = state.phase === 'bet' ? state.bets[seat] : state.hands[seat].reduce((a, h) => a + h.bet, 0);
  return state.beans[seat] - used;
}

// Höchsteinsatz von seat in der Setzphase (0 = kann nicht setzen)
export function maxBet(state, seat) {
  if (state.phase !== 'bet' || seat === state.bank) return 0;
  const room2 = 2 * state.beans[state.bank] - 3 * state.bets.reduce((a, b) => a + b, 0);   // in halben Bohnen
  return Math.max(0, Math.min(MAX_BET, Math.floor(state.beans[seat]), Math.floor(room2 / 3)));
}

// ---------- Ablauf ----------

function draw(s) {
  return s.shoe.shift();
}

function skipBettors(s) {
  const order = betOrder(s);
  while (s.pos < order.length && maxBet(s, order[s.pos]) < 1) s.pos++;
  if (s.pos >= order.length) deal(s);
}

function finish(s) {
  const best = Math.max(...s.beans);
  const top = s.beans.map((b, i) => (b === best ? i : -1)).filter(i => i >= 0);
  s.phase = 'over';
  s.turn = null;
  s.shuffle = null;
  s.over = top.length === 1
    ? { winner: top[0], reason: `hat die meisten Bohnen (${fmtBeans(best)})`, points: best }
    : { winner: null, reason: `Gleichstand mit je ${fmtBeans(best)} Bohnen`, points: best };
  return s;
}

// Neue Runde vorbereiten (Setzphase), ggf. Bank weiterreichen, Partieende, Mischen
function startRound(s) {
  const n = s.opts.players;
  s.phase = 'bet';
  s.bets = Array(n).fill(0);
  s.pos = 0;
  s.hands = Array.from({ length: n }, () => []);
  s.bankCards = [];
  s.holeOpen = false;
  s.turn = null;
  s.hand = 0;
  if (s.round >= n * ROUNDS_PER_BANK) return finish(s);
  let found = -1;
  for (let k = 0; k < n && found < 0; k++) {
    const b = (s.bank + k) % n;
    if (s.beans[b] >= 1.5 && s.beans.some((x, i) => i !== b && x >= 1)) found = b;
  }
  if (found < 0) return finish(s);
  if (found !== s.bank) {
    s.bank = found;
    s.bankRounds = 0;
  }
  if (s.shoe.length < SHUFFLE_BELOW) s.shuffle = 'new';
  skipBettors(s);
  return s;
}

function deal(s) {
  const players = betOrder(s).filter(p => s.bets[p] > 0);
  if (!players.length) return endRound(settle(s));   // nicht erreichbar (Bank hat immer einen Mitspieler)
  const first = {};
  for (const p of players) first[p] = draw(s);
  const up = draw(s);
  for (const p of players) s.hands[p] = [{ cards: [first[p], draw(s)], bet: s.bets[p], doubled: false, split: false, done: false }];
  s.bankCards = [up, draw(s)];
  s.holeOpen = false;
  if (handValue(s.bankCards).bj) {
    s.holeOpen = true;
    return endRound(settle(s));
  }
  s.phase = 'play';
  s.turn = players[0];
  s.hand = 0;
  return advance(s);
}

function nextHand(s) {
  if (s.hand + 1 < s.hands[s.turn].length) {
    s.hand++;
    return;
  }
  const order = betOrder(s), i = order.indexOf(s.turn);
  const next = order.slice(i + 1).find(p => s.hands[p].length > 0);
  s.turn = next === undefined ? null : next;
  s.hand = 0;
}

// Automatische Schritte bis zur nächsten Entscheidung (oder bis Zufall nötig ist)
function advance(s) {
  while (s.phase === 'play') {
    if (s.shuffle) return s;
    if (s.turn === null) {
      s.phase = 'bank';
      break;
    }
    const h = s.hands[s.turn][s.hand];
    if (h.cards.length < 2) {   // Hand nach dem Teilen bekommt ihre zweite Karte
      if (!s.shoe.length) { s.shuffle = 'discard'; return s; }
      h.cards.push(draw(s));
      if (h.split && rankOf(h.cards[0]) === 'A') h.done = true;
      continue;
    }
    if (!h.done && (handValue(h.cards).total >= 21 || isBJHand(h))) h.done = true;
    if (h.done) { nextHand(s); continue; }
    if (!s.shoe.length) { s.shuffle = 'discard'; return s; }   // Ziehen muss möglich sein
    return s;
  }
  if (s.phase === 'bank') {
    if (s.shuffle) return s;
    s.holeOpen = true;
    const need = s.hands.some(hs => hs.some(h => !isBust(h) && !isBJHand(h)));
    if (need) {
      while (handValue(s.bankCards).total < 17) {
        if (!s.shoe.length) { s.shuffle = 'discard'; return s; }
        s.bankCards.push(draw(s));
      }
    }
    return endRound(settle(s));
  }
  return s;
}

// Abrechnen: Ergebnis je Hand, Bohnen verschieben, Karten ablegen
function settle(s) {
  const n = s.opts.players, bv = handValue(s.bankCards), bankBJ = bv.bj, bankBust = bv.total > 21;
  const delta = Array(n).fill(0);
  const hands = s.hands.map(hs => hs.map(h => {
    const v = handValue(h.cards), bj = isBJHand(h);
    let result, win;
    if (v.total > 21) { result = 'bust'; win = -h.bet; }
    else if (bankBJ) { result = bj ? 'push' : 'lose'; win = bj ? 0 : -h.bet; }
    else if (bj) { result = 'bj'; win = 1.5 * h.bet; }
    else if (bankBust || v.total > bv.total) { result = 'win'; win = h.bet; }
    else if (v.total === bv.total) { result = 'push'; win = 0; }
    else { result = 'lose'; win = -h.bet; }
    return { cards: h.cards.slice(), bet: h.bet, doubled: h.doubled, split: h.split, result, win };
  }));
  hands.forEach((hs, p) => {
    for (const h of hs) {
      delta[p] += h.win;
      delta[s.bank] -= h.win;
    }
  });
  for (let p = 0; p < n; p++) s.beans[p] += delta[p];
  s.lastRound = {
    round: s.round + 1, bank: s.bank, bankCards: s.bankCards.slice(), bankTotal: bv.total, bankBJ, bankBust,
    hands, delta
  };
  for (const hs of s.hands) for (const h of hs) s.discard.push(...h.cards);
  s.discard.push(...s.bankCards);
  s.hands = Array.from({ length: n }, () => []);
  s.bankCards = [];
  s.turn = null;
  return s;
}

function endRound(s) {
  const n = s.opts.players, lr = s.lastRound;
  s.round++;
  s.bankRounds++;
  let bjSeat = -1;
  if (s.opts.wechselBJ) {
    const order = betOrder(s);
    bjSeat = order.find(p => lr.hands[p].some(h => !h.split && handValue(h.cards).bj));
    if (bjSeat === undefined) bjSeat = -1;
  }
  if (bjSeat >= 0) {
    s.bank = bjSeat;
    s.bankRounds = 0;
  } else if (s.bankRounds >= ROUNDS_PER_BANK) {
    s.bank = (s.bank + 1) % n;
    s.bankRounds = 0;
  }
  s.lastRound = { ...lr, nextBank: s.bank };
  return startRound(s);
}

// ---------- Zufall ----------

export function chance(state) {
  if (!state || state.phase === 'over' || !state.shuffle) return null;
  return { kind: 'shuffle', n: state.shuffle === 'new' ? SHOE_SIZE : state.discard.length };
}

// 'new': perm[i] = Index in SHOE (alle 104 Karten); 'discard': perm[i] = Index in state.discard
export function applyChance(state, perm) {
  const c = chance(state);
  if (!c) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(perm) || perm.length !== c.n) throw new Error(`Permutation mit ${c.n} Einträgen erwartet`);
  const seen = new Set();
  for (const i of perm) {
    if (!Number.isInteger(i) || i < 0 || i >= c.n || seen.has(i)) throw new Error('Ungültige Permutation');
    seen.add(i);
  }
  const s = clone(state);
  if (s.shuffle === 'new') {
    s.shoe = perm.map(i => SHOE[i]);
    s.discard = [];
    s.shuffle = null;
    return s;
  }
  s.shoe = [...s.shoe, ...perm.map(i => state.discard[i])];
  s.discard = [];
  s.shuffle = null;
  return advance(s);
}

// ---------- API ----------

export function initialState(opts) {
  const o = normalizeOptions(opts), n = o.players;
  const s = {
    opts: o, phase: 'bet', shuffle: null, round: 0, bank: 0, bankRounds: 0, beans: Array(n).fill(o.start),
    shoe: [], discard: [], bets: Array(n).fill(0), pos: 0, hands: Array.from({ length: n }, () => []),
    bankCards: [], holeOpen: false, turn: null, hand: 0, lastRound: null, over: null
  };
  return startRound(s);
}

export function currentPlayer(state) {
  if (!state || state.shuffle || state.phase === 'over') return null;
  if (state.phase === 'bet') {
    const order = betOrder(state);
    return state.pos < order.length ? order[state.pos] : null;
  }
  if (state.phase === 'play') return state.turn;
  return null;
}

export function result(state) {
  return (state && state.over) || null;
}

function activeHand(state) {
  return state.phase === 'play' && state.turn !== null ? state.hands[state.turn][state.hand] : null;
}

function bankRoom(state) {
  return state.beans[state.bank] - exposure(state);
}

export function canDouble(state) {
  const h = activeHand(state);
  return !!h && !h.done && h.cards.length === 2 && freeBeans(state, state.turn) >= h.bet && bankRoom(state) >= h.bet;
}

export function canSplit(state) {
  const h = activeHand(state);
  if (!h || h.done || state.hands[state.turn].length !== 1 || h.cards.length !== 2) return false;
  const [a, b] = h.cards;
  if (!isCard(a) || !isCard(b) || cardValue(a) !== cardValue(b)) return false;
  return freeBeans(state, state.turn) >= h.bet && bankRoom(state) >= h.bet;
}

export function legalMoves(state) {
  try {
    if (!validState(state) || currentPlayer(state) === null) return [];
    if (state.phase === 'bet') {
      const max = maxBet(state, currentPlayer(state)), out = [];
      for (let a = 1; a <= max; a++) out.push({ type: 'bet', amount: a });
      return out;
    }
    const h = activeHand(state);
    if (!h || h.done) return [];
    const out = [{ type: 'hit' }, { type: 'stand' }];
    if (canDouble(state)) out.push({ type: 'double' });
    if (canSplit(state)) out.push({ type: 'split' });
    return out;
  } catch {
    return [];
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
    if (move.type === 'bet' && !Number.isInteger(move.amount)) return false;
    return legalMoves(state).some(m => m.type === move.type && (m.type !== 'bet' || m.amount === move.amount));
  } catch {
    return false;
  }
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${JSON.stringify(move)}`);
  const s = clone(state);
  if (move.type === 'bet') {
    s.bets[currentPlayer(s)] = move.amount;
    s.pos++;
    skipBettors(s);
    return s;
  }
  const p = s.turn, h = s.hands[p][s.hand];
  switch (move.type) {
    case 'hit':
      h.cards.push(draw(s));
      break;
    case 'stand':
      h.done = true;
      break;
    case 'double':
      h.bet *= 2;
      h.doubled = true;
      h.cards.push(draw(s));
      h.done = true;
      break;
    case 'split': {
      const [a, b] = h.cards;
      s.hands[p] = [
        { cards: [a], bet: h.bet, doubled: false, split: true, done: false },
        { cards: [b], bet: h.bet, doubled: false, split: true, done: false }
      ];
      s.hand = 0;
      break;
    }
  }
  return advance(s);
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object') return '?';
  switch (move.type) {
    case 'bet': return `setzt ${move.amount} ${move.amount === 1 ? 'Bohne' : 'Bohnen'}`;
    case 'hit': return 'zieht';
    case 'stand': return 'bleibt stehen';
    case 'double': return 'verdoppelt';
    case 'split': return 'teilt';
    default: return '?';
  }
}

// Vollständige Stellung (nur Host; enthält verdeckte Karten)
export function positionKey(state) {
  const s = state;
  return JSON.stringify([s.phase, s.shuffle, s.round, s.bank, s.bankRounds, s.beans, s.shoe, s.discard, s.bets, s.pos,
    s.hands, s.bankCards, s.holeOpen, s.turn, s.hand]);
}

// ---------- Sicht ----------

// Schuh-Reihenfolge und Loch-Karte (bis aufgedeckt) werden null; alles andere liegt offen. Für alle Sitze gleich.
export function viewFor(state, seat) {
  const s = clone(state);
  s.shoe = s.shoe.map(() => null);
  if (!s.holeOpen && s.bankCards.length >= 2) s.bankCards[1] = null;
  return s;
}

// ---------- Bewertung ----------

// Einheit Bohnen: eigene Bohnen minus Startbohnen
export function evaluate(state, seat) {
  if (!state || !Array.isArray(state.beans) || typeof state.beans[seat] !== 'number') return 0;
  return state.beans[seat] - state.opts.start;
}
