// Hold'em-Tisch als SVG (1000 × 1000): ovaler Filz, Sitze rundum (eigener Platz unten), Dealer-Knopf, Blinds,
// Einsätze als Chip-Stapel vor den Sitzen, Board und Pot(s) in der Mitte, eigene Karten groß unten.
// Ablauf eines Zugs (Zeiten aus tempo.js → holdemTimes): Chips gleiten in den Einsatz; am Ende der Setzrunde in den
// Pot, neue Board-Karten nacheinander; am Ende der Hand wandert der Pot zum Gewinner, das Ergebnis (aufgedeckte
// Karten, Hand-Name, Gewinn) bleibt liegen, dann wird neu ausgeteilt. Aktionsleiste (Knöpfe, Regler) baut gameui.js
// mit den Hilfen hier (raiseState, pre-Aktionen).
import * as E from './engine.js';
import { evaluate, handName, catName, draws, bestFive } from './eval.js';
import { handClass, PERCENTILE } from './equity.js';
import { s, ensureDefs, place, flyIn, fadeIn, toScreen, onTap, ball } from '../../ui/svg.js';
import { holdemTimes, OWN } from '../../tempo.js';
import { frCard, backCard, ensureCardDefs, frHeight } from '../../ui/cards.js';
import { SEAT_COLORS } from '../../ui/seatcolors.js';
import { chipSound, winSound } from '../../ui/sound.js';
import { DEKO, boardLayers } from '../../ui/deko.js';
import { woodFrame, feltRect, feltEllipse, shadowUnder } from '../../ui/material.js';
import * as FXS from '../../ui/fxsvg.js';

// Zwei Formate: quadratisch (Querformat, 1000 × 1000) und hoch (Hochformat, 1000 × 1150) – Maße in layout()
const SIZE = 1000;
const CX = 500, FRX = 455, SRX = 400;
const BOARD_W = 100, BOARD_GAP = 108, ME_W = 128;
let H = 1000, CY = 450, FRY = 330, SRY = 330, BOARD_Y = 440, ME_Y = 870, ME_SEAT = 790, ME_BET = 655, POT_Y = 318;
let DECK_AT = [CX, CY - 150];
function layout(tall) {
  if (tall) { H = 1150; CY = 480; FRY = 400; SRY = 382; BOARD_Y = 470; ME_Y = 1010; ME_SEAT = 935; ME_BET = 770; POT_Y = 330; }
  else { H = 1000; CY = 450; FRY = 330; SRY = 330; BOARD_Y = 440; ME_Y = 870; ME_SEAT = 790; ME_BET = 655; POT_Y = 318; }
  DECK_AT = [CX, CY - 150];
}
const isTall = () => typeof matchMedia === 'function' && matchMedia('(orientation: portrait)').matches;
const fmt = E.fmtChips;

// Chip-Farben nach Wert (wie im Casino, gedämpft)
const CHIP = [[5000, '#6b3fa0'], [1000, '#d6a21e'], [500, '#7a4a9c'], [100, '#222'], [25, '#2e8b57'], [5, '#c0392b'], [1, '#e8e2d4']];
const chipColor = (amt) => (CHIP.find(([v]) => amt >= v * 4) || CHIP[CHIP.length - 1])[1];

// Deko: Chip mit Kante (Zylinder), Randstreifen, Innenring und Glanz – Farbe nach Wert
const DK_CHIP = [[1000, '#d6a21e'], [500, '#7a4a9c'], [100, '#262626'], [25, '#2e8b57'], [5, '#c0392b'], [1, '#e8e2d4']];
function dkChip(g, x, y, r, col) {
  const ry = r * 0.42, e = (a) => s('ellipse', { cx: x, rx: r, ry, ...a });
  g.append(e({ cy: y + 5, fill: 'rgba(0,0,0,.28)' }),
    e({ cy: y + 3.5, fill: col, stroke: 'rgba(0,0,0,.45)', 'stroke-width': 1.5 }),
    e({ cy: y + 3.5, fill: 'url(#dk-chipedge)' }),
    e({ cy: y, fill: col, stroke: 'rgba(0,0,0,.35)', 'stroke-width': 1.2 }),
    e({ cy: y, fill: 'none', stroke: '#fff7e6', 'stroke-width': 2.6, 'stroke-dasharray': `${r * 0.42} ${r * 0.36}` }),
    s('ellipse', { cx: x, cy: y, rx: r * 0.62, ry: ry * 0.62, fill: 'none', stroke: 'rgba(255,247,230,.55)', 'stroke-width': 1.6 }),
    s('ellipse', { cx: x - r * 0.25, cy: y - ry * 0.35, rx: r * 0.45, ry: ry * 0.32, fill: '#fff', opacity: 0.22 }));
}
// Betrag in Chips zerlegen (größte zuerst), höchstens 3 Stapel × 6 Chips
function dkStacks(amount) {
  const out = [];
  let rest = amount;
  for (const [v, col] of DK_CHIP) {
    let k = Math.floor(rest / v);
    if (!k) continue;
    rest -= k * v;
    out.push([col, Math.min(6, k)]);
    if (out.length >= 3) break;
  }
  return out.length ? out : [[DK_CHIP[DK_CHIP.length - 1][1], 1]];
}

