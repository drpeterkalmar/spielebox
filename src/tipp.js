// „💡 Tipp“ (n11): empfohlener Zug für den Spieler am Zug – Quelle ist der starke Computer (Stufe 3, ohne absichtliche
// Fehler, Rechenzeit wie Stufe 3). Rein, ohne DOM; läuft im Bot-Worker (botworker.js) bzw. ersatzweise im Hauptthread.
// Fair Play: Spiele mit verdeckten Karten/Schiffen rechnen nur mit der Sicht des Spielers (viewFor) – genau das,
// was der Computer-Gegner auch bekommt. Der Tipp zieht nie selbst; er liefert nur:
//   { move, marks: [{ at, kind: 'von'|'nach'|'weg' }], acts: [data-act der Knöpfe], els: [CSS-Auswahl im Brett], text }
// at = Argument für view.target(at) der Brett-Ansicht. Kein Satz ist besser als ein falscher: Gründe nur, wo sie sich
// sicher aus dem Zug ableiten lassen.
import { GAMES } from './games/registry.js';
import { loadBot, TIME } from './games/bots.js';
import { equity as holdemEquity } from './games/holdem/equity.js';
import { mulberry32 } from './rng.js';

export const TIPP_LEVEL = 3;

// Sicht des Sitzes (verdeckte Informationen weg)
export function tipView(game, gs, seat) {
  const E = GAMES[game].engine;
  return E.HIDDEN ? E.viewFor(gs, seat) : gs;
}

