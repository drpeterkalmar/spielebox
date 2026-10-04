// Computer für Texas Hold'em (rein, ohne DOM). Bekommt nur die Sicht des Sitzes am Zug (viewFor): eigene Karten,
// Board, öffentliche Einsätze, die Züge dieser Hand (log) und die öffentliche Statistik (stats) – nie fremde Karten.
//
// level 1 = leicht: lockerer Mitspieler. Spielt viele Hände, geht oft mit, setzt mit guten Händen, blufft selten.
// level 2 = mittel: Startkarten-Tabellen nach Position, Push/Fold mit sehr wenig Chips; nach dem Flop Gewinnchance
//           per Monte-Carlo gegen geschätzte Hand-Bereiche (Erhöher eng, Mitgeher breiter), Pot-Odds,
//           gelegentliche Bluffs und Semibluffs (Fortsetzungs-Einsatz als Erhöher).
// level 3 = stark: wie mittel, dazu Push/Fold-Tabellen nach Stack-Tiefe (≤ 12 Big Blinds) und Position, Bereiche
//           nach jeder Aktion des Gegners eingegrenzt (Einsatz/Erhöhung = stärker, Mitgehen = Mittelfeld), Einsatz-
//           größen nach Board (trocken ⅓, mittel ½, nass ¾ Pot – gleich für Werthände und Bluffs, Bluff-Anteil passend
//           zur Größe), merkt sich Gegner-Tendenzen dieser Partie (VPIP, PFR, Aggression, Aussteigen nach Einsatz)
//           und nutzt sie: gegen Mitgeher weniger Bluffs, gegen Ängstliche mehr; Stack-Tiefe (SPR) bestimmt, wann
//           alles hineingeht.
import * as E from './engine.js';
import { evaluate as evalCards, cardIndex, draws as drawInfo, category } from './eval.js';
import { handClass, PERCENTILE, preflopEquity, rangeTop, RANDOM_RANGE, equity, strengthOn, masksOf, hasDraw } from './equity.js';

const ITERS = { 1: 0, 2: 900, 3: 1400 };

// ---------- Lage am Tisch ----------
function situation(view) {
  const p = view.turn, n = view.opts.players;
  const hole = view.holes[p], board = view.board;
  const bb = view.bbAmt;
  const pot = E.potTotal(view);
  const call = E.toCall(view, p);
  const stack = view.stacks[p];
  const live = E.liveSeats(view);
  const opps = live.filter((q) => q !== p);
  const rr = E.raiseRange(view);
  const myTotal = stack + view.bets[p];
  const oppMax = Math.max(0, ...opps.map((q) => view.stacks[q] + view.bets[q]));
  const eff = Math.min(myTotal, oppMax);
  // wer handelt in dieser Runde noch nach mir (aktiv, nicht All-in)?
  const order = [];
  if (view.street === 0) {
    const first = E.aliveSeats(view).length === 2 ? view.sb : (view.bb + 1) % n;
    for (let k = 0; k < n; k++) order.push((first + k) % n);
  } else for (let k = 1; k <= n; k++) order.push((view.button + k) % n);
  const inHand = order.filter((q) => E.live(view, q) && !view.allin[q]);
  const behind = inHand.slice(inHand.indexOf(p) + 1).length;
  const st0 = view.log.filter((e) => e.st === 0);
  const raises = st0.filter((e) => e.t === 'raise' || e.t === 'bet');
  const limpers = st0.filter((e) => e.t === 'call' && e.a <= bb).length;
  const cls = handClass(hole[0], hole[1]);
  return {
    p, n, hole, board, bb, pot, call, stack, live, opps, rr, eff, effBB: eff / bb, behind, raises, limpers, cls,
    pct: PERCENTILE[cls], street: view.street, heads: E.aliveSeats(view).length === 2,
    odds: call > 0 ? call / (pot + call) : 0, iAmBB: p === view.bb, iAmSB: p === view.sb, iAmBtn: p === view.button
  };
}