function chipStack(amount, { label = true, big = false, left = false } = {}) {
  const g = s('g', { class: 'he-chips' });
  if (DEKO.on) {
    const r = big ? 24 : 18, st = dkStacks(amount), gap = r * 1.75, h = big ? 6.5 : 5.5;
    const x0 = -((st.length - 1) * gap) / 2;
    st.forEach(([col, k], j) => { for (let i = 0; i < k; i++) dkChip(g, x0 + j * gap, -i * h, r, col); });
    const wide = ((st.length - 1) * gap) / 2 + r;
    if (label) g.append(s('text', { x: left ? -wide - 8 : wide + 8, y: 9, class: 'he-amt' + (big ? ' big' : '') + (left ? ' left' : ''), text: fmt(amount) }));
    return g;
  }
  const n = Math.max(1, Math.min(4, Math.ceil(Math.log10(Math.max(1, amount)) - 0.5)));
  const r = big ? 26 : 20;
  const col = chipColor(amount);
  for (let i = 0; i < n; i++) {
    const y = -i * (big ? 7 : 6);
    g.append(s('ellipse', { cx: 0, cy: y + 4, rx: r, ry: r * 0.42, fill: 'rgba(0,0,0,.35)' }),
      s('ellipse', { cx: 0, cy: y, rx: r, ry: r * 0.42, fill: col, stroke: '#fff7e6', 'stroke-width': 2.5, 'stroke-dasharray': `${r * 0.5} ${r * 0.35}` }));
  }
  if (label) g.append(s('text', { x: left ? -r - 8 : r + 8, y: 9, class: 'he-amt' + (big ? ' big' : '') + (left ? ' left' : ''), text: fmt(amount) }));
  return g;
}

