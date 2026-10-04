// Texas Hold'em No-Limit als Turnier („Sit & Go“, 2–8 Plätze, nur Spielchips) – reine Regel-Engine ohne DOM.
//
// Regeln (Kurzfassung): Alle starten mit gleich vielen Chips. Dealer-Knopf wandert reihum, links davon Small und Big
// Blind (zu zweit: Dealer = Small Blind, handelt vor dem Flop zuerst, danach zuletzt). Jeder bekommt 2 verdeckte
// Karten, dann Setzrunden Preflop, Flop (3 Karten), Turn, River (je 1 Karte; vor jeder wird eine Karte verbrannt).
// Züge: aussteigen (fold), checken, mitgehen (call), setzen/erhöhen (raise, mit Zielbetrag) – All-in = erhöhen auf
// alles bzw. mitgehen mit allem. Mindest-Erhöhung = letzte volle Erhöhung (mindestens Big Blind). Ein All-in, das
// keine volle Erhöhung ist, öffnet die Setzrunde für Spieler, die schon gehandelt haben, nicht wieder.
// Side-Pots bei All-ins, Split-Pots, ungerade Chips nach Platzfolge ab links vom Dealer. Blinds steigen nach Händen.
// Wer keine Chips mehr hat, scheidet aus; Sieger ist, wer zuletzt Chips hat.
//
// Entscheidungen bei unklaren/seltenen Fällen:
// - Knopf: „wandernder Knopf“ – er geht immer zum nächsten Platz mit Chips; Small Blind = nächster Platz mit Chips
//   nach dem Knopf, Big Blind = nächster danach (zu zweit: Knopf = Small Blind). Kein „toter Knopf“ (einfacher zu
//   verstehen, bei Hausturnieren üblich). Erste Hand: Knopf auf Platz 1.
// - Kurzer Blind: Wer den Blind nicht ganz zahlen kann, setzt alles (All-in). Mitgehen kostet trotzdem den vollen Big
//   Blind (Einsatzhöhe = voller Big Blind), die Side-Pots regeln den Rest.
// - Aussteigen ist nur erlaubt, wenn man etwas zahlen müsste (ohne Einsatz gibt es „checken“ – Kinder sollen nicht aus
//   Versehen gute Hände wegwerfen). Die Vorab-Taste „Check/Fold“ der Oberfläche checkt bzw. steigt aus.
// - Erhöhen ist nicht erlaubt, wenn alle anderen Spieler schon All-in sind (es könnte niemand mehr reagieren).
// - Unvollständiges All-in: Wer schon gehandelt hat, darf danach nur noch mitgehen oder aussteigen – außer der Betrag,
//   den er jetzt zusätzlich bringen muss, ist mindestens eine volle Erhöhung (TDA-Regel; mehrere kurze All-ins
//   zusammen können also wieder öffnen).
// - Nicht gegangener Einsatz (niemand ging ganz mit) geht am Ende der Setzrunde zurück (returned).
// - Showdown: zuerst zeigt, wer auf dem River zuletzt gesetzt/erhöht hat, sonst der erste Spieler links vom Knopf;
//   dann reihum. Wer keinen Pot mehr gewinnen kann (jemand vor ihm hat für jeden seiner Pots schon Besseres gezeigt),
//   legt die Karten verdeckt weg (muck); danach darf er sie mit dem Tisch-Kommando „show“ doch noch zeigen. Sind
//   Spieler All-in und es kann nicht mehr gesetzt werden, werden alle Hände sofort aufgedeckt (wie im Turnier).
//   Wer ohne Showdown gewinnt (alle anderen ausgestiegen), zeigt nichts, darf aber per „show“ zeigen.
// - Ungerade Chips beim Teilen: je ein Chip an die Gewinner in Platzfolge, beginnend links vom Knopf.
// - Scheiden mehrere in derselben Hand aus, bekommt den besseren Platz, wer zu Beginn der Hand mehr Chips hatte
//   (gleich viel → gleicher Platz).
// - Blinds: Stufen BLIND_LEVELS, neue Stufe alle HANDS_PER_LEVEL[opts.blinds] Hände (aus = nie). Sicherheitsgrenze
//   MAX_HANDS: danach gewinnt, wer die meisten Chips hat (nur bei „aus“ erreichbar).
// - Gemischt wird vor jeder Hand: chance { kind: 'shuffle', n: 52 }, perm[i] = Index in DECK (Karte i von oben).
//   Ausgeteilt wird wie am Tisch: reihum ab dem Small Blind je eine Karte, zweimal; vor Flop/Turn/River eine
//   Karte verbrennen.
//
// Zustand (reines JSON):
//   { opts: { players, start, blinds, timer }, phase: 'deal'|'bet'|'over', hand: Nummer der laufenden Hand (ab 1),
//     level: Blind-Stufe (Index), sbAmt, bbAmt, button, sb, bb (Sitze; sb = null nie, zu zweit sb = button),
//     stacks: [Chips vor dem Tisch je Sitz], out: [null | Platz] (ausgeschieden mit Endplatz), deck: [Karten, oben = 0],
//     holes: [[a, b] | [] je Sitz], board: [Karten], street: 0 Preflop … 3 River, bets: [Einsatz dieser Setzrunde],
//     contrib: [Einsatz der ganzen Hand], folded: [bool], allin: [bool], betTo: höchster Einsatz der Runde,
//     minRaise: Mindest-Erhöhung (letzte volle Erhöhung), matched: [Einsatzhöhe beim letzten eigenen Zug, −1 = noch
//     nicht gehandelt], turn: Sitz am Zug | null, aggr: letzter Setzer/Erhöher der Runde | null,
//     shown: [bool] (Hand offen, weil alle All-in sind), log: [{ s, t, a, st }] Züge dieser Hand (öffentlich),
//     startStacks: [Chips zu Beginn der Hand], vp/pr: [bool] (Statistik dieser Hand),
//     stats: [{ h, vpip, pfr, bet, call, fold, face, sd, won }] je Sitz (öffentlich, für Computer und Anzeige),
//     lastHand: null | { no, board, pots: [{ amount, eligible, winners, value, name }], shown: { Sitz: [a, b] },
//                        mucked: [Sitze], order: [Showdown-Reihenfolge], delta: [je Sitz], uncontested: Sitz | null,
//                        returned: [{ seat, amount }], busted: [Sitze], allin: bool, level, button },
//     lastHoles: { Sitz: [a, b] } (verdeckt weggelegte Karten der letzten Hand – nur beim Host, nie in der Sicht),
//     places: [null | Platz], over: null | { winner, reason, points, ranking: [Sitze vom 1. Platz an] } }
// Züge: { type: 'fold' } | { type: 'check' } | { type: 'call' } | { type: 'raise', to } (to = Gesamteinsatz dieser
//   Setzrunde; to = eigener Einsatz + Stack = All-in). legalMoves liefert fold/check/call und zwei Erhöhungen
//   (Minimum, All-in); welche Beträge dazwischen gehen, sagt raiseRange().
// Tisch-Kommando (außerhalb der Reihe, applyAct): 'show' – eigene, verdeckt weggelegte Karten der letzten Hand zeigen.