// Erhöhen auf einen Zielbetrag (in Grenzen), nahe am All-in → All-in
function raiseTo(view, x, sit) {
  const rr = sit.rr;
  if (!rr) return sit.call > 0 ? { type: 'call' } : { type: 'check' };
  let to = Math.round(x);
  const unit = sit.bb >= 100 ? 10 : 5;
  to = Math.round(to / unit) * unit;
  to = Math.max(rr.min, Math.min(rr.max, to));
  if (to >= rr.max * 0.72) to = rr.max;
  return { type: 'raise', to };
}
const allIn = (view, sit) => (sit.rr ? { type: 'raise', to: sit.rr.max } : sit.call > 0 ? { type: 'call' } : { type: 'check' });
const passive = (sit) => (sit.call > 0 ? { type: 'call' } : { type: 'check' });
const foldOrCheck = (sit) => (sit.call > 0 ? { type: 'fold' } : { type: 'check' });
// Einsatz als Anteil des Pots (bei Einsatz vor mir: Erhöhung um den Anteil des Pots nach meinem Mitgehen)
const potBet = (view, sit, f) => raiseTo(view, view.betTo + f * (sit.pot + sit.call), sit);

// gemachte Hand nach dem Flop: Kategorie mit/ohne eigene Karten, Top-Paar usw.
function made(sit) {
  const all = [...sit.hole, ...sit.board];
  const v = evalCards(all);
  const cat = category(v);
  const boardCat = sit.board.length >= 5 ? category(evalCards(sit.board)) : boardCategory(sit.board);
  const ranks = sit.board.map((c) => cardIndex(c) >> 2).sort((a, b) => b - a);
  const hr = sit.hole.map((c) => cardIndex(c) >> 2);
  const topPair = cat === 1 && hr.includes(ranks[0]);
  const overPair = cat === 1 && hr[0] === hr[1] && hr[0] > ranks[0];
  const d = sit.board.length < 5 ? drawInfo(all) : { flush: false, straight: null };
  return { v, cat, improves: cat > boardCat, topPair, overPair, flushDraw: d.flush, straightDraw: d.straight };
}
function boardCategory(board) {
  const r = board.map((c) => cardIndex(c) >> 2);
  const cnt = {};
  for (const x of r) cnt[x] = (cnt[x] || 0) + 1;
  const m = Math.max(0, ...Object.values(cnt));
  return m >= 3 ? 3 : m === 2 ? (Object.values(cnt).filter((x) => x === 2).length === 2 ? 2 : 1) : 0;
}

// ---------- leicht ----------
function easy(view, sit, rng) {
  if (sit.street === 0) {
    const raised = sit.raises.length > 0;
    if (!raised) {
      if (sit.pct < 8 && rng() < 0.6) return raiseTo(view, 3 * sit.bb, sit);
      if (sit.pct < 70 || sit.call === 0) return passive(sit);
      return rng() < 0.2 ? passive(sit) : foldOrCheck(sit);
    }
    if (sit.pct < 4 && rng() < 0.5) return raiseTo(view, view.betTo * 2.5, sit);
    if (sit.pct < 4) return passive(sit);   // ganz starke Hände nie weg
    if (sit.pct < 45 && sit.call <= sit.stack * 0.3) return passive(sit);
    if (sit.pct < 75 && sit.call <= 3 * sit.bb) return passive(sit);
    return rng() < 0.08 ? passive(sit) : foldOrCheck(sit);
  }
  const m = made(sit);
  const strong = m.improves && (m.cat >= 2 || m.topPair || m.overPair);
  const some = m.improves || m.flushDraw || m.straightDraw === 'open';
  if (sit.call === 0) {
    if (strong && rng() < 0.65) return potBet(view, sit, 0.5);
    if (some && rng() < 0.2) return potBet(view, sit, 0.4);
    if (rng() < 0.04) return potBet(view, sit, 0.5);
    return { type: 'check' };
  }
  if (strong) return m.cat >= 3 && rng() < 0.25 ? potBet(view, sit, 0.7) : passive(sit);
  if (some) return sit.call <= sit.pot * 0.8 || rng() < 0.4 ? passive(sit) : { type: 'fold' };
  return sit.call <= sit.pot * 0.45 && rng() < 0.35 ? passive(sit) : { type: 'fold' };
}

