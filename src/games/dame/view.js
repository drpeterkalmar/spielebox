// Dame-Brett als SVG (8×8 oder 10×10): Holzfelder, Steine mit Schatten, Damen mit Krone, letzte Züge markiert,
// erlaubte Züge beim Antippen, Schlagfolgen Sprung für Sprung, Pusten, Zug-Animation.
// Tippen trifft das nächstgelegene dunkle Feld (Voronoi-Zelle ≈ 1,4 Felder breit → große Touch-Ziele auch auf 10×10).
import { squareName } from './engine.js';
import { s, ensureDefs, piece, place, animateSteps, fadeOut, toBoard, toScreen, onTap } from '../../ui/svg.js';
import { OWN } from '../../tempo.js';

const Q = 100;   // Feldgröße
const R = 38;    // Steinradius

export function createBoard(host, { onMove, onHint }) {
  ensureDefs();
  const svg = s('svg', { class: 'board board-dame', role: 'img', 'aria-label': 'Damebrett' });
  const gBoard = s('g');
  const gLast = s('g', { class: 'last' });
  const gPieces = s('g', { class: 'pieces' });
  const gFx = s('g', { class: 'fx' });
  const gHints = s('g', { class: 'hints' });
  svg.append(gBoard, gLast, gFx, gPieces, gHints);
  host.appendChild(svg);

  let n = 0, flip = false, table = null, legal = null, sel = null, prefix = [], hint = '';
  let size = 0;
  let F = 30;   // Rahmen: 8×8 mit Koordinaten, 10×10 schmal (Touch-Ziele ≥ 48 px auch quer im Browser-Tab)

  const disp = (i) => { const r = Math.floor(i / n), c = i % n; return flip ? [n - 1 - r, n - 1 - c] : [r, c]; };
  const center = (i) => { const [r, c] = disp(i); return [F + c * Q + Q / 2, F + r * Q + Q / 2]; };

  function setHint(t) {
    if (t !== hint) { hint = t; onHint && onHint(t); }
  }

  function drawBoard() {
    F = n === 10 ? 8 : 30;
    size = n * Q + 2 * F;
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    gBoard.textContent = '';
    gBoard.append(
      s('rect', { width: size, height: size, rx: 18, fill: 'url(#sb-wood-frame)' }),
      s('rect', { x: F, y: F, width: n * Q, height: n * Q, fill: 'url(#sb-wood-light)' })
    );
    const dark = s('g', { fill: 'url(#sb-wood-dark)' });
    const labels = s('g', { class: 'coords' });
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      if ((r + c) % 2 !== 1) continue;
      const [x, y] = center(i);
      dark.append(s('rect', { x: x - Q / 2, y: y - Q / 2, width: Q, height: Q }));
      if (n === 10) labels.append(s('text', { x: x - Q / 2 + 6, y: y - Q / 2 + 20, class: 'sqnum', text: squareName(i, n) }));
    }
    gBoard.append(dark, s('rect', { x: F, y: F, width: n * Q, height: n * Q, fill: 'none', stroke: 'rgba(20,8,0,.55)', 'stroke-width': 3 }));
    if (n === 8) {
      for (let k = 0; k < 8; k++) {
        const file = String.fromCharCode(97 + (flip ? 7 - k : k));
        const rank = String(flip ? k + 1 : 8 - k);
        labels.append(s('text', { x: F + k * Q + Q / 2, y: size - 8, class: 'coord', text: file }));
        labels.append(s('text', { x: F / 2, y: F + k * Q + Q / 2 + 7, class: 'coord', text: rank }));
      }
    }
    gBoard.append(labels);
  }

  function renderPieces(board) {
    gPieces.textContent = '';
    board.forEach((v, i) => {
      if (!v) return;
      const [x, y] = center(i);
      const el = place(piece(v > 0 ? 0 : 1, R, { king: Math.abs(v) === 2 }), x, y);
      el.dataset.i = i;
      gPieces.append(el);
    });
  }

  const pieceAt = (i) => gPieces.querySelector(`[data-i="${i}"]`);

  function tint(i, cls) {
    const [x, y] = center(i);
    gLast.append(s('rect', { x: x - Q / 2, y: y - Q / 2, width: Q, height: Q, class: cls }));
  }

  function cross(g, i, cls) {
    const [x, y] = center(i), k = 18;
    g.append(s('path', { d: `M ${x - k} ${y - k} L ${x + k} ${y + k} M ${x + k} ${y - k} L ${x - k} ${y + k}`, class: cls }));
  }

  function renderLast() {
    gLast.textContent = '';
    const last = table && table.last;
    if (!last) return;
    const m = last.m;
    if (m.puste !== undefined) { cross(gLast, m.puste, 'last-cap'); return; }
    tint(m.from, 'last-sq');
    for (const p of m.path) tint(p, 'last-sq');
    for (const c of m.cap || []) cross(gLast, c, 'last-cap');
  }

  const startsWith = (path, pre) => pre.every((p, k) => path[k] === p);
  const cands = () => legal.filter((m) => m.puste === undefined && m.from === sel && startsWith(m.path, prefix));

  function renderHints() {
    gHints.textContent = '';
    if (!legal || !legal.length) { setHint(''); return; }
    const ring = (i, cls) => { const [x, y] = center(i); gHints.append(s('circle', { cx: x, cy: y, r: R + 6, class: cls })); };
    const dot = (i) => { const [x, y] = center(i); gHints.append(s('circle', { cx: x, cy: y, r: 16, class: 'hint-dot' })); };
    const pust = legal.filter((m) => m.puste !== undefined);
    const moves = legal.filter((m) => m.puste === undefined);
    const mustTake = moves.length && moves.every((m) => m.cap.length) && !(table.gs.opts && table.gs.opts.pusten);
    if (sel === null) {
      for (const m of pust) ring(m.puste, 'hint-take');
      for (const i of new Set(moves.map((m) => m.from))) ring(i, 'hint-can');
      if (pust.length) setHint('Pusten möglich: rot markierten Stein antippen – oder normal ziehen.');
      else setHint(mustTake ? 'Schlagen ist Pflicht! Tippe einen markierten Stein an.' : 'Tippe einen deiner Steine an.');
      return;
    }
    ring(sel, 'hint-sel');
    const cs = cands();
    // bereits festgelegte Sprünge: Zwischenstand zeigen, geschlagene Steine markieren
    if (prefix.length) {
      const [x, y] = center(prefix[prefix.length - 1]);
      const ghost = place(piece(table.gs.turn, R, { king: Math.abs(table.gs.board[sel]) === 2 }), x, y);
      ghost.classList.add('ghost');
      gHints.append(ghost);
      for (const c of cs[0].cap.slice(0, prefix.length)) cross(gHints, c, 'hint-x');
    }
    for (const i of new Set(cs.map((m) => m.path[prefix.length]).filter((x) => x !== undefined))) dot(i);
    const capturing = cs.some((m) => m.cap.length);
    setHint(capturing ? (prefix.length ? 'Weiter schlagen: nächstes Feld antippen.' : 'Schlagen: Zielfeld antippen.') : 'Wohin? Tippe ein grünes Feld an.');
  }

  function commit(m) {
    sel = null;
    prefix = [];
    legal = null;
    gHints.textContent = '';
    onMove(m);
  }

  function tapSquare(i) {
    if (!legal || !legal.length || i === null) return;
    const pm = legal.find((m) => m.puste === i);
    if (pm && (sel === null || !prefix.length)) return commit(pm);
    if (sel !== null) {
      const cs = cands();
      const step = cs.filter((m) => m.path[prefix.length] === i);
      if (step.length) {
        const np = [...prefix, i];
        if (step.length === 1) return commit(step[0]);
        const done = step.filter((m) => m.path.length === np.length);
        if (done.length && done.length === step.length) return commit(done[0]);
        prefix = np;
        return renderHints();
      }
      // direkt aufs Endfeld getippt
      const fin = cs.filter((m) => m.path[m.path.length - 1] === i);
      if (fin.length && fin.every((m) => m.cap.slice().sort().join() === fin[0].cap.slice().sort().join())) return commit(fin[0]);
      if (fin.length) {
        // mehrdeutig: gemeinsamen Anfang übernehmen, Rest wählt der Spieler
        let k = prefix.length;
        while (fin.every((m) => m.path[k] === fin[0].path[k]) && k < fin[0].path.length - 1) k++;
        prefix = fin[0].path.slice(0, k);
        return renderHints();
      }
    }
    if (legal.some((m) => m.from === i)) {
      sel = sel === i && !prefix.length ? null : i;
      prefix = [];
      return renderHints();
    }
    sel = null;
    prefix = [];
    renderHints();
  }

  function nearest(x, y) {
    let best = null, bd = Infinity;
    for (let i = 0; i < n * n; i++) {
      const r = Math.floor(i / n), c = i % n;
      if ((r + c) % 2 !== 1) continue;
      const [cx, cy] = center(i);
      const d = Math.hypot(cx - x, cy - y);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  onTap(svg, (cx, cy) => {
    const p = toBoard(svg, cx, cy);
    if (p) tapSquare(nearest(p[0], p[1]));
  });

  return {
    svg,
    update(t, info = {}, ctx = {}) {
      const nn = t.gs.n;
      const nf = !!ctx.flip;
      if (nn !== n || nf !== flip) { n = nn; flip = nf; drawBoard(); }
      const prevLegal = legal;
      table = t;
      legal = ctx.legal && ctx.legal.length ? ctx.legal : null;
      if (!legal || legal !== prevLegal) { sel = null; prefix = []; }
      renderPieces(t.gs.board);
      renderLast();
      // Zug ausspielen: Sprungkette Station für Station (mit Pause), geschlagene Steine verschwinden beim Überspringen
      if (info.kind === 'move' && info.move) {
        const a = ctx.anim || OWN;
        const m = info.move;
        const prev = info.prevGs;
        if (m.puste !== undefined) {
          if (prev) {
            const [x, y] = center(m.puste);
            const ghost = place(piece(prev.board[m.puste] > 0 ? 0 : 1, R, { king: Math.abs(prev.board[m.puste]) === 2 }), x, y);
            gFx.append(ghost);
            fadeOut(ghost, 60, a.fade);
          }
        } else {
          const hop = m.path.length > 1 ? a.hop : a.slide;
          const el = pieceAt(m.path[m.path.length - 1]);
          if (el) animateSteps(el, [m.from, ...m.path].map(center), { hop, pause: a.pause, lift: m.cap.length > 0 });
          if (prev) {
            m.cap.forEach((c, k) => {
              const v = prev.board[c];
              if (!v) return;
              const [x, y] = center(c);
              const ghost = place(piece(v > 0 ? 0 : 1, R, { king: Math.abs(v) === 2 }), x, y);
              gFx.append(ghost);
              fadeOut(ghost, k * (hop + a.pause) + hop / 2, a.fade);
            });
          }
        }
      }
      renderHints();
    },
    target(i) {
      const [x, y] = center(i);
      return toScreen(svg, x, y);
    },
    // Voronoi-Zelle eines dunklen Feldes: Inkreis-Durchmesser = Diagonalabstand √2·Feld
    metrics() {
      const scale = svg.getScreenCTM().a;
      return { minTargetPx: Math.SQRT2 * Q * scale, squarePx: Q * scale, boardPx: size * scale };
    },
    tap: tapSquare,
    destroy() { svg.remove(); }
  };
}