import { evaluate as evalHand, handName, RANK_CHARS, SUIT_CHARS } from './eval.js';

export const id = 'holdem';
export const title = "Texas Hold'em";
export const PLAYERS = ['Spieler 1', 'Spieler 2', 'Spieler 3', 'Spieler 4', 'Spieler 5', 'Spieler 6', 'Spieler 7', 'Spieler 8'];
export const HIDDEN = true;

export const DECK = Object.freeze([...RANK_CHARS].reverse().flatMap((r) => [...SUIT_CHARS].map((s) => r + s)));   // AS AH AD AC KS …
export const BLIND_LEVELS = Object.freeze([
  [5, 10], [10, 20], [15, 30], [20, 40], [30, 60], [40, 80], [50, 100], [75, 150], [100, 200], [150, 300], [200, 400],
  [300, 600], [400, 800], [500, 1000], [700, 1400], [1000, 2000], [1500, 3000], [2000, 4000], [3000, 6000],
  [5000, 10000], [7500, 15000], [10000, 20000], [15000, 30000], [25000, 50000]].map(Object.freeze));
export const HANDS_PER_LEVEL = Object.freeze({ aus: Infinity, langsam: 22, normal: 15, schnell: 9 });
export const STARTS = Object.freeze([500, 1000, 2000, 5000]);
export const TIMERS = Object.freeze([0, 15, 30, 60]);
export const MAX_HANDS = 600;
export const SUIT_NAMES = Object.freeze({ S: 'Pik', H: 'Herz', D: 'Karo', C: 'Kreuz' });
export const RANK_NAMES = Object.freeze({ A: 'Ass', K: 'König', Q: 'Dame', J: 'Bube', T: '10' });
export const STREETS = Object.freeze(['Preflop', 'Flop', 'Turn', 'River']);