// ---------- gemeinsame Bereiche ----------
// Gegner-Statistik dieser Partie (geglättet: unbekannte Gegner gelten als durchschnittlich)
function tendency(view, q) {
  const st = view.stats[q] || {};
  const h = st.h || 0;
  const vpip = (((st.vpip || 0) + 3 * 0.3) / (h + 3)) * 100;
  const pfr = (((st.pfr || 0) + 3 * 0.15) / (h + 3)) * 100;
  const af = ((st.bet || 0) + 1) / ((st.call || 0) + 1);
  const foldToBet = ((st.fold || 0) + 2 * 0.45) / ((st.face || 0) + 2);
  return { vpip, pfr, af, foldToBet, hands: h };
}

// Preflop-Bereich eines Gegners aus seinen Zügen dieser Hand
function preflopRange(view, q, level) {
  const acts = view.log.filter((e) => e.s === q && e.st === 0);
  const heads = E.aliveSeats(view).length === 2;
  const tnd = level >= 3 ? tendency(view, q) : null;
  const nRaise = acts.filter((e) => e.t === 'raise' || e.t === 'bet').length;
  const allin = acts.some((e) => e.allin);
  if (nRaise >= 2) return rangeTop(heads ? 12 : 5);
  if (nRaise === 1) {
    let w = heads ? 45 : 18;
    if (tnd && tnd.hands >= 8) w = Math.max(4, Math.min(70, tnd.pfr * (heads ? 1.3 : 1)));
    if (allin && view.bbAmt * 15 < E.potTotal(view)) w = Math.min(w, 25);
    return rangeTop(w);
  }
  if (acts.some((e) => e.t === 'call')) {
    let w = heads ? 70 : 45;
    if (tnd && tnd.hands >= 8) w = Math.max(15, Math.min(95, tnd.vpip));
    return rangeTop(w, heads ? 0 : 4);
  }
  return RANDOM_RANGE;   // Big Blind ohne Erhöhung / nur Blind gesetzt
}

// Bereich nach den Zügen nach dem Flop eingrenzen (stark): Einsatz/Erhöhung → stärkere Hälfte, Mitgehen → ohne
// das schwächste Viertel; Draws bleiben teilweise drin.
function narrow(view, q, range, level) {
  if (level < 3) return range;
  const tnd = tendency(view, q);
  let r = range;
  for (let st = 1; st <= view.street; st++) {
    const acts = view.log.filter((e) => e.s === q && e.st === st);
    if (!acts.length) continue;
    const b = view.board.slice(0, st === 1 ? 3 : st === 2 ? 4 : 5);
    const bm = masksOf(b);
    const river = b.length >= 5;
    const scored = r.map(([x, y, w]) => [x, y, w, strengthOn(x, y, bm), !river && hasDraw(x, y, bm)]);
    const total = scored.reduce((a, e) => a + e[2], 0);
    const sorted = scored.slice().sort((a2, b2) => a2[3] - b2[3]);
    const at = (frac) => { let acc = 0; for (const e of sorted) { acc += e[2]; if (acc >= frac * total) return e[3]; } return Infinity; };
    for (const a of acts) {
      let keep = null, drawW = 0.5;
      // aggressive Gegner setzen auch mit Schwächerem, passive nur mit Gutem
      const loose = tnd.hands >= 8 ? Math.max(0.2, Math.min(0.8, 0.45 / Math.max(0.5, tnd.af))) : 0.45;
      if (a.t === 'raise') { keep = at(Math.min(0.85, 0.55 + loose * 0.3)); drawW = 0.4; }
      else if (a.t === 'bet') keep = at(loose);
      else if (a.t === 'call') keep = at(0.25);
      if (keep === null) continue;
      r = scored.map(([x, y, w, s, d]) => [x, y, s >= keep ? w : d ? w * drawW : w * 0.05]);
    }
  }
  return r;
}
// Board-Struktur: 0 trocken … 2 nass (Flush-/Straßenmöglichkeiten)
function wetness(board) {
  const s = [0, 0, 0, 0], r = [];
  for (const c of board) { const i = cardIndex(c); s[i & 3]++; r.push(i >> 2); }
  let w = 0;
  if (Math.max(...s) >= 2) w++;
  if (Math.max(...s) >= 3) w++;
  r.sort((a, b) => a - b);
  for (let i = 0; i + 1 < r.length; i++) if (r[i + 1] - r[i] <= 2 && r[i + 1] !== r[i]) { w++; break; }
  return Math.min(2, w);
}

