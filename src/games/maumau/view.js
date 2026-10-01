// Mau-Mau-Tisch als SVG (1000 × 1000): oben die Mitspieler (verdeckte Fächer mit Kartenzahl), in der Mitte Stapel
// (antippen = ziehen) und Ablage mit Wunschfarbe/Strafe, unten die eigene Hand. Passende Karten stehen etwas höher;
// Karte antippen hebt sie an, nochmal tippen legt sie. Unter: danach Farbe wählen (Knöpfe). „Mau!“ ist ein Knopf.
// Bei vielen Karten wird die Hand enger; ein Tipp trifft dann die nächste passende Karte.
import { SUIT_NAMES, cardName, topCard } from './engine.js';
import { s, ensureDefs, place, animateSteps, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';
import { deCard, backCard, ensureCardDefs, CARD_W, CARD_H } from '../../ui/cards.js';

const SIZE = 1000, RATIO = CARD_H / CARD_W;
const HAND_Y = 815, HAND_W = 160, OPP_Y = 120, OPP_W = 84;
const STOCK = [330, 450], PILE = [590, 450], PILE_W = 170;

export function createBoard(host, { onMove, onHint, onLocal }) {
  ensureDefs();
  ensureCardDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-cards board-maumau', role: 'img', 'aria-label': 'Mau-Mau-Tisch' });
  const felt = s('g');
  felt.append(s('rect', { width: SIZE, height: SIZE, rx: 26, fill: 'url(#sb-wood-frame)' }),
    s('rect', { x: 14, y: 14, width: SIZE - 28, height: SIZE - 28, rx: 18, class: 'felt' }));
  const gOpp = s('g'), gMid = s('g'), gHand = s('g', { class: 'hand' }), gFx = s('g');
  svg.append(felt, gOpp, gMid, gHand, gFx);
  host.appendChild(svg);

  let table = null, gs = null, me = 0, legal = null, sel = null, hint = '', mau = false, seated = true, handPos = [], oppPos = {};
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const okCards = () => new Set((legal || []).filter((m) => m.type === 'play').map((m) => m.card));
  const names = () => table.seats.map((x, i) => (i === me && seated ? 'Du' : x ? (x.bot && table.seats.length === 2 ? 'Computer' : x.name) : `Spieler ${i + 1}`));

  function drawOpp() {
    gOpp.textContent = '';
    oppPos = {};
    const others = [];
    for (let k = 1; k < gs.n; k++) others.push((me + k) % gs.n);
    const nm = names();
    others.forEach((seat, j) => {
      const x = others.length === 1 ? 500 : 130 + (j * 740) / (others.length - 1);
      oppPos[seat] = [x, OPP_Y];
      const n = gs.hands[seat].length;
      const k = Math.min(n, 7);
      const spread = others.length > 2 ? 14 : 26;
      const g = s('g', { class: 'mm-opp' + (gs.turn === seat && gs.phase === 'play' ? ' active' : ''), 'data-opp': seat });
      if (gs.turn === seat && gs.phase === 'play') g.append(s('rect', { x: x - 95, y: OPP_Y - 82, width: 190, height: 212, rx: 18, class: 'bj-active' }));
      for (let i = 0; i < k; i++) {
        const c = place(backCard(OPP_W), x + (i - (k - 1) / 2) * spread, OPP_Y);
        c.style.transform += ` rotate(${(i - (k - 1) / 2) * 5}deg)`;
        g.append(c);
      }
      g.append(s("text", { x, y: OPP_Y + 112, class: "mm-count", text: `${nm[seat]}: ${n}` }));
      if (gs.mau && gs.mau[seat] && n === 1) g.append(s('text', { x, y: OPP_Y - 64, class: 'mm-mau', text: 'Mau!' }));
      gOpp.append(g);
    });
  }

  function drawMid() {
    gMid.textContent = '';
    const [sx, sy] = STOCK;
    const n = gs.stock.length;
    const canDraw = legal && legal.some((m) => m.type === 'draw');
    for (let i = 0; i < Math.min(n, 5); i++) gMid.append(place(backCard(150), sx - i * 3, sy - i * 3));
    if (!n) gMid.append(s('rect', { x: sx - 75, y: sy - 124, width: 150, height: 248, rx: 12, class: 'pile-empty' }));
    if (canDraw) gMid.append(s('rect', { x: sx - 88, y: sy - 140, width: 176, height: 280, rx: 18, class: 'mm-can' }));
    gMid.append(s('text', { x: sx, y: sy + 172, class: 'card-count', text: n ? `Stapel ${n}` : 'Stapel leer' }));
    // Ablage: oberste Karte groß, zwei darunter leicht verdreht
    const pile = gs.pile;
    const under = pile.slice(-3, -1);
    under.forEach((c, i) => {
      const el = place(deCard(c, PILE_W), PILE[0] - 10 + i * 12, PILE[1] + 4);
      el.style.transform += ` rotate(${i ? 8 : -9}deg)`;
      gMid.append(el);
    });
    const top = topCard(gs);
    if (top) {
      const el = place(deCard(top, PILE_W), ...PILE);
      el.dataset.top = top;
      gMid.append(el);
    }
    if (gs.wish) gMid.append(s('g', { class: 'mm-wish' }, s('rect', { x: 690, y: 340, width: 270, height: 74, rx: 37, class: 'mm-badge' }), s('text', { x: 825, y: 388, class: 'mm-badge-t', text: `Wunsch: ${SUIT_NAMES[gs.wish]}` })));
    if (gs.penalty > 0) gMid.append(s('g', { class: 'mm-pen' }, s('rect', { x: 690, y: 430, width: 270, height: 74, rx: 37, class: 'mm-badge pen' }), s('text', { x: 825, y: 478, class: 'mm-badge-t', text: `+${gs.penalty} ziehen` })));
    if (gs.drawn && seated && gs.turn === me) gMid.append(s('text', { x: 500, y: 640, class: 'trick-label', text: 'Gezogene Karte legen – oder „Weiter“' }));
  }

  function drawHand() {
    gHand.textContent = '';
    if (!seated) { handPos = []; return; }
    const hand = gs.hands[me].filter(Boolean);
    const n = hand.length;
    const ok = okCards();
    const gap = n > 1 ? Math.min(176, (SIZE - HAND_W - 40) / (n - 1)) : 0;
    handPos = hand.map((card, i) => ({ card, x: SIZE / 2 + (i - (n - 1) / 2) * gap, y: HAND_Y }));
    for (const p of handPos) {
      const can = legal && ok.has(p.card);
      const lift = sel === p.card ? -70 : can ? -26 : 0;
      const el = place(deCard(p.card, HAND_W), p.x, p.y + lift);
      el.dataset.hand = p.card;
      if (legal && !can) el.classList.add('dim');
      if (sel === p.card) el.classList.add('sel');
      if (gs.drawn === p.card) el.classList.add('drawn');
      gHand.append(el);
    }
    handGap = gap;
  }
  let handGap = 176;

  function render() {
    drawOpp();
    drawMid();
    drawHand();
    if (!legal) { setHint(''); return; }
    const ok = okCards();
    if (sel) return setHint(sel[1] === 'U' && gs.opts.unter ? 'Unter: Wunschfarbe unten wählen.' : `${cardName(sel)}: nochmal tippen zum Legen.`);
    if (gs.penalty > 0) return setHint(ok.size ? `Kontern mit einer 7 – oder ${gs.penalty} Karten ziehen.` : `Du musst ${gs.penalty} Karten ziehen (Stapel antippen).`);
    if (gs.drawn) return setHint(ok.size ? 'Die gezogene Karte passt – legen oder „Weiter“.' : 'Passt nicht – „Weiter“ tippen.');
    setHint(ok.size ? 'Passende Karte antippen – oder vom Stapel ziehen.' : 'Keine passende Karte – Stapel antippen zum Ziehen.');
  }

  function playMove(card, wish) {
    const m = { type: 'play', card };
    if (wish) m.wish = wish;
    if (mau) m.mau = true;
    const ok = (legal || []).some((x) => x.type === 'play' && x.card === card && (x.wish || null) === (m.wish || null) && !!x.mau === !!m.mau);
    if (!ok && m.mau) delete m.mau;   // „Mau“ nur bei der vorletzten Karte erlaubt
    sel = null; mau = false; legal = null;
    onMove(m);
  }

  const needsWish = (card) => card[1] === 'U' && gs.opts.unter && (legal || []).some((x) => x.type === 'play' && x.card === card && x.wish);

  function tap(x, y) {
    if (!legal || gs.phase !== 'play') return;
    // Stapel → ziehen
    if (Math.abs(x - STOCK[0]) < 100 && Math.abs(y - STOCK[1]) < 150) {
      const d = legal.find((m) => m.type === 'draw');
      if (d) { sel = null; legal = null; onMove(d); }
      return;
    }
    // Ablage mit angehobener Karte → legen
    if (sel && !needsWish(sel) && Math.abs(x - PILE[0]) < 110 && Math.abs(y - PILE[1]) < 160) return playMove(sel);
    const ok = okCards();
    let hit = null, bd = Infinity;
    for (const p of handPos) {
      const lift = sel === p.card ? -70 : ok.has(p.card) ? -26 : 0;
      const h = HAND_W * RATIO;
      if (y < p.y + lift - h / 2 - 20 || y > p.y + h / 2 + 30) continue;
      // nächste Karte, passende bevorzugt (enge Hand)
      const d = Math.abs(x - p.x) - (ok.has(p.card) ? Math.max(0, HAND_W / 2 - handGap / 2) : 0);
      if (Math.abs(x - p.x) <= Math.max(handGap / 2 + 6, ok.has(p.card) ? HAND_W / 2 : 0) && d < bd) { bd = d; hit = p.card; }
    }
    if (!hit) { if (sel) { sel = null; render(); onLocal && onLocal(); } return; }
    if (!ok.has(hit)) { sel = null; render(); setHint(`${cardName(hit)} passt gerade nicht.`); onLocal && onLocal(); return; }
    if (sel === hit && !needsWish(hit)) return playMove(hit);
    sel = hit;
    render();
    onLocal && onLocal();
  }

  onTap(svg, (cx, cy) => { const p = toBoard(svg, cx, cy); if (p) tap(p[0], p[1]); });

  const api = {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      gs = t.gs;
      seated = ctx.seated !== false;
      me = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) { sel = null; mau = false; }
      render();
      const m = info.kind === 'move' ? info.move : null;
      const a = ctx.anim || OWN;
      if (m && m.type === 'play') {
        const el = gMid.querySelector(`[data-top="${m.card}"]`);
        const from = info.by === me && seated ? [500, HAND_Y] : oppPos[info.by] || [500, OPP_Y];
        if (el) animateSteps(el, [from, PILE], { hop: a.slide });
      } else if (m && m.type === 'draw' && gs.last && gs.last.n) {
        // gezogene Karte(n): Rücken fliegen vom Stapel zum Spieler
        const to = info.by === me && seated ? [500, HAND_Y] : oppPos[info.by] || [500, OPP_Y];
        const k = Math.min(gs.last.n, 4);
        for (let i = 0; i < k; i++) {
          const b = place(backCard(110), ...to);
          gFx.append(b);
          const an = animateSteps(b, [STOCK, to], { hop: a.slide, delay: i * Math.min(160, a.slide / 2) });
          if (an) an.onfinish = () => b.remove(); else b.remove();
        }
      }
    },
    // für die Knöpfe (gameui.js)
    selected: () => sel,
    needsWish: () => !!sel && needsWish(sel),
    wish(suit) { if (sel && needsWish(sel)) playMove(sel, suit); },
    mauOn: () => mau,
    canMau: () => !!legal && gs.opts.mau && gs.hands[me].length === 2 && legal.some((x) => x.type === 'play'),
    toggleMau() { mau = !mau; onLocal && onLocal(); },
    // Tests
    target(x) {
      if (x === 'stock') return toScreen(svg, ...STOCK);
      if (x === 'pile') return toScreen(svg, ...PILE);
      const p = handPos.find((q) => q.card === x);
      if (!p) return null;
      const lift = sel === x ? -70 : okCards().has(x) ? -26 : 0;
      return toScreen(svg, p.x, p.y + lift);
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Math.min(HAND_W, handGap) * scale, boardPx: SIZE * scale, cardW: HAND_W * scale, gapPx: handGap * scale };
    },
    tap,
    destroy() { svg.remove(); }
  };
  return api;
}