const CARD_SET = new Set(DECK);
const PHASES = new Set(['deal', 'bet', 'over']);
const FIELDS = { fold: new Set(['type']), check: new Set(['type']), call: new Set(['type']), raise: new Set(['type', 'to']) };
const isCard = (c) => typeof c === 'string' && CARD_SET.has(c);

export function cardName(card) {
  return isCard(card) ? `${SUIT_NAMES[card[1]]}-${RANK_NAMES[card[0]] || card[0]}` : '?';
}

export const fmtChips = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function normalizeOptions(opts) {
  const o = opts && typeof opts === 'object' ? opts : {};
  const p = Number(o.players), st = Number(o.start), tm = Number(o.timer);
  return {
    players: Number.isInteger(p) && p >= 2 && p <= 8 ? p : 4,
    start: STARTS.includes(st) ? st : 1000,
    blinds: Object.hasOwn(HANDS_PER_LEVEL, o.blinds) ? o.blinds : 'normal',
    timer: TIMERS.includes(tm) ? tm : 30
  };
}

const emptyStats = () => ({ h: 0, vpip: 0, pfr: 0, bet: 0, call: 0, fold: 0, face: 0, sd: 0, won: 0 });

function clone(s) {
  return {
    ...s, opts: { ...s.opts }, stacks: s.stacks.slice(), out: s.out.slice(), deck: s.deck.slice(),
    holes: s.holes.map((h) => h.slice()), board: s.board.slice(), bets: s.bets.slice(), contrib: s.contrib.slice(),
    folded: s.folded.slice(), allin: s.allin.slice(), matched: s.matched.slice(), shown: s.shown.slice(),
    log: s.log.slice(), startStacks: s.startStacks.slice(), vp: s.vp.slice(), pr: s.pr.slice(),
    stats: s.stats.map((x) => ({ ...x })), places: s.places.slice()
  };
}

function validState(s) {
  const n = s && s.opts && s.opts.players;
  return !!s && typeof s === 'object' && PHASES.has(s.phase) && Number.isInteger(n) && Array.isArray(s.stacks) &&
    s.stacks.length === n && Array.isArray(s.holes) && s.holes.length === n && Array.isArray(s.bets) &&
    Array.isArray(s.contrib) && Array.isArray(s.folded) && Array.isArray(s.allin) && Array.isArray(s.matched) &&
    Array.isArray(s.board) && Array.isArray(s.deck) && Array.isArray(s.out);
}

export function phase(state) {
  return state.phase;
}

// ---------- Sitze ----------

const nOf = (s) => s.opts.players;
const alive = (s, p) => s.out[p] === null;
// im Spiel dieser Hand (hat Karten, nicht ausgestiegen)
export const live = (s, p) => s.holes[p].length === 2 && !s.folded[p];
// kann noch handeln (im Spiel und nicht All-in)
const active = (s, p) => live(s, p) && !s.allin[p];

function nextSeat(s, from, pred) {
  const n = nOf(s);
  for (let k = 1; k <= n; k++) {
    const q = (from + k) % n;
    if (pred(q)) return q;
  }
  return null;
}

export const aliveSeats = (s) => [...Array(nOf(s)).keys()].filter((p) => alive(s, p));
export const liveSeats = (s) => [...Array(nOf(s)).keys()].filter((p) => live(s, p));
export const handsPerLevel = (opts) => HANDS_PER_LEVEL[opts.blinds];
export const blindsAt = (level) => BLIND_LEVELS[Math.min(level, BLIND_LEVELS.length - 1)];
export function levelFor(opts, hand) {
  const per = handsPerLevel(opts);
  return per === Infinity ? 0 : Math.min(BLIND_LEVELS.length - 1, Math.floor((hand - 1) / per));
}
// Hände bis zur nächsten Blind-Stufe (null = Blinds steigen nicht mehr)
export function handsToNextLevel(state) {
  const per = handsPerLevel(state.opts);
  if (per === Infinity || state.level >= BLIND_LEVELS.length - 1) return null;
  return per - ((state.hand - 1) % per);
}

// ---------- Ablauf ----------

function finish(s, winner, reason) {
  s.phase = 'over';
  s.turn = null;
  if (winner !== null) s.places[winner] = 1;
  const ranking = [...Array(nOf(s)).keys()].sort((a, b) => (s.places[a] ?? 99) - (s.places[b] ?? 99) || s.stacks[b] - s.stacks[a]);
  s.over = { winner, reason, points: 1, ranking };
  return s;
}