// ---------- Push/Fold (wenige Big Blinds) ----------
// Anteil der Hände (in %), mit denen man ohne vorherige Erhöhung alles setzt: grob an Nash-Tabellen angelehnt
function pushPct(effBB, behind, heads) {
  const base = heads ? 58 : [100, 45, 30, 23, 19, 16, 14, 13][Math.min(7, behind)];
  return Math.min(100, base * Math.pow(10 / Math.max(1, effBB), 0.8));
}

function preflopShort(view, sit, rng, level) {
  // nur Blinds vor mir (niemand erhöht, keine Mitgeher): alles oder nichts
  const unopened = sit.raises.length === 0 && sit.limpers === 0;
  if (unopened) {
    if (sit.call === 0 && sit.pct > pushPct(sit.effBB, sit.behind, sit.heads)) return { type: 'check' };
    return sit.pct <= pushPct(sit.effBB, sit.behind, sit.heads) ? allIn(view, sit) : foldOrCheck(sit);
  }
  // jemand hat erhöht oder ist All-in: Gewinnchance gegen seinen Bereich gegen Pot-Odds
  // nur wer freiwillig Chips gebracht hat (erhöht/mitgegangen), zählt mit seinem Bereich; die anderen steigen meist aus
  const ranges = [];
  for (const q of sit.opps) {
    const acts = view.log.filter((e) => e.s === q && e.st === 0);
    const raised = acts.some((e) => e.t === 'raise' || e.t === 'bet');
    if (!raised) { if (acts.some((e) => e.t === 'call')) ranges.push(rangeTop(40)); continue; }
    const theirBB = (view.stacks[q] + view.bets[q]) / sit.bb;
    const tnd = tendency(view, q);
    let w = acts.some((e) => e.allin) ? pushPct(Math.max(1, theirBB), 2, sit.heads) : 15;
    if (level >= 3 && tnd.hands >= 8) w = Math.max(5, Math.min(100, w * (tnd.pfr / 15)));
    ranges.push(rangeTop(Math.max(5, w)));
  }
  const { eq } = equity(sit.hole, sit.board, ranges.length ? ranges : [null], { iters: level >= 3 ? 700 : 400, rng });
  const odds = sit.call / (sit.pot + sit.call);
  if (eq > Math.max(odds + 0.03, 0.5) && sit.rr && rng() < 0.85) return allIn(view, sit);
  if (eq > odds + 0.02) return sit.call > 0 ? { type: 'call' } : { type: 'check' };
  return foldOrCheck(sit);
}

