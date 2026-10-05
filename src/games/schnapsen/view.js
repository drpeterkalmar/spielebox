// Schnapsen-Tisch als SVG: Gegner-Hand (Rücken) oben, Talon mit quer liegendem Atout links, Stich in der Mitte,
// eigene Hand unten groß (5 Karten nebeneinander, Tipp = anheben, zweiter Tipp = ausspielen).
// Die Knöpfe (Ansagen, Austauschen, Zudrehen, Ausmelden) kommen aus gameui.js in die Aktionsleiste.
// Rechts die Stichstapel: eigener unten (verdeckt gefächert, Anzahl, antippen = Stich-Blatt), gegnerischer oben (nur Anzahl).
import { SUIT_NAMES, canDeclare, cardName } from './engine.js';
import { s, ensureDefs, place, animateSteps, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';
import { deCard, backCard, ensureCardDefs, CARD_W, CARD_H } from '../../ui/cards.js';
import { boardLayers } from '../../ui/deko.js';
import { woodFrame, feltRect } from '../../ui/material.js';
import { confetti, stars } from '../../ui/fx.js';

const SIZE = 1000;
const HAND_Y = 812, HAND_W = 182, HAND_GAP = 196;
const OPP_Y = 118, OPP_W = 118, OPP_GAP = 92;
const TALON = [150, 440], TRICK = [610, 430];
const RATIO = CARD_H / CARD_W;
const PILE_W = 78, PILE_ME = [902, 590], PILE_OPP = [902, 128];   // Stichstapel rechts (eigener unten)

export function createBoard(host, { onMove, onHint, onStiche }) {
  ensureDefs();
  ensureCardDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-cards board-schnapsen', role: 'img', 'aria-label': 'Schnapsen-Tisch' });
  const felt = s('g');
  const gTalon = s('g', { class: 'talon' });
  const gTrick = s('g', { class: 'trick' });
  const gOpp = s('g', { class: 'opp' });
  const gHand = s('g', { class: 'hand' });
  const gInfo = s('g', { class: 'info' });
  const gPiles = s('g', { class: 'piles' });
  svg.append(felt, gTalon, gOpp, gPiles, gTrick, gHand, gInfo);
  host.appendChild(svg);
  // Deko: Tisch (Holzrand, Filz mit Licht und Ziernaht) in der statischen Ebene darunter
  const L = boardLayers(svg, host);
  if (L) { const b = L.under.appendChild(s('g')); woodFrame(b, 0, 0, SIZE, SIZE, 26); feltRect(b, 14, 14, SIZE - 28, SIZE - 28, 18); }
  else felt.append(s('rect', { width: SIZE, height: SIZE, rx: 26, fill: 'url(#sb-wood-frame)' }), s('rect', { x: 14, y: 14, width: SIZE - 28, height: SIZE - 28, rx: 18, class: 'felt' }));

  let table = null, gs = null, me = 0, legal = null, sel = null, hint = '', seated = true;
  let handPos = [];   // [{card, x, y}]

  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const playable = () => new Set((legal || []).filter((m) => m.type === 'play').map((m) => m.card));

  function drawTalon() {
    gTalon.textContent = '';
    if (!gs || !gs.atout) return;
    const [x, y] = TALON;
    const w = 150, h = w * RATIO;
    if (gs.atoutCard) {
      const a = place(deCard(gs.atoutCard, w), x + 96, y);
      a.firstChild && a.setAttribute('data-atout', '1');
      a.style.transform += ' rotate(90deg)';
      gTalon.append(a);
    }
    const n = gs.talon.length;
    for (let i = 0; i < Math.min(n, 4); i++) gTalon.append(place(backCard(w), x - 8 - i * 3, y - i * 3));
    if (n) gTalon.append(s('text', { x: x - 20, y: y + h / 2 + 44, class: 'card-count', text: gs.closed ? 'zugedreht' : `Talon ${n}` }));
    else gTalon.append(s('text', { x: x, y: y + 20, class: 'card-count', text: gs.closed ? 'zugedreht' : '' }));
    if (gs.closed && n) gTalon.append(s('path', { d: `M ${x - 90} ${y - 120} L ${x + 70} ${y + 110}`, class: 'closed-bar' }));
    // Atout-Farbe groß daneben, auch wenn die Karte weg ist
    gTalon.append(s('text', { x: x, y: 128 + 150, class: 'atout-label', text: `Atout: ${SUIT_NAMES[gs.atout]}` }));
  }

  function drawOpp() {
    gOpp.textContent = '';
    const n = gs.hands[1 - me].length;
    for (let i = 0; i < n; i++) {
      const c = gs.hands[1 - me][i];
      const x = SIZE / 2 + (i - (n - 1) / 2) * OPP_GAP;
      const el = place(c ? deCard(c, OPP_W) : backCard(OPP_W), x, OPP_Y);
      el.dataset.opp = i;
      gOpp.append(el);
    }
  }

  function trickCards() {
    if (gs.trick.length) return { cards: gs.trick, done: false };
    const lm = table.last && table.last.m;
    if (gs.lastTrick && lm && lm.type === 'play' && gs.phase === 'play') return { cards: gs.lastTrick.cards, done: true, winner: gs.lastTrick.winner };
    if (gs.phase === 'spielende' && gs.lastTrick) return { cards: gs.lastTrick.cards, done: true, winner: gs.lastTrick.winner };
    return { cards: [], done: false };
  }

  function trickPos(k, seat) {
    const [x, y] = TRICK;
    return seat === me ? [x + 40 * (k ? 1 : -1) * 0 + (k ? 60 : -30), y + 70] : [x + (k ? 60 : -30), y - 60];
  }

  function drawTrick() {
    gTrick.textContent = '';
    const tc = trickCards();
    tc.cards.forEach((e, k) => {
      const [x, y] = trickPos(k, e.seat);
      const el = place(deCard(e.card, 170), x, y);
      el.dataset.trick = e.card;
      if (tc.done) el.classList.add('done');
      gTrick.append(el);
    });
    if (tc.done && tc.cards.length === 2 && gs.phase === 'play') {
      const who = tc.winner === me ? 'Dein Stich' : 'Stich für den Gegner';
      gTrick.append(s('text', { x: 880, y: TRICK[1] + 10, class: 'trick-label', text: who.replace('Stich für den Gegner', 'Gegner sticht') }));
    }
  }

  // Stichstapel: nur verdeckte Rücken und die Anzahl – nie Kartenwerte im Bild oder in Attributen
  function drawPiles() {
    gPiles.textContent = '';
    if (!gs || (gs.phase !== 'play' && gs.phase !== 'spielende')) return;
    const pile = ([x, y], n, mine) => {
      const h = PILE_W * RATIO;
      const g = s('g', { class: 'pile' + (mine ? ' pile-me' : ' pile-opp'), 'data-pile': mine ? 'me' : 'opp' });
      if (!n) g.append(s('rect', { x: x - PILE_W / 2, y: y - h / 2, width: PILE_W, height: h, rx: 8, class: 'pile-empty' }));
      const k = Math.min(n, 5);
      for (let i = 0; i < k; i++) {
        const c = place(backCard(PILE_W), x + (i - (k - 1) / 2) * 7, y - i * 2);
        c.style.transform += ` rotate(${(i - (k - 1) / 2) * 9}deg)`;
        g.append(c);
      }
      const label = n ? `${n} ${n === 1 ? 'Stich' : 'Stiche'}` : 'kein Stich';
      g.append(s('text', { x, y: mine ? y - h / 2 - 16 : y + h / 2 + 36, class: 'pile-label', text: label }));
      if (mine && n && onStiche) g.append(s('text', { x, y: y + 12, class: 'pile-tap', text: '👁' }));
      return g;
    };
    gPiles.append(pile(PILE_OPP, gs.tricks[1 - me], false));
    if (seated) gPiles.append(pile(PILE_ME, gs.tricks[me], true));
    else gPiles.append(pile(PILE_ME, gs.tricks[me], false));
  }

  function hitPile(x, y) {
    const h = PILE_W * RATIO;
    return seated && Math.abs(x - PILE_ME[0]) <= PILE_W / 2 + 34 && y >= PILE_ME[1] - h / 2 - 44 && y <= PILE_ME[1] + h / 2 - 4;
  }

  function hitHand(x, y) {
    for (const p of handPos) {
      const lift = sel === p.card ? -46 : 0;
      const h = HAND_W * RATIO;
      if (Math.abs(x - p.x) <= Math.min(HAND_GAP, HAND_W) / 2 + 4 && y >= p.y + lift - h / 2 - 10 && y <= p.y + h / 2 + 20) return p.card;
    }
    return null;
  }

  function drawHand() {
    gHand.textContent = '';
    const hand = gs.hands[me].filter(Boolean);
    const n = hand.length;
    const ok = playable();
    const gap = n > 5 ? (SIZE - HAND_W - 20) / (n - 1) : HAND_GAP;
    handPos = hand.map((card, i) => ({ card, x: SIZE / 2 + (i - (n - 1) / 2) * gap, y: HAND_Y }));
    for (const p of handPos) {
      const lift = sel === p.card ? -46 : 0;
      const el = place(deCard(p.card, HAND_W), p.x, p.y + lift);
      el.dataset.hand = p.card;
      if (legal && legal.length && !ok.has(p.card)) el.classList.add('dim');
      if (sel === p.card) el.classList.add('sel');
      gHand.append(el);
    }
  }

  function drawInfo() {
    gInfo.textContent = '';
    if (gs.phase !== 'spielende' || !gs.spiel) return;
    const sp = gs.spiel;
    const box = s('g', { class: 'spiel-end' });
    const names = table.seats.map((x, i) => (x ? x.name : `Spieler ${i + 1}`));
    const title = `${sp.winner === me ? 'Du gewinnst' : names[sp.winner] + ' gewinnt'} ${sp.points} ${sp.points === 1 ? 'Punkt' : 'Punkte'}`;
    box.append(
      s('rect', { x: 120, y: 300, width: 760, height: 290, rx: 26, class: 'end-card' }),
      s('text', { x: 500, y: 368, class: 'end-title', text: title }),
      s('text', { x: 500, y: 420, class: 'end-sub', text: sp.reason || '' }),
      s('text', { x: 500, y: 478, class: 'end-sub', text: `Augen: ${names[me]} ${sp.augen[me]} · ${names[1 - me]} ${sp.augen[1 - me]}` }),
      s('text', { x: 500, y: 536, class: 'end-sub', text: `Stand im Bummerl: ${gs.points[me]} : ${gs.points[1 - me]}` }));
    gInfo.append(box);
  }

  function render() {
    drawTalon();
    drawOpp();
    drawPiles();
    drawTrick();
    drawHand();
    drawInfo();
    if (!legal) { setHint(''); return; }
    if (gs.phase === 'spielende') { setHint(''); return; }
    if (gs.openAnsage) return setHint(`Spiel König oder Ober (${SUIT_NAMES[gs.openAnsage]}) aus.`);
    if (sel) return setHint(`${cardName(sel)}: nochmal tippen zum Ausspielen.`);
    if (gs.trick.length) return setHint(gs.closed || !gs.talon.length ? 'Farbe bedienen und wenn möglich stechen.' : 'Tippe eine Karte an, um zuzugeben.');
    setHint(canDeclare(gs) ? 'Du hast 66 – du kannst dich ausmelden.' : 'Tippe eine Karte an, um auszuspielen.');
  }

  function tap(x, y) {
    if (!legal || !gs || gs.phase !== 'play') return;
    const ok = playable();
    let hit = null;
    for (const p of handPos) {
      const lift = sel === p.card ? -46 : 0;
      const h = HAND_W * RATIO;
      if (Math.abs(x - p.x) <= Math.min(HAND_GAP, HAND_W) / 2 + 4 && y >= p.y + lift - h / 2 - 10 && y <= p.y + h / 2 + 20) hit = p.card;
    }
    // Tipp in die Stichmitte spielt die angehobene Karte
    if (!hit && sel && Math.abs(x - TRICK[0]) < 200 && Math.abs(y - TRICK[1]) < 200) hit = sel;
    if (!hit) { sel = null; return render(); }
    if (!ok.has(hit)) { sel = null; render(); setHint(`${cardName(hit)} darfst du jetzt nicht spielen.`); return; }
    if (sel === hit) {
      sel = null;
      legal = null;
      onMove({ type: 'play', card: hit });
      return;
    }
    sel = hit;
    render();
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (!p) return;
    // eigener Stichstapel → Stich-Blatt (außer der Tipp trifft eine angehobene Handkarte)
    if (hitPile(p[0], p[1]) && !(sel && hitHand(p[0], p[1]))) { if (onStiche) onStiche(); return; }
    tap(p[0], p[1]);
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      gs = t.gs;
      me = ctx.viewer === 1 ? 1 : 0;
      seated = ctx.seated !== false;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) sel = null;
      render();
      // Deko: eigenes Spiel gewonnen (Ergebnis-Karte erscheint) → Sterne und ein wenig Konfetti
      const a0 = ctx.anim || OWN;
      if (info.kind === 'move' && a0.slide > 0 && gs.phase === 'spielende' && gs.spiel && gs.spiel.winner === me && seated && info.prevGs && info.prevGs.phase !== 'spielende') {
        setTimeout(() => {
          if (!svg.isConnected) return;
          const r = svg.getBoundingClientRect();
          stars([r.left + r.width / 2, r.top + r.height * 0.35], { count: 9, spread: 6, size: 24 });
          confetti({ rect: { left: r.left, top: r.top, width: r.width, height: r.height }, count: 45, life: 2200 });
        }, a0.slide + 150);
      }
      // Animation: gespielte Karte fliegt aus der Hand in die Mitte (Gegner: langsam von seiner Hand)
      if (info.kind === 'move' && info.move && info.move.type === 'play') {
        const a = ctx.anim || OWN;
        const el = gTrick.querySelector(`[data-trick="${info.move.card}"]`);
        if (el) {
          const from = info.by === me ? [SIZE / 2, HAND_Y] : [SIZE / 2, OPP_Y];
          animateSteps(el, [from, [Number(el.dataset.x), Number(el.dataset.y)]], { hop: a.slide });
        }
      }
    },
    // Bildschirmpunkt einer Handkarte bzw. der Stichmitte / des eigenen Stichstapels (Tests)
    target(card) {
      if (card === 'trick') return toScreen(svg, TRICK[0], TRICK[1]);
      if (card === 'pile') return toScreen(svg, PILE_ME[0], PILE_ME[1]);
      const p = handPos.find((q) => q.card === card);
      return p ? toScreen(svg, p.x, p.y + (sel === card ? -46 : 0)) : null;
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Math.min(HAND_W, HAND_GAP) * scale, boardPx: SIZE * scale, cardW: HAND_W * scale };
    },
    tap,
    destroy() { svg.remove(); }
  };
}