// neue Hand vorbereiten: Knopf, Blind-Stufe; Mischen steht aus
function startHand(s) {
  const al = aliveSeats(s);
  if (al.length <= 1) return finish(s, al.length ? al[0] : null, 'Turniersieg – alle Chips gewonnen');
  if (s.hand >= MAX_HANDS) {
    // Sicherheitsgrenze: die meisten Chips gewinnen; Plätze nach Chips
    const order = al.slice().sort((a, b) => s.stacks[b] - s.stacks[a]);
    order.forEach((p, i) => { s.places[p] = i + 1; });
    return finish(s, order[0], `hat nach ${MAX_HANDS} Händen die meisten Chips`);
  }
  const n = nOf(s);
  s.hand++;
  s.level = levelFor(s.opts, s.hand);
  [s.sbAmt, s.bbAmt] = blindsAt(s.level);
  s.button = s.hand === 1 ? (alive(s, 0) ? 0 : nextSeat(s, 0, (q) => alive(s, q))) : nextSeat(s, s.button, (q) => alive(s, q));
  if (al.length === 2) {
    s.sb = s.button;
    s.bb = nextSeat(s, s.button, (q) => alive(s, q));
  } else {
    s.sb = nextSeat(s, s.button, (q) => alive(s, q));
    s.bb = nextSeat(s, s.sb, (q) => alive(s, q));
  }
  s.phase = 'deal';
  s.deck = [];
  s.holes = Array.from({ length: n }, () => []);
  s.board = [];
  s.street = 0;
  s.bets = Array(n).fill(0);
  s.contrib = Array(n).fill(0);
  s.folded = Array(n).fill(false);
  s.allin = Array(n).fill(false);
  s.matched = Array(n).fill(-1);
  s.shown = Array(n).fill(false);
  s.vp = Array(n).fill(false);
  s.pr = Array(n).fill(false);
  s.startStacks = s.stacks.slice();
  s.log = [];
  s.turn = null;
  s.aggr = null;
  s.betTo = 0;
  s.minRaise = s.bbAmt;
  return s;
}

function put(s, p, amount) {
  const a = Math.min(amount, s.stacks[p]);
  s.stacks[p] -= a;
  s.bets[p] += a;
  s.contrib[p] += a;
  if (s.stacks[p] === 0) s.allin[p] = true;
  return a;
}

// nach dem Mischen: Blinds, Karten, erste Setzrunde
function deal(s) {
  const n = nOf(s);
  put(s, s.sb, s.sbAmt);
  put(s, s.bb, s.bbAmt);
  s.log.push({ s: s.sb, t: 'sb', a: s.bets[s.sb], st: 0 }, { s: s.bb, t: 'bb', a: s.bets[s.bb], st: 0 });
  s.betTo = s.bbAmt;
  s.minRaise = s.bbAmt;
  // reihum ab dem Small Blind je eine Karte, zweimal
  const order = [];
  for (let p = s.sb, k = 0; k < n; k++, p = (p + 1) % n) if (alive(s, p)) order.push(p);
  for (let r = 0; r < 2; r++) for (const p of order) s.holes[p].push(s.deck.shift());
  for (const p of order) s.stats[p].h++;
  s.phase = 'bet';
  s.street = 0;
  s.aggr = null;
  // zu zweit handelt der Knopf (= Small Blind) vor dem Flop zuerst, sonst der Platz nach dem Big Blind
  s.turn = null;
  return nextTurn(s, order.length === 2 ? (s.sb - 1 + n) % n : s.bb);
}

// muss Sitz p in dieser Setzrunde (noch) handeln?
function needsAct(s, p) {
  if (!active(s, p)) return false;
  if (s.bets[p] < s.betTo) return true;
  if (s.matched[p] >= 0) return false;
  // noch nicht gehandelt: nur sinnvoll, wenn noch jemand anderes setzen kann
  return liveSeats(s).some((q) => q !== p && !s.allin[q]);
}

// nächsten Sitz am Zug ab „from“ (exklusiv) suchen; sonst Setzrunde beenden
function nextTurn(s, from) {
  const q = nextSeat(s, from, (x) => needsAct(s, x));
  if (q !== null && liveSeats(s).length > 1) {
    s.turn = q;
    return s;
  }
  s.turn = null;
  return endStreet(s);
}