// ---------- mittel / stark: vor dem Flop ----------
function preflop(view, sit, rng, level) {
  if (sit.effBB <= (level >= 3 ? 12 : 8)) return preflopShort(view, sit, rng, level);
  const hard = level >= 3;
  const nRaise = sit.raises.length;
  // Einstiegs-Bereich nach Position (Spieler nach mir)
  const openBase = sit.heads ? (sit.iAmSB ? 70 : 0) : [0, 42, 30, 22, 17, 14, 12, 10][Math.min(7, sit.behind)];
  if (nRaise === 0) {
    let open = openBase;
    if (sit.iAmSB && !sit.heads) open = 32;
    if (hard && !sit.heads && sit.behind <= 2) {
      // Blinds nach mir eng? → mehr stehlen
      const blinds = [view.sb, view.bb].filter((q) => q !== sit.p && E.live(view, q));
      const tight = blinds.every((q) => tendency(view, q).vpip < 28);
      if (tight) open += 8;
    }
    if (sit.limpers > 0) open = Math.max(6, open * 0.6);
    if (sit.call === 0) {
      // Big Blind nach Mitgehern: erhöhen mit guten Händen
      if (sit.pct < (hard ? 12 : 8)) return raiseTo(view, (3 + sit.limpers) * sit.bb, sit);
      return { type: 'check' };
    }
    if (sit.pct < open) return raiseTo(view, (sit.heads ? 2.5 : 2.5 + sit.limpers) * sit.bb, sit);
    if (sit.iAmSB && sit.limpers > 0 && sit.pct < 55) return { type: 'call' };
    return { type: 'fold' };
  }
  // gegen Erhöhung(en)
  const raiser = sit.raises[sit.raises.length - 1].s;
  const rt = tendency(view, raiser);
  let rangeW = sit.heads ? 45 : 18;
  if (hard && rt.hands >= 8) rangeW = Math.max(5, Math.min(70, rt.pfr * (sit.heads ? 1.3 : 1)));
  if (nRaise >= 2) rangeW = Math.min(rangeW, sit.heads ? 15 : 6);
  const callCost = sit.call / sit.stack;
  // Wert-Erhöhung
  const valuePct = nRaise >= 2 ? 2.2 : Math.max(2.5, rangeW * 0.22);
  if (sit.pct <= valuePct) {
    if (sit.effBB <= 30 || nRaise >= 2) return allIn(view, sit);
    return raiseTo(view, view.betTo * (sit.behind > 0 ? 3.2 : 2.8), sit);
  }
  // stark: gelegentlich Bluff-Erhöhung mit kleinen suited Assen / Connectors (polarisiert)
  if (hard && nRaise === 1 && /^A[2-5]s$|^(65|76|87|98)s$/.test(sit.cls) && rng() < 0.3 && sit.effBB > 40) {
    return raiseTo(view, view.betTo * 3, sit);
  }
  // Mitgehen: Gewinnchance gegen den Bereich des Erhöhers, Pot-Odds, mit Tiefe auch kleine Paare (Set-Mining)
  const eqTab = preflopEquity(sit.cls, Math.max(1, sit.opps.length));
  const setMine = sit.cls.length === 2 && sit.call <= sit.eff / 15 && nRaise === 1;
  const suitedPlay = hard && /s$/.test(sit.cls) && sit.pct < 40 && sit.call <= sit.eff / 20 && nRaise === 1;
  const need = sit.odds + (nRaise >= 2 ? 0.08 : 0.02);
  const vsRange = sit.pct <= rangeW * (sit.heads ? 1.2 : 0.9);
  if ((vsRange && eqTab >= need) || setMine || suitedPlay) {
    if (callCost > 0.35 && sit.pct > valuePct * 2) return { type: 'fold' };
    return { type: 'call' };
  }
  if (sit.iAmBB && sit.odds < 0.3 && sit.pct < (sit.heads ? 75 : 45) && nRaise === 1) return { type: 'call' };
  return { type: 'fold' };
}

