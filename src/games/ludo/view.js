// Ludo-Brett als SVG (11 × 11 Felder, Kreuzform): 40 Bahnfelder, je Farbe 4 Häuschen und 4 Zielfelder.
// Das Brett ist so gedreht, dass die eigene Farbe links unten steht. Würfel neben dem Häuschen dessen, der dran ist.
// Bedienung: „Würfeln“ (Knopf oder Würfel antippen), dann ziehbare Figur antippen (oder ihr Zielfeld).
// Felder sind am Handy nur ~35 px groß → ein Tipp trifft immer den nächsten sinnvollen Kandidaten.
import { s, ensureDefs, place, animateSteps, toBoard, toScreen, onTap, die3d, ball } from '../../ui/svg.js';
import { OWN, ludoStep } from '../../tempo.js';
import { boardLayers } from '../../ui/deko.js';
import { woodFrame, inset } from '../../ui/material.js';
import * as FXS from '../../ui/fxsvg.js';
import { hopWave } from '../../ui/sieg.js';
import { mayRollThrice } from './engine.js';
import { SEAT_COLORS, SEAT_SYMBOLS } from '../../ui/seatcolors.js';

const U = 100, F = 20, SIZE = 11 * U + 2 * F;
const PR = 34;
// Laufbahn für Rot (Farbe 0) im Uhrzeigersinn ab dem roten Startfeld; andere Farben = gedreht (90° je Farbe)
const TRACK = [[4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5], [0, 4], [1, 4], [2, 4], [3, 4], [4, 4],
  [4, 3], [4, 2], [4, 1], [4, 0], [5, 0], [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5], [10, 6],
  [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10]];
