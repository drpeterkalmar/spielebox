// Mühle-Brett als SVG: Holz, Linien, Steine mit Schatten, letzte Züge markiert, erlaubte Züge beim Antippen,
// Zug-Animation. Tippen trifft immer den nächstgelegenen Punkt (große Touch-Ziele auch im Querformat).
import { POINTS, MILLS } from './engine.js';
import { s, ensureDefs, piece, place, animateSteps, animateDrop, flyIn, fadeOut, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';
import { boardLayers } from '../../ui/deko.js';
import { woodFrame, inset } from '../../ui/material.js';
import * as FXS from '../../ui/fxsvg.js';
import { hopWave } from '../../ui/sieg.js';

const U = 100;          // Rasterabstand
const OFF = 52;         // Rand bis zum äußeren Ring (schmal: Touch-Ziele ≥ 48 px auch quer im Browser-Tab)
const SIZE = 6 * U + 2 * OFF;
const R = 38;           // Steinradius
const HIT = 0.62 * U;   // größter Abstand für einen Treffer

const xy = (i) => [OFF + POINTS[i][0] * U, OFF + POINTS[i][1] * U];

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-muehle', role: 'img', 'aria-label': 'Mühlebrett' });
  host.appendChild(svg);
  const L = boardLayers(svg, host);
  const c = OFF + 3 * U;
  const linePath = (k0 = 0) => `M ${c} ${OFF} V ${OFF + 2 * U} M ${c} ${OFF + 4 * U} V ${OFF + 6 * U} M ${OFF} ${c} H ${OFF + 2 * U} M ${OFF + 4 * U} ${c} H ${OFF + 6 * U}` +
    [0, 1, 2].map((k) => { const a = OFF + k * U + k0, w = (6 - 2 * k) * U; return ` M ${a} ${a} h ${w} v ${w} h ${-w} Z`; }).join('');
  if (L) {
    // Deko: Rahmen mit Schliff, eingelassene Spielfläche, eingebrannte Linien (dunkel + helle Kante), Messing-Punkte
    const b = s('g');
    woodFrame(b, 0, 0, SIZE, SIZE, 20);
    inset(b, 12, 12, SIZE - 24, SIZE - 24, 8, 'url(#sb-wood-light)');
    b.append(s('path', { d: linePath(), transform: 'translate(2 2.5)', stroke: 'rgba(255,240,215,.45)', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
      s('path', { d: linePath(), stroke: '#352113', 'stroke-width': 7, fill: 'none', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', opacity: 0.94 }));
    POINTS.forEach((_, i) => {
      const [x, y] = xy(i);
      b.append(s('circle', { cx: x + 1.5, cy: y + 2, r: 13, fill: 'rgba(255,240,215,.4)' }), s('circle', { cx: x, cy: y, r: 13, fill: 'url(#dk-brass)', stroke: '#3a2412', 'stroke-width': 2.5 }));
    });
    L.under.append(b);
  } else {
    svg.append(
      s('rect', { width: SIZE, height: SIZE, rx: 20, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: 12, y: 12, width: SIZE - 24, height: SIZE - 24, rx: 8, fill: 'url(#sb-wood-light)', stroke: 'rgba(40,20,5,.45)', 'stroke-width': 3 })
    );
    const lines = s('g', { stroke: '#3a2515', 'stroke-width': 7, 'stroke-linecap': 'round', fill: 'none', opacity: 0.92 });
    for (const k of [0, 1, 2]) {
      const a = OFF + k * U, w = (6 - 2 * k) * U;
      lines.append(s('rect', { x: a, y: a, width: w, height: w }));
    }
    lines.append(s('path', { d: `M ${c} ${OFF} V ${OFF + 2 * U} M ${c} ${OFF + 4 * U} V ${OFF + 6 * U} M ${OFF} ${c} H ${OFF + 2 * U} M ${OFF + 4 * U} ${c} H ${OFF + 6 * U}` }));
    const dots = s('g', { fill: '#3a2515' });
    POINTS.forEach((_, i) => { const [x, y] = xy(i); dots.append(s('circle', { cx: x, cy: y, r: 11 })); });
    svg.append(lines, dots);
  }
  const gLast = s('g', { class: 'last' });
  const gMill = s('g', { class: 'mill' });
  const gPieces = s('g', { class: 'pieces' });
  const gFx = s('g', { class: 'fx' });
  const gHints = s('g', { class: 'hints' });
  svg.append(gLast, gMill, gPieces, gFx, gHints);

  let table = null;
  let legal = null;
  let sel = null;        // gewählter eigener Stein (Ziehen/Springen)
  let partial = null;    // Zug schließt Mühle → wartet auf Wahl des geschlagenen Steins
  let hint = '';

  function setHint(t) {
    if (t !== hint) { hint = t; onHint && onHint(t); }
  }

  function renderPieces(board) {
    gPieces.textContent = '';
    board.forEach((v, i) => {
      if (v < 0) return;
      const [x, y] = xy(i);
      const el = place(piece(v, R), x, y);
      el.dataset.i = i;
      gPieces.append(el);
    });
  }

  function pieceAt(i) {
    return gPieces.querySelector(`[data-i="${i}"]`);
  }

  function renderLast() {
    gLast.textContent = '';
    gMill.textContent = '';
    const last = table && table.last;
    if (!last) return;
    const m = last.m;
    const ring = (i, cls) => { const [x, y] = xy(i); gLast.append(s('circle', { cx: x, cy: y, r: R + 9, class: cls })); };
    if (m.from !== undefined) {
      const [x1, y1] = xy(m.from), [x2, y2] = xy(m.to);
      gLast.append(s('line', { x1, y1, x2, y2, class: 'last-path' }));
      ring(m.from, 'last-from');
    }
    ring(m.to, 'last-to');
    if (m.remove !== undefined) {
      const [x, y] = xy(m.remove), k = 16;
      gLast.append(s('path', { d: `M ${x - k} ${y - k} L ${x + k} ${y + k} M ${x + k} ${y - k} L ${x - k} ${y + k}`, class: 'last-cap' }));
    }
    // geschlossene Mühle(n) des letzten Zugs leuchten lassen
    const b = table.gs.board;
    for (const mill of MILLS) {
      if (!mill.includes(m.to)) continue;
      if (mill.every((p) => b[p] === last.by)) {
        const [x1, y1] = xy(mill[0]), [x2, y2] = xy(mill[2]);
        gMill.append(s('line', { x1, y1, x2, y2, class: 'mill-line' }));
      }
    }
  }

  function renderHints() {
    gHints.textContent = '';
    gPieces.querySelectorAll('.dim').forEach((e) => e.classList.remove('dim'));
    if (!legal || !legal.length) { setHint(''); return; }
    const dot = (i, cls = 'hint-dot') => { const [x, y] = xy(i); gHints.append(s('circle', { cx: x, cy: y, r: 15, class: cls })); };
    const ring = (i, cls) => { const [x, y] = xy(i); gHints.append(s('circle', { cx: x, cy: y, r: R + 7, class: cls })); };
    if (partial) {
      // Vorschau des Steins, dann gegnerische Steine zum Schlagen markieren
      const [x, y] = xy(partial.to);
      const ghost = place(piece(table.gs.turn, R), x, y);
      ghost.classList.add('ghost');
      gHints.append(ghost);
      if (partial.from !== undefined) pieceAt(partial.from)?.classList.add('dim');
      for (const m of legal) if (m.to === partial.to && m.from === partial.from && m.remove !== undefined) ring(m.remove, 'hint-take');
      setHint('Mühle! Tippe einen gegnerischen Stein an.');
      return;
    }
    const placing = legal.some((m) => m.from === undefined);
    if (placing) {
      for (const i of new Set(legal.map((m) => m.to))) dot(i, 'hint-dot soft');
      setHint('Setze einen Stein auf einen freien Punkt.');
      return;
    }
    const jumping = legal.some((m) => m.from !== undefined && !isNeighbour(m.from, m.to));
    if (sel === null) {
      for (const i of new Set(legal.map((m) => m.from))) ring(i, 'hint-can');
      setHint(jumping ? 'Du darfst springen: tippe einen Stein an.' : 'Tippe einen deiner Steine an.');
      return;
    }
    ring(sel, 'hint-sel');
    for (const m of legal) if (m.from === sel) dot(m.to);
    setHint(jumping ? 'Springe auf einen freien Punkt.' : 'Wohin? Tippe einen grünen Punkt an.');
  }

  function isNeighbour(a, b) {
    const [ax, ay] = POINTS[a], [bx, by] = POINTS[b];
    return MILLS.some((mill) => { const ia = mill.indexOf(a), ib = mill.indexOf(b); return ia >= 0 && ib >= 0 && Math.abs(ia - ib) === 1; }) && (ax === bx || ay === by);
  }

  function commit(m) {
    sel = null;
    partial = null;
    legal = null;
    gHints.textContent = '';
    onMove(m);
  }

  function tapPoint(i) {
    if (!legal || !legal.length) return;
    if (partial) {
      const m = i === null ? null : legal.find((x) => x.to === partial.to && x.from === partial.from && x.remove === i);
      if (m) return commit(m);
      partial = null;
      sel = null;
      return renderHints();
    }
    if (i === null) { sel = null; return renderHints(); }
    const placing = legal.some((m) => m.from === undefined);
    if (placing) {
      const ms = legal.filter((m) => m.to === i);
      if (!ms.length) return;
      if (ms.some((m) => m.remove !== undefined)) { partial = { to: i }; return renderHints(); }
      return commit(ms[0]);
    }
    if (sel !== null) {
      const ms = legal.filter((m) => m.from === sel && m.to === i);
      if (ms.length) {
        if (ms.some((m) => m.remove !== undefined)) { partial = { from: sel, to: i }; sel = null; return renderHints(); }
        return commit(ms[0]);
      }
    }
    sel = legal.some((m) => m.from === i) && sel !== i ? i : null;
    renderHints();
  }

  function nearest(x, y) {
    let best = null, bd = Infinity;
    POINTS.forEach((_, i) => {
      const [px, py] = xy(i);
      const d = Math.hypot(px - x, py - y);
      if (d < bd) { bd = d; best = i; }
    });
    return bd <= HIT ? best : null;
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (p) tapPoint(nearest(p[0], p[1]));
  });

  return {
    svg,
    // table: Tisch-Zustand; info: {kind, move, by, prevGs}; ctx: { legal }
    update(t, info = {}, ctx = {}) {
      const prevLegal = legal;
      table = t;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) { sel = null; partial = null; }
      renderPieces(t.gs.board);
      renderLast();
      // Zug ausspielen: erst Setzen/Ziehen (Stein gleitet bzw. kommt vom Rand), dann nach einer Pause das Schlagen
      if (info.kind === 'move' && info.move) {
        const a = ctx.anim || OWN;
        const m = info.move;
        const el = pieceAt(m.to);
        if (el) {
          if (m.from !== undefined) animateSteps(el, [xy(m.from), xy(m.to)], { hop: a.slide });
          else if (!a.own && info.by !== ctx.viewer) flyIn(el, [SIZE / 2, -R], a.slide);
          else animateDrop(el);
        }
        if (m.remove !== undefined) {
          const [x, y] = xy(m.remove);
          const ghost = place(piece(1 - info.by, R), x, y);
          gFx.append(ghost);
          fadeOut(ghost, a.slide + a.pause, a.fade);
          // Deko: geschlossene Mühle funkelt, der geschlagene Stein verpufft
          if (a.slide > 0) {
            const b = t.gs.board;
            for (const mill of MILLS) {
              if (mill.includes(m.to) && mill.every((p) => b[p] === info.by)) FXS.sweep(gFx, ...xy(mill[0]), ...xy(mill[2]), { delay: a.slide, size: 16 });
            }
            FXS.puff(gFx, x, y, R * 1.1, a.slide + a.pause);
          }
        }
      }
      renderHints();
    },
    // Bildschirmkoordinaten eines Punktes (Tests)
    target(i) {
      const [x, y] = xy(i);
      return toScreen(svg, x, y);
    },
    // kleinste Touch-Zielgröße in CSS-Pixeln: Punktabstand (Voronoi) bzw. Trefferradius
    metrics() {
      const scale = svg.getScreenCTM().a; // Pixel je Brett-Einheit (Brett skaliert per viewBox „meet“)
      return { minTargetPx: Math.min(U, 2 * HIT) * scale, boardPx: SIZE * scale };
    },
    tap: tapPoint,
    // Deko: Sieg – die Steine des Gewinners hüpfen der Reihe nach (von oben nach unten)
    celebrate({ winner }) {
      const els = [...gPieces.querySelectorAll(winner === 0 ? '.pc-w' : '.pc-b')].sort((a, b) => a.dataset.y - b.dataset.y || a.dataset.x - b.dataset.x);
      hopWave(els);
    },
    destroy() { svg.remove(); }
  };
}