// ---------- mittel / stark: nach dem Flop ----------
function postflop(view, sit, rng, level, iters, deadline) {
  const hard = level >= 3;
  const ranges = sit.opps.map((q) => narrow(view, q, preflopRange(view, q, level), level));
  const { eq } = equity(sit.hole, sit.board, ranges, { iters, rng, deadline });
  const m = made(sit);
  const nOpp = sit.opps.length;
  const draw = m.flushDraw || m.straightDraw === 'open';
  const pfRaiser = view.log.some((e) => e.s === sit.p && e.st === 0 && (e.t === 'raise' || e.t === 'bet'));
  const spr = sit.eff / Math.max(1, sit.pot);
  const tnds = sit.opps.map((q) => tendency(view, q));
  const foldy = tnds.reduce((a, t) => a + t.foldToBet, 0) / Math.max(1, tnds.length);
  const valueTh = nOpp === 1 ? 0.6 : nOpp === 2 ? 0.48 : 0.4;
  const sizeF = hard ? [0.33, 0.5, 0.75][wetness(sit.board)] : (rng() < 0.5 ? 0.5 : 0.66);
  if (sit.call === 0) {
    if (spr < 1.2 && eq > 0.5) return allIn(view, sit);
    if (eq > valueTh) return potBet(view, sit, eq > 0.8 && sit.street === 3 ? Math.max(sizeF, 0.75) : sizeF);
    // Bluffs: Anteil passend zur Größe (Gegner muss α = s/(1+2s) mitgehen-Bereich treffen), mehr gegen Ängstliche
    const alpha = sizeF / (1 + 2 * sizeF);
    let bluff = 0;
    if (sit.street === 1 && pfRaiser && nOpp === 1) bluff = hard ? 0.45 + (foldy - 0.45) : 0.55;
    else if (draw && sit.street < 3) bluff = hard ? 0.4 : 0.3;
    else if (sit.street === 3 && eq < 0.2 && nOpp === 1) bluff = hard ? alpha * (foldy / 0.45) : 0.05;
    else bluff = hard ? 0.05 : 0.04;
    if (nOpp > 1) bluff *= 0.35;
    if (rng() < Math.max(0, Math.min(0.8, bluff))) return potBet(view, sit, sizeF);
    return { type: 'check' };
  }
  // vor einem Einsatz
  const odds = sit.odds;
  const implied = draw && sit.street < 3 && sit.eff > sit.pot ? (hard ? 0.07 : 0.04) : 0;
  if (spr < 1.2 && eq > Math.max(odds, 0.4)) return allIn(view, sit);
  const raiseTh = nOpp === 1 ? (hard ? 0.72 : 0.75) : 0.6;
  if (eq > raiseTh && sit.rr) {
    if (spr < 2.5) return allIn(view, sit);
    return raiseTo(view, view.betTo * 2.5 + (sit.pot - view.betTo) * 0.3, sit);
  }
  if (hard && draw && sit.street === 1 && sit.rr && nOpp === 1 && rng() < 0.15 && spr > 3) {
    return raiseTo(view, view.betTo * 2.6 + (sit.pot - view.betTo) * 0.3, sit);
  }
  // gegen Dauer-Bluffer etwas lockerer mitgehen
  const loosen = hard ? Math.max(0, Math.min(0.06, (tnds[0] ? tnds[0].af - 1.5 : 0) * 0.03)) : 0;
  if (eq + implied + loosen >= odds + (hard ? 0.01 : 0.03)) return { type: 'call' };
  return { type: 'fold' };
}

// ---------- Einstieg ----------
export function chooseMove(view, { level = 2, rng = Math.random, timeMs = 0, iters } = {}) {
  const moves = E.legalMoves(view);
  if (moves.length <= 1) return moves.length ? moves[0] : null;
  const sit = situation(view);
  let m;
  if (level <= 1) m = easy(view, sit, rng);
  else if (sit.street === 0) m = preflop(view, sit, rng, level);
  else m = postflop(view, sit, rng, level, iters || (timeMs ? 20000 : ITERS[level] || 900), iters ? 0 : Math.max(0, (timeMs || 0) * 0.6));
  if (!m || !E.isLegal(view, m)) m = moves.find((x) => x.type === 'check') || moves.find((x) => x.type === 'call') || moves[0];
  return m;
}