// nicht gegangenen Einsatz zurückgeben (höchster Einsatz über dem zweithöchsten)
function returnUncalled(s) {
  const n = nOf(s);
  let top = -1;
  for (let p = 0; p < n; p++) if (top < 0 || s.bets[p] > s.bets[top]) top = p;
  if (top < 0) return null;
  let second = 0;
  for (let p = 0; p < n; p++) if (p !== top) second = Math.max(second, s.bets[p]);
  const extra = s.bets[top] - second;
  if (extra <= 0) return null;
  s.bets[top] -= extra;
  s.contrib[top] -= extra;
  s.stacks[top] += extra;
  if (s.stacks[top] > 0) s.allin[top] = false;
  return { seat: top, amount: extra };
}

function endStreet(s) {
  const ret = returnUncalled(s);
  if (ret) s.returned = [...(s.returned || []), ret];
  const lv = liveSeats(s);
  if (lv.length === 1) return settle(s, lv[0]);
  s.bets = Array(nOf(s)).fill(0);
  s.betTo = 0;
  s.minRaise = s.bbAmt;
  s.matched = Array(nOf(s)).fill(-1);
  const canBet = lv.filter((p) => !s.allin[p]).length >= 2;
  if (!canBet) for (const p of lv) s.shown[p] = true;   // All-in: alle Hände offen, Rest wird ausgeteilt
  if (s.street === 3) return settle(s, null);
  // nächste Straße: Karte verbrennen, Flop 3 / Turn 1 / River 1
  s.deck.shift();
  const k = s.street === 0 ? 3 : 1;
  for (let i = 0; i < k; i++) s.board.push(s.deck.shift());
  s.street++;
  s.aggr = null;
  if (!canBet) return endStreet(s);
  return nextTurn(s, s.button);
}

// Pots aus den Einsätzen der ganzen Hand: Schichten bis zu jedem Einsatzniveau eines Spielers im Spiel
export function computePots(state) {
  const n = nOf(state);
  const lv = liveSeats(state);
  const caps = [...new Set(lv.map((p) => state.contrib[p]))].sort((a, b) => a - b);
  const pots = [];
  let prev = 0;
  for (const cap of caps) {
    let amount = 0;
    for (let q = 0; q < n; q++) amount += Math.max(0, Math.min(state.contrib[q], cap) - prev);
    const eligible = lv.filter((p) => state.contrib[p] >= cap);
    if (amount > 0) pots.push({ amount, eligible });
    prev = cap;
  }
  // Einsätze Ausgestiegener über dem höchsten Niveau (praktisch unmöglich) gehören zum letzten Pot
  let rest = 0;
  for (let q = 0; q < n; q++) rest += Math.max(0, state.contrib[q] - prev);
  if (rest) {
    if (pots.length) pots[pots.length - 1].amount += rest;
    else pots.push({ amount: rest, eligible: lv });
  }
  return pots;
}

// Pot-Summe (alles, was diese Hand gesetzt wurde)
export const potTotal = (state) => state.contrib.reduce((a, b) => a + b, 0);