const GOAL = [[5, 9], [5, 8], [5, 7], [5, 6]];
const HOME = [[0, 9], [1, 9], [0, 10], [1, 10]];
const DIE_AT = [2.55, 7.95];   // Würfel neben dem Häuschen (Rot-Lage)
const rot = (x, y, k) => { for (let i = 0; i < ((k % 4) + 4) % 4; i++) [x, y] = [10 - y, x]; return [x, y]; };

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-ludo', role: 'img', 'aria-label': 'Ludo-Brett' });
  const gBoard = s('g'), gPieces = s('g', { class: 'pieces' }), gHints = s('g', { class: 'hints' }), gDie = s('g', { class: 'dice' });
  const gFx = s('g', { class: 'fx' });
  svg.append(gBoard, gHints, gPieces, gDie, gFx);
  host.appendChild(svg);
  const L = boardLayers(svg, host);
  const gB = L ? L.under.appendChild(s('g')) : gBoard;

  let table = null, gs = null, legal = null, view = -1, hint = '', anim = OWN, lastDieKey = '', timers = [];
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const colorOf = (seat) => (gs && gs.colors ? gs.colors[seat] : seat);
  // Feld (Rot-Koordinaten) einer Farbe → Bildschirm-Mitte (gedreht, damit die eigene Farbe unten links ist)
  const cxy = ([x, y], color) => { const [a, b] = rot(x, y, color - view); return [F + a * U + U / 2, F + b * U + U / 2]; };
  function posXY(seat, p, k) {
    const c = colorOf(seat);
    if (p < 0) return cxy(HOME[k], c);
    if (p >= 40) return cxy(GOAL[Math.min(3, p - 40)], c);
    return cxy(TRACK[p % 40], c);
  }

  function drawBoard() {
    gB.textContent = '';
    if (L) {
      woodFrame(gB, 0, 0, SIZE, SIZE, 22);
      inset(gB, F, F, 11 * U, 11 * U, 12, 'url(#sb-wood-light)');
    } else {
      gB.append(s('rect', { width: SIZE, height: SIZE, rx: 22, fill: 'url(#sb-wood-frame)' }),
        s('rect', { x: F, y: F, width: 11 * U, height: 11 * U, rx: 12, fill: 'url(#sb-wood-light)' }));
    }
    const gBoard = gB;
    const used = new Set((gs.colors || [0, 1, 2, 3]));
    for (let c = 0; c < 4; c++) {
      const col = SEAT_COLORS[c];
      // Ecke der Farbe leicht getönt
      const [x0, y0] = cxy([0, 7], c), [x1, y1] = cxy([3, 10], c);
      gBoard.append(s('rect', { x: Math.min(x0, x1) - U / 2 + 6, y: Math.min(y0, y1) - U / 2 + 6, width: Math.abs(x1 - x0) + U - 12, height: Math.abs(y1 - y0) + U - 12, rx: 30, fill: col, opacity: used.has(c) ? 0.2 : 0.07 }));
    }
    // Bahn als verbundene Linie, dann die Felder
    const pts = TRACK.map((f) => cxy(f, 0));
    gBoard.append(s('polygon', { points: pts.map((p) => p.join(',')).join(' '), fill: 'none', stroke: 'rgba(70,40,15,.35)', 'stroke-width': 10, 'stroke-linejoin': 'round' }));
    for (let c = 0; c < 4; c++) {
      const col = SEAT_COLORS[c];
      for (let i = 0; i < 10; i++) {
        const [x, y] = cxy(TRACK[i], c);
        const start = i === 0;
        gBoard.append(s('circle', { cx: x, cy: y, r: 40, class: 'ld-field' + (start ? ' start' : ''), style: start ? `fill:${col}` : null }));
        if (start) gBoard.append(s('path', { d: `M ${x - 14} ${y - 12} L ${x + 14} ${y} L ${x - 14} ${y + 12} Z`, fill: 'rgba(255,255,255,.75)', transform: `rotate(${startDir(c)} ${x} ${y})` }));
      }
      for (const g of GOAL) { const [x, y] = cxy(g, c); gBoard.append(s('circle', { cx: x, cy: y, r: 38, class: 'ld-goal', fill: col })); }
      for (const g of HOME) { const [x, y] = cxy(g, c); gBoard.append(s('circle', { cx: x, cy: y, r: 38, class: 'ld-home', fill: col, opacity: used.has(c) ? 1 : 0.35 })); }
    }
    const [mx, my] = cxy([5, 5], 0);
    gBoard.append(s('circle', { cx: mx, cy: my, r: 30, fill: 'rgba(70,40,15,.25)' }));
    if (L) {
      // Deko: alle Felder leicht eingelassen (oben Schatten, unten Licht)
      const holes = s('g', { fill: 'none', stroke: 'url(#dk-hole)', 'stroke-width': 7 });
      const ring = (x, y, r) => holes.append(s('circle', { cx: x, cy: y, r: r - 4 }));
      for (let c = 0; c < 4; c++) {
        for (let i = 0; i < 10; i++) ring(...cxy(TRACK[i], c), 40);
        for (const g of GOAL) ring(...cxy(g, c), 38);
        for (const g of HOME) ring(...cxy(g, c), 38);
      }
      gBoard.append(holes);
    }
  }

  // Laufrichtung am Startfeld (Pfeil): erste Teilstrecke der Bahn der Farbe
  function startDir(c) {
    const [ax, ay] = cxy(TRACK[0], c), [bx, by] = cxy(TRACK[1], c);
    return Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
  }

  function pawn(seat) {
    const c = colorOf(seat);
    if (L) {
      // Deko: Figur von oben als glänzende Kugel (Kopf) auf dunklerem Fuß, Symbol bleibt (farbenblind)
      const g = ball(SEAT_COLORS[c], PR, { ring: true });
      g.setAttribute('class', 'pc ld-pawn dk-ball');
      g.append(s('text', { y: 12, class: 'ld-sym', text: SEAT_SYMBOLS[c] }));
      return g;
    }
    const g = s('g', { class: 'pc ld-pawn' });
    g.append(s('ellipse', { cx: 4, cy: 10, rx: PR, ry: PR * 0.9, fill: 'url(#sb-shadow)' }),
      s('circle', { r: PR, fill: SEAT_COLORS[c], stroke: 'rgba(0,0,0,.6)', 'stroke-width': 3.5 }),
      s('circle', { cy: -PR * 0.18, r: PR * 0.55, fill: 'rgba(255,255,255,.28)' }),
      s('text', { y: 12, class: 'ld-sym', text: SEAT_SYMBOLS[c] }));
    return g;
  }

  function renderPieces() {
    gPieces.textContent = '';
    (gs.pieces || []).forEach((ps, seat) => ps.forEach((p, k) => {
      const el = place(pawn(seat), ...posXY(seat, p, k));
      el.dataset.seat = seat;
      el.dataset.k = k;
      gPieces.append(el);
    }));
  }
  const pawnEl = (seat, k) => gPieces.querySelector(`[data-seat="${seat}"][data-k="${k}"]`);

  function die(x, y, v, size, cls = '') {
    if (L) { const d = die3d(v, size, { blank: !v, cls }); d.setAttribute('transform', `translate(${x} ${y})`); return d; }
    const g = s('g', { class: 'die ' + cls, transform: `translate(${x} ${y})` });
    g.append(s('rect', { x: -size / 2, y: -size / 2, width: size, height: size, rx: size * 0.18, class: 'die-face' }));
    const o = size * 0.26;
    const pips = { 1: [[0, 0]], 2: [[-o, -o], [o, o]], 3: [[-o, -o], [0, 0], [o, o]], 4: [[-o, -o], [o, -o], [-o, o], [o, o]], 5: [[-o, -o], [o, -o], [0, 0], [-o, o], [o, o]], 6: [[-o, -o], [o, -o], [-o, 0], [o, 0], [-o, o], [o, o]] }[v] || [];
    for (const [px, py] of pips) g.append(s('circle', { cx: px, cy: py, r: size * 0.09, class: 'die-pip' }));
    return g;
  }

  // Würfel: beim Spieler, der gerade würfelt bzw. zuletzt gewürfelt hat
  function renderDie() {
    gDie.textContent = '';
    const lr = gs.lastRoll;
    const seat = gs.phase === 'move' ? gs.turn : lr && gs.phase !== 'over' && lr.seat !== gs.turn && !(legal && gs.phase === 'roll') ? lr.seat : gs.turn;
    const value = gs.phase === 'move' ? gs.die : lr && lr.seat === seat ? lr.value : null;
    const [x, y] = cxy(DIE_AT, colorOf(seat));
    const canRoll = !!(legal && legal.some((m) => m.type === 'roll'));
    const grp = s('g', { class: 'ld-die' + (canRoll ? ' can' : ''), 'data-die': value || '' });
    if (canRoll) grp.append(s('circle', { cx: x, cy: y, r: 98, class: 'hint-can' }));
    grp.append(value ? die(x, y, value, 130) : die(x, y, 0, 130, 'blank'));
    if (!value) grp.append(s('text', { x, y: y + 14, class: 'ld-die-q', text: canRoll ? 'Tipp' : '?' }));
    if (gs.phase === 'roll' && gs.tries > 0 && mayRollThrice(gs)) grp.append(s('text', { x, y: y + 100, class: 'ld-tries', text: `Versuch ${gs.tries + 1} von 3` }));
    gDie.append(grp);
    // nur ein frischer Wurf wird animiert – nicht das Ziehen danach (lastRoll.moved) und nicht der alte Wert,
    // der während 'rolling' noch stehen bleibt. Schlüssel = Wurf (ply des Wurfs + Sitz + Augen).
    const fresh = !!(lr && !lr.moved && gs.phase !== 'rolling');
    const key = fresh ? JSON.stringify([gs.ply, lr.seat, lr.value]) : lastDieKey;
    if (fresh && value && key !== lastDieKey && anim.dice > 0 && grp.animate) {
      grp.style.transformBox = 'fill-box';
      grp.style.transformOrigin = 'center';
      grp.animate([{ transform: 'rotate(-30deg) scale(.6)', opacity: 0.2 }, { transform: 'rotate(12deg) scale(1.1)', opacity: 1, offset: 0.7 }, { transform: 'none' }], { duration: anim.dice, easing: 'ease-out' });
      const flicker = Math.max(0, Math.floor(anim.dice / 200) - 1);
      for (let k = 1; k <= flicker; k++) {
        timers.push(setTimeout(() => {
          const d = grp.querySelector('.die');
          if (!d || !grp.isConnected) return;
          d.replaceWith(die(x, y, k === flicker ? value : 1 + ((value + k * 3) % 6), 130));
        }, (k * anim.dice * 0.6) / flicker));
      }
    }
    lastDieKey = key;
  }

  // ziehbare Figuren und Ziele (aus den legalen Zügen)
  function cands() {
    if (!legal || gs.phase !== 'move') return [];
    const seat = gs.turn;
    return legal.filter((m) => m.type === 'move').map((m) => {
      const p = gs.pieces[seat][m.piece];
      const to = p < 0 ? 0 : p + gs.die;
      return { m, from: posXY(seat, p, m.piece), to: posXY(seat, to, m.piece), k: m.piece };
    });
  }

  function renderHints() {
    gHints.textContent = '';
    if (!legal) { setHint(''); return; }
    if (legal.some((m) => m.type === 'roll')) { setHint('Würfeln: Knopf oder Würfel antippen.'); return; }
    const cs = cands();
    for (const c of cs) {
      gHints.append(s('circle', { cx: c.from[0], cy: c.from[1], r: PR + 10, class: 'hint-can' }));
      gHints.append(s('circle', { cx: c.to[0], cy: c.to[1], r: 18, class: 'hint-dot' }));
      gHints.append(s('line', { x1: c.from[0], y1: c.from[1], x2: c.to[0], y2: c.to[1], class: 'ld-arrow' }));
    }
    setHint(cs.length === 1 ? 'Figur oder ihr Ziel antippen.' : 'Welche Figur? Antippen (oder ihr grünes Ziel).');
  }

  function commit(m) { legal = null; gHints.textContent = ''; onMove(m); }

  function tapAt(x, y) {
    if (!legal) return;
    const roll = legal.find((m) => m.type === 'roll');
    if (roll) {
      const [dx, dy] = cxy(DIE_AT, colorOf(gs.turn));
      if (Math.hypot(dx - x, dy - y) < 2.2 * U) commit(roll);
      return;
    }
    let best = null, bd = Infinity;
    for (const c of cands()) for (const pt of [c.from, c.to]) {
      const d = Math.hypot(pt[0] - x, pt[1] - y);
      if (d < bd) { bd = d; best = c; }
    }
    if (best && bd < 1.8 * U) commit(best.m);
  }

  onTap(svg, (cx, cy) => { const p = toBoard(svg, cx, cy); if (p) tapAt(p[0], p[1]); });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      for (const x of timers) clearTimeout(x);
      timers = [];
      table = t;
      gs = t.gs;
      anim = ctx.anim || OWN;
      const seatV = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      const v = colorOf(seatV) ?? 0;
      if (v !== view) { view = v; drawBoard(); }
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      renderPieces();
      renderDie();
      const m = info.kind === 'move' ? info.move : null;
      const prev = info.prevGs;
      if (m && m.type === 'move' && prev && prev.pieces) {
        const seat = info.by;
        const p0 = prev.pieces[seat][m.piece], p1 = gs.pieces[seat][m.piece];
        const el = pawnEl(seat, m.piece);
        let pts;
        if (p0 < 0) pts = [posXY(seat, p0, m.piece), posXY(seat, 0, m.piece)];
        else { pts = []; for (let p = p0; p <= p1; p++) pts.push(posXY(seat, p, m.piece)); }
        const n = pts.length - 1;
        const hop = ludoStep(anim, n);
        if (el) animateSteps(el, pts, { hop, lift: true });
        // geschlagene Figur: steht erst am Zielfeld, fliegt nach dem Zug ins Häuschen
        const dur = n * hop;
        if (hop > 0 && p1 >= 40 && p0 < 40) FXS.stars(gFx, ...pts[pts.length - 1], { delay: dur, size: 22, dist: 90 });
        prev.pieces.forEach((ps, s2) => {
          if (s2 === seat) return;
          ps.forEach((q, k) => {
            if (q >= 0 && q < 40 && gs.pieces[s2][k] < 0) {
              const ce = pawnEl(s2, k);
              if (ce) animateSteps(ce, [posXY(s2, q, k), posXY(s2, -1, k)], { hop: Math.max(200, anim.slide), delay: dur, lift: true });
              if (hop > 0) FXS.puff(gFx, ...posXY(s2, q, k), PR * 1.15, dur);
            }
          });
        });
      }
      renderHints();
    },
    // Tests: Bildschirmpunkt einer Figur (seat, k) bzw. des Würfels ('die')
    target(x) {
      if (x === 'die') return toScreen(svg, ...cxy(DIE_AT, colorOf(gs.turn)));
      const [seat, k] = x;
      return toScreen(svg, ...posXY(seat, gs.pieces[seat][k], k));
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      let minCand = Infinity;
      const pts = cands().flatMap((c) => [c.from, c.to]);
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
        if (d > 1) minCand = Math.min(minCand, d);
      }
      return { minTargetPx: U * scale, fieldPx: U * scale, candPx: (isFinite(minCand) ? minCand : U) * scale, boardPx: SIZE * scale };
    },
    tap: tapAt,
    celebrate({ winner }) { hopWave([0, 1, 2, 3].map((k) => pawnEl(winner, k)), { step: 120, up: 1.3 }); },
    destroy() { for (const x of timers) clearTimeout(x); svg.remove(); }
  };
}
