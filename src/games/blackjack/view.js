// Blackjack-Tisch als SVG (1000 × 1000): oben die Bank (Karten, Summe), in der Mitte die anderen Spieler
// (kleine Karten, Einsatz, Ergebnis), unten groß der eigene Platz. Nach der Runde bleiben die Karten mit
// Ergebnis liegen, bis neu ausgeteilt wird. Knöpfe (Setzen, Ziehen, Stehen, Verdoppeln, Teilen) aus gameui.js.
import { handValue, fmtBeans } from './engine.js';
import { s, ensureDefs, place, flyIn, fadeIn, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';
import { frCard, backCard, ensureCardDefs, frHeight } from '../../ui/cards.js';
import { SEAT_COLORS } from '../../ui/seatcolors.js';
import { DEKO, boardLayers } from '../../ui/deko.js';
import { spriteImage } from '../../ui/sprites.js';
import { woodFrame, feltRect } from '../../ui/material.js';

const SIZE = 1000;
const RES = { bj: 'Black Jack!', win: 'gewonnen', push: 'unentschieden', lose: 'verloren', bust: 'überkauft' };

export function createBoard(host, { onHint }) {
  ensureDefs();
  ensureCardDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-cards board-bj', role: 'img', 'aria-label': 'Blackjack-Tisch' });
  const felt = s('g');
  const gBank = s('g'), gOthers = s('g'), gMe = s('g');
  svg.append(felt, gBank, gOthers, gMe);
  host.appendChild(svg);
  // Deko: Tisch mit gedrucktem Bogen und Regel in Gold, Kartenschuh rechts oben – statische Ebene darunter
  const L = boardLayers(svg, host);
  const fb = L ? L.under.appendChild(s('g')) : felt;
  if (L) {
    woodFrame(fb, 0, 0, SIZE, SIZE, 26);
    feltRect(fb, 14, 14, SIZE - 28, SIZE - 28, 18);
    fb.append(s('path', { d: 'M 90 330 Q 500 520 910 330', class: 'bj-arc dk-print' }), s('path', { d: 'M 104 352 Q 500 548 896 352', class: 'bj-arc dk-print thin' }),
      s('text', { x: 500, y: 372, class: 'bj-rule dk-print', text: 'BANK ZIEHT BIS 16 · STEHT AB 17 · BLACK JACK ZAHLT 3:2' }));
    // Kartenschuh (dort kommen die Karten her)
    fb.append(s('g', { class: 'dk-shoe' },
      s('rect', { x: 846, y: 30, width: 112, height: 70, rx: 12, fill: 'rgba(0,0,0,.3)', transform: 'translate(4 8)' }),
      s('rect', { x: 846, y: 30, width: 112, height: 70, rx: 12, fill: 'url(#sb-wood-frame)', stroke: '#2a160b', 'stroke-width': 3 }),
      s('rect', { x: 846, y: 30, width: 112, height: 70, rx: 12, fill: 'url(#dk-sheen)' }),
      s('rect', { x: 862, y: 44, width: 80, height: 16, rx: 4, fill: '#7a1622', stroke: '#e9c46a', 'stroke-width': 2 })));
  } else {
    fb.append(
      s('rect', { width: SIZE, height: SIZE, rx: 26, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: 14, y: 14, width: SIZE - 28, height: SIZE - 28, rx: 18, class: 'felt' }),
      s('path', { d: 'M 90 330 Q 500 520 910 330', class: 'bj-arc' }),
      s('text', { x: 500, y: 372, class: 'bj-rule', text: 'BANK ZIEHT BIS 16 · STEHT AB 17 · BLACK JACK ZAHLT 3:2' }));
  }
  onTap(svg, () => {});

  let table = null, gs = null, me = 0, seen = new Set(), anim = OWN, tempo = OWN;

  // key: Runde (laufende = gs.round + 1, gezeigte letzte = lastRound.round) + Platz/Hand → Karten fliegen nur einmal herein
  function cardsRow(g, cards, cx, cy, w, { key: rowKey = '', label, sub, dim, badge, active, bank } = {}) {
    const n = cards.length;
    const off = w * 0.42;
    const x0 = cx - ((n - 1) * off) / 2;
    const h = frHeight(w);
    if (active) g.append(s('rect', { x: x0 - w / 2 - 10, y: cy - h / 2 - 10, width: (n - 1) * off + w + 20, height: h + 20, rx: 14, class: 'bj-active' }));
    cards.forEach((c, i) => {
      const el = place(c ? frCard(c, w) : backCard(w, h), x0 + i * off, cy);
      if (dim) el.classList.add('done');
      const key = `${rowKey}|${i}|${c}`;
      if (!seen.has(key)) { seen.add(key); el.dataset.fresh = bank ? 'bank' : '1'; }
      g.append(el);
    });
    if (label) g.append(s('text', { x: cx, y: cy + h / 2 + 34, class: 'bj-label', text: label }));
    if (sub) g.append(s('text', { x: cx, y: cy + h / 2 + 66, class: 'bj-sub', text: sub, 'data-after': bank ? 'bank' : null }));
    if (badge) {
      const bw = Math.max(120, badge.text.length * 17);
      g.append(s('g', { 'data-after': 'bank' },
        s('rect', { x: cx - bw / 2, y: cy - 24, width: bw, height: 44, rx: 22, class: 'bj-badge ' + badge.cls }),
        s('text', { x: cx, y: cy + 7, class: 'bj-badge-t', text: badge.text })));
    }
  }

  // Deko: Einsatz als Bohnen-Häufchen (Spirale, immer gleich gelegt – kein Zittern beim Neuzeichnen)
  function beans(g, cx, cy, amount, k = 1) {
    const n = Math.max(1, Math.min(14, Math.round(amount)));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const r = 9.5 * Math.sqrt(i) * k, a = i * 2.39996;
      pts.push([cx + Math.cos(a) * r * 1.25, cy + Math.sin(a) * r * 0.72, (i * 53) % 180 - 90]);
    }
    pts.sort((p, q) => p[1] - q[1]);
    const pile = s('g', { class: 'dk-beans' });
    for (const [x, y, rot] of pts) {
      const tr = `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot})`;
      const img = spriteImage(s, 'bean', 13.5 * k);
      if (img) { img.setAttribute('transform', tr); pile.append(img); }
      else pile.append(s('use', { href: '#dk-bean', x: -15 * k, y: -11 * k, width: 30 * k, height: 22 * k, transform: tr }));
    }
    g.append(pile);
  }

  const total = (cards) => {
    if (!cards.length || cards.some((c) => !c)) return '';
    const v = handValue(cards);
    return v.bj ? 'Black Jack' : v.total > 21 ? `${v.total} – überkauft` : `${v.soft && v.total <= 21 ? 'weich ' : ''}${v.total}`;
  };

  const names = () => table.seats.map((x, i) => (i === me ? 'Du' : x ? x.name : `Platz ${i + 1}`));

  // was gezeigt wird: laufende Runde, sonst die letzte Runde mit Ergebnis
  function spot(seat) {
    const cur = gs.hands[seat] || [];
    if (gs.phase === 'play' || cur.some((hd) => hd.cards.length)) return { hands: cur, done: false, round: gs.round + 1 };
    const lr = gs.lastRound;
    if (lr && lr.hands[seat] && lr.hands[seat].length) return { hands: lr.hands[seat], done: true, round: lr.round };
    return { hands: [], done: false, round: gs.round + 1 };
  }

  function drawBank() {
    gBank.textContent = '';
    const running = gs.phase === 'play' || gs.bankCards.length;
    const lr = gs.lastRound;
    const cards = running && gs.bankCards.length ? gs.bankCards : lr ? lr.bankCards : [];
    const bankSeat = running || !lr ? gs.bank : lr.bank;
    const t = total(cards);
    const rnd = running && gs.bankCards.length ? gs.round + 1 : lr ? lr.round : gs.round + 1;
    cardsRow(gBank, cards, 500, 150, 118, { key: `${rnd}|bank`, bank: true, label: `Bank: ${names()[bankSeat]}`, sub: t ? `${t}` : `${fmtBeans(gs.beans[gs.bank])} Bohnen` });
  }

  function drawPlayers() {
    gOthers.textContent = '';
    gMe.textContent = '';
    const n = table.seats.length;
    const others = [];
    for (let k = 1; k <= n; k++) {
      const seat = (gs.bank + k) % n;
      if (seat === gs.bank) continue;
      if (seat === me) continue;
      others.push(seat);
    }
    const w = others.length > 3 ? 84 : 100;
    gOthers.dataset.room = others.length > 3 ? 'eng' : '';
    others.forEach((seat, i) => {
      const cx = (SIZE / (others.length + 1)) * (i + 1);
      drawSpot(gOthers, seat, cx, 500, w, true);
    });
    if (me !== gs.bank && me !== null) drawSpot(gMe, me, 500, 815, 140, false);
  }

  function drawSpot(g, seat, cx, cy, w, small) {
    const sp = spot(seat);
    const name = names()[seat];
    const col = SEAT_COLORS[seat % 6];
    g.append(s('circle', { cx: cx - (small ? 0 : 0), cy: cy + frHeight(w) / 2 + (small ? 88 : 90), r: 0 }));
    if (!sp.hands.length) {
      const bet = gs.bets[seat];
      g.append(s('circle', { cx, cy, r: small ? 34 : 44, class: 'bj-spot', stroke: col }));
      if (DEKO.on && bet) {
        beans(g, cx, cy - 4, bet, small ? 1 : 1.25);
        g.append(s('text', { x: cx, y: cy + (small ? 30 : 38), class: 'bj-bet dk-bet', text: fmtBeans(bet) }));
      } else g.append(s('text', { x: cx, y: cy + 8, class: 'bj-bet', text: bet ? fmtBeans(bet) : '' }));
      g.append(s('text', { x: cx, y: cy + (small ? 72 : 90), class: 'bj-label', text: seat === me ? 'Du' : name }));
      g.append(s('text', { x: cx, y: cy + (small ? 104 : 124), class: 'bj-sub', text: `${fmtBeans(gs.beans[seat])} Bohnen` }));
      return;
    }
    const k = sp.hands.length;
    const gap = small ? w * 1.1 : 330;
    sp.hands.forEach((hd, j) => {
      const hx = cx + (j - (k - 1) / 2) * gap;
      const active = !sp.done && gs.phase === 'play' && gs.turn === seat && gs.hand === j;
      const winTxt = `${hd.win > 0 ? '+' : hd.win < 0 ? '−' : '±'}${fmtBeans(Math.abs(hd.win || 0))}`;
      const res = sp.done && hd.result ? { text: small ? `${hd.result === 'bj' ? 'BJ ' : ''}${winTxt}` : `${RES[hd.result]} ${winTxt}`, cls: hd.win > 0 ? 'plus' : hd.win < 0 ? 'minus' : 'even' } : null;
      const mine = `${j === 0 ? 'Du · ' : ''}${total(hd.cards)}${hd.bet ? ` · Einsatz ${fmtBeans(hd.bet)}${hd.doubled ? ' ×2' : ''}` : ''}`;
      cardsRow(g, hd.cards, hx, cy, w, { key: `${sp.round}|${seat}|${j}`, label: small ? (j === 0 ? name : '') : mine, sub: small ? total(hd.cards) : '', dim: sp.done, badge: res, active });
      // Deko: Einsatz liegt als Häufchen links neben den Karten (bei den anderen nur, wenn Platz ist)
      if (DEKO.on && hd.bet && !sp.done && (!small || k === 1 && g.dataset.room !== 'eng')) {
        const kk = small ? 0.95 : 1.35;
        beans(g, hx - ((hd.cards.length - 1) * w * 0.42) / 2 - w / 2 - 34 * kk, cy + (small ? 30 : 24), hd.bet * (hd.doubled ? 2 : 1), kk);
      }
    });
    if (small) g.append(s('text', { x: cx, y: cy + frHeight(w) / 2 + 98, class: 'bj-sub', text: `${fmtBeans(gs.beans[seat])} Bohnen` }));
  }

  function render() {
    drawBank();
    drawPlayers();
    // neue Karten fliegen vom Schuh (rechts oben) herein; Bank-Karten am Rundenende eine nach der anderen
    // (Abstand bankGap), Summe und Ergebnisse erst danach
    const bankNew = [...gBank.querySelectorAll('[data-fresh="bank"]')];
    const reveal = gs.phase !== 'play' && gs.lastRound && bankNew.length ? bankNew.length : 0;
    for (const el of svg.querySelectorAll('[data-fresh="1"]')) {
      delete el.dataset.fresh;
      flyIn(el, [900, 60], anim.slide);
    }
    bankNew.forEach((el, k) => {
      delete el.dataset.fresh;
      flyIn(el, [900, 60], reveal ? tempo.slide : anim.slide, reveal ? k * tempo.bankGap : 0);
    });
    if (reveal) {
      const after = (reveal - 1) * tempo.bankGap + tempo.slide;
      for (const el of svg.querySelectorAll('[data-after="bank"]')) fadeIn(el, after, tempo.slide ? 300 : 0);
    }
  }

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      table = t;
      gs = t.gs;
      me = ctx.viewer === undefined ? null : ctx.viewer;
      anim = info.kind === 'move' ? ctx.anim || OWN : OWN;
      tempo = ctx.tempo || OWN;
      render();
      const legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal) onHint && onHint('');
      else if (gs.phase === 'bet') onHint && onHint('Wähle deinen Einsatz.');
      else onHint && onHint(`Deine Hand: ${total(gs.hands[me][gs.hand].cards)} – ziehen oder stehen?`);
    },
    target() { return toScreen(svg, 500, 810); },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: 150 * scale, boardPx: SIZE * scale };
    },
    destroy() { svg.remove(); }
  };
}