// Abrechnen: uncontested = einziger übrig gebliebener Spieler, sonst Showdown
function settle(s, uncontested) {
  const n = nOf(s);
  const delta = Array(n).fill(0);
  const pots = computePots(s);
  const lastHoles = {};
  const shownCards = {};
  const mucked = [];
  let order = [];
  const outPots = [];
  if (uncontested !== null) {
    const amount = potTotal(s);
    s.stacks[uncontested] += amount;
    delta[uncontested] += amount;
    outPots.push({ amount, eligible: [uncontested], winners: [uncontested], value: null, name: null });
    lastHoles[uncontested] = s.holes[uncontested].slice();
    s.stats[uncontested].won++;
  } else {
    const lv = liveSeats(s);
    const val = {};
    for (const p of lv) val[p] = evalHand([...s.holes[p], ...s.board]);
    // Reihenfolge: letzter Aggressor auf dem River, sonst erster links vom Knopf
    const first = s.aggr !== null && live(s, s.aggr) ? s.aggr : nextSeat(s, s.button, (q) => live(s, q));
    for (let k = 0; k < n; k++) {
      const p = (first + k) % n;
      if (live(s, p)) order.push(p);
    }
    const allShown = lv.every((p) => s.shown[p]);
    const best = pots.map(() => -1);
    for (const p of order) {
      let mustShow = allShown;
      pots.forEach((pot, i) => { if (pot.eligible.includes(p) && val[p] >= best[i]) mustShow = true; });
      if (mustShow) {
        shownCards[p] = s.holes[p].slice();
        pots.forEach((pot, i) => { if (pot.eligible.includes(p)) best[i] = Math.max(best[i], val[p]); });
      } else {
        mucked.push(p);
        lastHoles[p] = s.holes[p].slice();
      }
      s.stats[p].sd++;
    }
    for (const pot of pots) {
      const cand = pot.eligible.filter((p) => shownCards[p]);
      const top = Math.max(...cand.map((p) => val[p]));
      const winners = cand.filter((p) => val[p] === top);
      // Platzfolge ab links vom Knopf
      winners.sort((a, b) => ((a - s.button - 1 + n) % n) - ((b - s.button - 1 + n) % n));
      const share = Math.floor(pot.amount / winners.length);
      let rem = pot.amount - share * winners.length;
      for (const w of winners) {
        const x = share + (rem > 0 ? 1 : 0);
        if (rem > 0) rem--;
        s.stacks[w] += x;
        delta[w] += x;
      }
      outPots.push({ amount: pot.amount, eligible: pot.eligible.slice(), winners, value: top, name: handName(top) });
    }
    for (const p of new Set(outPots.flatMap((x) => x.winners))) s.stats[p].won++;
  }
  for (let p = 0; p < n; p++) delta[p] -= s.contrib[p];
  // Ausscheiden: mehr Chips zu Beginn der Hand = besserer Platz
  const busted = [...Array(n).keys()].filter((p) => alive(s, p) && s.stacks[p] === 0);
  const remaining = aliveSeats(s).length - busted.length;
  busted.sort((a, b) => s.startStacks[b] - s.startStacks[a]);
  busted.forEach((p, i) => {
    const better = busted.findIndex((q) => s.startStacks[q] === s.startStacks[p]);
    s.places[p] = remaining + 1 + (better >= 0 ? better : i);
    s.out[p] = s.places[p];
  });
  s.lastHand = {
    no: s.hand, board: s.board.slice(), pots: outPots, shown: shownCards, mucked, order, delta,
    uncontested, returned: s.returned || [], busted, allin: s.shown.some(Boolean), level: s.level, button: s.button,
    sbAmt: s.sbAmt, bbAmt: s.bbAmt, log: s.log.slice()
  };
  s.lastHoles = lastHoles;
  s.returned = null;
  s.contrib = Array(n).fill(0);
  s.bets = Array(n).fill(0);
  s.holes = Array.from({ length: n }, () => []);
  s.shown = Array(n).fill(false);
  s.allin = Array(n).fill(false);
  s.folded = Array(n).fill(false);
  s.turn = null;
  return startHand(s);
}

// ---------- Zufall ----------

export function chance(state) {
  return state && state.phase === 'deal' ? { kind: 'shuffle', n: 52 } : null;
}

export function applyChance(state, perm) {
  const c = chance(state);
  if (!c) throw new Error('Kein Zufall ausstehend');
  if (!Array.isArray(perm) || perm.length !== 52) throw new Error('Permutation mit 52 Einträgen erwartet');
  const seen = new Set();
  for (const i of perm) {
    if (!Number.isInteger(i) || i < 0 || i >= 52 || seen.has(i)) throw new Error('Ungültige Permutation');
    seen.add(i);
  }
  const s = clone(state);
  s.deck = perm.map((i) => DECK[i]);
  return deal(s);
}

// ---------- API ----------

export function initialState(opts) {
  const o = normalizeOptions(opts), n = o.players;
  const s = {
    opts: o, phase: 'deal', hand: 0, level: 0, sbAmt: 0, bbAmt: 0, button: 0, sb: 0, bb: 0,
    stacks: Array(n).fill(o.start), out: Array(n).fill(null), deck: [], holes: Array.from({ length: n }, () => []),
    board: [], street: 0, bets: Array(n).fill(0), contrib: Array(n).fill(0), folded: Array(n).fill(false),
    allin: Array(n).fill(false), betTo: 0, minRaise: 0, matched: Array(n).fill(-1), turn: null, aggr: null,
    shown: Array(n).fill(false), log: [], startStacks: Array(n).fill(o.start), vp: Array(n).fill(false),
    pr: Array(n).fill(false), stats: Array.from({ length: n }, emptyStats), lastHand: null, lastHoles: {},
    returned: null, places: Array(n).fill(null), over: null
  };
  return startHand(s);
}

