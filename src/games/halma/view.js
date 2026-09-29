// Stern-Halma als SVG: Sternbrett aus Holz, Zacken in den Spielerfarben, Steine mit Farbe UND Symbol
// (farbenblind unterscheidbar). Das Brett ist so gedreht, dass die eigene Zacke unten liegt.
// Bedienung: Stein antippen → alle erreichbaren Ziele leuchten (auch Enden von Sprungketten) → Ziel antippen.
// 121 Löcher sind am Handy eng (Lochabstand ≈ 28 px): Ein Tipp trifft deshalb immer den NÄCHSTEN sinnvollen
// Kandidaten (eigener ziehbarer Stein bzw. erlaubtes Ziel), nicht das nächste Loch.
import { HOLES, CAMP, CAMPS, CAMP_OF, OPPOSITE } from './engine.js';
import { s, ensureDefs, place, animatePath, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { SEAT_COLORS, SEAT_SYMBOLS } from '../../ui/seatcolors.js';

const U = 100;
const PR = 40;   // Steinradius
const xy = (i) => [HOLES[i].x * U, HOLES[i].y * U];

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: '-690 -760 1380 1520', class: 'board board-halma', role: 'img', 'aria-label': 'Stern-Halma-Brett' });
  const root = s('g');
  const gBoard = s('g'), gLast = s('g', { class: 'last' }), gPieces = s('g', { class: 'pieces' }), gHints = s('g', { class: 'hints' });
  root.append(gBoard, gLast, gPieces, gHints);
  svg.append(root);
  host.appendChild(svg);

  let table = null, gs = null, legal = null, sel = null, rot = 0, n = 0, hint = '';
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const seatOfCamp = (c) => (CAMPS[n] || []).indexOf(c);

  const grow = (pts, d) => {
    const cx = pts.reduce((x, p) => x + p[0], 0) / pts.length, cy = pts.reduce((y, p) => y + p[1], 0) / pts.length;
    return pts.map(([x, y]) => { const dx = x - cx, dy = y - cy, l = Math.hypot(dx, dy) || 1; return [x + (dx / l) * d, y + (dy / l) * d]; });
  };
  const poly = (pts) => pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');

  // Zacke k als Dreieck: Spitze + die beiden Ecken der Grundreihe (am weitesten von der Spitze), vergrößert
  function campPoly(k) {
    const pts = CAMP[k].map(xy);
    const tip = pts[0];
    const far = pts.slice(1).sort((p, q) => Math.hypot(q[0] - tip[0], q[1] - tip[1]) - Math.hypot(p[0] - tip[0], p[1] - tip[1]));
    return grow([tip, far[0], far[1]], 70);
  }

  // Mittleres Sechseck: die 6 Löcher ohne Zacke mit größtem Abstand zur Mitte
  function hexPoly() {
    const mid = HOLES.map((_, i) => i).filter((i) => CAMP_OF[i] < 0).map(xy);
    const r = Math.max(...mid.map(([x, y]) => Math.hypot(x, y)));
    const corners = mid.filter(([x, y]) => Math.hypot(x, y) > r - 1).sort((p, q) => Math.atan2(p[1], p[0]) - Math.atan2(q[1], q[0]));
    return grow(corners, 70);
  }

  function drawBoard() {
    gBoard.textContent = '';
    // Sechseck + 6 Zacken als ein Stern: erst Rahmen (dick), dann Holz, dann Farbe der Zacken
    const shapes = [hexPoly(), ...[0, 1, 2, 3, 4, 5].map(campPoly)];
    for (const sh of shapes) gBoard.append(s('polygon', { points: poly(sh), fill: 'url(#sb-wood-frame)', stroke: 'url(#sb-wood-frame)', 'stroke-width': 40, 'stroke-linejoin': 'round' }));
    for (const sh of shapes) gBoard.append(s('polygon', { points: poly(sh), fill: 'url(#sb-wood-light)', stroke: 'url(#sb-wood-light)', 'stroke-width': 8, 'stroke-linejoin': 'round' }));
    for (let k = 0; k < 6; k++) {
      const seat = seatOfCamp(k), tseat = seatOfCamp(OPPOSITE[k]);
      const col = seat >= 0 ? SEAT_COLORS[seat] : tseat >= 0 ? SEAT_COLORS[tseat] : null;
      if (col) gBoard.append(s('polygon', { points: poly(grow(campPoly(k), -24)), fill: col, opacity: seat >= 0 ? 0.3 : 0.15 }));
    }
    const holes = s('g', { class: 'holes' });
    HOLES.forEach((_, i) => { const [x, y] = xy(i); holes.append(s('circle', { cx: x, cy: y, r: 17, class: 'hole' })); });
    gBoard.append(holes);
  }

  function stone(seat) {
    const g = s('g', { class: 'pc hs' });
    g.append(s('circle', { cx: 5, cy: 8, r: PR, fill: 'url(#sb-shadow)' }),
      s('circle', { r: PR, fill: SEAT_COLORS[seat], stroke: 'rgba(0,0,0,.55)', 'stroke-width': 3 }),
      s('circle', { r: PR * 0.72, fill: 'none', stroke: 'rgba(255,255,255,.35)', 'stroke-width': 3 }),
      s('text', { y: 13, class: 'hs-sym', transform: `rotate(${-rot})`, text: SEAT_SYMBOLS[seat] }));
    return g;
  }

  function renderPieces() {
    gPieces.textContent = '';
    gs.board.forEach((v, i) => {
      if (v < 0) return;
      const el = place(stone(v), ...xy(i));
      el.dataset.i = i;
      gPieces.append(el);
    });
  }

  function renderLast() {
    gLast.textContent = '';
    const l = gs.last;
    if (!l || l.pass) return;
    const pts = [l.from, ...l.path].map(xy);
    gLast.append(s('polyline', { points: pts.map((p) => p.join(',')).join(' '), class: 'last-path', fill: 'none' }));
    const [x, y] = xy(l.from);
    gLast.append(s('circle', { cx: x, cy: y, r: PR + 6, class: 'last-from' }));
  }

  const movable = () => [...new Set((legal || []).filter((m) => !m.pass).map((m) => m.from))];
  const targets = () => (legal || []).filter((m) => m.from === sel);

  function renderHints() {
    gHints.textContent = '';
    if (!legal) { setHint(''); return; }
    if (legal.length === 1 && legal[0].pass) { setHint('Kein Zug möglich – du setzt aus.'); return; }
    if (sel === null) {
      for (const i of movable()) { const [x, y] = xy(i); gHints.append(s('circle', { cx: x, cy: y, r: PR + 7, class: 'hint-can' })); }
      setHint('Tippe einen deiner Steine an.');
      return;
    }
    const [sx, sy] = xy(sel);
    gHints.append(s('circle', { cx: sx, cy: sy, r: PR + 9, class: 'hint-sel' }));
    for (const m of targets()) {
      const [x, y] = xy(m.path[m.path.length - 1]);
      gHints.append(s('circle', { cx: x, cy: y, r: m.path.length > 1 ? 24 : 20, class: 'hint-dot' + (m.path.length > 1 ? ' far' : '') }));
    }
    setHint('Wohin? Tippe ein grünes Loch an (auch das Ende einer Sprungkette).');
  }

  function commit(m) {
    sel = null;
    legal = null;
    gHints.textContent = '';
    onMove(m);
  }

  // Tipp → nächster sinnvoller Kandidat (ziehbarer eigener Stein oder erlaubtes Ziel)
  function tapAt(x, y) {
    if (!legal) return;
    const cands = [];
    for (const i of movable()) cands.push({ i, kind: 'sel' });
    if (sel !== null) for (const m of targets()) cands.push({ i: m.path[m.path.length - 1], kind: 'to', m });
    let best = null, bd = Infinity;
    for (const c of cands) {
      const [cx, cy] = xy(c.i);
      const d = Math.hypot(cx - x, cy - y) - (c.kind === 'to' ? 8 : 0);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best || bd > 1.6 * U) { sel = null; return renderHints(); }
    if (best.kind === 'to') return commit(best.m);
    sel = sel === best.i ? null : best.i;
    renderHints();
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (!p) return;
    const a = (rot * Math.PI) / 180;
    // Drehung rückgängig machen: Wurzel dreht um +rot → Modell = rotate(−rot)
    const x = p[0] * Math.cos(-a) - p[1] * Math.sin(-a);
    const y = p[0] * Math.sin(-a) + p[1] * Math.cos(-a);
    tapAt(x, y);
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      gs = t.gs;
      const viewer = typeof ctx.viewer === 'number' ? ctx.viewer : 0;
      const newN = gs.n;
      const camp = (CAMPS[newN] || [0])[viewer] || 0;
      const newRot = -60 * camp;
      if (newN !== n || newRot !== rot) {
        n = newN;
        rot = newRot;
        root.setAttribute('transform', `rotate(${rot})`);
        drawBoard();
      }
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) sel = null;
      renderPieces();
      renderLast();
      if (info.kind === 'move' && info.move && info.move.path) {
        const m = info.move;
        const el = gPieces.querySelector(`[data-i="${m.path[m.path.length - 1]}"]`);
        if (el) animatePath(el, [m.from, ...m.path].map(xy), 200);
      }
      renderHints();
    },
    // Tests: Bildschirmpunkt eines Lochs
    target(i) {
      const [x, y] = xy(i);
      const a = (rot * Math.PI) / 180;
      return toScreen(svg, x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a));
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      // Lochabstand (physisch) und kleinster Abstand zwischen Tipp-Kandidaten in der aktuellen Lage
      let minCand = Infinity;
      const c = sel === null ? movable() : targets().map((m) => m.path[m.path.length - 1]);
      for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) {
        const [ax, ay] = xy(c[i]), [bx, by] = xy(c[j]);
        minCand = Math.min(minCand, Math.hypot(ax - bx, ay - by));
      }
      return { minTargetPx: U * scale, holePx: U * scale, candPx: (isFinite(minCand) ? minCand : U) * scale, boardPx: 1380 * scale };
    },
    select(i) { sel = i; renderHints(); },
    tap: tapAt,
    destroy() { svg.remove(); }
  };
}