export function createBoard(host, { onMove, onHint, onLocal }) {
  ensureDefs();
  ensureCardDefs();
  layout(isTall());
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${H}`, class: 'board board-cards board-holdem', role: 'img', 'aria-label': "Hold'em-Tisch" });
  const felt = s('g');
  let L = null, fu = null;
  const drawFelt = () => {
    felt.textContent = '';
    svg.setAttribute('viewBox', `0 0 ${SIZE} ${H}`);
    if (fu) {
      // Deko: Raum mit Licht, Tisch mit Schatten, gepolsterte Lederbande mit Naht, Holzleiste, Filz mit Lichtkegel
      fu.textContent = '';
      woodFrame(fu, 0, 0, SIZE, H, 26);
      feltRect(fu, 14, 14, SIZE - 28, H - 28, 18, { cls: 'he-room', stitch: false });
      const rail = s('ellipse', { cx: CX, cy: CY, rx: FRX + 26, ry: FRY + 26 });
      shadowUnder(fu, rail, { dy: 16, op: 0.6 });
      fu.append(s('ellipse', { cx: CX, cy: CY, rx: FRX + 26, ry: FRY + 26, fill: '#3b1f10', stroke: '#1f0f06', 'stroke-width': 4 }),
        s('ellipse', { cx: CX, cy: CY, rx: FRX + 26, ry: FRY + 26, fill: 'url(#dk-leather)' }),
        s('ellipse', { cx: CX, cy: CY, rx: FRX + 15, ry: FRY + 15, fill: 'none', stroke: 'rgba(255,226,180,.32)', 'stroke-width': 2, 'stroke-dasharray': '7 6' }),
        s('ellipse', { cx: CX, cy: CY, rx: FRX + 4, ry: FRY + 4, fill: 'none', stroke: 'url(#sb-wood-light)', 'stroke-width': 7 }),
        s('ellipse', { cx: CX, cy: CY, rx: FRX + 4, ry: FRY + 4, fill: 'none', stroke: 'url(#dk-bevel)', 'stroke-width': 7 }));
      feltEllipse(fu, CX, CY, FRX, FRY, { cls: 'felt he-felt' });
      fu.append(s('ellipse', { cx: CX, cy: CY, rx: FRX - 40, ry: FRY - 40, class: 'he-line dk-print' }));
      return;
    }
    felt.append(
      s('rect', { width: SIZE, height: H, rx: 26, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: 14, y: 14, width: SIZE - 28, height: H - 28, rx: 18, class: 'he-room' }),
      s('ellipse', { cx: CX, cy: CY, rx: FRX + 22, ry: FRY + 22, class: 'he-rail' }),
      s('ellipse', { cx: CX, cy: CY, rx: FRX, ry: FRY, class: 'felt he-felt' }),
      s('ellipse', { cx: CX, cy: CY, rx: FRX - 40, ry: FRY - 40, class: 'he-line' }));
  };
  const gInfo = s('g'), gBoard = s('g'), gPot = s('g'), gSeats = s('g'), gBets = s('g'), gMe = s('g'), gFx = s('g'), gEnd = s('g');
  svg.append(felt, gInfo, gBoard, gPot, gSeats, gBets, gMe, gFx, gEnd);
  host.appendChild(svg);
  L = boardLayers(svg, host);
  if (L) fu = L.under.appendChild(s('g'));
  drawFelt();
  onTap(svg, () => {});

  const mq = typeof matchMedia === 'function' ? matchMedia('(orientation: portrait)') : null;
  const onOrient = () => { layout(isTall()); drawFelt(); if (gs) { clearTimers(); renderLive(gs); } };
  if (mq && mq.addEventListener) mq.addEventListener('change', onOrient);
  let table = null, gs = null, me = null, seated = false, n = 2, legal = null, mode = 'bot';
  let shownHand = 0, timers = [], tick = null, turnSeen = { key: '', at: 0 };
  // Aktionsleiste: Erhöhen-Regler offen? Betrag; Vorab-Aktion
  const ui = { raiseOpen: false, raiseTo: 0, pre: null, preKey: '', autoKey: '', help: false };
  const later = (ms, fn) => { if (ms <= 0) { fn(); return; } timers.push(setTimeout(fn, ms)); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  const rel = (seat) => (seat - (me ?? 0) + n) % n;
  function seatPos(seat) {
    const k = rel(seat);
    if (k === 0 && seated) return [CX, ME_SEAT];
    const a = (Math.PI / 2) + (k * 2 * Math.PI) / n;
    return [CX + SRX * Math.cos(a), CY + SRY * Math.sin(a) + (Math.sin(a) > 0.5 ? 20 : 0)];
  }
  const lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
  function betPos(seat) {
    const p = seatPos(seat);
    if (rel(seat) === 0 && seated) return [CX, ME_BET];
    return lerp(p, [CX, CY], p[1] < CY - 200 ? 0.52 : Math.abs(p[0] - CX) > 300 ? 0.42 : 0.36);
  }
  const potAt = () => [CX, POT_Y];
  const nameOf = (seat) => {
    if (seat === me && seated) return 'Du';
    const x = table.seats[seat];
    const nm = x ? x.name : `Platz ${seat + 1}`;
    return nm.length > 11 ? nm.slice(0, 10) + '…' : nm;
  };

  // ---------- Zeichnen ----------
  function drawInfo(state) {
    gInfo.textContent = '';
    const nxt = E.handsToNextLevel(state);
    const blinds = `Blinds ${fmt(state.sbAmt)}/${fmt(state.bbAmt)}`;
    gInfo.append(s('text', { x: CX, y: BOARD_Y + 112, class: 'he-blinds', text: state.phase === 'over' ? '' : `Hand ${state.hand} · ${blinds}${nxt ? ` · höher in ${nxt}` : ''}` }));
  }

  function drawBoard(cards, { fresh = 0, delay = 0, step = 0 } = {}) {
    gBoard.textContent = '';
    const x0 = CX - 2 * BOARD_GAP;
    const h = frHeight(BOARD_W);
    for (let i = 0; i < 5; i++) {
      const x = x0 + i * BOARD_GAP;
      if (i >= cards.length) {
        gBoard.append(s('rect', { x: x - BOARD_W / 2, y: BOARD_Y - h / 2, width: BOARD_W, height: h, rx: 8, class: 'he-slot' }));
        continue;
      }
      const el = place(frCard(cards[i], BOARD_W), x, BOARD_Y);
      el.dataset.board = cards[i];
      gBoard.append(el);
      const k = i - (cards.length - fresh);
      if (k >= 0) flyIn(el, DECK_AT, step || 300, delay + k * step);
    }
  }

  function drawPot(state, pots = null) {
    gPot.textContent = '';
    const total = pots ? pots.reduce((a, p) => a + p.amount, 0) : E.potTotal(state) - state.bets.reduce((a, b) => a + b, 0);
    if (total <= 0) return;
    const list = pots || E.computePots({ ...state, contrib: state.contrib.map((c, i) => c - state.bets[i]) });
    const g = place(s('g', { class: 'he-pot' }), ...potAt());
    g.append(chipStack(total, { label: false, big: true }));
    g.append(s('text', { x: 0, y: -34, class: 'he-pot-t', text: `Pot ${fmt(total)}` }));
    if (list.length > 1) g.append(s('text', { x: 0, y: 52, class: 'he-side-t', text: list.map((p, i) => `${i ? `Side-Pot ${i}` : 'Haupt'} ${fmt(p.amount)}`).join(' · ') }));
    gPot.append(g);
  }

  function seatCards(g, seat, cards, [x, y], { small = true, fresh = false, delay = 0, step = 0, hi = null } = {}) {
    const w = small ? 64 : ME_W;
    const off = small ? 30 : w * 0.62;
    cards.forEach((c, i) => {
      const cx = x + (i - 0.5) * off, cy = y;
      const el = place(c ? frCard(c, w) : backCard(w, frHeight(w)), cx, cy);
      el.style.transform += ` rotate(${(i - 0.5) * (small ? 8 : 6)}deg)`;
      if (hi && c && !hi.has(c)) el.classList.add('dim');
      el.dataset.hole = c || 'x';
      el.dataset.seat = seat;
      g.append(el);
      if (fresh) flyIn(el, [CX, CY], step || 300, delay + i * step * n);
    });
  }

  // eine Hand-Lage zeichnen. view = { stacks, bets, holes (je Sitz Karten/[]), folded, allin, out, button, sb, bb,
  // turn, labels: {Sitz: {text, cls}}, win: Set }
  function drawSeats(state, v, { dealFresh = false, dealDelay = 0, dealStep = 0 } = {}) {
    gSeats.textContent = '';
    gMe.textContent = '';
    gBets.textContent = '';
    for (let seat = 0; seat < n; seat++) {
      const pos = seatPos(seat);
      const isMe = seat === me && seated;
      const out = v.out[seat] !== null && v.out[seat] !== undefined;
      const cards = v.holes[seat] || [];
      const folded = v.folded[seat];
      const g = s('g', { class: 'he-seat' + (out ? ' out' : '') + (folded ? ' folded' : '') + (v.turn === seat ? ' active' : '') + (v.win && v.win.has(seat) ? ' win' : ''), 'data-seat': seat });
      const col = SEAT_COLORS[seat % 6];
      if (isMe) {
        // eigener Platz: Karten groß unten, Name/Stack links, Hand-Name rechts
        if (v.turn === seat) gMe.append(s('rect', { x: CX - 150, y: ME_Y - 118, width: 300, height: 236, rx: 24, class: 'he-turn' }));
        if (cards.length) seatCards(gMe, seat, cards, [CX, ME_Y], { small: false, fresh: dealFresh, delay: dealDelay, step: dealStep, hi: v.hi && v.hi[seat] });
        else if (!out) gMe.append(s('text', { x: CX, y: ME_Y + 10, class: 'he-me-empty', text: folded ? 'ausgestiegen' : '' }));
        gMe.append(s('text', { x: 205, y: ME_Y - 22, class: 'he-me-name', text: out ? `Du – Platz ${v.out[seat]}` : 'Du' }),
          s('text', { x: 205, y: ME_Y + 22, class: 'he-me-stack', text: out ? '' : fmt(v.stacks[seat]) }));
        if (v.labels && v.labels[seat]) gMe.append(s('text', { x: 795, y: ME_Y + 8, class: 'he-me-label ' + (v.labels[seat].cls || ''), text: v.labels[seat].text }));
        if (v.allin[seat] && !out) gMe.append(s('text', { x: 205, y: ME_Y + 62, class: 'he-tag allin', text: 'ALL-IN' }));
      } else {
        const [x, y] = pos;
        if (v.turn === seat) g.append(s('circle', { cx: x, cy: y, r: 54, class: 'he-turn' }));
        if (DEKO.on) {
          // Deko: Spieler-Marke als glänzende Scheibe mit hellem Ring
          const av = ball(col, 42, { ring: true });
          av.setAttribute('class', 'dk-av');
          av.setAttribute('transform', `translate(${x} ${y})`);
          g.append(av);
        } else g.append(s('circle', { cx: x, cy: y, r: 42, class: 'he-av', fill: col }));
        g.append(s('text', { x, y: y + 13, class: 'he-av-t', text: (table.seats[seat] && table.seats[seat].bot ? '◆' : (nameOf(seat)[0] || '?').toUpperCase()) }));
        // Karten über dem Avatar (zur Mitte hin versetzt)
        if (cards.length && !folded) seatCards(g, seat, cards, [x + (x < CX - 50 ? 34 : x > CX + 50 ? -34 : 0), y - 40], { fresh: dealFresh, delay: dealDelay, step: dealStep, hi: v.hi && v.hi[seat] });
        g.append(s('text', { x, y: y + 74, class: 'he-name', text: nameOf(seat) }),
          s('text', { x, y: y + 106, class: 'he-stack', text: out ? `Platz ${v.out[seat]}` : v.allin[seat] ? 'ALL-IN' : fmt(v.stacks[seat]) }));
        if (v.labels && v.labels[seat]) {
          const t = v.labels[seat];
          const w = Math.max(110, t.text.length * 15 + 24);
          const lx = Math.max(w / 2 + 18, Math.min(SIZE - w / 2 - 18, x));
          // oberster Platz im Hochformat: über dem Avatar ist kein Platz mehr (Bildrand) → unter den Chip-Stand
          const ly = y - 112 < 4 ? y + 122 : y - 112;
          g.append(s('g', { class: 'he-label ' + (t.cls || '') }, s('rect', { x: lx - w / 2, y: ly, width: w, height: 40, rx: 20 }), s('text', { x: lx, y: ly + 28, text: t.text })));
        }
      }
      gSeats.append(g);
      // Einsatz vor dem Sitz
      const bet = v.bets[seat];
      if (bet > 0) {
        const b = place(s('g', { 'data-bet': seat }), ...betPos(seat));
        b.append(chipStack(bet, { left: betPos(seat)[0] > CX + 60 }));
        gBets.append(b);
      }
      // Knopf und Blinds
      if (!out && seat === v.button) {
        // neben dem Avatar (links bei Plätzen rechts/oben, rechts bei Plätzen links), eigener Platz: rechts der Karten
        const [bx, by] = isMe ? [CX + 175, ME_Y - 70] : [pos[0] + (pos[0] < CX - 50 ? 64 : -64), pos[1] - 4];
        const btn = s('g', { class: 'he-btn' }, s('circle', { cx: bx, cy: by, r: 22 }));
        // Deko: Knopf mit Schatten, Innenring und Glanz
        if (DEKO.on) {
          btn.prepend(s('ellipse', { cx: bx + 3, cy: by + 5, rx: 23, ry: 22, fill: 'rgba(0,0,0,.35)' }));
          btn.append(s('ellipse', { cx: bx, cy: by, rx: 16, ry: 16, fill: 'none', stroke: 'rgba(107,86,54,.45)', 'stroke-width': 1.5 }),
            s('ellipse', { cx: bx - 7, cy: by - 9, rx: 9, ry: 5, fill: '#fff', opacity: 0.75 }));
        }
        btn.append(s('text', { x: bx, y: by + 9, text: 'D' }));
        gBets.append(btn);
      }
    }
  }

  // aktuelle Lage (laufende Hand)
  function liveView(state) {
    const labels = {};
    const last = {};
    for (const e of state.log) last[e.s] = e;
    for (let q = 0; q < n; q++) {
      const e = last[q];
      if (!e || q === state.turn) continue;
      if (state.folded[q]) labels[q] = { text: 'ausgestiegen', cls: 'fold' };
      else if (e.st !== state.street && e.t !== 'sb' && e.t !== 'bb') continue;
      else if (e.t === 'check') labels[q] = { text: 'Check', cls: '' };
      else if (e.t === 'call') labels[q] = { text: e.allin ? 'All-in' : 'mit', cls: '' };
      else if (e.t === 'bet') labels[q] = { text: e.allin ? 'All-in' : 'Setzt', cls: 'aggr' };
      else if (e.t === 'raise') labels[q] = { text: e.allin ? 'All-in' : 'Erhöht', cls: 'aggr' };
      else if (e.t === 'sb') labels[q] = { text: 'SB', cls: 'blind' };
      else if (e.t === 'bb') labels[q] = { text: 'BB', cls: 'blind' };
    }
    if (seated && me !== null && state.holes[me] && state.holes[me].length === 2 && ui.help) {
      labels[me] = { text: helpText(state, me, true), cls: 'help' };
    }
    return { stacks: state.stacks, bets: state.bets, holes: state.holes, folded: state.folded, allin: state.allin, out: state.out, button: state.button, turn: state.phase === 'bet' ? state.turn : null, labels };
  }

  // Ergebnis der letzten Hand (prev = Zustand vor dem Zug, für die eigenen/aufgedeckten Karten)
  function resultView(state, prev) {
    const lh = state.lastHand;
    const holes = Array.from({ length: n }, () => []);
    const folded = Array(n).fill(true);
    for (let q = 0; q < n; q++) {
      const had = prev && prev.holes[q] && prev.holes[q].length === 2 && !prev.folded[q];
      if (!had && !(lh.shown[q])) continue;
      folded[q] = false;
      holes[q] = lh.shown[q] || (q === me && seated && prev ? prev.holes[q] : (state.lastHoles && state.lastHoles[q]) || [null, null]);
    }
    const win = new Set(lh.pots.flatMap((p) => p.winners));
    const labels = {};
    const hi = {};
    for (const q of win) {
      const pot = lh.pots.find((p) => p.winners.includes(q));
      const name = pot && pot.value !== null ? catShort(pot.value) : '';
      labels[q] = { text: `+${fmt(lh.pots.filter((p) => p.winners.includes(q)).reduce((a, p) => a + Math.floor(p.amount / p.winners.length), 0))}${name ? ' ' + name : ''}`, cls: 'win' };
      if (pot && pot.value !== null && lh.shown[q]) hi[q] = new Set(bestFive([...lh.shown[q], ...lh.board]));
    }
    for (const q of lh.mucked) if (!labels[q]) labels[q] = { text: 'verdeckt', cls: 'fold' };
    const stacks = state.stacks.map((x, q) => x + (state.contrib ? state.contrib[q] : 0));
    return { stacks, bets: Array(n).fill(0), holes, folded, allin: Array(n).fill(false), out: state.out, button: lh.button, turn: null, labels, win, hi };
  }
  const catShort = (v) => catName(v);

  // Text für die Hand-Hilfe (nur eigene Karten + Board)
  function helpText(state, seat, short = false) {
    const hc = state.holes[seat];
    if (!hc || hc.length !== 2 || !hc[0]) return '';
    if (state.board.length < 3) {
      const p = PERCENTILE[handClass(hc[0], hc[1])];
      const q = p <= 10 ? 'sehr gute Starthand' : p <= 25 ? 'gute Starthand' : p <= 55 ? 'mittlere Starthand' : 'schwache Starthand';
      return short ? q.replace('Starthand', 'Karten') : `${q} (Top ${Math.max(1, Math.round(p))} %)`;
    }
    const all = [...hc, ...state.board];
    const name = handName(evaluate(all));
    const d = state.board.length < 5 ? draws(all) : {};
    const extra = [d.flush ? 'Flush-Chance' : '', d.straight ? 'Straßen-Chance' : ''].filter(Boolean);
    if (short) return extra.length && !/Flush|Straße|Full|Vierling|Straight/.test(name) ? `${name.split(',')[0]} + ${extra[0]}` : name.split(',')[0];
    return [name, ...extra].join(' · ');
  }

  function drawEnd(state) {
    gEnd.textContent = '';
    if (state.phase !== 'over' || !state.over) return;
    const rk = state.over.ranking;
    const h = 120 + rk.length * 52;
    const g = s('g', { class: 'he-end', 'data-end': '1' });
    g.append(s('rect', { x: 230, y: CY - h / 2, width: 540, height: h, rx: 26, class: 'end-card' }),
      s('text', { x: CX, y: CY - h / 2 + 62, class: 'end-title', text: 'Turnier vorbei' }));
    rk.forEach((q, i) => {
      g.append(s('text', { x: CX, y: CY - h / 2 + 118 + i * 52, class: 'end-sub' + (i === 0 ? ' first' : ''), text: `${state.places[q] || i + 1}. ${nameOf(q)}${i === 0 ? ` – ${fmt(state.stacks[q])} Chips` : ''}` }));
    });
    gEnd.append(g);
  }

  // ---------- Animation ----------
  function flyChips(from, to, amount, dur, delay = 0) {
    if (dur <= 0 || amount <= 0) return;
    const g = place(s('g', { class: 'he-fly' }), ...from);
    g.append(chipStack(amount, { label: false }));
    gFx.append(g);
    if (!g.animate) { g.remove(); return; }
    const a = g.animate([{ transform: `translate(${from[0]}px, ${from[1]}px)`, opacity: 1 }, { transform: `translate(${to[0]}px, ${to[1]}px)`, opacity: 1 }],
      { duration: dur, delay, fill: 'both', easing: 'cubic-bezier(.4,.1,.3,1)' });
    a.onfinish = () => g.remove();
  }

  // ganzen Tisch zeigen (ohne Animation bzw. mit Austeilen)
  function renderLive(state, { deal = false, step = 0, delay = 0 } = {}) {
    drawInfo(state);
    drawBoard(state.board);
    drawPot(state);
    drawSeats(state, liveView(state), { dealFresh: deal, dealDelay: delay, dealStep: step });
    drawEnd(state);
  }

  function animate(prev, state, info, ctx) {
    const a = ctx.anim || OWN;
    const tm = holdemTimes(a, state);
    const fx = E.lastMoveEffect(state);
    const by = info.by;
    // 1) Chips des Zugs gleiten vom Sitz zum Einsatz
    if (!fx.handEnd && !fx.streetEnd) {
      renderLive(state);
      if (by !== undefined && state.bets[by] > (prev.bets[by] || 0)) {
        const el = gBets.querySelector(`[data-bet="${by}"]`);
        if (el) flyIn(el, seatPos(by), tm.chip);
        if (tm.chip) chipSound();
      }
      return;
    }
    // 2) Ende der Setzrunde/Hand: alter Tisch mit dem Einsatz des Zugs, dann Chips in den Pot
    const bets = prev.bets.slice();
    if (by !== undefined && prev.turn === by) {
      const m = info.move || {};
      const need = prev.betTo - prev.bets[by];
      if (m.type === 'call') bets[by] += Math.min(need, prev.stacks[by]);
      else if (m.type === 'raise') bets[by] = m.to;
    }
    const pv = { ...liveView(prev), bets, turn: null };
    drawInfo(prev);
    drawBoard(prev.board);
    drawPot(prev);
    drawSeats(prev, pv);
    gEnd.textContent = '';
    if (tm.chip) chipSound();
    let t = tm.chip;
    later(t, () => {
      for (let q = 0; q < n; q++) if (bets[q] > 0) flyChips(betPos(q), potAt(), bets[q], tm.toPot);
      gBets.querySelectorAll('[data-bet]').forEach((el) => el.remove());
    });
    t += tm.toPot;
    if (fx.streetEnd) {
      later(t, () => {
        drawPot(state);
        drawBoard(state.board, { fresh: fx.runout, step: tm.card });
        drawSeats(state, { ...liveView(state), turn: null });
      });
      later(t + tm.runout, () => renderLive(state));
      return;
    }
    // 3) Ende der Hand: Board auslaufen lassen, Ergebnis zeigen, Pot zum Gewinner, liegen lassen, neu austeilen
    const lh = state.lastHand;
    const res = resultView(state, prev);
    later(t, () => {
      gPot.textContent = '';
      drawPot(prev, lh.pots);
      drawBoard(lh.board, { fresh: fx.runout, step: tm.card });
      // aufgedeckte Karten sofort (All-in) bzw. nach dem Board (Showdown)
      if (lh.allin) drawSeats(prev, { ...res, stacks: prev.stacks, labels: {}, win: null, hi: null });
    });
    t += tm.runout;
    later(t, () => {
      drawSeats(prev, { ...res, stacks: prev.stacks.map((x) => x) });
      gPot.textContent = '';
      lh.pots.forEach((p) => p.winners.forEach((w) => flyChips(potAt(), seatPos(w), Math.floor(p.amount / p.winners.length), tm.toWinner)));
      if (tm.toWinner) chipSound(true);
    });
    t += tm.toWinner;
    later(t, () => {
      drawSeats(prev, res);
      // Deko: Gewinner der Hand funkeln kurz
      if (tm.toWinner > 0) for (const w of res.win) FXS.sparks(gFx, ...seatPos(w), { n: w === me && seated ? 16 : 9, dist: 90, size: 14 });
      if (seated && me !== null && lh.pots.some((p) => p.winners.includes(me))) {
        const won = lh.delta[me];
        const total = state.stacks.reduce((x, y) => x + y, 0) + state.contrib.reduce((x, y) => x + y, 0);
        if (won > 0 && (won >= total * 0.25 || state.phase === 'over')) { winSound(); haptic(state.phase === 'over' ? [35, 80, 35] : 30); }
      }
    });
    t += tm.hold;
    later(t, () => {
      if (state.phase === 'over') { renderLive(state); return; }
      const players = state.holes.filter((h) => h.length).length;
      renderLive(state, { deal: tm.deal > 0, step: players ? Math.min(70, Math.round((a.slide || 0) / 8)) : 0 });
      shownHand = state.hand;
    });
  }

  function haptic(p) {
    try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* egal */ }
  }

  // Bedenkzeit online: Ring + Restsekunden
  function startClock(state, ctx) {
    clearInterval(tick);
    tick = null;
    const limit = (state.opts && state.opts.timer) || 0;
    if (mode !== 'online' || !limit || state.phase !== 'bet' || state.turn === null) return;
    const seat = state.turn;
    if (table.seats[seat] && table.seats[seat].bot) return;
    const key = `${state.hand}|${state.log.length}|${seat}`;
    if (turnSeen.key !== key) turnSeen = { key, at: Date.now() };
    const draw = () => {
      const left = Math.max(0, limit - (Date.now() - turnSeen.at) / 1000);
      let el = svg.querySelector('.he-clock');
      if (!el) { el = s('text', { class: 'he-clock' }); gFx.append(el); }
      const [x, y] = seat === me && seated ? [CX + 210, ME_Y - 60] : [seatPos(seat)[0] + 50, seatPos(seat)[1] - 44];
      el.setAttribute('x', x); el.setAttribute('y', y);
      el.textContent = `${Math.ceil(left)} s`;
      el.classList.toggle('low', left <= 8);
      if (left <= 0) { clearInterval(tick); tick = null; }
    };
    draw();
    tick = setInterval(draw, 500);
  }

  function hintFor(state) {
    if (!legal || !seated) return ui.help && seated && me !== null && state.holes[me] && state.holes[me].length === 2 && state.phase === 'bet' ? `Deine Hand: ${helpText(state, me)}` : '';
    const rr = E.raiseRange(state);
    const base = `Pot ${fmt(E.potTotal(state))}${rr && rr.min < rr.max ? ` · ${state.betTo ? 'Erhöhen' : 'Setzen'} ab ${fmt(rr.min)}` : ''}`;
    return ui.help ? `${base} · ${helpText(state, me)}` : base;
  }

  return {
    svg,
    ui,
    update(t, info = {}, ctx = {}) {
      table = t;
      const prev = gs;
      gs = t.gs;
      n = gs.opts.players;
      me = ctx.viewer === undefined ? null : ctx.viewer;
      seated = !!ctx.seated;
      mode = ctx.mode || 'bot';
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      ui.help = !!ctx.help;
      if (ui.preKey && ui.preKey !== `${gs.hand}`) { ui.pre = null; ui.preKey = ''; }
      if (!legal) { ui.raiseOpen = false; }
      const animated = info.kind === 'move' && info.prevGs && info.prevGs.hand !== undefined;
      if (info.kind === 'move' && animated) {
        clearTimers();
        animate(info.prevGs, gs, info, ctx);
      } else if (info.kind !== 'settle' || !timers.length) {
        clearTimers();
        renderLive(gs);
        shownHand = gs.hand;
      }
      startClock(gs, ctx);
      onHint && onHint(hintFor(gs));
      // Vorab-Aktion ausführen, sobald man dran ist
      if (legal && ui.pre) {
        const key = `${gs.hand}|${gs.log.length}`;
        if (ui.autoKey !== key) {
          ui.autoKey = key;
          const has = (tp) => legal.find((m) => m.type === tp);
          const m = ui.pre === 'checkfold' ? has('check') || has('fold') : has('call') || has('check');
          ui.pre = null;
          if (m) setTimeout(() => onMove && onMove(m), 0);
        }
      }
    },
    // Aktionsleiste: Vorab-Aktion setzen (nur außerhalb des eigenen Zugs)
    setPre(p) { ui.pre = ui.pre === p ? null : p; ui.preKey = gs ? `${gs.hand}` : ''; onLocal && onLocal(); },
    toggleRaise() { ui.raiseOpen = !ui.raiseOpen; onLocal && onLocal(); },
    state: () => gs,
    me: () => me,
    help: (st, seat) => helpText(st, seat),
    target(i) {
      if (i === 'pot') return toScreen(svg, ...potAt());
      if (Number.isInteger(i)) return toScreen(svg, ...seatPos(i));
      return toScreen(svg, CX, ME_Y);
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: 100 * scale, boardPx: SIZE * scale };
    },
    destroy() { clearTimers(); clearInterval(tick); if (mq && mq.removeEventListener) mq.removeEventListener('change', onOrient); svg.remove(); }
  };
}