export function currentPlayer(state) {
  if (!state || state.phase !== 'bet') return null;
  return state.turn;
}

export function result(state) {
  return (state && state.over) || null;
}

export const toCall = (state, p = state.turn) => Math.max(0, Math.min(state.betTo - state.bets[p], state.stacks[p]));

// erlaubte Erhöhung des Sitzes am Zug: { min, max } (Gesamteinsatz der Runde) oder null
export function raiseRange(state) {
  if (!state || state.phase !== 'bet' || state.turn === null) return null;
  const p = state.turn;
  const max = state.bets[p] + state.stacks[p];
  if (max <= state.betTo) return null;                                  // reicht nur zum Mitgehen
  if (state.matched[p] >= 0 && state.betTo - state.matched[p] < state.minRaise) return null;   // nicht wieder offen
  if (!liveSeats(state).some((q) => q !== p && !state.allin[q])) return null;                  // alle anderen All-in
  const min = Math.min(max, state.betTo + state.minRaise);
  return { min, max };
}

export function legalMoves(state) {
  try {
    if (!validState(state) || currentPlayer(state) === null) return [];
    const p = state.turn, out = [];
    const need = state.betTo - state.bets[p];
    if (need > 0) out.push({ type: 'fold' }, { type: 'call' });
    else out.push({ type: 'check' });
    const r = raiseRange(state);
    if (r) {
      out.push({ type: 'raise', to: r.min });
      if (r.max !== r.min) out.push({ type: 'raise', to: r.max });
    }
    return out;
  } catch {
    return [];
  }
}

// Prüft Form und Regeln; wirft nie (Müll → false)
export function isLegal(state, move) {
  try {
    if (!validState(state) || currentPlayer(state) === null) return false;
    if (!move || typeof move !== 'object' || Array.isArray(move)) return false;
    if (typeof move.type !== 'string' || !Object.hasOwn(FIELDS, move.type)) return false;
    for (const k of Object.keys(move)) if (!FIELDS[move.type].has(k)) return false;
    const p = state.turn, need = state.betTo - state.bets[p];
    switch (move.type) {
      case 'fold': case 'call': return need > 0;
      case 'check': return need <= 0;
      case 'raise': {
        if (!Number.isInteger(move.to)) return false;
        const r = raiseRange(state);
        return !!r && move.to >= r.min && move.to <= r.max;
      }
    }
    return false;
  } catch {
    return false;
  }
}

// Neuer Zustand; state bleibt unverändert. Wirft bei illegalem Zug.
export function applyMove(state, move) {
  if (!isLegal(state, move)) throw new Error(`Illegaler Zug: ${JSON.stringify(move)}`);
  const s = clone(state);
  const p = s.turn, st = s.stats[p], street = s.street;
  const facing = s.betTo - s.bets[p] > 0;
  if (street > 0 && facing) st.face++;
  switch (move.type) {
    case 'fold':
      s.folded[p] = true;
      if (street > 0) st.fold++;
      s.log.push({ s: p, t: 'fold', a: 0, st: street });
      break;
    case 'check':
      s.matched[p] = s.bets[p];
      s.log.push({ s: p, t: 'check', a: 0, st: street });
      break;
    case 'call': {
      const a = put(s, p, s.betTo - s.bets[p]);
      s.matched[p] = s.bets[p];
      if (street === 0 && !s.vp[p]) { s.vp[p] = true; st.vpip++; }
      if (street > 0) st.call++;
      s.log.push({ s: p, t: 'call', a, st: street, to: s.bets[p], allin: s.allin[p] });
      break;
    }
    case 'raise': {
      const before = s.betTo;
      put(s, p, move.to - s.bets[p]);
      const size = move.to - before;
      if (size >= s.minRaise) s.minRaise = size;      // volle Erhöhung (sonst unvollständiges All-in)
      s.betTo = move.to;
      s.matched[p] = move.to;
      s.aggr = p;
      if (street === 0) {
        if (!s.vp[p]) { s.vp[p] = true; st.vpip++; }
        if (!s.pr[p]) { s.pr[p] = true; st.pfr++; }
      } else st.bet++;
      s.log.push({ s: p, t: before === 0 ? 'bet' : 'raise', a: move.to, st: street, allin: s.allin[p], full: size >= s.minRaise });
      break;
    }
  }
  return nextTurn(s, p);
}

