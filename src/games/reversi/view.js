// Reversi-Brett als SVG (8 × 8, grünes Tuch): Steine schwarz/weiß, erlaubte Felder als Punkte, letzter Zug markiert,
// umgedrehte Steine kippen der Reihe nach um (vom gesetzten Stein nach außen). Ein Tipp auf ein Punkt-Feld setzt.
// Rahmen schmal, damit jedes Feld auch am Handy hochkant ≥ 48 px bleibt; Koordinaten klein in den Randfeldern.
import { s, ensureDefs, piece, place, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN, reversiTimes } from '../../tempo.js';
import { boardLayers } from '../../ui/deko.js';
import { woodFrame, feltRect } from '../../ui/material.js';
import { hopWave } from '../../ui/sieg.js';

const Q = 100, F = 8, N = 8, R = 41;
const SIZE = N * Q + 2 * F;
const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { viewBox: `0 0 ${SIZE} ${SIZE}`, class: 'board board-reversi', role: 'img', 'aria-label': 'Reversi-Brett' });
  const gBoard = s('g'), gLast = s('g', { class: 'last' }), gPieces = s('g', { class: 'pieces' }), gFx = s('g'), gHints = s('g', { class: 'hints' });
  svg.append(gBoard, gLast, gPieces, gFx, gHints);
  host.appendChild(svg);
  const L = boardLayers(svg, host);
  const gB = L ? L.under.appendChild(s('g')) : gBoard;

  let gs = null, legal = null, hint = '';
  const setHint = (t) => { if (t !== hint) { hint = t; onHint && onHint(t); } };
  const center = (i) => [F + (i % N) * Q + Q / 2, F + Math.floor(i / N) * Q + Q / 2];

  (function drawBoard() {
    if (L) {
      // Deko: Holzrahmen mit Schliff, Filz mit Licht, Linien mit heller Kante (eingeprägt)
      woodFrame(gB, 0, 0, SIZE, SIZE, 14);
      feltRect(gB, F, F, N * Q, N * Q, 4, { cls: 'rv-felt', stitch: false });
      for (let k = 1; k < N; k++) {
        gB.append(s('line', { x1: F + k * Q + 1.5, y1: F, x2: F + k * Q + 1.5, y2: F + N * Q, stroke: 'rgba(170,230,190,.16)', 'stroke-width': 2 }),
          s('line', { x1: F, y1: F + k * Q + 1.5, x2: F + N * Q, y2: F + k * Q + 1.5, stroke: 'rgba(170,230,190,.16)', 'stroke-width': 2 }));
      }
    } else {
      gB.append(s('rect', { width: SIZE, height: SIZE, rx: 14, fill: 'url(#sb-wood-frame)' }),
        s('rect', { x: F, y: F, width: N * Q, height: N * Q, class: 'rv-felt' }));
    }
    for (let k = 1; k < N; k++) {
      gB.append(s('line', { x1: F + k * Q, y1: F, x2: F + k * Q, y2: F + N * Q, class: 'rv-line' }),
        s('line', { x1: F, y1: F + k * Q, x2: F + N * Q, y2: F + k * Q, class: 'rv-line' }));
    }
    for (const [a, b] of [[2, 2], [6, 2], [2, 6], [6, 6]]) gB.append(s('circle', { cx: F + a * Q, cy: F + b * Q, r: 8, class: 'rv-dot' }));
    for (let k = 0; k < N; k++) {
      gB.append(s('text', { x: F + k * Q + 8, y: F + N * Q - 8, class: 'rv-coord', text: String.fromCharCode(97 + k) }));
      gB.append(s('text', { x: F + N * Q - 8, y: F + k * Q + 24, class: 'rv-coord end', text: String(k + 1) }));
    }
  })();

  const disc = (seat) => piece(seat === 0 ? 1 : 0, R);   // piece(): 0 = hell, 1 = dunkel

  function renderPieces() {
    gPieces.textContent = '';
    gs.board.forEach((v, i) => {
      if (v === null || v === undefined) return;
      const el = place(disc(v), ...center(i));
      el.dataset.i = i;
      gPieces.append(el);
    });
  }

  function renderLast() {
    gLast.textContent = '';
    const l = gs.last;
    if (!l || l.i === null || l.i === undefined) return;
    const [x, y] = center(l.i);
    gLast.append(s('rect', { x: x - Q / 2, y: y - Q / 2, width: Q, height: Q, class: 'last-sq' }));
  }

  function renderHints() {
    gHints.textContent = '';
    if (!legal) { setHint(''); return; }
    if (legal.length === 1 && legal[0].pass) { setHint('Kein Feld möglich – du musst passen.'); return; }
    for (const m of legal) { const [x, y] = center(m.i); gHints.append(s('circle', { cx: x, cy: y, r: 14, class: 'hint-dot' })); }
    setHint('Tippe ein Feld mit Punkt an.');
  }

  // Zug ausspielen: neuer Stein erscheint, dann kippen die eingeschlossenen Steine nacheinander um
  function animate(m, prev, a) {
    if (reduced() || !a || a.slide <= 0 || !gs.last || gs.last.i !== m.i) return;
    const t = reversiTimes(a);
    const el = gPieces.querySelector(`[data-i="${m.i}"]`);
    const [x0, y0] = center(m.i);
    if (el && el.animate) el.animate([{ transform: `translate(${x0}px, ${y0}px) scale(1.5)`, opacity: 0 }, { transform: `translate(${x0}px, ${y0}px) scale(1)`, opacity: 1 }], { duration: t.place, easing: 'ease-out' });
    for (const f of gs.last.flipped || []) {
      const d = Math.max(Math.abs((f % N) - (m.i % N)), Math.abs(Math.floor(f / N) - Math.floor(m.i / N)));
      const delay = t.place + (d - 1) * t.stagger;
      const [x, y] = center(f);
      const now = gPieces.querySelector(`[data-i="${f}"]`);
      const old = place(disc(1 - gs.board[f]), x, y);
      gFx.append(old);
      const half = t.flip / 2;
      const tf = (k) => `translate(${x}px, ${y}px) scale(${k}, 1)`;
      const a1 = old.animate([{ transform: tf(1) }, { transform: tf(0.02) }], { duration: half, delay, easing: 'ease-in', fill: 'forwards' });
      a1.onfinish = () => old.remove();
      if (now && now.animate) now.animate([{ transform: tf(0.02) }, { transform: tf(1) }], { duration: half, delay: delay + half, easing: 'ease-out', fill: 'backwards' });
    }
  }

  function tapAt(i) {
    if (!legal || i === null) return;
    const m = legal.find((x) => x.i === i);
    if (m) { legal = null; gHints.textContent = ''; onMove(m); }
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (!p) return;
    const c = Math.floor((p[0] - F) / Q), r = Math.floor((p[1] - F) / Q);
    tapAt(c >= 0 && c < N && r >= 0 && r < N ? r * N + c : null);
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      gs = t.gs;
      gFx.textContent = '';
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      renderPieces();
      renderLast();
      if (info.kind === 'move' && info.move && Number.isInteger(info.move.i)) animate(info.move, info.prevGs, ctx.anim || OWN);
      renderHints();
    },
    target(i) { return toScreen(svg, ...center(i)); },
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Q * scale, boardPx: SIZE * scale };
    },
    tap: tapAt,
    // Deko: Sieg – die Steine des Gewinners hüpfen als Welle (von der Mitte nach außen)
    celebrate({ winner }) {
      const c = F + 4 * Q;
      const els = [...gPieces.querySelectorAll(winner === 0 ? '.pc-b' : '.pc-w')].sort((a, b) => Math.hypot(a.dataset.x - c, a.dataset.y - c) - Math.hypot(b.dataset.x - c, b.dataset.y - c));
      hopWave(els, { step: 28, up: 1.15 });
    },
    destroy() { svg.remove(); }
  };
}
