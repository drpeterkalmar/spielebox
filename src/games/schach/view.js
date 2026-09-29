// Schachbrett als SVG: Holzfelder wie Dame, cburnett-Figuren (BSD-3), letzter Zug, Schach-Markierung,
// erlaubte Züge beim Antippen (auch Rochade: König auf g1/c1 bzw. auf den Turm tippen, en passant),
// Umwandlungsauswahl direkt auf dem Brett, Zug-Animation, Brett für Schwarz gedreht.
import { board as boardOf, inCheck, kingSquare } from './engine.js';
import { s, ensureDefs, place, animatePath, fadeOut, toBoard, toScreen, onTap } from '../../ui/svg.js';

const Q = 100;
const F = 12;   // schmaler Rahmen: Touch-Ziele ≥ 48 px (Koordinaten stehen in den Feldern)
const SIZE = 8 * Q + 2 * F;
const FILES = 'abcdefgh';
const PROMO = ['q', 'r', 'b', 'n'];

export function pieceImg(color, type, size = Q) {
  const g = s('g', { class: 'pc cpc' });
  g.append(s('image', { href: `assets/pieces/${color}${type.toUpperCase()}.svg`, x: -size / 2, y: -size / 2, width: size, height: size }));
  return g;
}

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-schach', role: 'img', 'aria-label': 'Schachbrett' });
  const gBoard = s('g');
  const gLast = s('g', { class: 'last' });
  const gPieces = s('g', { class: 'pieces' });
  const gFx = s('g', { class: 'fx' });
  const gHints = s('g', { class: 'hints' });
  svg.append(gBoard, gLast, gPieces, gFx, gHints);
  host.appendChild(svg);

  let flip = null, table = null, legal = null, sel = null, promo = null, hint = '', grid = null;

  const rc = (sq) => [8 - Number(sq[1]), FILES.indexOf(sq[0])];
  const center = (sq) => {
    let [r, c] = rc(sq);
    if (flip) { r = 7 - r; c = 7 - c; }
    return [F + c * Q + Q / 2, F + r * Q + Q / 2];
  };
  const sqAt = (x, y) => {
    let c = Math.floor((x - F) / Q), r = Math.floor((y - F) / Q);
    if (c < 0 || c > 7 || r < 0 || r > 7) return null;
    if (flip) { r = 7 - r; c = 7 - c; }
    return FILES[c] + (8 - r);
  };

  function setHint(t) {
    if (t !== hint) { hint = t; onHint && onHint(t); }
  }

  function drawBoard() {
    gBoard.textContent = '';
    gBoard.append(
      s('rect', { width: SIZE, height: SIZE, rx: 18, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: F, y: F, width: 8 * Q, height: 8 * Q, fill: 'url(#sb-wood-light)' }));
    const dark = s('g', { fill: 'url(#sb-wood-dark)' });
    const labels = s('g');
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if ((r + c) % 2 === 1) dark.append(s('rect', { x: F + c * Q, y: F + r * Q, width: Q, height: Q }));
    }
    for (let k = 0; k < 8; k++) {
      // Buchstaben unten rechts in der untersten Reihe, Zahlen oben links in der linken Spalte (wie Lichess)
      labels.append(s('text', { x: F + k * Q + Q - 13, y: F + 8 * Q - 8, class: 'coord-in ' + ((7 + k) % 2 ? 'on-dark' : 'on-light'), text: FILES[flip ? 7 - k : k] }));
      labels.append(s('text', { x: F + 5, y: F + k * Q + 22, class: 'coord-in ' + (k % 2 ? 'on-dark' : 'on-light'), text: String(flip ? k + 1 : 8 - k) }));
    }
    gBoard.append(dark, s('rect', { x: F, y: F, width: 8 * Q, height: 8 * Q, fill: 'none', stroke: 'rgba(20,8,0,.55)', 'stroke-width': 3 }), labels);
  }

  function renderPieces() {
    gPieces.textContent = '';
    grid.forEach((row, r) => row.forEach((p, c) => {
      if (!p) return;
      const sq = FILES[c] + (8 - r);
      const [x, y] = center(sq);
      const el = place(pieceImg(p.color, p.type), x, y);
      el.dataset.sq = sq;
      gPieces.append(el);
    }));
  }

  const pieceAt = (sq) => gPieces.querySelector(`[data-sq="${sq}"]`);
  const sqRect = (sq, cls) => { const [x, y] = center(sq); return s('rect', { x: x - Q / 2, y: y - Q / 2, width: Q, height: Q, class: cls }); };

  function renderLast() {
    gLast.textContent = '';
    const last = table && table.last;
    if (last && last.m) gLast.append(sqRect(last.m.from, 'last-sq'), sqRect(last.m.to, 'last-sq'));
    if (table && table.gs && inCheck(table.gs)) {
      const color = table.gs.turn === 0 ? 'w' : 'b';
      const k = kingSquare(table.gs, color);
      if (k) { const [x, y] = center(k); gLast.append(s('circle', { cx: x, cy: y, r: Q * 0.52, class: 'check-glow' })); }
    }
  }

  function renderHints() {
    gHints.textContent = '';
    if (!legal) { setHint(''); return; }
    if (promo) {
      // Auswahl: 4 Figuren in der Zielspalte, von der Grundreihe nach innen
      const color = table.gs.turn === 0 ? 'w' : 'b';
      const [x, y0] = center(promo.to);
      const dir = y0 < SIZE / 2 ? 1 : -1;
      gHints.append(s('rect', { x: F, y: F, width: 8 * Q, height: 8 * Q, class: 'promo-veil' }));
      PROMO.forEach((p, k) => {
        const y = y0 + dir * k * Q;
        const g = s('g', { class: 'promo-opt', 'data-promo': p });
        g.append(s('circle', { cx: x, cy: y, r: Q * 0.48, class: 'promo-bg' }));
        const img = place(pieceImg(color, p, Q * 0.86), x, y);
        g.append(img);
        gHints.append(g);
      });
      setHint('Umwandlung: Figur wählen');
      return;
    }
    if (sel === null) {
      setHint('Tippe eine deiner Figuren an.');
      return;
    }
    gHints.append(sqRect(sel, 'hint-selsq'));
    const occupied = new Set();
    grid.forEach((row, r) => row.forEach((p, c) => { if (p) occupied.add(FILES[c] + (8 - r)); }));
    const seen = new Set();
    for (const m of legal) {
      if (m.from !== sel || seen.has(m.to)) continue;
      seen.add(m.to);
      const [x, y] = center(m.to);
      if (occupied.has(m.to)) gHints.append(s('circle', { cx: x, cy: y, r: Q * 0.44, class: 'hint-capture' }));
      else gHints.append(s('circle', { cx: x, cy: y, r: 15, class: 'hint-dot' }));
    }
    setHint('Wohin? Tippe ein markiertes Feld an.');
  }

  function commit(m) {
    sel = null;
    promo = null;
    legal = null;
    gHints.textContent = '';
    onMove(m);
  }

  function tapSquare(sq, x, y) {
    if (!legal) return;
    if (promo) {
      // welche Option getroffen? (Kreise in der Zielspalte)
      const [cx, cy0] = center(promo.to);
      const dir = cy0 < SIZE / 2 ? 1 : -1;
      const k = Math.round(((y - cy0) * dir) / Q);
      if (Math.abs(x - cx) <= Q / 2 && k >= 0 && k < 4) return commit({ from: promo.from, to: promo.to, promo: PROMO[k] });
      promo = null;
      return renderHints();
    }
    if (sq === null) { sel = null; return renderHints(); }
    if (sel !== null) {
      let ms = legal.filter((m) => m.from === sel && m.to === sq);
      // Rochade auch durch Tipp auf den eigenen Turm
      if (!ms.length && grid) {
        const [r, c] = rc(sq), p = grid[r][c], [kr, kc] = rc(sel), k = grid[kr][kc];
        if (k && k.type === 'k' && p && p.type === 'r' && p.color === k.color) {
          const to = (c > kc ? 'g' : 'c') + sel[1];
          ms = legal.filter((m) => m.from === sel && m.to === to);
        }
      }
      if (ms.length) {
        if (ms[0].promo) { promo = { from: sel, to: sq }; return renderHints(); }
        return commit(ms[0]);
      }
    }
    sel = legal.some((m) => m.from === sq) && sel !== sq ? sq : null;
    renderHints();
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (p) tapSquare(sqAt(p[0], p[1]), p[0], p[1]);
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) { sel = null; promo = null; }
      const f = !!ctx.flip;
      if (f !== flip) { flip = f; drawBoard(); }
      grid = boardOf(t.gs);
      renderPieces();
      renderLast();
      if (info.kind === 'move' && info.move && info.prevGs) {
        const m = info.move;
        const el = pieceAt(m.to);
        if (el) animatePath(el, [center(m.from), center(m.to)], 240);
        // Rochade: Turm mitbewegen
        const prev = boardOf(info.prevGs);
        const [fr, fc] = rc(m.from);
        const mover = prev[fr][fc];
        if (mover && mover.type === 'k' && Math.abs(FILES.indexOf(m.to[0]) - fc) === 2) {
          const rank = m.from[1];
          const [rf, rt] = m.to[0] === 'g' ? ['h', 'f'] : ['a', 'd'];
          const rook = pieceAt(rt + rank);
          if (rook) animatePath(rook, [center(rf + rank), center(rt + rank)], 240);
        }
        // geschlagene Figur ausblenden (auch en passant)
        const [tr, tc] = rc(m.to);
        let capSq = prev[tr][tc] ? m.to : null;
        if (!capSq && mover && mover.type === 'p' && fc !== tc) capSq = m.to[0] + m.from[1];
        if (capSq) {
          const [cr, cc] = rc(capSq);
          const cp = prev[cr][cc];
          if (cp) {
            const [x, y] = center(capSq);
            const ghost = place(pieceImg(cp.color, cp.type), x, y);
            gFx.append(ghost);
            fadeOut(ghost, 160);
          }
        }
      }
      renderHints();
    },
    target(sq) {
      const [x, y] = center(sq);
      return toScreen(svg, x, y);
    },
    // Bildschirmpunkt einer Umwandlungs-Option (Tests)
    promoTarget(to, k) {
      const [x, y0] = center(to);
      const dir = y0 < SIZE / 2 ? 1 : -1;
      return toScreen(svg, x, y0 + dir * k * Q);
    },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Q * scale, boardPx: SIZE * scale };
    },
    tap: tapSquare,
    destroy() { svg.remove(); }
  };
}