// Tisch-Kommandos außerhalb der Reihe (siehe table.js): 'show' = eigene weggelegte Karten der letzten Hand zeigen
export const ACTS = Object.freeze(['show']);
export function isLegalAct(state, seat, act) {
  return act === 'show' && !!state && !!state.lastHand && !!state.lastHoles && Number.isInteger(seat) &&
    Array.isArray(state.lastHoles[seat]) && !state.lastHand.shown[seat];
}
export function applyAct(state, seat, act) {
  if (!isLegalAct(state, seat, act)) throw new Error('Kommando nicht erlaubt');
  const s = clone(state);
  s.lastHand = { ...s.lastHand, shown: { ...s.lastHand.shown, [seat]: s.lastHoles[seat].slice() } };
  s.lastHoles = { ...s.lastHoles };
  delete s.lastHoles[seat];
  return s;
}
export const describeAct = (state, seat, act) => (act === 'show' ? 'zeigt die Karten' : '?');

// Zeitlimit / Spieler weg: checken, wenn es nichts kostet, sonst aussteigen
export function timeoutMove(state) {
  if (currentPlayer(state) === null) return null;
  return state.betTo - state.bets[state.turn] > 0 ? { type: 'fold' } : { type: 'check' };
}

export function describeMove(state, move) {
  if (!move || typeof move !== 'object') return '?';
  try {
    const p = state.turn;
    switch (move.type) {
      case 'fold': return 'steigt aus';
      case 'check': return 'checkt';
      case 'call': {
        const a = toCall(state, p);
        return a >= state.stacks[p] ? `geht mit – All-in (${fmtChips(a)})` : `geht mit (${fmtChips(a)})`;
      }
      case 'raise': {
        const allin = move.to === state.bets[p] + state.stacks[p];
        if (allin) return `geht All-in (${fmtChips(move.to)})`;
        return state.betTo === 0 ? `setzt ${fmtChips(move.to)}` : `erhöht auf ${fmtChips(move.to)}`;
      }
    }
  } catch { /* unten */ }
  return '?';
}

// Was hat der letzte Zug ausgelöst? (für Anzeige, Tempo, Meldungen; nur aus dem neuen Zustand ablesbar)
//   { handEnd, showdown, runout: neu aufgedeckte Board-Karten, streetEnd }
export function lastMoveEffect(gs) {
  if (!gs || !Array.isArray(gs.log)) return {};
  const acts = gs.log.filter((e) => e.t !== 'sb' && e.t !== 'bb');
  if (gs.lastHand && (gs.phase === 'over' || acts.length === 0)) {
    const lh = gs.lastHand;
    const last = (lh.log || []).filter((e) => e.t !== 'sb' && e.t !== 'bb').pop();
    const from = last ? last.st : 0;
    return { handEnd: true, showdown: lh.uncontested === null, runout: Math.max(0, lh.board.length - [0, 3, 4, 5][from]) };
  }
  const last = acts[acts.length - 1];
  if (last && last.st < gs.street) return { streetEnd: true, runout: gs.board.length - [0, 3, 4, 5][last.st] };
  return {};
}

// ---------- Sicht ----------

// Stapel verdeckt, fremde Hole Cards verdeckt (außer All-in aufgedeckt), weggelegte Karten der letzten Hand weg.
// seat = null (Zuschauer): keine Hole Cards.
export function viewFor(state, seat) {
  const s = clone(state);
  const me = Number.isInteger(seat) && seat >= 0 && seat < nOf(s) ? seat : -1;
  s.deck = s.deck.map(() => null);
  s.holes = s.holes.map((h, q) => (q === me || s.shown[q] ? h : h.map(() => null)));
  s.lastHoles = {};
  if (me >= 0 && state.lastHoles && state.lastHoles[me]) s.lastHoles[me] = state.lastHoles[me].slice();
  return s;
}

// ---------- Bewertung ----------

// Einheit Chips: eigene Chips (inkl. Einsatz dieser Hand) minus Durchschnitt der Lebenden. „Wer gewinnt?“ rechnet
// für Hold'em eigens (Gewinnchance der Hand, siehe evalpos.js); das hier ist die Turnier-Lage.
export function evaluate(state, seat) {
  if (!state || !Array.isArray(state.stacks) || typeof state.stacks[seat] !== 'number') return 0;
  const al = aliveSeats(state);
  if (!al.length) return 0;
  const tot = (p) => state.stacks[p] + (state.contrib ? state.contrib[p] : 0);
  return tot(seat) - al.reduce((a, p) => a + tot(p), 0) / al.length;
}