// empfohlener Zug + Erklärung; opts.rng / opts.timeMs / opts.bot (Attrappe) nur für Tests
export async function suggest(game, gs, seat, opts = {}) {
  const E = GAMES[game].engine;
  const view = tipView(game, gs, seat);
  if (E.currentPlayer(view) !== seat) return null;
  const legal = E.legalMoves(view);
  if (!legal.length) return null;
  // Schiffe versenken beim Aufstellen: jede erlaubte Aufstellung ist gleich gut – kein Tipp statt eines falschen
  if (game === 'schiffe' && legal.every((m) => m.type === 'place')) return { move: null, none: 'Beim Aufstellen gibt es keinen Tipp – jede erlaubte Aufstellung ist gleich gut' };
  const bot = opts.bot || await loadBot(game);
  const move = bot(view, { level: TIPP_LEVEL, timeMs: opts.timeMs || TIME[TIPP_LEVEL], fehler: 0, ...(opts.rng ? { rng: opts.rng } : {}) });
  if (!move) return null;
  let info = { marks: [], acts: [], els: [], text: '' };
  try { info = { ...info, ...explain(game, view, move, seat) }; } catch { /* Erklärung ist Zugabe */ }
  return { move, ...info };   // info.move (selten) ersetzt den Zug durch den nächstliegenden, den es als Knopf gibt
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Markierungen und Grund je Spiel (view = Sicht des Spielers vor dem Zug)
export function explain(game, s, m, seat) {
  const E = GAMES[game].engine;
  const fn = EXPLAIN[game];
  return fn ? fn(E, s, m, seat) : { marks: [], acts: [], text: '' };
}

const EXPLAIN = {
  reversi(E, s, m) {
    if (m.pass) return { acts: ['pass'], text: 'Kein Feld möglich – passen' };
    const name = E.squareName(m.i), n = E.flipsFor(s, m.i).length;
    const next = E.applyMove(s, m);
    const opp = next.over ? 0 : next.turn === s.turn ? 0 : E.legalMoves(next).filter((x) => !x.pass).length;
    let why;
    if ([0, 7, 56, 63].includes(m.i)) why = 'Ecke sichern';
    else if (!next.over && opp === 0) why = 'Gegner muss passen';
    else if (opp <= 2 && !next.over) why = `lässt dem Gegner nur ${plural(opp, 'Zug', 'Züge')}`;
    else why = `dreht ${n} um`;
    return { marks: [{ at: m.i, kind: 'nach' }], text: `${name}: ${why}` };
  },
  schach(E, s, m) {
    const san = E.describeMove(s, m);
    const why = san.includes('#') ? 'setzt matt' : san.includes('+') ? (san.includes('x') ? 'schlägt und gibt Schach' : 'gibt Schach') : san.includes('x') ? 'schlägt' : '';
    return { marks: [{ at: m.from, kind: 'von' }, { at: m.to, kind: 'nach' }], text: why ? `${san}: ${why}` : san };
  },
  muehle(E, s, m) {
    const marks = [];
    if (m.from !== undefined) marks.push({ at: m.from, kind: 'von' });
    marks.push({ at: m.to, kind: 'nach' });
    if (m.remove !== undefined) marks.push({ at: m.remove, kind: 'weg' });
    let why = '';
    if (m.remove !== undefined) why = 'schließt eine Mühle';
    else {
      // hätte der Gegner auf diesem Feld eine Mühle geschlossen? (gleiche Stellung, Gegner am Zug)
      try {
        const flip = { ...s, turn: 1 - s.turn, over: null };
        if (E.legalMoves(flip).some((x) => x.to === m.to && x.remove !== undefined)) why = 'verhindert eine Mühle';
      } catch { /* dann ohne Grund */ }
    }
    const d = E.describeMove(s, m);
    return { marks, text: why ? `${d}: ${why}` : d };
  },
  dame(E, s, m) {
    const to = m.path[m.path.length - 1];
    const marks = [{ at: m.from, kind: 'von' }, { at: to, kind: 'nach' }];
    for (const c of m.cap || []) marks.push({ at: c, kind: 'weg' });
    const n = (m.cap || []).length;
    return { marks, text: `${E.describeMove(s, m)}${n ? `: schlägt ${plural(n, 'Stein', 'Steine')}` : ''}` };
  },
  halma(E, s, m) {
    if (m.pass) return { acts: ['pass'], text: 'Aussetzen' };
    return { marks: [{ at: m.from, kind: 'von' }, { at: m.path[m.path.length - 1], kind: 'nach' }], text: m.path.length > 1 ? `Sprungkette mit ${m.path.length} Sprüngen` : '' };
  },
  vier(E, s, m) {
    const next = E.applyMove(s, m);
    let why = '';
    if (next.over && next.over.winner === s.turn) why = 'gewinnt sofort';
    else {
      try {
        const flip = { ...s, turn: 1 - s.turn, over: null };
        const r = E.result(E.applyMove(flip, m));
        if (r && r.winner === 1 - s.turn) why = 'verhindert eine Vier des Gegners';
      } catch { /* ohne Grund */ }
    }
    return { marks: [{ at: m.col, kind: 'nach' }], text: `Spalte ${m.col + 1}${why ? `: ${why}` : ''}` };
  },
  backgammon(E, s, m) {
    if (m.type === 'roll') return { acts: ['roll'], text: 'Würfeln' };
    if (m.type === 'double') return { acts: ['double'], text: 'Verdoppeln' };
    if (m.type === 'take') return { acts: ['take'], text: 'Annehmen' };
    if (m.type === 'drop') return { acts: ['drop'], text: 'Aufgeben – Annehmen wäre zu teuer' };
    if (m.type !== 'play') return {};
    if (!m.steps || !m.steps.length) return { acts: ['pass'], text: 'Kein Zug möglich' };
    const pt = (p) => (p === 'bar' || (Number.isInteger(p) && p >= 1 && p <= 24) ? p : null);
    const marks = [];
    for (const st of m.steps) {
      const f = pt(st.from), t = pt(st.to);
      if (f !== null && !marks.some((x) => x.at === f)) marks.push({ at: f, kind: 'von' });
      if (t !== null && !marks.some((x) => x.at === t)) marks.push({ at: t, kind: 'nach' });
    }
    let hits = 0;
    try { hits = E.applySteps(s, m.steps).hits || 0; } catch { /* egal */ }
    const d = E.describeMove(s, m);
    return { marks, text: hits ? `${d}: wirft ${plural(hits, 'Stein', 'Steine')} raus` : d };
  },
  ludo(E, s, m, seat) {
    if (m.type === 'roll') return { acts: ['roll'], marks: [{ at: 'die', kind: 'nach' }], text: 'Würfeln' };
    const next = E.applyMove(s, m);
    const d = E.describeMove(s, m).replace(/^[^:]*: /, '');
    let why = '';
    if (next.last && next.last.capture) why = 'wirft raus';
    return { marks: [{ at: [seat, m.piece], kind: 'nach' }], text: why ? `${d} – ${why}` : d };
  },
  schiffe(E, s, m) {
    if (m.type !== 'shot') return {};
    const r = Math.floor(m.i / 10), c = m.i % 10;
    return { marks: [{ at: m.i, kind: 'nach' }], text: `Feld ${'ABCDEFGHIJ'[c]}${r + 1}` };
  },
  paare(E, s, m) {
    const known = (s.memory || []).some(([i]) => i === m.flip);
    let why = '';
    if (s.open.length && known && s.cards[s.open[0]] !== null && (s.memory || []).some(([i, x]) => i === m.flip && x === s.cards[s.open[0]])) why = 'die Partnerin war schon offen';
    return { marks: [{ at: m.flip, kind: 'nach' }], text: why };
  },
  wuerfel(E, s, m) {
    if (m.type === 'roll') {
      if (s.phase === 'roll') return { acts: ['roll'], text: 'Würfeln' };
      const marks = m.hold.map((x, k) => (x ? { at: k, kind: 'nach' } : null)).filter(Boolean);
      const held = s.dice.filter((_, k) => m.hold[k]).sort((a, b) => a - b);
      return { marks, acts: ['roll'], text: held.length ? `${held.join(', ')} halten und würfeln` : 'Alle Würfel neu würfeln' };
    }
    if (m.type === 'score') {
      const pts = E.scoreFor(s.dice, m.cat, s.sheets[s.turn], s.opts);
      return { els: [`[data-cat="${m.cat}"]`], acts: ['score'], text: `${E.CAT_NAME ? E.CAT_NAME[m.cat] : m.cat}: ${pts ? `+${pts}` : 'streichen (0)'}` };
    }
    return {};
  },
  maumau(E, s, m) {
    if (m.type === 'draw') return { acts: ['draw'], marks: [{ at: 'stock', kind: 'nach' }], text: s.penalty > 0 ? `${s.penalty} Karten ziehen` : 'Karte ziehen' };
    if (m.type === 'pass') return { acts: ['pass'], text: 'Weiter' };
    const parts = [E.cardName(m.card)];
    if (m.wish) parts.push(`${E.SUIT_NAMES[m.wish]} wünschen`);
    if (m.mau) parts.push('„Mau“ sagen!');
    return { marks: [{ at: m.card, kind: 'nach' }], acts: [...(m.mau ? ['mau'] : []), ...(m.wish ? ['wish-' + m.wish] : [])], text: parts.join(' · ') };
  },
  schnapsen(E, s, m, seat) {
    if (m.type === 'ansagen') return { acts: ['ansagen-' + m.suit], text: `${m.suit === s.atout ? 40 : 20} ansagen` };
    if (m.type === 'tauschen') return { acts: ['tauschen'], text: 'Atout-Unter tauschen' };
    if (m.type === 'zudrehen') return { acts: ['zudrehen'], text: 'Zudrehen' };
    if (m.type === 'ausmelden') return { acts: ['ausmelden'], text: 'Ausmelden – du hast 66' };
    if (m.type === 'weiter') return { acts: ['weiter'], text: '' };
    if (m.type !== 'play') return {};
    let why = '';
    if (s.trick.length === 1) why = E.trickWinner([s.trick[0], { seat, card: m.card }], s.atout) === seat ? 'gewinnt den Stich' : 'gibt den Stich ab';
    return { marks: [{ at: m.card, kind: 'nach' }], text: why ? `${E.cardName(m.card)}: ${why}` : E.cardName(m.card) };
  },
  blackjack(E, s, m, seat) {
    if (m.type === 'bet') {
      // Knöpfe wie in ui.js (1, 2, 5, 10, 20, 50, alles); krumme Beträge des Computers → nächstliegender Knopf
      const max = Math.max(...E.legalMoves(s).filter((x) => x.type === 'bet').map((x) => x.amount));
      const picks = [...new Set([1, 2, 5, 10, 20, 50].filter((x) => x <= max).concat([max]))];
      const a = picks.reduce((b, x) => (Math.abs(x - m.amount) < Math.abs(b - m.amount) ? x : b), picks[0]);
      return { move: { type: 'bet', amount: a }, acts: ['bet-' + a], text: `Einsatz ${a}` };
    }
    const LABEL = { hit: 'Ziehen', stand: 'Stehen', double: 'Verdoppeln', split: 'Teilen' };
    const hand = s.hands && s.hands[seat] && s.hands[seat][s.hand];
    const v = hand ? E.handValue(hand.cards) : null;
    const up = s.bankCards && s.bankCards[0] ? E.handValue([s.bankCards[0]]).total : null;
    const what = v && up ? `${v.soft ? 'weiche ' : ''}${v.total} gegen ${up === 11 ? 'Ass' : up} der Bank` : '';
    return { acts: [m.type], text: what ? `${LABEL[m.type]} (${what})` : LABEL[m.type] || '' };
  },
  holdem(E, s, m, seat) {
    const ACT = { fold: 'fold', check: 'check', call: 'call', raise: 'raise' };
    const call = E.toCall(s, seat), pot = E.potTotal(s);
    let acts = [ACT[m.type]];
    if (m.type === 'raise') { const rr = E.raiseRange(s); if (rr && m.to >= rr.max) acts = ['allin', 'raise']; }
    // Gewinnchance nur mit den eigenen Karten und dem offenen Board (gegen zufällige Hände)
    const opp = E.liveSeats(s).filter((q) => q !== seat).length;
    const hole = s.holes && s.holes[seat];
    let eq = null;
    // Zufall aus den sichtbaren Karten: gleiche Sicht → gleiche Zahl
    const seed = [...(hole || []), ...s.board].join('').split('').reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 7);
    if (hole && hole[0] && opp) eq = holdemEquity(hole, s.board, Array(opp).fill(null), { iters: 2000, rng: mulberry32(seed >>> 0) }).eq;
    const odds = call > 0 ? call / (pot + call) : 0;
    const word = { fold: 'Aussteigen', check: 'Checken', call: 'Mitgehen', raise: s.betTo === 0 ? 'Setzen' : 'Erhöhen' }[m.type];
    let why = '';
    if (eq !== null) why = call > 0 && (m.type === 'call' || m.type === 'fold') ? `${Math.round(eq * 100)} % Chance, nötig ${Math.round(odds * 100)} %` : `${Math.round(eq * 100)} % Chance`;
    const amt = m.type === 'raise' ? ` auf ${E.fmtChips(m.to)}` : '';
    return { acts, text: why ? `${word}${amt} – ${why}` : `${word}${amt}` };
  }
};
